const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const { version } = require('../package.json');
// Keep each unpacked build separate so a running older release is never overwritten.
const outputDir = path.join('release', `v${version}`);
const artifactName = `Disklands-${version}-Windows.exe`;
const env = { ...process.env };
// Locally staged tools avoid Windows failures when an encrypted cache is on another drive.
const tools = {
  ELECTRON_BUILDER_7ZIP_PATH: 'build/tools/7zip/bin/7za.exe',
  ELECTRON_BUILDER_NSIS_DIR: 'build/tools/nsis',
  ELECTRON_BUILDER_NSIS_RESOURCES_DIR: 'build/tools/nsis-resources'
};
for (const [key, relative] of Object.entries(tools)) {
  const resolved = path.join(root, relative);
  if (!env[key] && fs.existsSync(resolved)) env[key] = resolved;
}
// Electron 44 downloads its runtime on first use.
require('electron');
const builder = spawn(process.execPath, [require.resolve('electron-builder/cli.js'), '--win', 'portable', '--x64', '--publish', 'never', `--config.directories.output=${outputDir}`], { cwd: root, env, stdio: 'inherit', windowsHide: true });
builder.on('error', error => { console.error(error.message); process.exitCode = 1; });
builder.on('close', code => {
  if (code !== 0) {
    process.exitCode = typeof code === 'number' ? code : 1;
    return;
  }
  try {
    // Byte copying also works when Windows cache files use encryption on another drive.
    const portable = fs.readFileSync(path.join(root, outputDir, artifactName));
    fs.writeFileSync(path.join(root, 'release', artifactName), portable);
    console.log(`Portable ready: release/${artifactName}`);
  } catch (error) {
    console.error(`Failed to prepare portable EXE: ${error.message}`);
    process.exitCode = 1;
  }
});
