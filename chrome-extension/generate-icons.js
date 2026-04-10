// Pure Node.js PNG generator (no external deps)
const zlib = require('zlib');
const fs = require('fs');

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const tb = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([tb, data])));
  return Buffer.concat([len, tb, data, crcBuf]);
}

// Draw pixel at (x,y) with RGBA
function createIconPNG(size) {
  // Colors
  const BG   = [124, 58, 237]; // #7c3aed purple
  const FG   = [255, 255, 255]; // white

  // Simple "M" bitmap (15x11, will be centered)
  const M = [
    [1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
    [1,1,0,0,0,0,0,0,0,0,0,0,0,1,1],
    [1,1,1,0,0,0,0,0,0,0,0,0,1,1,1],
    [1,1,0,1,0,0,0,0,0,0,0,1,0,1,1],
    [1,1,0,0,1,0,0,0,0,0,1,0,0,1,1],
    [1,1,0,0,0,1,0,0,0,1,0,0,0,1,1],
    [1,1,0,0,0,0,1,0,1,0,0,0,0,1,1],
    [1,1,0,0,0,0,0,1,0,0,0,0,0,1,1],
    [1,1,0,0,0,0,0,0,0,0,0,0,0,1,1],
    [1,1,0,0,0,0,0,0,0,0,0,0,0,1,1],
    [1,1,0,0,0,0,0,0,0,0,0,0,0,1,1],
  ];

  const mH = M.length;    // 11
  const mW = M[0].length; // 15
  const scale = Math.max(1, Math.floor(size / 18));
  const offX = Math.floor((size - mW * scale) / 2);
  const offY = Math.floor((size - mH * scale) / 2);

  // Build pixel grid (RGB)
  const pixels = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      // Rounded corners: treat corners as transparent (white fallback)
      const r = size * 0.22;
      const dx = Math.min(x, size - 1 - x);
      const dy = Math.min(y, size - 1 - y);
      const inCorner = dx < r && dy < r && Math.hypot(dx - r, dy - r) > r;

      if (inCorner) { row.push(BG); continue; } // same color keeps it square on dark bg

      // Map pixel to M bitmap
      const mx = Math.floor((x - offX) / scale);
      const my = Math.floor((y - offY) / scale);
      if (my >= 0 && my < mH && mx >= 0 && mx < mW && M[my][mx]) {
        row.push(FG);
      } else {
        row.push(BG);
      }
    }
    pixels.push(row);
  }

  // Encode as PNG
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB

  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 3)] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const off = y * (1 + size * 3) + 1 + x * 3;
      raw[off]     = pixels[y][x][0];
      raw[off + 1] = pixels[y][x][1];
      raw[off + 2] = pixels[y][x][2];
    }
  }

  const idat = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idat),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = __dirname;
for (const size of [16, 48, 128]) {
  const buf = createIconPNG(size);
  fs.writeFileSync(`${dir}/icon${size}.png`, buf);
  console.log(`Created icon${size}.png`);
}
// icon.png = 48px (used by notifications)
fs.writeFileSync(`${dir}/icon.png`, createIconPNG(48));
console.log('Created icon.png');
