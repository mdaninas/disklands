const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const { Worker } = require('node:worker_threads');
const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const execute = promisify(execFile);
let window;
let scanningWorker;
let dataWorker;
let lastSummary;
let history = [];
let drives = [];
let chosenRoot;
let language = 'en';
let nextId = 0;
const pending = new Map();
const permittedRoots = new Set();
const devUrl = process.env.RUANG_DEV_URL;
const launchRoot = process.argv.find(arg => arg.startsWith('--scan='))?.slice(7);
const label = (english, indonesian) => language === 'id' ? indonesian : english;

function assertSender(event) {
  if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Permintaan tidak diizinkan.');
}
function emit(data) { if (window && !window.isDestroyed()) window.webContents.send('scan-event', data); }
async function getDrives() {
  if (process.platform !== 'win32') return [];
  try {
    const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 3 -or $_.DriveType -eq 2 } | Select-Object DeviceID,VolumeName,Size,FreeSpace | ConvertTo-Json -Compress'], { windowsHide: true, timeout: 12000, maxBuffer: 1024 * 1024 });
    const parsed = JSON.parse(stdout || '[]');
    return (Array.isArray(parsed) ? parsed : [parsed]).filter(d => d.Size > 0).map(d => ({ root: d.DeviceID + '\\', name: d.VolumeName || 'Local disk', total: Number(d.Size), free: Number(d.FreeSpace), used: Number(d.Size) - Number(d.FreeSpace) }));
  } catch { return []; }
}
const stateFile = () => path.join(app.getPath('userData'), 'history.json');
async function saveHistory() {
  try {
    await fs.mkdir(app.getPath('userData'), { recursive: true });
    await fs.writeFile(stateFile() + '.tmp', JSON.stringify({ history, chosenRoot, language }), 'utf8');
    try { await fs.rename(stateFile() + '.tmp', stateFile()); }
    catch (error) {
      if (!['EXDEV', 'EPERM'].includes(error.code)) throw error;
      await fs.copyFile(stateFile() + '.tmp', stateFile());
      await fs.unlink(stateFile() + '.tmp');
    }
  } catch (error) { console.warn('Riwayat tidak tersimpan:', error.message); }
}
async function startScan(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || !permittedRoots.has(path.resolve(root))) throw new Error('Pilih folder melalui tombol Pilih folder.');
  root = path.resolve(root);
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Direktori tidak tersedia atau merupakan tautan.');
  if (scanningWorker) throw new Error('Pemindaian sedang berjalan.');
  const worker = new Worker(path.join(__dirname, 'scanner.cjs'), { workerData: { root } });
  scanningWorker = worker;
  chosenRoot = root;
  emit({ type: 'started', root });
  worker.on('message', async message => {
    if (message.type === 'response') {
      const request = pending.get(message.id);
      if (request) { clearTimeout(request.timer); pending.delete(message.id); message.error ? request.reject(new Error(message.error)) : request.resolve(message.data); }
      return;
    }
    if (worker !== scanningWorker) return;
    if (message.type === 'complete') {
      const oldWorker = dataWorker;
      dataWorker = worker;
      scanningWorker = null;
      if (oldWorker) await oldWorker.terminate();
      drives = await getDrives();
      lastSummary = message.summary;
      history.unshift({ root, totalSize: lastSummary.totalSize, fileCount: lastSummary.fileCount, folderCount: lastSummary.folderCount, scannedAt: lastSummary.scannedAt, duration: lastSummary.duration, skipped: lastSummary.skipped });
      history = history.slice(0, 30);
      await saveHistory();
      emit({ ...message, drives, history });
    } else if (message.type === 'error') {
      scanningWorker = null;
      await worker.terminate();
      emit(message);
    } else emit(message);
  });
  worker.on('error', error => {
    if (worker === scanningWorker) { scanningWorker = null; emit({ type: 'error', message: error.message }); }
  });
  return { root };
}
function containsPath(target) {
  if (!lastSummary || typeof target !== 'string') return false;
  const relative = path.relative(lastSummary.root, path.resolve(target));
  return !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}
function requestFolder(target) {
  if (!dataWorker || !containsPath(target)) throw new Error('Folder belum dipindai.');
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Folder tidak dapat dimuat.')); }, 8000);
    pending.set(id, { resolve, reject, timer });
    dataWorker.postMessage({ id, type: 'folder', target });
  });
}
function registerHandlers() {
  function handle(name, fn) { ipcMain.handle(name, (event, ...args) => { assertSender(event); return fn(...args); }); }
  handle('initial-state', () => ({ drives, history, chosenRoot, language, launchRoot: launchRoot ? path.resolve(launchRoot) : null, summary: lastSummary || null }));
  handle('set-language', async value => {
    if (value !== 'en' && value !== 'id') throw new Error('Unsupported language.');
    language = value;
    await saveHistory();
    return language;
  });
  handle('choose-folder', async () => {
    const result = await dialog.showOpenDialog(window, { title: label('Choose a directory to scan', 'Pilih direktori yang ingin dianalisis'), defaultPath: chosenRoot || app.getPath('home'), properties: ['openDirectory'] });
    if (result.canceled) return null;
    const root = path.resolve(result.filePaths[0]);
    permittedRoots.add(root);
    return root;
  });
  handle('scan', startScan);
  handle('cancel-scan', async () => {
    const worker = scanningWorker;
    scanningWorker = null;
    if (worker) { await worker.terminate(); emit({ type: 'canceled' }); }
    return true;
  });
  handle('get-folder', requestFolder);
  handle('reveal', async target => {
    if (!containsPath(target)) throw new Error('Lokasi berada di luar pemindaian.');
    await fs.access(target);
    shell.showItemInFolder(target);
    return true;
  });
  handle('copy-path', target => {
    if (!containsPath(target)) throw new Error('Lokasi belum dipindai.');
    clipboard.writeText(target);
    return true;
  });
  handle('export-csv', async () => {
    if (!lastSummary) throw new Error('Lakukan pemindaian terlebih dahulu.');
    const result = await dialog.showSaveDialog(window, { title: label('Export scan results', 'Ekspor hasil pemindaian'), defaultPath: path.join(app.getPath('documents'), 'Disklands-' + new Date().toISOString().slice(0, 10) + '.csv'), filters: [{ name: 'CSV', extensions: ['csv'] }] });
    if (result.canceled) return null;
    // Prevent spreadsheet formula execution for filenames beginning with =, +, -, @.
    const cell = value => '"' + String(value).replace(/^[=+@-]/, match => "'" + match).replaceAll('"', '""') + '"';
    const rows = [
      [label('Summary', 'Ringkasan'), label('Value', 'Nilai')], [label('Directory', 'Direktori'), lastSummary.root], [label('Scanned at', 'Dipindai pada'), lastSummary.scannedAt],
      [label('Logical size (bytes)', 'Ukuran logis (byte)'), lastSummary.totalSize], [label('File count', 'Jumlah file'), lastSummary.fileCount], [label('Folder count', 'Jumlah folder'), lastSummary.folderCount],
      [label('Unreadable', 'Tidak terbaca'), lastSummary.skipped], [label('Links skipped', 'Tautan dilewati'), lastSummary.links], [],
      [label('File type', 'Jenis file'), label('Size (bytes)', 'Ukuran (byte)'), label('File count', 'Jumlah file')], ...lastSummary.categories.map(group => [group.category, group.size, group.count]), [],
      [label('Top 500 files (maximum)', '500 file terbesar (maksimal)'), label('Path', 'Lokasi'), label('Size (bytes)', 'Ukuran (byte)'), label('Modified at', 'Diubah pada')],
      ...lastSummary.largestFiles.map(file => [file.name, file.path, file.size, new Date(file.modified).toISOString()])
    ];
    await fs.writeFile(result.filePath, '\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n'), 'utf8');
    return result.filePath;
  });
  ipcMain.on('window-action', (event, action) => {
    assertSender(event);
    if (action === 'minimize') window.minimize();
    if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
    if (action === 'close') window.close();
  });
}
async function createWindow() {
  window = new BrowserWindow({ width: 1440, height: 960, minWidth: 1050, minHeight: 720, frame: false, backgroundColor: '#eeeee5', title: 'Disklands', icon: path.join(__dirname, '../dist/icon.png'), show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });
  window.once('ready-to-show', () => window.show());
  if (devUrl === 'http://127.0.0.1:5173') await window.loadURL(devUrl);
  else await window.loadFile(path.join(__dirname, '../dist/index.html'));
}
app.setAppUserModelId('id.disklands.desktop');
app.whenReady().then(async () => {
  try {
    const legacy = path.join(app.getPath('appData'), 'ruang-desktop', 'history.json');
    const saved = JSON.parse(await fs.readFile(stateFile(), 'utf8').catch(() => fs.readFile(stateFile() + '.tmp', 'utf8').catch(() => fs.readFile(legacy, 'utf8'))));
    history = Array.isArray(saved.history) ? saved.history.filter(row => typeof row.root === 'string' && Number.isFinite(row.totalSize)).slice(0, 30) : [];
    chosenRoot = typeof saved.chosenRoot === 'string' ? saved.chosenRoot : undefined;
    language = saved.language === 'id' ? 'id' : 'en';
  } catch {}
  drives = await getDrives();
  for (const drive of drives) permittedRoots.add(path.resolve(drive.root));
  for (const entry of history) permittedRoots.add(path.resolve(entry.root));
  if (chosenRoot) permittedRoots.add(path.resolve(chosenRoot));
  if (launchRoot) permittedRoots.add(path.resolve(launchRoot));
  registerHandlers();
  await createWindow();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  scanningWorker?.terminate();
  dataWorker?.terminate();
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Aplikasi ditutup.')); }
});
