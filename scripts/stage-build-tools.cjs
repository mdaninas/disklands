// Copy a verified, already-downloaded build tool without carrying NTFS encryption attributes.
const fs = require('node:fs/promises');
const path = require('node:path');
const source = path.resolve(process.argv[2] || '');
const destination = path.resolve(process.argv[3] || '');
const allowed = path.resolve(__dirname, '../build/tools');
const relative = path.relative(allowed, destination);
if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Destination must be inside build/tools.');
async function copy(from, to) {
  const info = await fs.lstat(from);
  if (info.isSymbolicLink()) return;
  if (info.isDirectory()) {
    await fs.mkdir(to, { recursive: true });
    for (const name of await fs.readdir(from)) await copy(path.join(from, name), path.join(to, name));
  } else {
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.writeFile(to, await fs.readFile(from));
  }
}
copy(source, destination).catch(error => { console.error(error.message); process.exitCode = 1; });
