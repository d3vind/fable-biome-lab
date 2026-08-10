// Measure the DELIVERED pixels. No browser, no inference: decode the shipped
// captures and report what is actually on screen.
import { readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));

function decodePNG(buf) {
  let p = 8, w = 0, h = 0, depth = 0, ctype = 0, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9];
      if (data[12] !== 0) throw new Error('interlaced'); }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8) throw new Error('depth ' + depth);
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch, out = Buffer.alloc(h * stride);
  let q = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[q++]; const row = raw.subarray(q, q + stride); q += stride;
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

const hsv = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let hu = 0;
  if (d > 1e-9) { if (mx === r) hu = ((g - b) / d + 6) % 6; else if (mx === g) hu = (b - r) / d + 2; else hu = (r - g) / d + 4; hu *= 60; }
  return [hu, mx < 1e-9 ? 0 : d / mx, mx];
};
const pct = (a, q) => a.length ? a[Math.min(a.length - 1, Math.floor(q * (a.length - 1)))] : 0;

function analyse(path) {
  const { w, h, ch, data } = decodePNG(readFileSync(path));
  const veg = { hue: [], sat: [], val: [] }, clip = { n: 0, tot: 0 };
  // far-mass band: vegetation-class pixels that are dark AND sit in the upper
  // half of the non-sky part of the frame
  const far = [];
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * ch, r = data[i], g = data[i + 1], b = data[i + 2];
      clip.tot++; if (Math.max(r, g, b) >= 250) clip.n++;
      if (b > g && b > r) continue;                   // sky
      const [hu, s, v] = hsv(r, g, b);
      if (s < 0.16) continue;                         // road / stone / cloud
      if (!(g >= r && g >= b)) continue;              // not vegetation-ish
      veg.hue.push(hu); veg.sat.push(s); veg.val.push(v);
      if (v < 0.62 && y < h * 0.60) far.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
    }
  }
  for (const k of ['hue', 'sat', 'val']) veg[k].sort((a, b) => a - b);
  far.sort((a, b) => a - b);
  const name = path.split('/').slice(-2).join('/');
  const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  return {
    name, n: veg.hue.length,
    hue: [pct(veg.hue, 0.25), pct(veg.hue, 0.5), pct(veg.hue, 0.75)],
    sat: [pct(veg.sat, 0.25), pct(veg.sat, 0.5), pct(veg.sat, 0.75)],
    val: [pct(veg.val, 0.25), pct(veg.val, 0.5), pct(veg.val, 0.75)],
    clipPct: 100 * clip.n / clip.tot,
    farN: far.length, farMean: mean(far),
    farSpread: far.length ? pct(far, 0.9) - pct(far, 0.1) : 0,
  };
}

const rows = [];
for (const f of ['rows.png', 'headland.png'])
  rows.push(analyse(join(HERE, 'island-shots', f)));
for (const f of readdirSync(join(HERE, 'island-02-shots')).sort())
  rows.push(analyse(join(HERE, 'island-02-shots', f)));

console.log('VEGETATION-CLASS PIXELS  (hue/sat/val quartiles, sRGB as displayed)');
console.log('file                              n      hue p25/50/75      sat p25/50/75     val p25/50/75    clip%');
for (const r of rows) {
  console.log(`${r.name.padEnd(32)} ${String(r.n).padStart(6)}  ` +
    `${r.hue.map(v => v.toFixed(0).padStart(3)).join('/')}°        ` +
    `${r.sat.map(v => v.toFixed(2)).join('/')}   ` +
    `${r.val.map(v => v.toFixed(2)).join('/')}   ` +
    `${r.clipPct.toFixed(2)}`);
}
console.log('\nFAR-MASS BAND  (dark vegetation pixels in the upper 60% of frame)');
console.log('file                              n      mean lum   p10-p90 spread');
for (const r of rows)
  console.log(`${r.name.padEnd(32)} ${String(r.farN).padStart(6)}   ${r.farMean.toFixed(1).padStart(6)}      ${r.farSpread.toFixed(1).padStart(6)}`);
