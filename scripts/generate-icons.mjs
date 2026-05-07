// Generates simple PWA icons from scratch using only built-in modules.
// Produces solid brand-color tiles with a centered rounded "card" glyph.
// Replace public/icon-*.png with proper artwork later.

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crcBuf]);
}

function makePng(w, h, paint) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB color type
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowSize = w * 3 + 1;
  const raw = Buffer.alloc(rowSize * h);
  for (let y = 0; y < h; y++) {
    raw[y * rowSize] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const [r, g, b] = paint(x, y, w, h);
      const off = y * rowSize + 1 + x * 3;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
    }
  }
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BRAND = [0x0a, 0x2e, 0x1f]; // forest-950
const ACCENT = [0xdc, 0xfc, 0xe7]; // mint-200
const INNER = [0x14, 0x53, 0x2d]; // forest-800

function paintIcon(x, y, w, h) {
  // Layered rounded squares like a stack of cards
  const cx = w / 2;
  const cy = h / 2;
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);

  const outerHalf = w * 0.34;
  const radiusOuter = w * 0.06;
  const innerHalf = w * 0.22;
  const radiusInner = w * 0.05;

  if (insideRoundRect(dx, dy, outerHalf, outerHalf, radiusOuter)) {
    if (insideRoundRect(dx, dy, innerHalf, innerHalf, radiusInner)) {
      return INNER;
    }
    return ACCENT;
  }
  return BRAND;
}

function insideRoundRect(dx, dy, halfW, halfH, r) {
  if (dx <= halfW - r && dy <= halfH) return true;
  if (dy <= halfH - r && dx <= halfW) return true;
  if (dx > halfW || dy > halfH) return false;
  const ddx = dx - (halfW - r);
  const ddy = dy - (halfH - r);
  return ddx * ddx + ddy * ddy <= r * r;
}

const sizes = [192, 512];
for (const size of sizes) {
  const buf = makePng(size, size, paintIcon);
  writeFileSync(`public/icon-${size}.png`, buf);
  console.log(`wrote public/icon-${size}.png (${buf.length} bytes)`);
}

// Also write a 32x32 favicon as PNG (browsers accept .ico containing PNG too,
// but a plain PNG named favicon.ico is fine for most modern browsers).
writeFileSync('public/favicon.ico', makePng(32, 32, paintIcon));
console.log('wrote public/favicon.ico');
