// Draws the app icon: the pill itself, as a gauge, on a dark squircle.
//
// Written pixel by pixel so the repo needs no image tooling. Run with
// `npm run app-icon`; electron-builder turns the PNG into the .icns.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "assets");
const SIZE = 1024;
const SAMPLES = 4; // per axis, so 16 samples a pixel

// --- the drawing ------------------------------------------------------------

const C = SIZE / 2;
// macOS sizes the art to 824 of the 1024 canvas, leaving room for the shadow.
const SQUIRCLE_HALF = 824 / 2;
const SQUIRCLE_N = 5; // superellipse exponent: Apple's rounded corner
// The capsule: a stadium 520 x 210, stroked, with the left 62% filled in.
const CAP_HALF_W = 260;
const CAP_HALF_H = 105;
const CAP_R = CAP_HALF_H;
const STROKE = 34;
const FILL_GAP = 22; // clear space between the stroke and the fill
const FILL_SHARE = 0.62;

const INK_TOP = [0x1c, 0x1c, 0x24];
const INK_BOTTOM = [0x0a, 0x0a, 0x0c];
const CHALK = [0xec, 0xec, 0xea];
const BLUE = [0x7b, 0x8b, 0xff];

/** Inside Apple's rounded square. */
function inSquircle(x, y) {
  const dx = Math.abs(x - C) / SQUIRCLE_HALF;
  const dy = Math.abs(y - C) / SQUIRCLE_HALF;
  return dx ** SQUIRCLE_N + dy ** SQUIRCLE_N <= 1;
}

/** Signed distance to the capsule outline: negative inside. */
function capsuleDistance(x, y) {
  const dx = Math.max(Math.abs(x - C) - (CAP_HALF_W - CAP_R), 0);
  const dy = Math.max(Math.abs(y - C) - (CAP_HALF_H - CAP_R), 0);
  return Math.hypot(dx, dy) - CAP_R;
}

const FILL_EDGE = C - CAP_HALF_W + 2 * CAP_HALF_W * FILL_SHARE;

/** The colour at one sample point, or null where the icon is transparent. */
function sample(x, y) {
  if (!inSquircle(x, y)) return null;
  const d = capsuleDistance(x, y);
  if (Math.abs(d) <= STROKE / 2) return CHALK;
  if (d < -(STROKE / 2 + FILL_GAP) && x <= FILL_EDGE) return BLUE;
  const t = y / SIZE;
  return [
    INK_TOP[0] + (INK_BOTTOM[0] - INK_TOP[0]) * t,
    INK_TOP[1] + (INK_BOTTOM[1] - INK_TOP[1]) * t,
    INK_TOP[2] + (INK_BOTTOM[2] - INK_TOP[2]) * t,
  ];
}

/** One pixel, averaged over its samples so the edges are smooth. */
function pixel(px, py) {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (let i = 0; i < SAMPLES; i++) {
    for (let j = 0; j < SAMPLES; j++) {
      const c = sample(px + (i + 0.5) / SAMPLES, py + (j + 0.5) / SAMPLES);
      if (!c) continue;
      r += c[0];
      g += c[1];
      b += c[2];
      a += 1;
    }
  }
  const n = SAMPLES * SAMPLES;
  if (!a) return [0, 0, 0, 0];
  // Colours are averaged over the covered samples only, so a partly covered
  // edge pixel keeps its colour and loses only alpha.
  return [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round((a / n) * 255)];
}

// --- PNG --------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, colourAt) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = colourAt(x, y);
      row[1 + x * 4] = r;
      row[1 + x * 4 + 1] = g;
      row[1 + x * 4 + 2] = b;
      row[1 + x * 4 + 3] = a;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, "icon.png");
writeFileSync(file, png(SIZE, pixel));
console.log(`wrote ${file} (${SIZE}x${SIZE})`);
