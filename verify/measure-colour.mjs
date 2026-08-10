// Exact replication of three r185's colour math (ColorManagement on by
// default: setHex assumes sRGB and converts to the LinearSRGB working space,
// and lerp interpolates in that working space).
const s2l = c => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const l2s = c => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
const col = h => [s2l(((h >> 16) & 255) / 255), s2l(((h >> 8) & 255) / 255), s2l((h & 255) / 255)];
const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const mixc = (a, b, t) => lerp(col(a), col(b), t);
const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(1, l2s(v))) * 255).toString(16).padStart(2, '0')).join('');
// hue/sat from the sRGB-encoded value, which is what an eye reading the frame sees
function hsv(c) {
  const r = l2s(c[0]), g = l2s(c[1]), b = l2s(c[2]);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-9) {
    if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: mx < 1e-9 ? 0 : d / mx, v: mx };
}

const PAL = { sky:0x5EC2E8, cloud:0xFFFBEF, sunGrass:0xC3E56A, meadow:0x74B851,
  leafShade:0x3C7A55, woodDeep:0x1B4239, bark:0x6B4A34, road:0xE9DCB4, blossom:0xEBAFB9 };

const C_VALLEY_LO = col(PAL.meadow);
const C_VALLEY_HI = mixc(PAL.sunGrass, PAL.meadow, 0.10);
const C_COMMON_LO = lerp(mixc(PAL.meadow, PAL.bark, 0.46), col(PAL.sunGrass), 0.24);
const C_COMMON_HI = lerp(mixc(PAL.sunGrass, PAL.road, 0.50), col(PAL.bark), 0.38);
const C_DRY       = lerp(mixc(PAL.sunGrass, PAL.road, 0.44), col(PAL.bark), 0.22);
const C_STONE_LIT = lerp(mixc(PAL.road, PAL.leafShade, 0.24), col(PAL.bark), 0.12);
const C_ROAD_MID  = mixc(PAL.road, PAL.bark, 0.055);

const show = (n, c) => { const k = hsv(c);
  console.log(`  ${n.padEnd(14)} ${hex(c)}  lum ${lum(c).toFixed(3)}  hue ${k.h.toFixed(0).padStart(3)}°  sat ${k.s.toFixed(2)}  val ${k.v.toFixed(2)}`); };

console.log('AUTHORED ENDPOINTS');
show('VALLEY_LO', C_VALLEY_LO); show('VALLEY_HI', C_VALLEY_HI);
show('COMMON_LO', C_COMMON_LO); show('COMMON_HI', C_COMMON_HI);
show('DRY', C_DRY); show('STONE_LIT', C_STONE_LIT); show('ROAD_MID', C_ROAD_MID);

// groundColorL on LEVEL ground (slope 0, thin 0, rel 0), which is where the
// rider spends the ride. e = 0.14 + t*0.94, t is fbm in [0,1] with mean ~0.5.
function turf(open, e) {
  const lo = lerp(C_VALLEY_LO, C_COMMON_LO, open);
  const hi = lerp(C_VALLEY_HI, C_COMMON_HI, open);
  return lerp(lo, hi, e);
}
console.log('\nLEVEL GROUND, slope=0 thin=0 — valley (open=0) vs common (open=1)');
console.log('  t     e      valley                                    common                                    Δlum  Δhue');
for (const t of [0.15, 0.30, 0.50, 0.70, 0.85]) {
  const e = Math.max(0, Math.min(1, 0.14 + t * 0.94));
  const V = turf(0, e), C = turf(1, e);
  const kv = hsv(V), kc = hsv(C);
  console.log(`  ${t.toFixed(2)}  ${e.toFixed(2)}   ${hex(V)} lum ${lum(V).toFixed(3)} hue ${kv.h.toFixed(0).padStart(3)}° sat ${kv.s.toFixed(2)}   ` +
              `${hex(C)} lum ${lum(C).toFixed(3)} hue ${kc.h.toFixed(0).padStart(3)}° sat ${kc.s.toFixed(2)}   ` +
              `${(lum(C) - lum(V)).toFixed(3).padStart(6)} ${(kc.h - kv.h).toFixed(0).padStart(4)}°`);
}

// the sensitivity of `open` to residual enclosure: open = clamp(1-enc*2.4,0,1)
console.log('\nSENSITIVITY OF THE COMMON SHIFT TO RESIDUAL ENCLOSURE  (open = 1 - enc*2.4)');
const eMid = 0.14 + 0.5 * 0.94;
for (const enc of [0, 0.05, 0.10, 0.15, 0.20, 0.30, 0.42]) {
  const open = Math.max(0, Math.min(1, 1 - enc * 2.4));
  const C = turf(open, eMid), V = turf(0, eMid), F = turf(1, eMid);
  const frac = (lum(C) - lum(V)) / (lum(F) - lum(V) || 1);
  console.log(`  enc ${enc.toFixed(2)}  open ${open.toFixed(2)}  ${hex(C)}  hue ${hsv(C).h.toFixed(0).padStart(3)}°  ` +
              `${(frac * 100).toFixed(0).padStart(3)}% of the way to common`);
}

// C_DRY is slope-gated: clamp((slope-0.18)*1.4, 0, 0.46)
console.log('\nC_DRY WEIGHT vs SLOPE  — clamp((slope-0.18)*1.4, 0, 0.46) * open * (0.42+0.58*t2)');
for (const sl of [0, 0.05, 0.10, 0.18, 0.25, 0.40, 0.60]) {
  const w = Math.max(0, Math.min(0.46, (sl - 0.18) * 1.4));
  console.log(`  slope ${sl.toFixed(2)} (${(Math.atan(sl) * 180 / Math.PI).toFixed(0).padStart(2)}°)  weight ${w.toFixed(3)}  ${w === 0 ? '<-- contributes NOTHING' : ''}`);
}

// far masses: the lit/cool separation is what gives a distant mass its form
console.log('\nFAR MASSES — lit vs cool separation per ring (FAR_SKY_MAX = 0.12)');
for (const ring of [{ n: 'inner', lift: 0.07 }, { n: 'outer', lift: 0.12 }]) {
  for (const jitter of [0, 0.04]) {
    const cool = lerp(mixc(PAL.leafShade, PAL.woodDeep, 0.26), col(PAL.sky), Math.min(0.12, ring.lift + jitter));
    for (const lj of [0, 0.18]) {
      const lit = lerp(mixc(PAL.meadow, PAL.leafShade, 0.30 + lj), col(PAL.sky), Math.min(0.12, ring.lift * 0.55));
      const ratio = lum(lit) / lum(cool);
      console.log(`  ${ring.n} lift ${ring.lift}  jitter ${jitter}/${lj}  lit ${hex(lit)} lum ${lum(lit).toFixed(3)}  ` +
                  `cool ${hex(cool)} lum ${lum(cool).toFixed(3)}  ratio ${ratio.toFixed(2)}:1`);
    }
  }
}
// what it was BEFORE the A4 cap, for comparison
console.log('\n  ...and what the same masses were before the A4 sky-lerp cap (lift 0.16 / 0.26, uncapped):');
for (const ring of [{ n: 'inner', lift: 0.16 }, { n: 'outer', lift: 0.26 }]) {
  const cool = lerp(mixc(PAL.leafShade, PAL.woodDeep, 0.26), col(PAL.sky), ring.lift + 0.04);
  const lit = lerp(mixc(PAL.meadow, PAL.leafShade, 0.30), col(PAL.sky), ring.lift * 0.55);
  console.log(`  ${ring.n} lift ${ring.lift}  lit lum ${lum(lit).toFixed(3)}  cool lum ${lum(cool).toFixed(3)}  ratio ${(lum(lit) / lum(cool)).toFixed(2)}:1`);
}
