// Generates PWA icons: forest-green gradient background with a centered
// stylized "€" mark. Uses only Node built-ins (no canvas dep).

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
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
  ihdr[8] = 8;
  ihdr[9] = 2;

  const rowSize = w * 3 + 1;
  const raw = Buffer.alloc(rowSize * h);
  for (let y = 0; y < h; y++) {
    raw[y * rowSize] = 0;
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

// Palette
const FOREST_950 = [0x0a, 0x2e, 0x1f];
const FOREST_700 = [0x16, 0x65, 0x34];
const MINT_200 = [0xdc, 0xfc, 0xe7];

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * Diagonal gradient: top-left = forest-700, bottom-right = forest-950.
 */
function gradientBg(x, y, w, h) {
  const t = (x + y) / (w + h);
  return lerp(FOREST_700, FOREST_950, t);
}

/**
 * Centered mint-coloured tile with a forest "F" letterform inside.
 * The F is built from three rectangles (vertical bar, top bar, middle
 * bar) — simple, legible at small sizes, and recognisable as "Finance".
 */
function paintIcon(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = Math.abs(x - cx);
  const dy = Math.abs(y - cy);

  // Centered rounded rectangle (the "tile")
  const tileHalf = w * 0.34;
  const tileRadius = w * 0.12;

  const insideTile = (() => {
    if (dx <= tileHalf - tileRadius && dy <= tileHalf) return true;
    if (dy <= tileHalf - tileRadius && dx <= tileHalf) return true;
    if (dx > tileHalf || dy > tileHalf) return false;
    const ddx = dx - (tileHalf - tileRadius);
    const ddy = dy - (tileHalf - tileRadius);
    return ddx * ddx + ddy * ddy <= tileRadius * tileRadius;
  })();

  if (!insideTile) return gradientBg(x, y, w, h);

  // F glyph — coordinates relative to the tile centre.
  const localX = (x - cx) / w; // ~ -0.34..0.34 inside the tile
  const localY = (y - cy) / h;

  // Vertical stem: slightly left of centre
  const stem =
    localX >= -0.18 &&
    localX <= -0.07 &&
    localY >= -0.22 &&
    localY <= 0.22;

  // Top horizontal arm
  const topArm =
    localX >= -0.18 &&
    localX <= 0.18 &&
    localY >= -0.22 &&
    localY <= -0.12;

  // Middle horizontal arm (shorter)
  const midArm =
    localX >= -0.18 &&
    localX <= 0.08 &&
    localY >= -0.04 &&
    localY <= 0.04;

  if (stem || topArm || midArm) return FOREST_950;
  return MINT_200;
}

const sizes = [192, 512];
for (const size of sizes) {
  const buf = makePng(size, size, paintIcon);
  writeFileSync(`public/icon-${size}.png`, buf);
  console.log(`wrote public/icon-${size}.png (${buf.length} bytes)`);
}
writeFileSync('public/favicon.ico', makePng(32, 32, paintIcon));
console.log('wrote public/favicon.ico');
