const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

const scanner = path.resolve(__dirname, '../electron/scanner.cjs');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ruang-test-'));
  t.after(async () => {
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(root));
    assert.ok(relative.startsWith('ruang-test-') && !relative.includes(path.sep) && !path.isAbsolute(relative));
    await fs.rm(root, { recursive: true, force: true });
  });
  return root;
}
function scan(t, root) {
  const worker = new Worker(scanner, { workerData: { root } });
  t.after(() => worker.terminate());
  return new Promise((resolve, reject) => {
    worker.on('error', reject);
    worker.on('message', message => {
      if (message.type === 'error') reject(new Error(message.message));
      if (message.type === 'complete') resolve({ summary: message.summary, worker });
    });
  });
}
function folder(worker, target) {
  return new Promise((resolve, reject) => {
    const listener = message => {
      if (message.type !== 'response' || message.id !== 99) return;
      worker.off('message', listener);
      message.error ? reject(new Error(message.error)) : resolve(message.data);
    };
    worker.on('message', listener);
    worker.postMessage({ type: 'folder', target, id: 99 });
  });
}

test('nested totals, Unicode/hidden names, categories, breadcrumbs, and exact byte proportions', async t => {
  const root = await fixture(t);
  const child = path.join(root, 'Proyek 日本語');
  const nested = path.join(child, 'nested');
  await fs.mkdir(nested, { recursive: true });
  await fs.mkdir(path.join(root, 'empty'));
  await fs.writeFile(path.join(root, '.hidden.txt'), Buffer.alloc(13));
  await fs.writeFile(path.join(child, 'code.TS'), Buffer.alloc(27));
  await fs.writeFile(path.join(nested, 'video.mp4'), Buffer.alloc(100));
  await fs.writeFile(path.join(nested, 'zero'), '');
  const { summary, worker } = await scan(t, root);
  assert.equal(summary.totalSize, 140);
  assert.equal(summary.fileCount, 4);
  assert.equal(summary.folderCount, 3);
  assert.equal(summary.categories.reduce((sum, g) => sum + g.size, 0), 140);
  assert.equal(summary.categories.reduce((sum, g) => sum + g.count, 0), 4);
  assert.equal(summary.largestFiles[0].name, 'video.mp4');
  assert.equal(summary.categories.find(g => g.category === 'code').size, 27);
  const node = summary.folder.entries.find(entry => entry.path === child);
  assert.equal(node.size, 127);
  assert.equal(node.fileCount, 3);
  assert.equal(node.folderCount, 1);
  const result = await folder(worker, nested);
  assert.equal(result.size, 100);
  assert.equal(result.fileCount, 2);
  assert.equal(result.crumbs.length, 3);
  assert.equal(result.parent, child);
  assert.equal(summary.folder.entries.reduce((sum, e) => sum + e.size, 0) + summary.folder.omittedSize, 140);
  await assert.rejects(folder(worker, path.join(root, 'missing')), /belum dipindai/);
});

test('bounded file indexes keep exact totals and correct top 500 / top 30', async t => {
  const root = await fixture(t);
  await Promise.all(Array.from({ length: 540 }, (_, i) => fs.writeFile(path.join(root, `file-${String(i).padStart(3, '0')}.dat`), Buffer.alloc(i + 1))));
  const { summary } = await scan(t, root);
  const expected = 540 * 541 / 2;
  assert.equal(summary.totalSize, expected);
  assert.equal(summary.fileCount, 540);
  assert.equal(summary.largestFiles.length, 500);
  assert.equal(summary.largestFiles[0].size, 540);
  assert.equal(summary.largestFiles.at(-1).size, 41);
  assert.equal(summary.folder.entries.length, 30);
  assert.equal(summary.folder.entries.at(-1).size, 511);
  assert.equal(summary.folder.omittedFiles, 510);
  assert.equal(summary.folder.omittedSize + summary.folder.entries.reduce((sum, entry) => sum + entry.size, 0), expected);
});

test('junction cycles and out-of-root linked directories are skipped', async t => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'normal.txt'), Buffer.alloc(22));
  await fs.symlink(root, path.join(root, 'cycle'), process.platform === 'win32' ? 'junction' : 'dir');
  const { summary } = await scan(t, root);
  assert.equal(summary.totalSize, 22);
  assert.equal(summary.links, 1);
  assert.equal(summary.folderCount, 0);
  assert.equal(summary.fileCount, 1);
});

test('empty directory reports a valid zero-size result', async t => {
  const root = await fixture(t);
  const { summary } = await scan(t, root);
  assert.equal(summary.totalSize, 0);
  assert.equal(summary.fileCount, 0);
  assert.equal(summary.folderCount, 0);
  assert.deepEqual(summary.folder.entries, []);
  assert.deepEqual(summary.categories, []);
});

test('file or nonexistent directory fails clearly', async t => {
  const root = await fixture(t);
  const target = path.join(root, 'file.txt');
  await fs.writeFile(target, 'hello');
  await assert.rejects(scan(t, target), /direktori biasa/);
  await assert.rejects(scan(t, path.join(root, 'does-not-exist')), /ENOENT/);
});
