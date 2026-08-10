// Which COMMON_GLSL term owns the crest flank? Measured by removal: whichever
// term's absence changes the flank most, relative to how much it changes the
// rest of the frame, is the one doing it.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));

function decodePNG(buf) {
  let p = 8, w = 0, h = 0, depth = 0, ctype = 0, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch, out = Buffer.alloc(h * stride);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[q++], row = raw.subarray(q, q + stride); q += stride;
    const o = y * stride, po = (y - 1) * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? out[o + i - ch] : 0, b = y > 0 ? out[po + i] : 0, c = (i >= ch && y > 0) ? out[po + i - ch] : 0;
      let v = row[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      out[o + i] = v & 255;
    }
  }
  return { w, h, ch, data: out };
}
const L = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

const DIR = join(HERE, 'island-02-diagnose') + '/';
const names = ['baseline', 'rock-off', 'comb-off', 'distfade-off', 'terracettes-off'];
const img = {};
for (const n of names) img[n] = decodePNG(readFileSync(DIR + `crest-${n}.png`));
const { w, h, ch } = img.baseline;

// the flank: left of the road, below the horizon. Located by scanning for the
// darkest sustained vegetation column band rather than guessed.
const BOX = { x0: 20, x1: Math.round(w * 0.34), y0: Math.round(h * 0.50), y1: Math.round(h * 0.82) };
const REST = { x0: Math.round(w * 0.52), x1: w - 20, y0: Math.round(h * 0.50), y1: Math.round(h * 0.82) };

function meanAbsDiff(a, b, box) {
  let s = 0, n = 0;
  for (let y = box.y0; y < box.y1; y++) for (let x = box.x0; x < box.x1; x++) {
    const i = (y * w + x) * ch; s += Math.abs(L(a.data, i) - L(b.data, i)); n++;
  }
  return s / n;
}
function anisotropy(a, box) {
  let gx = 0, gy = 0, n = 0, sum = 0, sq = 0;
  for (let y = box.y0 + 1; y < box.y1 - 1; y++) for (let x = box.x0 + 1; x < box.x1 - 1; x++) {
    const i = (y * w + x) * ch;
    const v = L(a.data, i);
    gx += Math.abs(L(a.data, i + ch) - v);
    gy += Math.abs(L(a.data, i + w * ch) - v);
    sum += v; sq += v * v; n++;
  }
  return { gx: gx / n, gy: gy / n, ratio: (gy / n) / Math.max(1e-6, gx / n),
           std: Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2)) };
}

console.log(`flank box x${BOX.x0}-${BOX.x1} y${BOX.y0}-${BOX.y1}   control box x${REST.x0}-${REST.x1}\n`);
console.log('variant             Δflank   Δcontrol   ratio    |dI/dx|  |dI/dy|  dy/dx   std');
for (const n of names) {
  const df = n === 'baseline' ? 0 : meanAbsDiff(img.baseline, img[n], BOX);
  const dc = n === 'baseline' ? 0 : meanAbsDiff(img.baseline, img[n], REST);
  const a = anisotropy(img[n], BOX);
  console.log(`${n.padEnd(18)} ${df.toFixed(2).padStart(6)} ${dc.toFixed(2).padStart(10)} ` +
    `${(df / Math.max(0.01, dc)).toFixed(2).padStart(7)}   ${a.gx.toFixed(2).padStart(6)} ${a.gy.toFixed(2).padStart(8)} ` +
    `${a.ratio.toFixed(2).padStart(6)} ${a.std.toFixed(2).padStart(6)}`);
}
