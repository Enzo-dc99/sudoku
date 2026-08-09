/* Génère les icônes PNG de la PWA sans dépendance externe.
   Usage : node tools/make-icons.js */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'icons');

/* --- encodage PNG minimal --- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = buf => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --- dessin --- */
function makeIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const set = (x, y, r, g, b, a = 1) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const sa = a, da = px[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa === 0) return;
    px[i]     = Math.round((r * sa + px[i]     * da * (1 - sa)) / oa);
    px[i + 1] = Math.round((g * sa + px[i + 1] * da * (1 - sa)) / oa);
    px[i + 2] = Math.round((b * sa + px[i + 2] * da * (1 - sa)) / oa);
    px[i + 3] = Math.round(oa * 255);
  };

  // fond : dégradé bleu vertical
  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const r = Math.round(47 + (26 - 47) * t);
    const g = Math.round(111 + (70 - 111) * t);
    const b = Math.round(208 + (170 - 208) * t);
    for (let x = 0; x < size; x++) set(x, y, r, g, b, 1);
  }

  // grille 3x3 de tuiles arrondies, anticrénelée
  const area = size * 0.62;
  const origin = (size - area) / 2;
  const gap = area * 0.075;
  const cell = (area - gap * 2) / 3;
  const radius = cell * 0.22;
  const strong = [0, 2, 4, 6, 8];

  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const x0 = origin + c * (cell + gap);
    const y0 = origin + r * (cell + gap);
    const alpha = strong.includes(r * 3 + c) ? 1 : 0.42;
    for (let y = Math.floor(y0) - 1; y <= Math.ceil(y0 + cell) + 1; y++) {
      for (let x = Math.floor(x0) - 1; x <= Math.ceil(x0 + cell) + 1; x++) {
        // couverture approchée par sur-échantillonnage 3x3
        let cover = 0;
        for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
          const pxc = x + (sx + 0.5) / 3, pyc = y + (sy + 0.5) / 3;
          const dx = Math.max(x0 + radius - pxc, 0, pxc - (x0 + cell - radius));
          const dy = Math.max(y0 + radius - pyc, 0, pyc - (y0 + cell - radius));
          const inside = pxc >= x0 && pxc <= x0 + cell && pyc >= y0 && pyc <= y0 + cell
            && Math.hypot(dx, dy) <= radius + 1e-9;
          if (inside) cover++;
        }
        if (cover) set(x, y, 255, 255, 255, alpha * (cover / 9));
      }
    }
  }
  return encodePNG(size, size, px);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  fs.writeFileSync(path.join(OUT, name), makeIcon(size));
  console.log('écrit', name, size + 'px');
}
