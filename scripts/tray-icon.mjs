// Draws the menu bar icon (a small pill outline) as template PNGs, without
// any image library: black pixels with alpha, which macOS tints itself.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "assets");
mkdirSync(out, { recursive: true });

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
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

function png(size, alphaAt) {
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      row[1 + x * 4 + 3] = Math.round(255 * alphaAt(x, y));
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
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Distance from a point to a rounded rectangle (a stadium), supersampled. */
function pillAlpha(size) {
  const s = size / 16;
  const w = 12 * s, h = 6 * s, r = h / 2, stroke = 1.5 * s;
  const cx = size / 2, cy = size / 2;
  const sdf = (px, py) => {
    const dx = Math.max(Math.abs(px - cx) - (w / 2 - r), 0);
    const dy = Math.max(Math.abs(py - cy) - (h / 2 - r), 0);
    return Math.hypot(dx, dy) - r;
  };
  return (x, y) => {
    let hit = 0;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        const d = sdf(x + (i + 0.5) / 4, y + (j + 0.5) / 4);
        // Outline, plus a filled left third so it reads as a gauge.
        const inOutline = Math.abs(d) <= stroke / 2;
        const inFill = d < 0 && x + (i + 0.5) / 4 < cx - w / 2 + w * 0.4;
        if (inOutline || inFill) hit++;
      }
    }
    return hit / 16;
  };
}

writeFileSync(path.join(out, "trayTemplate.png"), png(16, pillAlpha(16)));
writeFileSync(path.join(out, "trayTemplate@2x.png"), png(32, pillAlpha(32)));
console.log("wrote", path.join(out, "trayTemplate.png"), "and @2x");
