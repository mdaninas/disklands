const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js')], { cwd: root, stdio: 'inherit' });
let desktop;
let closing = false;
function stop() {
  if (closing) return;
  closing = true;
  desktop?.kill();
  vite.kill();
}
function wait() {
  const request = http.get('http://127.0.0.1:5173', response => {
    response.resume();
    const env = { ...process.env, RUANG_DEV_URL: 'http://127.0.0.1:5173' };
    delete env.ELECTRON_RUN_AS_NODE;
    desktop = spawn(require('electron'), [root, ...process.argv.slice(2)], { cwd: root, env, stdio: 'inherit', windowsHide: true });
    desktop.on('exit', code => { stop(); process.exit(code || 0); });
  });
  request.on('error', () => { if (!closing) setTimeout(wait, 300); });
}
vite.on('exit', () => { stop(); process.exit(); });
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
wait();
