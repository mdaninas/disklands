import '@fontsource-variable/inter';
import './style.css';
import './biome-theme.css';
import { icon } from './icons.js';
import { biomeFor, biomeScene } from './biomes.js';
import { localize, toEnglish } from './i18n.js';
import { version } from '../package.json';

const api = window.ruang;
const app = document.querySelector('#app');
document.body.classList.add('biome-theme');
let language = localStorage.getItem('disklands.language') === 'id' ? 'id' : 'en';
let nf = new Intl.NumberFormat(language === 'id' ? 'id-ID' : 'en-US');
document.documentElement.lang = language;
function translated(value) { return language === 'en' ? toEnglish(value) : value; }
function setLanguage(value, persist = true) {
  if (!['en', 'id'].includes(value)) return;
  language = value;
  nf = new Intl.NumberFormat(language === 'id' ? 'id-ID' : 'en-US');
  document.documentElement.lang = language;
  localStorage.setItem('disklands.language', language);
  render();
  if (persist) api?.setLanguage?.(language)?.catch(error => toast(error.message, true));
}
const categoryMeta = {
  code: { name: 'Kode & data', icon: 'code', color: '#438675', bg: '#e6f3ee' },
  apps: { name: 'Aplikasi', icon: 'apps', color: '#8b72ba', bg: '#f0eafa' },
  documents: { name: 'Dokumen', icon: 'file', color: '#b88d31', bg: '#fbf1dc' },
  archives: { name: 'Arsip', icon: 'archive', color: '#bf7751', bg: '#fbece3' },
  images: { name: 'Gambar', icon: 'image', color: '#d96f57', bg: '#fff0e9' },
  videos: { name: 'Video', icon: 'video', color: '#508aaf', bg: '#e8f2fa' },
  audio: { name: 'Audio', icon: 'music', color: '#a38a45', bg: '#f8f0dc' },
  other: { name: 'Lainnya', icon: 'more', color: '#7f939b', bg: '#edf2f4' }
};
for (const [category, meta] of Object.entries(categoryMeta)) {
  const biome = biomeFor({ type: 'file', category });
  meta.color = biome.deep;
  meta.bg = biome.surface + '26';
}
const state = {
  page: 'overview', drives: [], history: [], summary: null, folder: null, root: null,
  scanning: false, progress: null, query: '', sort: 'size-desc', category: 'all', minSize: 0,
  view: 'map', mapFoldersOnly: false, selection: null, help: false, toast: null, previous: null
};
let toastTimer;
let folderRequest = 0;
function esc(value = '') { return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
function attr(value) { return esc(value); }
function sizeParts(bytes = 0) {
  if (bytes === 0) return ['0', 'B'];
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(Math.max(1, bytes)) / Math.log(1024)), units.length - 1);
  return [new Intl.NumberFormat(language === 'id' ? 'id-ID' : 'en-US', { maximumFractionDigits: i > 0 ? 2 : 0 }).format(bytes / 1024 ** i), units[i]];
}
function size(bytes = 0) { return sizeParts(bytes).join(' '); }
function percent(bytes, total) { return total > 0 ? Math.min(100, Math.max(0, bytes / total * 100)) : 0; }
function pct(bytes, total) { return new Intl.NumberFormat(language === 'id' ? 'id-ID' : 'en-US', { maximumFractionDigits: 1 }).format(percent(bytes, total)) + '%'; }
function date(value, withTime = false) {
  if (!value) return '-';
  return new Intl.DateTimeFormat(language === 'id' ? 'id-ID' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(value));
}
function elapsed(ms) { return ms < 1000 ? '< 1 detik' : ms < 60000 ? `${Math.round(ms / 1000)} detik` : `${Math.floor(ms / 60000)} menit ${Math.round(ms % 60000 / 1000)} detik`; }
function currentDrive() { return state.drives.find(drive => (state.root || state.summary?.root || '').toLowerCase().startsWith(drive.root.toLowerCase())) || state.drives.find(d => d.root === 'D:\\') || state.drives[0]; }
function toast(message, error = false) {
  state.toast = { message, error };
  clearTimeout(toastTimer);
  renderToast();
  toastTimer = setTimeout(() => { state.toast = null; renderToast(); }, 4000);
}
function renderToast() {
  document.querySelector('.toast')?.remove();
  if (state.toast) app.insertAdjacentHTML('beforeend', `<div class="toast ${state.toast.error ? 'error' : ''}" role="status">${icon(state.toast.error ? 'info' : 'check')}<span>${esc(translated(state.toast.message))}</span></div>`);
}

function sidebar() {
  const pages = [
    ['overview', 'grid', 'Ringkasan'], ['largest', 'file', 'File terbesar'],
    ['types', 'chart', 'Jenis file'], ['history', 'history', 'Riwayat pindai']
  ];
  return `<aside class="sidebar">
    <a class="brand" href="#" data-action="navigate" data-page="overview" aria-label="Disklands, ringkasan"><span class="brand-mark"><i></i><i></i><i></i><i></i></span><span>Disklands</span></a>
    <nav aria-label="Navigasi utama">${pages.map(([page, glyph, label]) => `<button class="nav-item ${state.page === page ? 'active' : ''}" data-action="navigate" data-page="${page}" ${state.page === page ? 'aria-current="page"' : ''}><span class="nav-icon">${icon(glyph)}</span><span class="nav-text">${label}</span></button>`).join('')}</nav>
    <div class="drive-heading"><span class="nav-label">PERANGKAT</span><span class="tiny-count">${state.drives.length}</span></div>
    <div class="drive-list">${state.drives.map(drive => `<button class="drive-item ${currentDrive()?.root === drive.root ? 'selected' : ''}" data-action="scan-drive" data-path="${attr(drive.root)}" ${state.scanning ? 'disabled' : ''} title="Pindai ${attr(drive.root)}">
      <span class="drive-top">${icon('drive')}<span><b>Disk lokal (${esc(drive.root.slice(0, 2))})</b><small>${size(drive.free)} tersedia</small></span></span>
      <span class="drive-bar"><span style="width:${percent(drive.used, drive.total)}%;background:${percent(drive.used, drive.total) > 90 ? '#e5987d' : '#a5bc72'}"></span></span>
      <span class="drive-capacity"><span>${pct(drive.used, drive.total)} terpakai</span><span>${size(drive.total)}</span></span>
    </button>`).join('') || '<div class="muted sidebar-note">Informasi disk belum tersedia.</div>'}</div>
    <div class="sidebar-note">Klik disk untuk memindai<br>seluruh penyimpanannya.</div>
    <div class="sidebar-bottom"><span class="app-version">Disklands ${version}</span></div>
  </aside>`;
}
function titlebar() {
  return `<div class="titlebar"><span>Disklands</span><div class="window-controls"><button data-action="window" data-window="minimize" aria-label="Minimalkan">${icon('minimize')}</button><button data-action="window" data-window="maximize" aria-label="Maksimalkan">${icon('maximize')}</button><button data-action="window" data-window="close" aria-label="Tutup aplikasi">${icon('close')}</button></div></div>`;
}
function toolbar() {
  const titles = { overview: 'Ringkasan', largest: 'File terbesar', types: 'Jenis file', history: 'Riwayat pindai' };
  return `<header class="toolbar"><div class="toolbar-breadcrumb">Penyimpanan ${icon('chevron')} <b>${titles[state.page]}</b></div><div class="toolbar-right"><select id="language" aria-label="Language" title="Language"><option value="en" ${language === 'en' ? 'selected' : ''}>English</option><option value="id" ${language === 'id' ? 'selected' : ''}>Bahasa Indonesia</option></select><button class="icon-button" data-action="help" aria-label="Panduan penggunaan">${icon('help')}</button></div></header>`;
}
function hero(title, description) {
  return `<div class="hero"><div><h1>${title}</h1><p>${description}</p></div><div class="hero-actions"><button class="button secondary" data-action="export" ${!state.summary || state.scanning ? 'disabled' : ''}>${icon('download')} Ekspor CSV</button><button class="button primary" data-action="choose" ${state.scanning ? 'disabled' : ''}>${icon('folder')} Pilih folder</button></div></div>`;
}
function directoryBar() {
  return `<div class="directory-bar"><div class="directory-icon">${icon('folder')}</div><div class="directory-info"><span class="micro-label">DIREKTORI AKTIF</span><button class="directory-path" data-action="choose" title="${attr(state.root || translated('Pilih direktori'))}" ${state.scanning ? 'disabled' : ''}><span class="directory-path-label">${esc(state.root || translated('Belum ada direktori dipilih'))}</span>${icon('down')}</button></div><div class="directory-status">${state.scanning ? `<span class="directory-state scanning"><span class="spinning">${icon('refresh')}</span> Memindai</span>` : state.summary ? `<span class="directory-state">${icon('check')} Selesai</span> <span>Dipindai ${date(state.summary.scannedAt, true)}</span>` : `${icon('info')}<span>Pilih folder untuk mulai</span>`}</div><button class="button small ${state.scanning ? 'cancel-button' : 'secondary'}" data-action="${state.scanning ? 'cancel' : 'rescan'}" ${!state.root ? 'disabled' : ''}>${icon(state.scanning ? 'stop' : 'refresh')}${state.scanning ? 'Hentikan' : 'Pindai ulang'}</button></div>`;
}
function stats() {
  const summary = state.scanning ? state.progress : state.summary;
  const drive = currentDrive();
  const [amount, unit] = sizeParts(summary?.totalSize || 0);
  const [free, freeUnit] = sizeParts(drive?.free || 0);
  const values = [
    ['Ukuran direktori', summary ? `${amount}<span>${unit}</span>` : '-', state.scanning ? 'Menghitung ukuran file' : 'Total ukuran logis file'],
    ['File ditemukan', summary ? nf.format(summary.fileCount) : '-', state.scanning ? 'Memeriksa isi direktori' : 'Termasuk seluruh subfolder'],
    ['Folder dianalisis', summary ? nf.format(summary.folderCount) : '-', state.scanning ? 'Menelusuri subfolder' : 'Struktur direktori keseluruhan'],
    ['Ruang tersedia', drive ? `${free}<span>${freeUnit}</span>` : '-', drive ? `Disk ${esc(drive.root.slice(0, 2))}, kapasitas ${size(drive.total)}` : 'Informasi disk belum tersedia']
  ];
  return `<section class="stats-grid" aria-label="Statistik penyimpanan">${values.map(([label, value, note], index) => `<div class="stat-card ${index === 0 ? 'stat-primary' : ''}"><div class="stat-top"><span>${label}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${index === 3 && drive ? `<div class="stat-disk-meter" role="meter" aria-label="Ruang disk ${attr(drive.root.slice(0, 2))} terpakai" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent(drive.used, drive.total).toFixed(1)}"><span style="width:${percent(drive.used, drive.total)}%"></span></div><div class="stat-disk-caption"><span>${pct(drive.used, drive.total)} terpakai</span><span>${esc(drive.root.slice(0, 2))} / ${size(drive.total)}</span></div>` : `<div class="stat-note">${note}</div>`}</div></div>`).join('')}</section>`;
}
function scanProgress() {
  if (!state.scanning) return '';
  return `<div class="scan-progress" role="status"><div class="progress-track"><span></span></div><div><span>${icon('refresh', 'spinning')} Memindai, ${nf.format(state.progress?.fileCount || 0)} file ditemukan</span><small title="${attr(state.progress?.currentPath || state.root)}">${esc(state.progress?.currentPath || state.root)}</small></div></div>`;
}
function emptyState(title = 'Belum ada hasil pemindaian', description = 'Pilih folder atau disk untuk memulai.', action = true) {
  return `<div class="empty-state"><div class="empty-folder" aria-hidden="true">${icon('folder')}</div><h3>${title}</h3><p>${description}</p>${action ? `<button class="button primary" data-action="choose" ${state.scanning ? 'disabled' : ''}>${icon('folder')} ${api ? 'Pilih folder' : 'Buka melalui aplikasi desktop'}</button>` : ''}</div>`;
}

// Balanced binary treemap. Every rectangle is proportional to its byte size.
function mapLayout(entries, x = 0, y = 0, width = 100, height = 100, ratio = 1.95) {
  if (!entries.length) return [];
  if (entries.length === 1) return [{ ...entries[0], x, y, width, height }];
  const total = entries.reduce((sum, e) => sum + e.size, 0);
  let sum = 0;
  let split = 1;
  let closest = Infinity;
  for (let i = 0; i < entries.length - 1; i++) {
    sum += entries[i].size;
    const delta = Math.abs(total / 2 - sum);
    if (delta < closest) { closest = delta; split = i + 1; }
  }
  const first = entries.slice(0, split);
  const second = entries.slice(split);
  const share = first.reduce((sum, e) => sum + e.size, 0) / total;
  if (width * ratio >= height) return [...mapLayout(first, x, y, width * share, height, ratio), ...mapLayout(second, x + width * share, y, width * (1 - share), height, ratio)];
  return [...mapLayout(first, x, y, width, height * share, ratio), ...mapLayout(second, x, y + height * share, width, height * (1 - share), ratio)];
}
function mapEntries() {
  const folder = state.folder;
  if (!folder) return [];
  const all = folder.entries.filter(e => e.size > 0 && (!state.mapFoldersOnly || e.type === 'folder')).sort((a, b) => b.size - a.size);
  const total = all.reduce((sum, e) => sum + e.size, 0) + (state.mapFoldersOnly ? 0 : folder.omittedSize);
  const visible = all.filter(e => e.size / total >= .018).slice(0, 11);
  const remainder = total - visible.reduce((sum, e) => sum + e.size, 0);
  const tiles = visible.map(entry => ({ ...entry, biome: biomeFor(entry) }));
  if (remainder > 0) tiles.push({ name: 'Lainnya', type: 'aggregate', size: remainder, biome: biomeFor({ type: 'aggregate' }), groupedCount: all.length - visible.length + (state.mapFoldersOnly ? 0 : folder.omittedFiles || 0) });
  return tiles;
}
function worldLoading() {
  return `<div class="world-loading" role="status"><div class="loading-chunks" aria-hidden="true">${Array.from({ length: 16 }, (_, i) => `<span class="loading-chunk" style="--chunk-index:${i}"></span>`).join('')}</div><h3>Memindai folder</h3><p>${nf.format(state.progress?.fileCount || 0)} file ditemukan. Hasil muncul setelah pemindaian selesai</p></div>`;
}
function worldTile(tile, total) {
  const biome = tile.biome;
  const label = tile.type === 'aggregate' ? translated(tile.name) : tile.name;
  const compact = tile.width < 18 || tile.height < 22;
  const narrow = tile.width < 10 || tile.height < 12;
  const action = tile.type === 'folder' ? 'folder' : tile.type === 'file' ? 'details' : 'map-list';
  const description = `${label}, ${size(tile.size)}, ${pct(tile.size, total)}, ${tile.type === 'aggregate' ? translated('Lihat daftar') : translated(biome.name)}`;
  return `<button class="map-tile biome-tile biome-${biome.id}${compact ? ' compact' : ''}${narrow ? ' narrow' : ''}" style="left:${tile.x}%;top:${tile.y}%;width:${tile.width}%;height:${tile.height}%;--biome-surface:${biome.surface};--biome-deep:${biome.deep};--biome-detail:${biome.detail};--biome-ink:${biome.ink}" data-action="${action}" ${tile.path ? `data-path="${attr(tile.path)}"` : ''} title="${attr(description)}" aria-label="${attr(description)}">${biomeScene(biome, tile.path || tile.name, compact)}<span class="tile-top"><span class="biome-badge">${icon(tile.type === 'folder' ? 'folder' : tile.type === 'aggregate' ? 'more' : categoryMeta[tile.category]?.icon || 'file')}<span>${esc(biome.name)}</span></span><span>${pct(tile.size, total)}</span></span><span class="biome-label"><span class="tile-label">${esc(label)}</span><span class="tile-size">${size(tile.size)}${tile.type === 'aggregate' ? `, ${nf.format(tile.groupedCount)} item digabung` : ''}</span></span></button>`;
}
function treemapCard() {
  const entries = mapEntries();
  const total = entries.reduce((sum, e) => sum + e.size, 0);
  const layout = mapLayout(entries);
  return `<section class="card treemap-card world-card"><div class="card-heading"><div><h2 class="world-heading">Peta direktori</h2><p>Luas kawasan menunjukkan ruang yang dipakai.</p></div><div class="segmented world-mode-controls" aria-label="Tampilan direktori"><button class="${state.view === 'map' ? 'active' : ''}" data-action="view" data-view="map" aria-pressed="${state.view === 'map'}">${icon('grid')}<span>Bioma</span></button><button class="${state.view === 'isometric' ? 'active' : ''}" data-action="view" data-view="isometric" aria-pressed="${state.view === 'isometric'}">${icon('layers')}<span>Isometrik</span></button><button class="${state.view === 'list' ? 'active' : ''}" data-action="view" data-view="list" aria-pressed="${state.view === 'list'}">${icon('list')}<span>Daftar</span></button></div></div>
    ${state.folder ? `<div class="map-toolbar"><div class="map-crumbs">${state.folder.parent ? `<button class="icon-button" data-action="folder" data-path="${attr(state.folder.parent)}" aria-label="Ke folder induk">${icon('back')}</button>` : ''}${state.folder.crumbs.slice(-3).map((crumb, i) => `${i ? icon('chevron') : ''}<button data-action="folder" data-path="${attr(crumb.path)}" title="${attr(crumb.path)}">${esc(crumb.name)}</button>`).join('')}</div><select id="map-filter" aria-label="Filter peta"><option value="all" ${!state.mapFoldersOnly ? 'selected' : ''}>Folder & file</option><option value="folders" ${state.mapFoldersOnly ? 'selected' : ''}>Hanya folder</option></select></div>` : ''}
    ${!state.folder ? state.scanning ? worldLoading() : emptyState() : state.view !== 'list' ? layout.length ? `<div class="treemap treemap-world${state.view === 'isometric' ? ' world-isometric' : ''}" aria-label="Peta ukuran direktori"><div class="world-plane${state.view === 'isometric' ? ' isometric' : ''}">${layout.map(tile => worldTile(tile, total)).join('')}</div></div>` : emptyState('Peta kosong', 'Tidak ada item berukuran lebih dari 0 byte yang sesuai dengan filter peta.', false) : `<div class="compact-folder-list">${state.folder.entries.slice(0, 30).map(entry => `<button data-action="${entry.type === 'folder' ? 'folder' : 'details'}" data-path="${attr(entry.path)}"><span class="legend-dot" style="background:${biomeFor(entry).surface}"></span>${icon(entry.type === 'folder' ? 'folder' : 'file')}<span>${esc(entry.name)}</span><b>${size(entry.size)}</b>${icon('chevron')}</button>`).join('') || '<p class="muted">Folder ini kosong.</p>'}</div>`}
    <div class="map-footer"><span>${icon('info')} ${state.folder ? 'Klik folder untuk membuka isinya atau file untuk melihat detail' : 'Pilih folder untuk melihat peta'}</span> <span>${state.folder ? size(state.mapFoldersOnly ? total : state.folder.size) : '-'} <small>${state.mapFoldersOnly ? 'folder' : 'total'}</small></span></div>
  </section>`;
}
function donut(groups, total) {
  let offset = 0;
  const circumference = 2 * Math.PI * 67;
  const hasResult = !!state.summary;
  const [amount, unit] = sizeParts(total);
  return `<div class="donut-wrap"><svg class="donut" viewBox="0 0 180 180" role="img" aria-label="Distribusi jenis file"><circle cx="90" cy="90" r="67" fill="none" stroke="#eeeee9" stroke-width="18"/>${groups.filter(g => g.size > 0).map(group => {
    const length = total ? group.size / total * circumference : 0;
    const dash = Math.max(0, length - (groups.length > 1 ? 3.5 : 0));
    const segment = `<circle cx="90" cy="90" r="67" fill="none" stroke="${categoryMeta[group.category]?.color || '#a5aaa7'}" stroke-width="18" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 90 90)"/>`;
    offset += length;
    return segment;
  }).join('')}</svg><div class="donut-center"><span>${hasResult ? amount : '-'}</span><small>${hasResult ? unit + ' terpakai' : state.scanning ? 'Sedang dipindai' : 'Belum dipindai'}</small></div></div>`;
}
function typesCard() {
  const groups = state.summary?.categories || [];
  return `<section class="card types-card"><div class="card-heading"><div><h2>Komposisi file</h2><p>Ukuran berdasarkan jenis file.</p></div></div>${donut(groups, state.summary?.totalSize || 0)}<div class="type-legend">${groups.slice(0, 5).map(group => `<button data-action="category" data-category="${group.category}"><span class="legend-dot" style="background:${categoryMeta[group.category].color}"></span><span>${categoryMeta[group.category].name}</span><b>${size(group.size)}</b></button>`).join('') || `<div class="no-types">Jenis file akan dikelompokkan<br> secara otomatis.</div>`}</div><button class="card-link" data-action="navigate" data-page="types">Lihat semua jenis file ${icon('arrowRight')}</button></section>`;
}
function tableFilters(isLargest = false) {
  return `<div class="table-filters"><label class="search-input">${icon('search')}<input id="search" type="search" placeholder="${isLargest ? 'Cari nama atau lokasi file' : 'Cari file atau folder'}" value="${attr(state.query)}" aria-label="Cari file atau folder" /></label><div class="filter-controls">${isLargest ? `<select id="category-filter" aria-label="Filter jenis file"><option value="all">Semua jenis</option>${Object.entries(categoryMeta).map(([key, meta]) => `<option value="${key}" ${state.category === key ? 'selected' : ''}>${meta.name}</option>`).join('')}</select><select id="size-filter" aria-label="Filter ukuran minimum"><option value="0">Semua ukuran</option><option value="104857600" ${state.minSize === 104857600 ? 'selected' : ''}>Di atas 100 MB</option><option value="1073741824" ${state.minSize === 1073741824 ? 'selected' : ''}>Di atas 1 GB</option></select>` : ''}<select id="sort" aria-label="Urutkan daftar"><option value="size-desc" ${state.sort === 'size-desc' ? 'selected' : ''}>Ukuran terbesar</option><option value="size-asc" ${state.sort === 'size-asc' ? 'selected' : ''}>Ukuran terkecil</option><option value="name" ${state.sort === 'name' ? 'selected' : ''}>Nama A-Z</option><option value="modified" ${state.sort === 'modified' ? 'selected' : ''}>Terbaru diubah</option></select></div></div>`;
}
function filteredEntries(isLargest = false) {
  let entries = [...(isLargest ? state.summary?.largestFiles || [] : state.folder?.entries || [])];
  const query = state.query.toLowerCase();
  if (query) entries = entries.filter(e => e.name.toLowerCase().includes(query) || (isLargest && e.path.toLowerCase().includes(query)));
  if (isLargest && state.category !== 'all') entries = entries.filter(e => e.category === state.category);
  if (isLargest && state.minSize) entries = entries.filter(e => e.size > state.minSize);
  const sorts = { 'size-desc': (a, b) => b.size - a.size, 'size-asc': (a, b) => a.size - b.size, name: (a, b) => a.name.localeCompare(b.name), modified: (a, b) => b.modified - a.modified };
  entries.sort(sorts[state.sort]);
  return entries;
}
function rows(isLargest = false) {
  const entries = filteredEntries(isLargest);
  const total = isLargest ? state.summary?.totalSize || 0 : state.folder?.size || 0;
  return entries.slice(0, isLargest ? 500 : 150).map((entry, i) => {
    const meta = entry.type === 'folder' ? { icon: 'folder', bg: '#f6ebdb', color: '#bc9761' } : categoryMeta[entry.category] || categoryMeta.other;
    const biome = biomeFor(entry);
    const value = percent(entry.size, total);
    return `<tr><td class="row-index">${String(i + 1).padStart(2, '0')}</td><td><button class="file-name" data-action="${entry.type === 'folder' ? 'folder' : 'details'}" data-path="${attr(entry.path)}"><span class="file-icon inventory-item" style="--biome-surface:${biome.surface};--biome-deep:${biome.deep};background:${biome.surface}26;color:${biome.deep}">${icon(meta.icon)}</span><span><b title="${attr(entry.name)}">${esc(entry.name)}</b><small title="${attr(entry.path)}">${isLargest ? esc(entry.path.substring(0, entry.path.length - entry.name.length)) : entry.type === 'folder' ? `${nf.format(entry.fileCount)} file, ${nf.format(entry.folderCount)} subfolder` : esc(entry.extension ? entry.extension.slice(1).toUpperCase() + ' file' : 'Tanpa ekstensi')}</small></span></button></td><td class="size-cell">${size(entry.size)}</td><td class="usage-cell"><span class="usage-track"><span style="width:${value}%;background:${biome.deep}"></span></span><span>${pct(entry.size, total)}</span></td><td class="date-cell">${date(entry.modified)}</td><td><button class="icon-button row-more" data-action="details" data-path="${attr(entry.path)}" aria-label="Detail ${attr(entry.name)}">${icon('more')}</button></td></tr>`;
  }).join('') || `<tr><td colspan="6" class="table-empty">${state.summary ? state.query || state.category !== 'all' || state.minSize ? 'Tidak ada hasil yang cocok. Coba ubah pencarian atau filter.' : 'Belum ada file di direktori ini.' : 'Pilih direktori untuk melihat file dan folder.'}</td></tr>`;
}
function tableCard(isLargest = false) {
  const count = filteredEntries(isLargest).length;
  return `<section class="card table-card inventory-card"><div class="card-heading"><div><h2 class="inventory-title">${isLargest ? 'File terbesar' : 'Isi direktori'} <span class="inline-count" id="result-count">${count}</span></h2><p>${isLargest ? 'Hingga 500 file terbesar dari seluruh direktori yang dipindai.' : 'File dan folder dalam direktori aktif.'}</p></div>${!isLargest && state.folder?.parent ? `<button class="button text-button" data-action="folder" data-path="${attr(state.folder.parent)}">${icon('back')} Folder induk</button>` : ''}</div>${tableFilters(isLargest)}<div class="table-scroll"><table><thead><tr><th class="row-index">#</th><th>Nama ${icon('down')}</th><th>Ukuran</th><th>Proporsi</th><th>Terakhir diubah</th><th></th></tr></thead><tbody id="table-body">${rows(isLargest)}</tbody></table></div><div class="table-footer"><span id="table-count">${nf.format(Math.min(count, isLargest ? 500 : 150))} dari ${nf.format(count)} item ditampilkan</span> <span>${!isLargest && state.folder?.omittedFiles ? `${nf.format(state.folder.omittedFiles)} file kecil lainnya, ${size(state.folder.omittedSize)}. Daftar menyimpan 30 file terbesar per folder.` : 'Ukuran dihitung dalam satuan 1.024 byte.'}</span></div></section>`;
}
function scanNotes() {
  if (!state.summary || (!state.summary.skipped && !state.summary.links)) return '';
  return `<div class="scan-notes">${icon('info')}<span>${state.summary.skipped ? `${nf.format(state.summary.skipped)} lokasi tidak dapat dibaca. ` : ''}${state.summary.links ? `${nf.format(state.summary.links)} tautan/junction dilewati. ` : ''}Total mencakup file yang berhasil dibaca.</span><button data-action="help">Lihat penjelasan ${icon('arrowUpRight')}</button></div>`;
}
function overview() {
  return `${hero('Ringkasan penyimpanan', 'Ukuran file dan folder pada direktori yang dipindai.')} ${directoryBar()} ${scanProgress()} <div id="stats">${stats()}</div><div class="overview-charts">${treemapCard()}${typesCard()}</div>${tableCard()}${scanNotes()}`;
}
function largestPage() {
  return `${hero('File terbesar', 'Hingga 500 file terbesar dari direktori yang dipindai.')} ${directoryBar()}${scanProgress()} ${state.summary ? tableCard(true) : `<section class="card">${emptyState()}</section>`}${scanNotes()}`;
}
function typesPage() {
  const groups = state.summary?.categories || [];
  return `${hero('Jenis file', 'Penggunaan ruang berdasarkan ekstensi file.')} ${directoryBar()}${scanProgress()}${state.summary ? `<div class="types-page-layout"><section class="card type-summary"><div class="card-heading"><div><h2>Seluruh direktori</h2><p>${nf.format(state.summary.fileCount)} file dalam ${groups.length} kategori</p></div></div>${donut(groups, state.summary.totalSize)}<p class="type-summary-note">Klasifikasi berdasarkan ekstensi file.</p></section><section class="card category-breakdown"><div class="card-heading"><div><h2>Distribusi penyimpanan</h2><p>Klik kategori untuk melihat file terbesarnya.</p></div></div>${groups.map(group => { const meta = categoryMeta[group.category]; return `<button class="category-row" data-action="category" data-category="${group.category}"><span class="category-icon" style="background:${meta.bg};color:${meta.color}">${icon(meta.icon)}</span><span class="category-info"><b>${meta.name}</b><small>${nf.format(group.count)} file, ${Object.keys(group.extensions).slice(0, 5).map(esc).join(', ')}</small><span class="category-track"><i style="width:${percent(group.size, state.summary.totalSize)}%;background:${meta.color}"></i></span></span><span class="category-value"><b>${size(group.size)}</b><small>${pct(group.size, state.summary.totalSize)}</small></span>${icon('chevron')}</button>`; }).join('') || '<div class="table-empty">Direktori ini kosong.</div>'}</section></div>` : `<section class="card">${emptyState()}</section>`}${scanNotes()}`;
}
function historyPage() {
  return `${hero('Riwayat pemindaian', 'Ringkasan pemindaian sebelumnya.')}<section class="card history-card"><div class="card-heading"><div><h2>Riwayat pemindaian <span class="inline-count">${state.history.length}</span></h2><p>Klik Pindai lagi untuk mendapatkan kondisi terbaru.</p></div></div>${state.history.length ? `<div class="table-scroll"><table><thead><tr><th>Direktori</th><th>Ukuran</th><th>File</th><th>Waktu pemindaian</th><th></th></tr></thead><tbody>${state.history.map(row => `<tr><td><div class="history-path">${icon('folder')}<span title="${attr(row.root)}">${esc(row.root)}</span></div></td><td class="size-cell">${size(row.totalSize)}</td><td>${nf.format(row.fileCount)}</td><td class="date-cell">${date(row.scannedAt, true)}<small class="history-duration">Selesai dalam ${elapsed(row.duration)}</small></td><td><button class="button small secondary" data-action="scan-drive" data-path="${attr(row.root)}" ${state.scanning ? 'disabled' : ''}>${icon('refresh')} Pindai lagi</button></td></tr>`).join('')}</tbody></table></div>` : emptyState('Belum ada riwayat pemindaian', 'Pemindaian yang selesai akan muncul di sini. Hingga 30 hasil terakhir tersimpan otomatis.', false)}</section><div class="history-info">Riwayat menyimpan ringkasan pemindaian. Pindai lagi untuk menjelajahi isinya.</div>`;
}
function selectionDrawer() {
  if (!state.selection) return '';
  const entry = state.selection;
  const biome = biomeFor(entry);
  const meta = entry.type === 'folder' ? { icon: 'folder', name: 'Folder', color: '#b99765', bg: '#f8f0e5' } : categoryMeta[entry.category] || categoryMeta.other;
  return `<div class="drawer-backdrop" data-action="close-details"></div><aside class="details-drawer inspection-drawer" role="dialog" aria-modal="true" aria-labelledby="details-title"><div class="drawer-header"><span>DETAIL ${entry.type === 'folder' ? 'FOLDER' : 'FILE'}</span><button class="icon-button" data-action="close-details" aria-label="Tutup detail">${icon('close')}</button></div><span class="detail-file-icon inspection-block" style="--biome-surface:${biome.surface};--biome-deep:${biome.deep};--biome-detail:${biome.detail};background:${biome.surface};color:${biome.ink}">${icon(meta.icon)}</span><h2 id="details-title">${esc(entry.name)}</h2><span class="detail-type">${entry.type === 'folder' ? 'Direktori' : meta.name}, ${esc(biome.name)}</span><div class="detail-big-size">${sizeParts(entry.size)[0]} <span>${sizeParts(entry.size)[1]}</span></div><dl class="detail-list"><div><dt>Lokasi</dt><dd class="detail-path">${esc(entry.path)}</dd></div><div><dt>Ukuran tepat</dt><dd>${nf.format(entry.size)} byte</dd></div><div><dt>Bagian dari direktori</dt><dd>${pct(entry.size, state.summary?.totalSize || 0)}</dd></div><div><dt>Terakhir diubah</dt><dd>${date(entry.modified, true)}</dd></div>${entry.type === 'folder' ? `<div><dt>Isi folder</dt><dd>${nf.format(entry.fileCount)} file, ${nf.format(entry.folderCount)} subfolder</dd></div>` : ''}</dl><div class="drawer-actions"><button class="button primary" data-action="reveal" data-path="${attr(entry.path)}">${icon('folder')} Tampilkan di Explorer</button><button class="button secondary" data-action="copy" data-path="${attr(entry.path)}">${icon('copy')} Salin lokasi</button>${entry.type === 'folder' ? `<button class="button secondary" data-action="folder" data-path="${attr(entry.path)}">${icon('arrowRight')} Buka folder</button>` : ''}</div></aside>`;
}
function helpDialog() {
  if (!state.help) return '';
  return `<div class="modal-backdrop" data-action="close-help"></div><section class="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button class="icon-button modal-close" data-action="close-help" aria-label="Tutup panduan">${icon('close')}</button><h2 id="help-title">Panduan penggunaan</h2><p>Pilih folder atau disk untuk memindai ukuran file dan folder.</p><div class="help-step"><b>01</b><div><h3>Pilih folder</h3><p>Gunakan Pilih folder, atau klik disk di sidebar untuk memindai seluruh drive. Pemindaian besar dapat dihentikan kapan saja.</p></div></div><div class="help-step"><b>02</b><div><h3>Telusuri hasil</h3><p>Klik kotak di peta untuk masuk ke subfolder. File terbesar menampilkan hingga 500 file; daftar folder menyimpan 30 file terbesar per folder, dengan semua subfolder.</p></div></div><div class="help-step"><b>03</b><div><h3>Buka detail file</h3><p>Buka detail file untuk menampilkan lokasinya di Explorer atau menyalin lokasi. Gunakan Ekspor CSV di bagian atas untuk mengekspor hasil pemindaian.</p></div></div><div class="help-footnote">${icon('info')}<p>Ukuran direktori adalah ukuran logis, bukan ukuran alokasi di disk. Hard link dapat terhitung lebih dari sekali. File tersembunyi ikut dihitung; junction dan symbolic link dilewati. File yang berubah saat pemindaian atau lokasi yang tidak terbaca dapat menyebabkan perbedaan total.</p></div><button class="button primary" data-action="close-help">Tutup</button></section>`;
}
function render() {
  const scrollTop = document.querySelector('.content')?.scrollTop || 0;
  app.innerHTML = `${titlebar()}${sidebar()}<main class="main">${toolbar()}<div class="content">${!api ? '<div class="browser-notice">Pratinjau tampilan. Akses file lokal tersedia ketika dibuka sebagai aplikasi desktop Disklands.</div>' : ''}${({ overview, largest: largestPage, types: typesPage, history: historyPage }[state.page])()}</div></main>${selectionDrawer()}${helpDialog()}`;
  localize(app, language);
  document.querySelector('.content').scrollTop = scrollTop;
  renderToast();
}
function refreshTable() {
  const largest = state.page === 'largest';
  const body = document.querySelector('#table-body');
  if (!body) return;
  body.innerHTML = rows(largest);
  const count = filteredEntries(largest).length;
  document.querySelector('#result-count').textContent = count;
  document.querySelector('#table-count').textContent = `${nf.format(Math.min(count, largest ? 500 : 150))} dari ${nf.format(count)} item ditampilkan`;
  localize(body, language);
  localize(document.querySelector('#table-count'), language);
}
async function runScan(root) {
  if (!api) { toast('Buka Disklands melalui aplikasi desktop untuk memindai direktori.'); return; }
  if (state.scanning) return;
  try {
    await api.scan(root);
  } catch (error) { toast(error.message || 'Direktori tidak dapat dipindai.', true); }
}
async function chooseFolder() {
  if (!api) { toast('Jalankan aplikasi desktop Disklands untuk memilih folder.'); return; }
  const selected = await api.chooseFolder();
  if (selected) await runScan(selected);
}
async function navigateFolder(target) {
  if (!api || state.scanning) return;
  const request = ++folderRequest;
  try {
    const folder = await api.getFolder(target);
    if (request !== folderRequest) return;
    state.folder = folder;
    state.selection = null;
    state.query = '';
    state.page = 'overview';
    render();
  } catch (error) { toast(error.message, true); }
}
function navigate(page) {
  state.page = page;
  state.query = '';
  state.category = 'all';
  state.minSize = 0;
  state.selection = null;
  render();
  document.querySelector('.content').scrollTop = 0;
}
app.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  event.preventDefault();
  const action = button.dataset.action;
  try {
    if (action === 'navigate') navigate(button.dataset.page);
    if (action === 'choose') await chooseFolder();
    if (action === 'rescan') await runScan(state.root);
    if (action === 'scan-drive') { navigate('overview'); await runScan(button.dataset.path); }
    if (action === 'cancel') await api?.cancel();
    if (action === 'folder') await navigateFolder(button.dataset.path);
    if (action === 'view') {
      if (!['map', 'isometric', 'list'].includes(button.dataset.view)) return;
      state.view = button.dataset.view;
      render();
      document.querySelector(`[data-action="view"][data-view="${state.view}"]`)?.focus({ preventScroll: true });
    }
    if (action === 'map-list') {
      state.view = 'list';
      render();
      document.querySelector('.inventory-card')?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      document.querySelector('#search')?.focus({ preventScroll: true });
    }
    if (action === 'category') { navigate('largest'); state.category = button.dataset.category; render(); }
    if (action === 'help' || action === 'close-help') { state.help = action === 'help'; render(); }
    if (action === 'close-details') { state.selection = null; render(); }
    if (action === 'details') {
      state.selection = [...(state.folder?.entries || []), ...(state.summary?.largestFiles || [])].find(e => e.path === button.dataset.path);
      render();
    }
    if (action === 'reveal') await api?.reveal(button.dataset.path);
    if (action === 'copy') { await api?.copyPath(button.dataset.path); toast('Lokasi disalin ke clipboard.'); }
    if (action === 'export') { const output = await api?.exportCsv(); if (output) toast('Hasil pemindaian berhasil diekspor.'); }
    if (action === 'window') api?.windowAction(button.dataset.window);
  } catch (error) { toast(error.message || 'Tindakan tidak dapat dilakukan.', true); }
});
app.addEventListener('input', event => { if (event.target.id === 'search') { state.query = event.target.value; refreshTable(); } });
app.addEventListener('change', event => {
  if (event.target.id === 'language') { setLanguage(event.target.value); return; }
  if (event.target.id === 'sort') { state.sort = event.target.value; refreshTable(); }
  if (event.target.id === 'category-filter') { state.category = event.target.value; refreshTable(); }
  if (event.target.id === 'size-filter') { state.minSize = Number(event.target.value); refreshTable(); }
  if (event.target.id === 'map-filter') { state.mapFoldersOnly = event.target.value === 'folders'; render(); }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && (state.selection || state.help)) { state.selection = null; state.help = false; render(); }
  if ((event.ctrlKey || event.metaKey) && event.key === 'f') { event.preventDefault(); document.querySelector('#search')?.focus(); }
  if ((event.ctrlKey || event.metaKey) && event.key === 'o') { event.preventDefault(); if (!state.scanning) chooseFolder().catch(error => toast(error.message, true)); }
});
render();
if (api) {
  api.onScanEvent(event => {
    if (event.type === 'started') {
      state.previous = { summary: state.summary, folder: state.folder, root: state.root };
      state.summary = null;
      state.folder = null;
      state.scanning = true;
      state.root = event.root;
      state.progress = { totalSize: 0, fileCount: 0, folderCount: 0, currentPath: event.root };
      state.selection = null;
      state.page = 'overview';
      render();
    }
    if (event.type === 'progress') {
      state.progress = event;
      const box = document.querySelector('#stats');
      if (box) { box.innerHTML = stats(); localize(box, language); }
      const progress = document.querySelector('.scan-progress');
      if (progress) { progress.outerHTML = scanProgress(); localize(document.querySelector('.scan-progress'), language); }
      const worldCaption = document.querySelector('.world-loading p');
      if (worldCaption) { worldCaption.textContent = `${nf.format(event.fileCount || 0)} file ditemukan. Hasil muncul setelah pemindaian selesai`; localize(worldCaption, language); }
    }
    if (event.type === 'complete') {
      state.previous = null;
      folderRequest++;
      state.scanning = false;
      state.summary = event.summary;
      state.folder = event.summary.folder;
      state.drives = event.drives;
      state.history = event.history;
      state.root = event.summary.root;
      state.query = '';
      state.category = 'all';
      state.minSize = 0;
      render();
      toast(`Pemindaian selesai. ${nf.format(event.summary.fileCount)} file dianalisis dalam ${elapsed(event.summary.duration)}.`);
    }
    if (event.type === 'error' || event.type === 'canceled') {
      state.scanning = false;
      if (state.previous?.summary) Object.assign(state, state.previous);
      state.previous = null;
      state.root = state.summary?.root || state.root;
      render();
      toast(event.type === 'error' ? event.message : 'Pemindaian dihentikan.', event.type === 'error');
    }
  });
  api.getInitialState().then(initial => {
    if (initial.language === 'id' || initial.language === 'en') setLanguage(initial.language, false);
    state.drives = initial.drives;
    state.history = initial.history;
    state.root = initial.chosenRoot || initial.launchRoot;
    state.summary = initial.summary;
    state.folder = initial.summary?.folder || null;
    render();
    if (initial.launchRoot && !initial.summary) runScan(initial.launchRoot);
  }).catch(error => toast(error.message, true));
}
