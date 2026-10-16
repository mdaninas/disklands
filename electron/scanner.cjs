const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs/promises');
const path = require('node:path');

// File contents are never opened. Junctions and symbolic links are skipped.
const categories = {
  images: new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.heic', '.raw', '.bmp', '.ico', '.avif', '.tiff']),
  videos: new Set(['.mp4', '.mkv', '.mov', '.avi', '.webm', '.wmv', '.m4v']),
  audio: new Set(['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma']),
  documents: new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.md', '.odt', '.epub']),
  archives: new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.iso', '.bz2', '.xz']),
  code: new Set(['.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs', '.html', '.css', '.json', '.sql', '.ipynb', '.yml', '.yaml', '.toml', '.php']),
  apps: new Set(['.exe', '.msi', '.dll', '.app', '.apk', '.bin', '.sys', '.so', '.dmg'])
};
function categoryFor(extension) {
  for (const [name, extensions] of Object.entries(categories)) if (extensions.has(extension)) return name;
  return 'other';
}

class TopFiles {
  constructor(limit) { this.limit = limit; this.heap = []; }
  add(file) {
    const heap = this.heap;
    if (heap.length === this.limit) {
      if (file.size <= heap[0].size) return;
      heap[0] = file;
      let i = 0;
      while (true) {
        let child = 2 * i + 1;
        if (child >= heap.length) break;
        if (child + 1 < heap.length && heap[child + 1].size < heap[child].size) child++;
        if (heap[i].size <= heap[child].size) break;
        [heap[i], heap[child]] = [heap[child], heap[i]];
        i = child;
      }
      return;
    }
    heap.push(file);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (heap[parent].size <= heap[i].size) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  }
  sorted() { return [...this.heap].sort((a, b) => b.size - a.size || a.path.localeCompare(b.path)); }
}

const folders = new Map();
let summary;
let totalSize = 0;
let fileCount = 0;
let skipped = 0;
let links = 0;
let lastProgress = 0;
const problems = [];
const groups = new Map();
const largest = new TopFiles(500);
function progress(currentPath) {
  if (Date.now() - lastProgress < 180) return;
  lastProgress = Date.now();
  parentPort.postMessage({ type: 'progress', totalSize, fileCount, folderCount: folders.size, skipped, currentPath });
}
function skip(target, error) {
  skipped++;
  if (problems.length < 100) problems.push({ path: target, reason: error.code || error.message });
}
async function scan() {
  const started = Date.now();
  const root = path.resolve(workerData.root);
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Pilih direktori biasa, bukan file atau tautan.');
  const nodes = [{ path: root, name: path.basename(root) || root, parent: null, size: 0, fileCount: 0, folderCount: 0, directFileCount: 0, directSize: 0, children: [], top: new TopFiles(30), modified: rootStat.mtimeMs }];
  folders.set(root, nodes[0]);
  for (let index = 0; index < nodes.length; index++) {
    const folder = nodes[index];
    let entries;
    try { entries = await fs.readdir(folder.path, { withFileTypes: true }); }
    catch (error) { skip(folder.path, error); continue; }
    for (let offset = 0; offset < entries.length; offset += 64) {
      const results = await Promise.all(entries.slice(offset, offset + 64).map(async entry => {
        const target = path.join(folder.path, entry.name);
        try {
          if (entry.isSymbolicLink()) { links++; return null; }
          return { entry, target, stat: await fs.lstat(target) };
        } catch (error) { skip(target, error); return null; }
      }));
      for (const item of results) {
        if (!item) continue;
        const { entry, target, stat } = item;
        if (stat.isSymbolicLink()) { links++; continue; }
        if (stat.isDirectory()) {
          const child = { path: target, name: entry.name, parent: folder.path, size: 0, fileCount: 0, folderCount: 0, directFileCount: 0, directSize: 0, children: [], top: new TopFiles(30), modified: stat.mtimeMs };
          nodes.push(child);
          folders.set(target, child);
          folder.children.push(target);
        } else if (stat.isFile()) {
          const extension = path.extname(entry.name).toLowerCase();
          const category = categoryFor(extension);
          const file = { name: entry.name, path: target, size: stat.size, modified: stat.mtimeMs, extension, category, type: 'file' };
          folder.top.add(file);
          largest.add(file);
          folder.directSize += stat.size;
          folder.directFileCount++;
          totalSize += stat.size;
          fileCount++;
          const group = groups.get(category) || { category, size: 0, count: 0, extensions: {} };
          group.size += stat.size;
          group.count++;
          group.extensions[extension || '(tanpa ekstensi)'] = (group.extensions[extension || '(tanpa ekstensi)'] || 0) + stat.size;
          groups.set(category, group);
        }
      }
      progress(folder.path);
    }
    progress(folder.path);
  }
  // Every parent precedes its descendants, so reverse order gives exact totals.
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    node.size += node.directSize;
    node.fileCount += node.directFileCount;
    if (node.parent) {
      const parent = folders.get(node.parent);
      parent.size += node.size;
      parent.fileCount += node.fileCount;
      parent.folderCount += node.folderCount + 1;
    }
  }
  summary = {
    root, name: nodes[0].name, totalSize, fileCount, folderCount: folders.size - 1,
    skipped, links, problems, duration: Date.now() - started, scannedAt: new Date().toISOString(),
    largestFiles: largest.sorted(), categories: [...groups.values()].sort((a, b) => b.size - a.size),
    folder: getFolder(root)
  };
  parentPort.postMessage({ type: 'complete', summary });
}
function getFolder(target) {
  const node = folders.get(target);
  if (!node) throw new Error('Folder ini belum dipindai.');
  const children = node.children.map(childPath => {
    const child = folders.get(childPath);
    return { path: child.path, name: child.name, size: child.size, fileCount: child.fileCount, folderCount: child.folderCount, modified: child.modified, type: 'folder' };
  });
  const files = node.top.sorted();
  const crumbs = [];
  let current = node;
  while (current) { crumbs.unshift({ name: current.name, path: current.path }); current = folders.get(current.parent); }
  return {
    path: node.path, name: node.name, parent: node.parent, size: node.size, fileCount: node.fileCount,
    folderCount: node.folderCount, directFileCount: node.directFileCount,
    omittedFiles: Math.max(0, node.directFileCount - files.length),
    omittedSize: Math.max(0, node.directSize - files.reduce((sum, file) => sum + file.size, 0)),
    entries: [...children, ...files].sort((a, b) => b.size - a.size || a.name.localeCompare(b.name)), crumbs
  };
}
parentPort.on('message', ({ id, type, target }) => {
  try {
    if (type === 'folder') parentPort.postMessage({ type: 'response', id, data: getFolder(target) });
  } catch (error) { parentPort.postMessage({ type: 'response', id, error: error.message }); }
});
scan().catch(error => parentPort.postMessage({ type: 'error', message: error.message }));
