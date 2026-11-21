// Generates icon-192.png and icon-512.png with no external deps.
// Draws a dark rounded-ish background with a blue upward arrow (growth) motif.
import zlib from "node:zlib";
import { writeFileSync } from "node:fs";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function png(size, draw) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };
  draw(set, size);

  // Build raw image data with filter byte per row
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function draw(set, size) {
  const bg = [15, 17, 21];
  const tile = [30, 42, 74];
  const accent = [91, 140, 255];
  const cx = size / 2;
  const r = size * 0.42;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // rounded square background
      const inset = size * 0.06;
      const rad = size * 0.22;
      let inside = x >= inset && y >= inset && x <= size - inset && y <= size - inset;
      // round corners
      const corners = [
        [inset + rad, inset + rad], [size - inset - rad, inset + rad],
        [inset + rad, size - inset - rad], [size - inset - rad, size - inset - rad],
      ];
      if (inside) {
        const nearCorner =
          (x < inset + rad && y < inset + rad) ||
          (x > size - inset - rad && y < inset + rad) ||
          (x < inset + rad && y > size - inset - rad) ||
          (x > size - inset - rad && y > size - inset - rad);
        if (nearCorner) {
          inside = corners.some(([ccx, ccy]) => Math.hypot(x - ccx, y - ccy) <= rad &&
            (x <= ccx ? x >= inset : x <= size - inset) && (y <= ccy ? y >= inset : y <= size - inset)) ||
            corners.some(([ccx, ccy]) => Math.hypot(x - ccx, y - ccy) <= rad);
        }
      }
      if (!inside) { set(x, y, bg[0], bg[1], bg[2], 255); continue; }
      set(x, y, tile[0], tile[1], tile[2], 255);
    }
  }

  // Upward arrow (growth) centered
  const w = size * 0.07;
  // vertical shaft
  for (let y = size * 0.32; y <= size * 0.70; y++) {
    for (let x = cx - w; x <= cx + w; x++) set(Math.round(x), Math.round(y), accent[0], accent[1], accent[2], 255);
  }
  // arrow head
  const headH = size * 0.20;
  const topY = size * 0.28;
  for (let dy = 0; dy <= headH; dy++) {
    const half = (headH - dy) * 1.2 + w;
    for (let x = cx - half; x <= cx + half; x++) {
      set(Math.round(x), Math.round(topY + dy), accent[0], accent[1], accent[2], 255);
    }
  }
}

for (const size of [192, 512]) {
  const buf = png(size, draw);
  writeFileSync(`icon-${size}.png`, buf);
  console.log(`wrote icon-${size}.png (${buf.length} bytes)`);
}
