// Measure the DELIVERED pixels. No browser, no inference: decode the shipped
// captures and report what is actually on screen.
import { readFileSync, readdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));

const r3Arg=process.argv.find(a=>a.startsWith('--r3='));

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

const linearChannel=v=>{
  v/=255;
  return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;
};
const relativeLuminance=(r,g,b)=>0.2126*linearChannel(r)+0.7152*linearChannel(g)+0.0722*linearChannel(b);
const quantiles=a=>{
  a.sort((x,y)=>x-y);
  return {p10:pct(a,0.10),median:pct(a,0.50),p90:pct(a,0.90)};
};

function maskedPixels(framePath,maskPath,kind){
  const frame=decodePNG(readFileSync(framePath)), mask=decodePNG(readFileSync(maskPath));
  if(frame.w!==mask.w||frame.h!==mask.h)throw new Error(`${kind}: frame/mask size mismatch`);
  const out=[];
  for(let y=0;y<frame.h-42;y+=2)for(let x=0;x<frame.w;x+=2){
    const mi=(y*mask.w+x)*mask.ch;
    if(mask.data[mi]<160||mask.data[mi+1]<160||mask.data[mi+2]<160)continue;
    const i=(y*frame.w+x)*frame.ch,r=frame.data[i],g=frame.data[i+1],b=frame.data[i+2];
    const [h,s,v]=hsv(r,g,b);
    // corridorMat includes verge and shoulder; keep only delivered road-like
    // pixels for the road surface distribution.
    if(kind==='road'&&!(r>=g*0.94&&g>b*1.03&&s<0.34))continue;
    out.push({x,y,r,g,b,h,s,v,lum:relativeLuminance(r,g,b)});
  }
  return {w:frame.w,h:frame.h,pixels:out};
}

function surfaceSummary(row){
  const L=row.pixels.map(p=>p.lum),S=row.pixels.map(p=>p.s),H=row.pixels.map(p=>p.h);
  return {n:L.length,luminance:quantiles(L),saturation:quantiles(S),hue:quantiles(H)};
}

function pairedIsolation(normalPath,variantPath,maskPath,threshold){
  const normal=decodePNG(readFileSync(normalPath)), variant=decodePNG(readFileSync(variantPath));
  const mask=decodePNG(readFileSync(maskPath));
  const affected=[],unaffected=[],ratios=[];let eligible=0;
  for(let y=0;y<normal.h-42;y+=2)for(let x=0;x<normal.w;x+=2){
    const mi=(y*mask.w+x)*mask.ch;
    if(mask.data[mi]<160||mask.data[mi+1]<160||mask.data[mi+2]<160)continue;
    const i=(y*normal.w+x)*normal.ch;
    const a=relativeLuminance(normal.data[i],normal.data[i+1],normal.data[i+2]);
    const b=relativeLuminance(variant.data[i],variant.data[i+1],variant.data[i+2]);
    if(b<0.015)continue;
    eligible++;const ratio=a/b,delta=Math.abs(a-b);
    if(delta>=threshold){affected.push(a);ratios.push(ratio);}else unaffected.push(a);
  }
  return {eligible,coveragePct:100*affected.length/Math.max(1,eligible),
    affectedLuminance:quantiles(affected),surroundingLuminance:quantiles(unaffected),
    deliveredToIsolatedRatio:quantiles(ratios)};
}

function analyseR3(dir){
  const labels=['island-02-tip','island-01-open','keeper-midcountry'];
  const report={measurement:'delivered sRGB decoded to linear relative luminance',maskUse:'semantic masks identify pixels only; RGB values come from delivered.png',references:{}};
  for(const label of labels){
    const base=join(dir,label),surfaces={};
    for(const kind of ['turf','road','scrub','crowns'])surfaces[kind]=surfaceSummary(maskedPixels(join(base,'delivered.png'),join(base,`${kind}-mask.png`),kind));
    const cloud=pairedIsolation(join(base,'delivered.png'),join(base,'unshadowed.png'),join(base,'turf-mask.png'),0.004);
    // "Duty" is the proportion of delivered turf pixels changed by at least
    // 0.004 relative luminance when only cloudShadowAt is returned as 1.0.
    const row={surfaces,cloudShadow:{...cloud,definition:'turf pixels whose delivered luminance changes by >=0.004 when cloudShadowAt alone is isolated'}};
    if(label==='island-02-tip')row.sunBleach=pairedIsolation(join(base,'delivered.png'),join(base,'no-bleach.png'),join(base,'turf-mask.png'),0.003);
    report.references[label]=row;
  }
  const a=report.references['island-02-tip'].surfaces.turf.luminance.median;
  const b=report.references['island-01-open'].surfaces.turf.luminance.median;
  const c=report.references['keeper-midcountry'].surfaces.turf.luminance.median;
  report.comparison={
    island02VsIsland01Pct:(a/b-1)*100,
    island02VsKeeperPct:(a/c-1)*100,
    island01VsKeeperPct:(b/c-1)*100,
    referencesDisagreeByMoreThan10Pct:Math.abs(b/c-1)>0.10,
  };
  return report;
}

if(r3Arg){
  const dir=r3Arg.slice('--r3='.length);
  console.log(JSON.stringify(analyseR3(dir),null,2));
}else{
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
}
