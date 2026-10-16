// Rasterize the code-native Disklands mark and write a standard PNG-backed Windows ICO.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const width = 256;
const pixels = Buffer.alloc((width * 4 + 1) * width);
const inside = (x, y, left, top, right, bottom, radius) => {
  if (x < left || x >= right || y < top || y >= bottom) return false;
  const cx = Math.max(left + radius, Math.min(right - radius, x));
  const cy = Math.max(top + radius, Math.min(bottom - radius, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
};
for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
  const offset = y * (width * 4 + 1) + 1 + x * 4;
  let color = [238, 238, 229, inside(x, y, 0, 0, width, width, 16) ? 255 : 0];
  const shapes = [[48, 48, 120, 120, [134, 169, 80]], [136, 48, 208, 120, [170, 202, 116]], [48, 136, 120, 208, [99, 139, 66]], [136, 136, 208, 208, [211, 183, 121]]];
  for (const [left, top, right, bottom, channels] of shapes) {
    if (inside(x, y, left, top, right, bottom, 0)) {
      const shade = y < top + 7 ? 1.15 : x > right - 7 || y > bottom - 7 ? .77 : 1;
      color = channels.map(channel => Math.min(255, Math.round(channel * shade))).concat(255);
    }
  }
  pixels.set(color, offset);
}
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const type = Buffer.from(name);
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  type.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([type, data])), out.length - 4);
  return out;
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(width, 4);
header[8] = 8;
header[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(1, 4);
ico.writeUInt16LE(1, 10);
ico.writeUInt16LE(32, 12);
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18);
const directory = path.join(__dirname, '../build');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'icon.png'), png);
fs.writeFileSync(path.join(directory, 'icon.ico'), Buffer.concat([ico, png]));
fs.writeFileSync(path.join(__dirname, '../public/icon.png'), png);
