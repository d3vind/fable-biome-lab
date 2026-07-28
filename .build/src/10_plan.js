/* ==================================================================
 *  WORLD PLAN
 *  A seed produces a frozen, serialisable description of the place.
 *  Nothing here knows about triangles, quality tiers or the renderer:
 *  the plan is what low / standard / high must all agree on.
 * ================================================================== */

const DS = 4;                 // route sample spacing (m)
const WATER_Y = 0;            // the tide plane is the world datum
const ROAD_HALF = 2.36;       // 4.72 m carriageway
const SEAM = 0.34;            // dark contact seam beyond the carriageway
const GRAVEL = 2.15;          // wet gravel / broken loam
const VERGE = 2.9;            // sedge verge before the batter slope
const CORRIDOR = ROAD_HALF + SEAM + GRAVEL + VERGE;   // 7.75 m of made ground

const CHAPTERS = [
  { key: 'hush', name: 'Hush' },
  { key: 'exposure', name: 'Exposure' },
  { key: 'sluices', name: 'The Three Sluices' },
  { key: 'orchard', name: 'The Drowned Orchard' },
  { key: 'fork', name: 'Two Ways With the Wind' },
  { key: 'wheel', name: 'The Tide Wheel' },
  { key: 'afterglow', name: 'Afterglow' },
];

/* ---------- 1D helpers used only by the planner ---------- */
const n1 = (t, s) => gnoise(t, 37.19, s);
function fbm1(t, s, oct = 4) {
  let v = 0, a = 1, nrm = 0, f = 1;
  for (let i = 0; i < oct; i++) { v += a * gnoise(t * f, 37.19 + i * 11.7, s + i * 617); nrm += a; a *= 0.5; f *= 2.11; }
  return v / nrm;
}

/** A sampled centreline. All arrays are parallel; s[] is arc length from the start. */
function makePoly(n) {
  return { n, x: new Float32Array(n), z: new Float32Array(n), y: new Float32Array(n), h: new Float32Array(n), s: new Float32Array(n), len: 0 };
}
function polyFinish(p) {
  p.s[0] = 0;
  for (let i = 1; i < p.n; i++) p.s[i] = p.s[i - 1] + Math.hypot(p.x[i] - p.x[i - 1], p.z[i] - p.z[i - 1]);
  p.len = p.s[p.n - 1];
  for (let i = 0; i < p.n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(p.n - 1, i + 1);
    p.h[i] = Math.atan2(p.z[b] - p.z[a], p.x[b] - p.x[a]);
  }
  return p;
}

/* ==================================================================
 *  the planner
 * ================================================================== */
function buildPlan(seedStr) {
  const seedU = hashStr(seedStr);
  const R = new Rng(seedU, 'plan:structure');
  const nz = (seedU ^ 0x5bf03635) >>> 0;         // noise-field seed for terrain fields

  /* ---------------- weather arc, tide, wind ---------------- */
  const tide = +R.f(0.22, 0.66).toFixed(3);      // depth of standing water over the low marsh
  const windDir = +R.f(0, TAU).toFixed(4);
  const windBase = +R.f(3.1, 4.9).toFixed(3);    // m/s at the open causeway
  const wd = [Math.cos(windDir), Math.sin(windDir)];

  const weather = {
    tide,
    windDir, windBase,
    // the sky opens as the ride goes on; each entry is (routeFraction, openness)
    deckOpen: Array.from({ length: 6 }, (_, i) => +sat(R.f(0.12, 0.42) + i * R.f(0.05, 0.12)).toFixed(3)),
    mistBase: +R.f(0.42, 0.78).toFixed(3),
    /* The deck is not one flat lid for forty minutes. One break is guaranteed early, low
       and copper — the first time the country is given a warm light instead of a grey one
       — and two or three more are scattered by rule over the rest of the ride. */
    breaks: (() => {
      const b = [{ s: +R.f(1450, 2250).toFixed(0), len: +R.f(430, 700).toFixed(0), depth: +R.f(0.62, 0.88).toFixed(2) }];
      const n = R.i(2, 3);
      for (let i = 0; i < n; i++) b.push({ s: +R.f(4200, 17000).toFixed(0), len: +R.f(500, 1100).toFixed(0), depth: +R.f(0.35, 0.78).toFixed(2) });
      return b.sort((x, y) => x.s - y.s);
    })(),
    sunAz: +(windDir + R.f(-1.5, 1.5)).toFixed(4),
    sunEl: +R.f(0.125, 0.215).toFixed(4),         // radians — first light, sun barely clear of the reeds
    warmth: +R.f(0.38, 0.72).toFixed(3),
  };

  /* ---------------- chapter lengths ---------------- */
  const jit = (base, spread) => Math.round(base * R.f(1 - spread, 1 + spread) / DS) * DS;
  /* Cadence. Hush is a held breath, not a commute: at cruise it is ~90 seconds, and every
     later chapter arrives while the rider still has appetite for it. */
  const chapLen = {
    hush: jit(660, 0.16),
    exposure: jit(1850, 0.12),
    sluices: jit(2000, 0.12),
    orchard: jit(2500, 0.12),
    wheel: jit(3000, 0.11),
    afterglow: jit(4000, 0.11),
  };
  const spineForkLen = jit(4000, 0.10);

  /* ---------------- elevation programme ----------------
     Reedwake's physical challenge is exposure, not climbing: nearly all of the
     route sits inside +/-3%, with a few flood-bank pinches allowed to ~5%. */
  const CAUSEWAY = +R.f(3.25, 4.05).toFixed(2);
  const elevKeys = [];                            // [sGlobal, targetY]
  {
    let s = 0;
    const push = (ds, y) => { s += ds; elevKeys.push([s, y]); };
    elevKeys.push([0, +R.f(0.68, 0.86).toFixed(2)]);
    push(chapLen.hush * 0.52, R.f(0.78, 0.98));
    // the road starts lifting inside Hush, so the reveal is under way before the cue
    push(chapLen.hush * 0.48, R.f(1.70, 2.10));
    push(R.f(150, 230), CAUSEWAY - R.f(0.5, 0.9));                 // out onto the bank
    push(R.f(180, 260), CAUSEWAY + R.f(0.0, 0.25));                // full causeway height
    push(chapLen.exposure - R.f(330, 490), CAUSEWAY + R.f(-0.35, 0.3));
    push(chapLen.sluices * 0.42, CAUSEWAY + R.f(0.35, 0.7));       // hump over the sluice deck
    push(chapLen.sluices * 0.58, CAUSEWAY - R.f(0.15, 0.45));
    push(chapLen.orchard * 0.5, CAUSEWAY - R.f(0.75, 1.15));
    push(chapLen.orchard * 0.5, CAUSEWAY - R.f(0.95, 1.4));        // low bank at the orchard
  }
  const preForkLen = chapLen.hush + chapLen.exposure + chapLen.sluices + chapLen.orchard;

  /* ---------------- pre-fork centreline ---------------- */
  const course0 = R.f(0, TAU);
  const curvSeed = (seedU ^ 0x1f83d9ab) >>> 0;

  function walk(startX, startZ, startH, length, opt) {
    const n = Math.floor(length / DS) + 1;
    const p = makePoly(n);
    let x = startX, z = startZ, h = startH;
    for (let i = 0; i < n; i++) {
      p.x[i] = x; p.z[i] = z;
      const sg = opt.s0 + i * DS;
      // slow global course + banded curvature noise, spring-limited so 19 km never folds back
      const course = course0 + 0.62 * fbm1(sg * 0.000085, curvSeed, 3) + opt.courseBias * (sg - opt.s0) * 0.00004;
      let c = opt.amp * fbm1(sg * opt.scale, curvSeed + 401, 3) + opt.amp2 * n1(sg * opt.scale2, curvSeed + 907);
      c += angDiff(h, course) * 0.0016;                      // pull back toward the course
      c = clamp(c, -opt.maxC, opt.maxC);
      h += c * DS;
      x += Math.cos(h) * DS; z += Math.sin(h) * DS;
    }
    return polyFinish(p);
  }

  // Hush wanders inside its reed corridor; the causeway straightens out into big sweeps.
  const preSegs = [
    { len: chapLen.hush, amp: 0.000105, scale: 0.0022, amp2: 0.00006, scale2: 0.0071, maxC: 0.0042, courseBias: 0 },
    { len: chapLen.exposure, amp: 0.000042, scale: 0.00085, amp2: 0.000018, scale2: 0.0029, maxC: 0.0016, courseBias: R.f(-1, 1) },
    { len: chapLen.sluices, amp: 0.000055, scale: 0.0013, amp2: 0.000022, scale2: 0.0041, maxC: 0.0022, courseBias: R.f(-1, 1) },
    { len: chapLen.orchard, amp: 0.000075, scale: 0.0017, amp2: 0.00003, scale2: 0.0052, maxC: 0.0030, courseBias: R.f(-1, 1) },
  ];
  let pre;
  {
    const parts = [];
    let x = 0, z = 0, h = course0, s0 = 0;
    for (const sg of preSegs) {
      const q = walk(x, z, h, sg.len, { ...sg, s0 });
      parts.push(q);
      x = q.x[q.n - 1]; z = q.z[q.n - 1]; h = q.h[q.n - 1]; s0 += sg.len;
    }
    let total = 0; for (const q of parts) total += q.n - 1;
    pre = makePoly(total + 1);
    let k = 0;
    for (let pi = 0; pi < parts.length; pi++) {
      const q = parts[pi], st = pi === 0 ? 0 : 1;
      for (let i = st; i < q.n; i++) { pre.x[k] = q.x[i]; pre.z[k] = q.z[i]; k++; }
    }
    polyFinish(pre);
  }

  /* ---------------- fork spine, then the two arms ---------------- */
  const forkX = pre.x[pre.n - 1], forkZ = pre.z[pre.n - 1], forkH = pre.h[pre.n - 1];
  const spine = walk(forkX, forkZ, forkH, spineForkLen, {
    amp: 0.000030, scale: 0.00062, amp2: 0.000014, scale2: 0.0021, maxC: 0.0012,
    courseBias: R.f(-0.7, 0.7), s0: preForkLen,
  });

  const handed = R.bool() ? 1 : -1;              // +1 = the Open Bank peels off to the left
  const openBase = R.f(125, 165) * handed;
  const willowBase = -R.f(100, 140) * handed;
  const willowLobes = R.i(8, 12);                // short wavelength -> genuinely tight bends
  const willowLobeAmp = R.f(24, 40);
  const openPh = R.f(0, TAU), willowPh = R.f(0, TAU);

  /* Lateral offset from the shared spine.
     Two shaping terms: a junction ramp that opens the Y quickly enough to be read as a fork
     from well before the commitment point, and a long sine that carries the arm out across
     the country. Both are zero with zero slope at u=0 and u=1, so each arm still leaves and
     rejoins tangentially. The lobe term only ever swings *outward* (0..2A), so the two arms
     can never cross or touch mid-fork. */
  function armFromSpine(base, lobes, lobeAmp, ph, fineAmp, fineK, seedOff) {
    const n = spine.n, p = makePoly(n), sg = Math.sign(base);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const ramp = smootherstep(0, 0.10, u) * smootherstep(1, 0.90, u);
      const w = 0.5 * ramp + 0.5 * Math.pow(Math.sin(PI * u), 1.4);
      const wobble = 1 + 0.24 * fbm1(u * 3.1, curvSeed + seedOff, 3);
      const lobe = lobeAmp * (0.5 + 0.5 * Math.sin(TAU * lobes * u + ph));
      const fine = fineAmp * (0.5 + 0.5 * fbm1(u * fineK, curvSeed + seedOff + 88, 3));
      const off = w * sg * (Math.abs(base) * wobble + lobe + fine);
      const hh = spine.h[i], nx = -Math.sin(hh), nzz = Math.cos(hh);
      p.x[i] = spine.x[i] + nx * off; p.z[i] = spine.z[i] + nzz * off;
    }
    return polyFinish(p);
  }
  // The Willow Cut is fixed by its identity: short lobes, tight radii, sheltered.
  // The Open Bank keeps long sweeping bends and is nudged only as far as it needs to come out
  // the longer of the two — a longer, steadier ride into the wind vs. a shorter twistier one.
  let armWillow = armFromSpine(willowBase, willowLobes, willowLobeAmp, willowPh, 19, 9.4, 617);
  // Sweep the Open Bank's long-lobe amplitude and keep the longest arm. (Swinging outward can
  // shorten the path when it falls on the inside of the spine's curvature, so this is scanned,
  // not stepped.) Every candidate keeps the same three long sweeps, so the bends stay smooth.
  let armOpen = null, openLobe = 0;
  for (let g = 0; g <= 13; g++) {
    const amp = 40 + g * 10;
    const cand = armFromSpine(openBase, 3, amp, openPh, 13, 3.6, 131);
    if (!armOpen || cand.len > armOpen.len) { armOpen = cand; openLobe = amp; }
  }
  // Fall back to trimming the Willow Cut's fine detail (never its character lobes) if the
  // spine geometry still leaves it the longer of the two.
  for (let g = 0; g < 10 && armWillow.len >= armOpen.len * 0.997; g++) {
    armWillow = armFromSpine(willowBase, willowLobes, willowLobeAmp * (1 - 0.09 * (g + 1)), willowPh, 19 * (1 - 0.12 * (g + 1)), 9.4, 617);
  }

  const postStart = { x: spine.x[spine.n - 1], z: spine.z[spine.n - 1], h: spine.h[spine.n - 1] };
  const postLen = chapLen.wheel + chapLen.afterglow;
  const post = walk(postStart.x, postStart.z, postStart.h, postLen, {
    amp: 0.000068, scale: 0.0014, amp2: 0.000026, scale2: 0.0044, maxC: 0.0027,
    courseBias: R.f(-1, 1), s0: preForkLen + armOpen.len,
  });

  /* ---------------- elevation for every centreline ---------------- */
  const MAXG = 0.030, PINCH = 0.050;
  function applyElev(p, sOffset, keys, pinchWindows) {
    const n = p.n, tgt = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const sg = sOffset + p.s[i];
      let a = keys[0], b = keys[keys.length - 1];
      for (let k = 0; k < keys.length - 1; k++) if (sg >= keys[k][0] && sg <= keys[k + 1][0]) { a = keys[k]; b = keys[k + 1]; break; }
      const t = b[0] > a[0] ? sat((sg - a[0]) / (b[0] - a[0])) : 1;
      tgt[i] = lerp(a[1], b[1], smootherstep(0, 1, t));
    }
    p.y[0] = tgt[0];
    for (let i = 1; i < n; i++) {
      const ds = Math.max(1e-3, p.s[i] - p.s[i - 1]);
      let g = (tgt[i] - p.y[i - 1]) / ds;
      let lim = MAXG;
      if (pinchWindows) for (const w of pinchWindows) if (p.s[i] >= w[0] && p.s[i] <= w[1]) lim = PINCH;
      p.y[i] = p.y[i - 1] + clamp(g, -lim, lim) * ds;
    }
    // three light smoothing passes: removes grade discontinuities, keeps the programme
    for (let pass = 0; pass < 3; pass++) {
      const c = Float64Array.from(p.y);
      for (let i = 2; i < n - 2; i++) p.y[i] = (c[i - 2] + 2 * c[i - 1] + 4 * c[i] + 2 * c[i + 1] + c[i + 2]) / 10;
    }
    for (let i = 0; i < n; i++) p.y[i] = Math.max(tide + 0.42, p.y[i]);   // never sink below the tide
    return p;
  }
  applyElev(pre, 0, elevKeys);

  const yFork = pre.y[pre.n - 1];
  const yRejoin = CAUSEWAY - R.f(0.1, 0.45);
  const openKeys = [
    [0, yFork], [armOpen.len * 0.16, CAUSEWAY + R.f(0.5, 1.0)],
    [armOpen.len * 0.36, CAUSEWAY + R.f(0.15, 0.55)], [armOpen.len * 0.58, CAUSEWAY + R.f(0.55, 1.05)],
    [armOpen.len * 0.80, CAUSEWAY + R.f(0.0, 0.4)], [armOpen.len, yRejoin],
  ];
  applyElev(armOpen, 0, openKeys, [[armOpen.len * 0.08, armOpen.len * 0.2], [armOpen.len * 0.5, armOpen.len * 0.63]]);

  const nCulv = R.i(4, 6);
  const culvertU = Array.from({ length: nCulv }, (_, i) => +((i + R.f(0.28, 0.72)) / nCulv).toFixed(4)).filter((u) => u > 0.08 && u < 0.93);
  const willowKeys = [[0, yFork]];
  {
    const base = CAUSEWAY - R.f(1.15, 1.7);
    for (const u of culvertU) {
      const c = armWillow.len * u;
      willowKeys.push([c - R.f(34, 46), base - R.f(0.1, 0.4)]);
      willowKeys.push([c, base + R.f(0.62, 1.0)]);                          // hump over the culvert
      willowKeys.push([c + R.f(34, 46), base - R.f(0.05, 0.35)]);
    }
    willowKeys.push([armWillow.len, yRejoin]);
    willowKeys.sort((a, b) => a[0] - b[0]);
  }
  applyElev(armWillow, 0, willowKeys);

  const postKeys = [
    [0, yRejoin], [chapLen.wheel * 0.45, yRejoin - R.f(0.1, 0.4)], [chapLen.wheel, yRejoin - R.f(0.3, 0.7)],
    [chapLen.wheel + chapLen.afterglow * 0.35, R.f(2.0, 2.5)],
    [chapLen.wheel + chapLen.afterglow * 0.74, R.f(1.2, 1.6)],
    [postLen, R.f(1.25, 1.65)],
  ];
  applyElev(post, 0, postKeys, [[chapLen.wheel + chapLen.afterglow * 0.2, chapLen.wheel + chapLen.afterglow * 0.42]]);

  /** A riseReveal beat is a real crest in the road: it hides the country, then gives it
   *  back. Applied after the elevation programme, then re-smoothed and re-grade-clamped. */
  function applyBeatRises(p, sOffset, list) {
    let touched = false;
    for (const b of list) {
      if (!b.rise) continue;
      const a0 = b.s0 - sOffset, a1 = b.s1 - sOffset;
      if (a1 < 0 || a0 > p.len) continue;
      for (let i = 0; i < p.n; i++) {
        const u = (p.s[i] - a0) / Math.max(1, a1 - a0);
        if (u <= 0 || u >= 1) continue;
        p.y[i] += b.rise * Math.pow(Math.sin(PI * u), 1.6);
        touched = true;
      }
    }
    if (!touched) return;
    for (let pass = 0; pass < 2; pass++) {
      const c = Float64Array.from(p.y);
      for (let i = 2; i < p.n - 2; i++) p.y[i] = (c[i - 2] + 2 * c[i - 1] + 4 * c[i] + 2 * c[i + 1] + c[i + 2]) / 10;
    }
    for (let i = 1; i < p.n; i++) {
      const ds = Math.max(1e-3, p.s[i] - p.s[i - 1]);
      const g = (p.y[i] - p.y[i - 1]) / ds;
      if (Math.abs(g) > PINCH) p.y[i] = p.y[i - 1] + Math.sign(g) * PINCH * ds;
      p.y[i] = Math.max(tide + 0.42, p.y[i]);
    }
  }

  /* ---------------- nominal speeds and the 8% arm balance ---------------- */
  const vOpen = 7.15, vWillow = 7.30;
  const lenOpen = pre.len + armOpen.len + post.len;
  const lenWillow = pre.len + armWillow.len + post.len;
  const preTime = pre.len / 7.42, postTime = post.len / 7.34;
  const tOpen = preTime + armOpen.len / vOpen + postTime;
  const tWillow = preTime + armWillow.len / vWillow + postTime;

  /* ---------------- chapter table in global route distance ---------------- */
  const chapters = [];
  {
    let s = 0;
    const add = (key, len) => { chapters.push({ key, name: CHAPTERS.find((c) => c.key === key).name, s0: +s.toFixed(1), s1: +(s + len).toFixed(1) }); s += len; };
    add('hush', chapLen.hush); add('exposure', chapLen.exposure);
    add('sluices', chapLen.sluices); add('orchard', chapLen.orchard);
    add('fork', armOpen.len); add('wheel', chapLen.wheel); add('afterglow', chapLen.afterglow);
  }
  const forkS = preForkLen;
  const rejoinS = preForkLen + armOpen.len;

  /* ==================================================================
   *  COMPOSITION BEATS
   *  The old world varied its data without varying its pictures, because both
   *  sides of the road always did the same thing. A beat gives the left and the
   *  right of the carriageway different jobs for 45-90 seconds at a time: water
   *  on one hand, mass on the other; an aperture; a rise that hides then gives
   *  back the country. Terrain, vegetation height and family all read from here,
   *  so a change of beat is a change of composition, not a change of noise.
   * ================================================================== */
  const ROLE = {
    // dig/mass are 0..1 per side; vig is a direct stem-height multiplier; rise lifts the road
    corridor:     { digL: 0.06, digR: 0.06, massL: 1.00, massR: 1.00, vigL: 1.86, vigR: 1.86, rise: 0 },
    /* the slit has to be seen, not inferred: no reed screen at all on the wet hand, or
       a 1.4 m eye looks straight over the water it is supposed to be told about */
    waterSlit:    { digL: 0.90, digR: 0.05, massL: 0.00, massR: 1.00, vigL: 0.20, vigR: 1.84, rise: 0 },
    waterSide:    { digL: 1.00, digR: 0.14, massL: 0.00, massR: 0.94, vigL: 0.28, vigR: 1.26, rise: 0 },
    openBoth:     { digL: 0.96, digR: 0.96, massL: 0.00, massR: 0.00, vigL: 0.30, vigR: 0.30, rise: 0 },
    aperture:     { digL: 0.14, digR: 0.14, massL: 1.00, massR: 1.00, vigL: 1.72, vigR: 1.72, rise: 0, gap: 1 },
    islandCurve:  { digL: 0.88, digR: 0.08, massL: 0.00, massR: 1.00, vigL: 0.34, vigR: 1.10, rise: 0, island: 1 },
    channelCross: { digL: 0.66, digR: 0.66, massL: 0.40, massR: 0.40, vigL: 0.86, vigR: 0.86, rise: 0, drain: 1 },
    riseReveal:   { digL: 0.82, digR: 0.82, massL: 0.16, massR: 0.16, vigL: 0.58, vigR: 0.58, rise: 1 },
    compression:  { digL: 0.04, digR: 0.04, massL: 1.00, massR: 1.00, vigL: 1.64, vigR: 1.64, rise: 0 },
    callback:     { digL: 0.92, digR: 0.92, massL: 0.06, massR: 0.06, vigL: 0.36, vigR: 0.36, rise: 0 },
  };
  // which roles belong to which stretch of country
  const POOL = {
    hush:      ['waterSlit', 'channelCross', 'aperture', 'compression'],
    exposure:  ['openBoth', 'waterSide', 'riseReveal', 'islandCurve'],
    sluices:   ['waterSide', 'channelCross', 'openBoth', 'compression', 'riseReveal'],
    orchard:   ['islandCurve', 'compression', 'aperture', 'waterSide', 'channelCross'],
    fork:      ['openBoth', 'waterSide', 'riseReveal', 'islandCurve', 'callback'],
    wheel:     ['riseReveal', 'waterSide', 'openBoth', 'channelCross', 'islandCurve'],
    afterglow: ['callback', 'compression', 'islandCurve', 'waterSide', 'aperture'],
  };
  const POOL_WILLOW = ['compression', 'islandCurve', 'channelCross', 'aperture', 'waterSlit'];

  function chapterKeyAt(sg) {
    for (const c of chapters) if (sg >= c.s0 && sg < c.s1) return c.key;
    return chapters[chapters.length - 1].key;
  }

  /** side +1 puts water left / mass right; -1 mirrors it */
  function mkBeat(s0, s1, role, side, RB, extra) {
    const t = ROLE[role];
    const flip = side < 0;
    const b = {
      s0: +s0.toFixed(1), s1: +s1.toFixed(1), role, side,
      digL: +(flip ? t.digR : t.digL).toFixed(3), digR: +(flip ? t.digL : t.digR).toFixed(3),
      massL: +(flip ? t.massR : t.massL).toFixed(3), massR: +(flip ? t.massL : t.massR).toFixed(3),
      vigL: +(flip ? t.vigR : t.vigL).toFixed(3), vigR: +(flip ? t.vigL : t.vigR).toFixed(3),
      rise: t.rise ? +RB.f(0.55, 1.15).toFixed(2) : 0,
      gapAt: t.gap ? +RB.f(0.35, 0.7).toFixed(3) : 0,
      gapW: t.gap ? +RB.f(0.10, 0.20).toFixed(3) : 0,
      island: t.island ? 1 : 0, drain: t.drain ? 1 : 0,
    };
    if (extra) Object.assign(b, extra);
    return b;
  }

  function buildBeats(RB, s0, s1, poolFor, scripted) {
    const out = [];
    let s = s0, prevRole = '', side = RB.sgn();
    for (const sc of (scripted || [])) {
      const len = sc.len;
      out.push(mkBeat(s, s + len, sc.role, sc.side !== undefined ? sc.side : side, RB));
      prevRole = sc.role; s += len;
      if (sc.flip) side = -side;
    }
    while (s < s1 - 40) {
      const pool = poolFor(s).filter((r) => r !== prevRole);
      const role = pool[Math.floor(RB.u() * pool.length) % pool.length];
      // 45-90 s of ride at cruise, compressions and channel crossings run shorter
      const base = (role === 'compression' || role === 'channelCross') ? RB.f(240, 380) : RB.f(360, 640);
      const len = Math.min(base, s1 - s);
      if (RB.u() < 0.62) side = -side;                 // handedness persists, then turns over
      out.push(mkBeat(s, s + len, role, side, RB));
      prevRole = role; s += len;
    }
    if (out.length) out[out.length - 1].s1 = +s1.toFixed(1);
    return out;
  }

  const RB = new Rng(seedU, 'plan:beats');
  /* The opening is scripted in role order so the first three minutes are guaranteed for
     every seed; the parameters inside each beat are still seeded. */
  const openingScript = [
    { role: 'corridor', len: RB.f(120, 165) },                       // enclosed, tall, no sky
    { role: 'waterSlit', len: RB.f(150, 205), flip: true },          // ~30 s: tidal identity
    { role: 'channelCross', len: RB.f(180, 240) },                   // ~45-75 s: new composition
    { role: 'riseReveal', len: RB.f(170, 230), flip: true },         // ~75-105 s: reveal begins
  ];
  const beats = buildBeats(RB, 0, lenOpen, (sg) => POOL[chapterKeyAt(sg)] || POOL.exposure, openingScript);
  // the Willow Cut gets its own, closer, more sheltered sequence over the same span
  const beatsWillow = buildBeats(new Rng(seedU, 'plan:beats:willow'), forkS, forkS + armWillow.len,
    () => POOL_WILLOW, null);

  applyBeatRises(pre, 0, beats);
  applyBeatRises(armOpen, forkS, beats);
  applyBeatRises(post, rejoinS, beats);
  applyBeatRises(armWillow, forkS, beatsWillow);

  /* ==================================================================
   *  hydrology — braided channels, drains, banks, islands
   * ================================================================== */
  const allPolys = [pre, armOpen, armWillow, post];
  const routePointAt = (sg) => {                 // approximate world point at global s (open-bank reference)
    if (sg <= pre.len) { const i = clamp(Math.round(sg / DS), 0, pre.n - 1); return { x: pre.x[i], z: pre.z[i], y: pre.y[i], h: pre.h[i] }; }
    if (sg <= rejoinS) { const i = clamp(Math.round((sg - pre.len) / (armOpen.len / (armOpen.n - 1))), 0, armOpen.n - 1); return { x: spine.x[i], z: spine.z[i], y: armOpen.y[i], h: spine.h[i] }; }
    const i = clamp(Math.round((sg - rejoinS) / DS), 0, post.n - 1); return { x: post.x[i], z: post.z[i], y: post.y[i], h: post.h[i] };
  };

  const channels = [];
  function addChannel(cx, cz, dir, length, width, depth, kind, wig) {
    const segs = Math.max(4, Math.round(length / 55));
    const pts = [];
    let x = cx - Math.cos(dir) * length * 0.5, z = cz - Math.sin(dir) * length * 0.5, h = dir;
    for (let i = 0; i <= segs; i++) {
      pts.push(+x.toFixed(2), +z.toFixed(2));
      h += (fbm1(i * 0.42 + cx * 0.01, curvSeed + 3301, 3) * wig) * 0.5;
      const step = length / segs;
      x += Math.cos(h) * step; z += Math.sin(h) * step;
    }
    channels.push({ pts, w: +width.toFixed(2), d: +depth.toFixed(2), kind });
    return channels.length - 1;
  }

  // main tidal creeks: broad, meandering, crossing the corridor at a shallow angle
  const nCreek = R.i(6, 9);
  for (let i = 0; i < nCreek; i++) {
    const sg = ((i + R.f(0.15, 0.85)) / nCreek) * lenOpen;
    const rp = routePointAt(sg);
    const lat = R.sgn() * R.f(90, 620);
    const nx = -Math.sin(rp.h), nz = Math.cos(rp.h);
    addChannel(rp.x + nx * lat, rp.z + nz * lat, rp.h + PI / 2 + R.f(-0.9, 0.9),
      R.f(1100, 2400), R.f(15, 32), R.f(1.3, 2.2), 'creek', R.f(0.12, 0.3));
  }
  // tributaries hung off the creeks
  const nTrib = R.i(10, 16);
  for (let i = 0; i < nTrib; i++) {
    const c = channels[R.i(0, Math.min(nCreek, channels.length) - 1)];
    const k = R.i(1, (c.pts.length / 2 | 0) - 2);
    addChannel(c.pts[k * 2], c.pts[k * 2 + 1], R.f(0, TAU), R.f(320, 900), R.f(5, 12), R.f(0.7, 1.4), 'trib', R.f(0.25, 0.55));
  }
  // straight maintenance drains cut square to the causeway
  const nDrain = R.i(12, 20);
  for (let i = 0; i < nDrain; i++) {
    const sg = R.f(chapLen.hush * 0.5, lenOpen * 0.97);
    const rp = routePointAt(sg);
    addChannel(rp.x, rp.z, rp.h + PI / 2 + R.f(-0.12, 0.12), R.f(260, 620), R.f(3.2, 6.5), R.f(0.6, 1.1), 'drain', 0.02);
  }

  // flood banks: long low ridges that give the far field its horizontal structure
  const banks = [];
  const nBank = R.i(7, 11);
  for (let i = 0; i < nBank; i++) {
    const sg = R.f(chapLen.hush, lenOpen);
    const rp = routePointAt(sg);
    const lat = R.sgn() * R.f(150, 900);
    const nx = -Math.sin(rp.h), nz = Math.cos(rp.h);
    const dir = rp.h + R.f(-0.6, 0.6) + (R.bool() ? 0 : PI);
    const length = R.f(700, 2100), segs = 6;
    const pts = [];
    let x = rp.x + nx * lat - Math.cos(dir) * length / 2, z = rp.z + nz * lat - Math.sin(dir) * length / 2, h = dir;
    for (let k = 0; k <= segs; k++) { pts.push(+x.toFixed(2), +z.toFixed(2)); h += fbm1(k * 0.7 + i, curvSeed + 55, 2) * 0.10; x += Math.cos(h) * length / segs; z += Math.sin(h) * length / segs; }
    banks.push({ pts, w: +R.f(15, 27).toFixed(2), hgt: +R.f(1.15, 2.15).toFixed(2) });
  }

  // willow islands — clustered heavily along the Willow Cut, sparse over the open water
  const islands = [];
  function addIsland(x, z, rad, ecc, rot, hgt, dens) {
    islands.push({ x: +x.toFixed(1), z: +z.toFixed(1), r: +rad.toFixed(1), e: +ecc.toFixed(2), rot: +rot.toFixed(3), h: +hgt.toFixed(2), dens: +dens.toFixed(2) });
  }
  const nIsland = R.i(22, 34);
  for (let i = 0; i < nIsland; i++) {
    const useWillow = R.bool(0.5);
    let bx, bz, bh;
    if (useWillow) { const k = R.i(2, armWillow.n - 3); bx = armWillow.x[k]; bz = armWillow.z[k]; bh = armWillow.h[k]; }
    else { const sg = R.f(chapLen.hush * 0.8, lenOpen); const rp = routePointAt(sg); bx = rp.x; bz = rp.z; bh = rp.h; }
    const lat = R.sgn() * R.f(useWillow ? 45 : 130, useWillow ? 320 : 1000);
    const along = R.f(-260, 260);
    const nx = -Math.sin(bh), nz = Math.cos(bh);
    addIsland(bx + nx * lat + Math.cos(bh) * along, bz + nz * lat + Math.sin(bh) * along,
      R.f(26, 135), R.f(0.42, 0.95), R.f(0, PI), R.f(0.8, 2.4), R.f(0.35, 1.0));
  }

  /* Beats that ask for an island or a crossing get a real one, placed on the side the
     composition wants it — this is what makes a bend read as "around the willows"
     rather than as more of the same reed. */
  const beatFeatures = [];
  for (const list of [beats, beatsWillow]) {
    for (const b of list) {
      const mid = (b.s0 + b.s1) * 0.5;
      const rp = routePointAt(mid);
      const nx = -Math.sin(rp.h), nz = Math.cos(rp.h);
      if (b.island) {
        const side = b.massL > b.massR ? 1 : -1;
        const lat = R.f(58, 130) * side;
        const ix = rp.x + nx * lat, iz = rp.z + nz * lat;
        addIsland(ix, iz, R.f(46, 105), R.f(0.45, 0.9), R.f(0, PI), R.f(1.1, 2.3), R.f(0.7, 1.0));
        beatFeatures.push({ kind: 'island', s: +mid.toFixed(1), side, x: +ix.toFixed(1), z: +iz.toFixed(1) });
      }
      if (b.drain) {
        addChannel(rp.x, rp.z, rp.h + PI / 2 + R.f(-0.28, 0.28), R.f(420, 900), R.f(5.5, 11), R.f(0.9, 1.5), 'drain', 0.05);
        beatFeatures.push({ kind: 'crossing', s: +mid.toFixed(1), x: +rp.x.toFixed(2), z: +rp.z.toFixed(2), rot: +rp.h.toFixed(4) });
      }
      /* When the beat opens both hands to water there is nothing left to hold the eye, and
         a flat horizon held for a minute is the failure this whole pass exists to fix. So
         an open beat earns a far bank or a group of willow islands out on the skyline —
         far enough to stay a silhouette, near enough to be a shape. */
      if (b.massL < 0.2 && b.massR < 0.2) {
        const far = R.sgn(), lat = R.f(620, 1250) * far;
        const bx = rp.x + nx * lat, bz = rp.z + nz * lat;
        if (R.bool(0.55)) {
          const dir = rp.h + R.f(-0.35, 0.35), length = R.f(1100, 2400), segs = 6;
          const pts = [];
          let x = bx - Math.cos(dir) * length / 2, z = bz - Math.sin(dir) * length / 2, hh = dir;
          for (let k = 0; k <= segs; k++) {
            pts.push(+x.toFixed(2), +z.toFixed(2));
            hh += fbm1(k * 0.6 + mid * 0.001, curvSeed + 771, 2) * 0.08;
            x += Math.cos(hh) * length / segs; z += Math.sin(hh) * length / segs;
          }
          banks.push({ pts, w: +R.f(18, 30).toFixed(2), hgt: +R.f(1.5, 2.5).toFixed(2) });
          beatFeatures.push({ kind: 'skyline-bank', s: +mid.toFixed(1), side: far, x: +bx.toFixed(1), z: +bz.toFixed(1) });
        } else {
          const n = R.i(3, 6);
          for (let k = 0; k < n; k++) {
            const a = R.f(0, TAU), rr = R.f(0, 420);
            addIsland(bx + Math.cos(a) * rr, bz + Math.sin(a) * rr,
              R.f(38, 120), R.f(0.4, 0.9), R.f(0, PI), R.f(1.3, 2.5), R.f(0.6, 1.0));
          }
          beatFeatures.push({ kind: 'skyline-islands', s: +mid.toFixed(1), side: far, x: +bx.toFixed(1), z: +bz.toFixed(1), n });
        }
      }
    }
  }

  /* ==================================================================
   *  landmarks
   * ================================================================== */
  const landmarks = [];
  const lm = (o) => { landmarks.push(o); return o; };

  /* -- the first tidal structure. It has to be met early, or the country reads as scenery
     for too long: a tide gauge stands up out of the reed as a distant vertical, and the
     road then rides over a real cut on a small brick span. Promise, then contact. */
  {
    const gS = chapLen.hush * 0.9 + chapLen.exposure * R.f(0.30, 0.40);
    const rp = routePointAt(gS);
    const nx = -Math.sin(rp.h), nz = Math.cos(rp.h);
    const side = R.sgn(), lat = R.f(11, 17) * side;
    lm({
      kind: 'gauge', id: 'first-gauge', s: +gS.toFixed(1),
      x: +(rp.x + nx * lat).toFixed(2), z: +(rp.z + nz * lat).toFixed(2),
      rot: +R.f(0, TAU).toFixed(3), h: +R.f(4.6, 6.2).toFixed(2), wear: +R.f(0.4, 1).toFixed(2),
      far: 1,
    });
    const cS = gS + R.f(180, 300);
    const k = clamp(Math.round(cS / DS), 1, pre.n - 2);
    addChannel(pre.x[k], pre.z[k], pre.h[k] + PI / 2 + R.f(-0.22, 0.22),
      R.f(700, 1300), R.f(8, 14), R.f(1.1, 1.7), 'sluice', 0.07);
    lm({
      kind: 'culvert', id: 'first-cut', arm: 'pre', s: +pre.s[k].toFixed(1),
      x: +pre.x[k].toFixed(2), z: +pre.z[k].toFixed(2), rot: +pre.h[k].toFixed(4),
      span: +R.f(7.5, 10.5).toFixed(2), style: R.pick(['brick', 'stone', 'brick']),
      rail: true, wear: +R.f(0.4, 1).toFixed(2),
    });
  }

  // -- Three Sluices: a creek is deliberately routed through the causeway here.
  const sluiceS = chapLen.hush + chapLen.exposure + chapLen.sluices * R.f(0.24, 0.38);
  {
    const rp = routePointAt(sluiceS);
    const skew = R.f(-0.30, 0.30);
    const dir = rp.h + PI / 2 + skew;
    addChannel(rp.x, rp.z, dir, R.f(1300, 2000), R.f(20, 28), R.f(1.7, 2.3), 'sluice', 0.08);
    const gates = [0, 1, 2].map((i) => ({
      w: +R.f(2.5, 3.5).toFixed(2), open: +R.f(0.18, 0.86).toFixed(2),
      gate: R.pick(['timber', 'iron', 'timber']), wear: +R.f(0.3, 1.0).toFixed(2),
    }));
    lm({
      kind: 'sluices', id: 'three-sluices', s: +sluiceS.toFixed(1), x: +rp.x.toFixed(2), z: +rp.z.toFixed(2),
      rot: +dir.toFixed(4), y: +rp.y.toFixed(2), gates, pierW: +R.f(1.5, 2.2).toFixed(2),
      deck: +R.f(0.85, 1.25).toFixed(2), tideMark: +R.f(0.5, 1.0).toFixed(2), moss: +R.f(0.45, 0.95).toFixed(2),
      ladder: R.bool(0.85), flow: +R.f(0.6, 1.0).toFixed(2),
    });
  }

  // -- Drowned Orchard: rows of pollards standing in shallow water
  const orchS = chapLen.hush + chapLen.exposure + chapLen.sluices + chapLen.orchard * R.f(0.34, 0.5);
  {
    const rp = routePointAt(orchS);
    const rowDir = rp.h + R.f(-0.5, 0.5) + PI / 2;
    lm({
      kind: 'orchard', id: 'drowned-orchard', s: +orchS.toFixed(1), x: +rp.x.toFixed(2), z: +rp.z.toFixed(2),
      rot: +rowDir.toFixed(4), rows: R.i(7, 11), rowGap: +R.f(11.5, 15.5).toFixed(2),
      treeGap: +R.f(8.5, 12).toFixed(2), perRow: R.i(15, 26), jitter: +R.f(0.22, 0.42).toFixed(2),
      gapChance: +R.f(0.10, 0.22).toFixed(2), extent: +R.f(520, 760).toFixed(0), pondDepth: +R.f(0.25, 0.55).toFixed(2),
    });
  }

  // -- Tide Wheel: the hero, standing in a channel just off the road after the rejoin
  const wheelS = rejoinS + chapLen.wheel * R.f(0.40, 0.54);
  {
    const rp = routePointAt(wheelS);
    const side = R.sgn(), lat = R.f(27, 41);
    const nx = -Math.sin(rp.h), nz = Math.cos(rp.h);
    const wx = rp.x + nx * lat * side, wz = rp.z + nz * lat * side;
    addChannel(wx, wz, rp.h + R.f(-0.25, 0.25), R.f(900, 1500), R.f(11, 16), R.f(1.5, 2.1), 'wheelrace', 0.06);
    lm({
      kind: 'wheel', id: 'tide-wheel', s: +wheelS.toFixed(1), x: +wx.toFixed(2), z: +wz.toFixed(2),
      rot: +(rp.h + PI / 2 + R.f(-0.2, 0.2)).toFixed(4), side,
      radius: +R.f(5.4, 6.9).toFixed(2), paddles: R.i(16, 22), width: +R.f(2.2, 3.0).toFixed(2),
      axleY: +R.f(4.1, 5.2).toFixed(2), rpm: +R.f(0.75, 1.25).toFixed(3), wear: +R.f(0.45, 0.95).toFixed(2),
      housing: R.pick(['open', 'braced', 'braced']), ladder: true, groan: +R.f(0.6, 1.0).toFixed(2),
      approachSide: side,
    });
  }

  // -- Willow Cut bridges / culverts
  culvertU.forEach((u, i) => {
    const k = clamp(Math.round(u * (armWillow.n - 1)), 1, armWillow.n - 2);
    lm({
      kind: 'culvert', id: 'culvert-' + i, arm: 'willow', s: +(preForkLen + armWillow.s[k]).toFixed(1),
      x: +armWillow.x[k].toFixed(2), z: +armWillow.z[k].toFixed(2), rot: +armWillow.h[k].toFixed(4),
      span: +R.f(5.5, 9.5).toFixed(2), style: R.pick(['brick', 'timber', 'brick', 'stone']),
      rail: R.bool(0.7), wear: +R.f(0.3, 1).toFixed(2),
    });
  });

  // -- Open Bank marker: a lone tide gauge visible a long way off
  {
    const u = R.f(0.42, 0.62), k = Math.round(u * (armOpen.n - 1));
    const nx = -Math.sin(armOpen.h[k]), nz = Math.cos(armOpen.h[k]);
    const lat = R.sgn() * R.f(24, 46);
    lm({
      kind: 'gauge', id: 'open-bank-gauge', arm: 'open', s: +(preForkLen + armOpen.s[k]).toFixed(1),
      x: +(armOpen.x[k] + nx * lat).toFixed(2), z: +(armOpen.z[k] + nz * lat).toFixed(2),
      rot: +R.f(0, TAU).toFixed(3), h: +R.f(4.2, 6.0).toFixed(2), wear: +R.f(0.4, 1).toFixed(2),
    });
  }

  // -- the ending: a maintenance gate on a grassy flood bank with a last tide marker
  {
    const k = post.n - 1;
    lm({
      kind: 'endgate', id: 'end-gate', s: +(rejoinS + post.len).toFixed(1),
      x: +post.x[k].toFixed(2), z: +post.z[k].toFixed(2), rot: +post.h[k].toFixed(4),
      style: R.pick(['fivebar', 'fivebar', 'kissing']), wear: +R.f(0.5, 1).toFixed(2),
    });
  }

  // -- rule-driven roadside furniture (never an authored coordinate list)
  const furniture = [];
  {
    // spaced by rule along every real carriageway, so both arms are furnished
    const walks = [['pre', pre, 0], ['open', armOpen, preForkLen], ['willow', armWillow, preForkLen], ['post', post, rejoinS]];
    for (const [arm, p, sOff] of walks) {
      let s = 120 + ihashf(hashStr(arm), 3, seedU) * 300;
      while (s < p.len - 50) {
        const key = Math.round(s) ^ hashStr(arm);
        const t = ihashf(key, 13, seedU);
        const i = clamp(Math.round((s / p.len) * (p.n - 1)), 0, p.n - 1);
        furniture.push({
          arm, s: +(sOff + s).toFixed(1), x: +p.x[i].toFixed(2), z: +p.z[i].toFixed(2), rot: +p.h[i].toFixed(4),
          side: ihashf(key, 7, seedU) < 0.5 ? -1 : 1, lat: +(4.5 + t * 2.5).toFixed(2),
          kind: t < 0.30 ? 'marker' : t < 0.55 ? 'post' : t < 0.78 ? 'tidepost' : 'gatepost',
          h: +(0.75 + t * 0.9).toFixed(2), lean: +((ihashf(key, 29, seedU) - 0.5) * 0.22).toFixed(3),
        });
        s += 230 + ihashf(key, 31, seedU) * 520;
      }
    }
  }

  /* ==================================================================
   *  wind fronts — spatial events armed by route distance
   * ================================================================== */
  const fronts = [];
  {
    const nF = R.i(11, 16);
    /* The first front breaks while the Hush is still handing over: it has to be watched
       coming across the reed for a minute or so, then land, inside the first three minutes.
       Everything after it is scattered by rule. */
    const firstS = chapLen.hush * 0.9 + chapLen.exposure * R.f(0.10, 0.17);
    for (let i = 0; i < nF; i++) {
      const armS = i === 0 ? firstS : R.f(chapLen.hush * 0.6, lenOpen * 0.985);
      fronts.push({
        armS: +armS.toFixed(1),
        lead: +(i === 0 ? R.f(600, 800) : R.f(760, 1180)).toFixed(0),   // spawns this far upwind
        width: +R.f(85, 165).toFixed(1),
        amp: +R.f(i === 0 ? 0.95 : 0.5, i === 0 ? 1.35 : 1.5).toFixed(3),
        speed: +R.f(11.5, 17.5).toFixed(2),
        k: +R.f(0.0035, 0.011).toFixed(5),        // lateral wavenumber: makes the front a wavy line
        ph: +R.f(0, TAU).toFixed(3),
        k2: +R.f(0.0009, 0.0031).toFixed(5),
        ph2: +R.f(0, TAU).toFixed(3),
        run: +R.f(1500, 2200).toFixed(0),
      });
    }
    fronts.sort((a, b) => a.armS - b.armS);
  }

  /* ==================================================================
   *  clouds, wildlife, encounters, sound
   * ================================================================== */
  const clouds = Array.from({ length: R.i(13, 19) }, (_, i) => ({
    u: +R.f(0, 1).toFixed(4), v: +R.f(0.06, 0.92).toFixed(4),
    scale: +R.f(0.55, 1.9).toFixed(3), mass: +R.f(0.42, 1.0).toFixed(3),
    lift: +R.f(0.2, 1.0).toFixed(3), seed: +R.f(0, 100).toFixed(2),
  }));

  const wildlife = {
    swallow: { band: ['exposure', 'fork', 'wheel'], base: +R.f(0.5, 1.0).toFixed(2) },
    marshbird: { band: ['orchard', 'wheel', 'afterglow'], base: +R.f(0.5, 1.0).toFixed(2) },
    dragonfly: { band: ['hush', 'orchard', 'fork', 'afterglow'], base: +R.f(0.5, 1.0).toFixed(2) },
    drift: { base: +R.f(0.35, 0.8).toFixed(2) },
    // scheduled lift events; at least one lands inside the Drowned Orchard
    lifts: (() => {
      const arr = [];
      const orchA = chapLen.hush + chapLen.exposure + chapLen.sluices;
      // something alive inside the first two minutes, on every seed, before any label appears
      arr.push({ s: +R.f(210, 640).toFixed(1), kind: 'marshbird', n: R.i(4, 9) });
      arr.push({ s: +(orchA + chapLen.orchard * R.f(0.3, 0.62)).toFixed(1), kind: 'marshbird', n: R.i(5, 12) });
      const nL = R.i(4, 8);
      for (let i = 0; i < nL; i++) arr.push({ s: +R.f(chapLen.hush * 0.7, lenOpen * 0.97).toFixed(1), kind: R.pick(['swallow', 'marshbird', 'marshbird']), n: R.i(3, 9) });
      return arr.sort((a, b) => a.s - b.s);
    })(),
    frogs: Array.from({ length: R.i(8, 15) }, () => ({ s: +R.f(0, lenOpen).toFixed(1), n: R.i(1, 3) })).sort((a, b) => a.s - b.s),
  };

  const RARE = ['heron-lift', 'two-hares', 'otter-wake', 'gate-moves', 'seed-sails', 'long-shadow'];
  const STRANGE = new Set(['gate-moves', 'seed-sails', 'long-shadow']);
  /* Rarity that never fires is just absence. Every seed gets an early one, a distinctive
     later one, and one inside each arm, so the two ways with the wind are told apart by
     what happens on them and not only by how they bend. */
  const encounters = (() => {
    const out = []; const pool = R.shuffle(RARE.slice());
    let strangeUsed = false, pi = 0;
    const windows = [
      [chapLen.hush * 0.55, chapLen.hush + chapLen.exposure * 0.75],          // early
      [forkS - 1900, forkS - 420],                                            // before the choice
      [forkS + 320, forkS + Math.max(700, armOpen.len * 0.72)],               // Open Bank
      [forkS + 260, forkS + Math.max(620, armWillow.len * 0.68)],             // Willow Cut
      [rejoinS + chapLen.wheel * 0.2, rejoinS + postLen * 0.9],               // after the rejoin
    ];
    const armOf = [null, null, 'open', 'willow', null];
    for (let w = 0; w < windows.length; w++) {
      let kind = null;
      for (let t = 0; t < pool.length && !kind; t++) {
        const c = pool[(pi + t) % pool.length];
        if (STRANGE.has(c) && strangeUsed) continue;
        kind = c; pi = (pi + t + 1) % pool.length;
      }
      if (!kind) break;
      if (STRANGE.has(kind)) strangeUsed = true;
      let s = 0, ok = false;
      for (let tries = 0; tries < 40 && !ok; tries++) {
        s = R.f(windows[w][0], windows[w][1]);
        ok = !(s > forkS - 260 && s < forkS + 220) && !(s > rejoinS - 180 && s < rejoinS + 140);
      }
      if (ok) out.push({ kind, s: +s.toFixed(1), arm: armOf[w], strange: STRANGE.has(kind), side: R.sgn(), seed: R.i(1, 1e6) });
    }
    return out.sort((a, b) => a.s - b.s);
  })();

  const sound = {
    reedBands: [+R.f(320, 460).toFixed(0), +R.f(760, 1150).toFixed(0), +R.f(1900, 2900).toFixed(0)],
    sluiceTone: [+R.f(146, 176).toFixed(2), +R.f(214, 268).toFixed(2)],   // the two-note pipe accident
    wheelGroan: +R.f(41, 62).toFixed(2),
    waterTilt: +R.f(0.35, 0.8).toFixed(2),
  };

  // ending composition: two earlier forms re-seen from a materially different angle
  const ending = {
    callbacks: [
      { of: 'three-sluices', fromS: +(rejoinS + chapLen.wheel + chapLen.afterglow * R.f(0.30, 0.46)).toFixed(1), bearing: +R.f(0, TAU).toFixed(3) },
      { of: 'tide-wheel', fromS: +(rejoinS + chapLen.wheel + chapLen.afterglow * R.f(0.55, 0.74)).toFixed(1), bearing: +R.f(0, TAU).toFixed(3) },
    ],
    stillness: +R.f(0.55, 0.9).toFixed(2),
  };

  /* ==================================================================
   *  habitat field parameters (rules, not coordinates)
   * ================================================================== */
  const habitat = {
    nz,
    reedScale: +R.f(0.0016, 0.0031).toFixed(5),
    reedWarp: +R.f(38, 96).toFixed(1),
    patchScale: +R.f(0.0075, 0.0155).toFixed(5),
    sedgeBias: +R.f(0.3, 0.7).toFixed(3),
    meadowBias: +R.f(0.25, 0.6).toFixed(3),
    edgeBias: +R.f(0.4, 0.9).toFixed(3),
    microAmp: +R.f(0.07, 0.14).toFixed(3),
    basinAmp: +R.f(0.55, 1.05).toFixed(3),
    basinScale: +R.f(0.00045, 0.00092).toFixed(6),
  };

  /* ---------------- freeze + checksum ---------------- */
  const plan = {
    version: 3, seed: seedStr, seedU,
    weather, habitat,
    chapters, chapLen, forkS: +forkS.toFixed(1), rejoinS: +rejoinS.toFixed(1),
    handed, causeway: CAUSEWAY,
    route: {
      pre: polyData(pre), spine: polyData(spine), open: polyData(armOpen), willow: polyData(armWillow), post: polyData(post),
      lenOpen: +lenOpen.toFixed(1), lenWillow: +lenWillow.toFixed(1),
      armOpenLen: +armOpen.len.toFixed(1), armWillowLen: +armWillow.len.toFixed(1),
      tOpen: +tOpen.toFixed(1), tWillow: +tWillow.toFixed(1), vOpen, vWillow,
    },
    beats, beatsWillow, beatFeatures,
    channels, banks, islands, landmarks, furniture, fronts, clouds, wildlife, encounters, sound, ending,
  };

  // checksum covers structure only; nothing quality- or renderer-dependent may enter here
  plan.checksum = checksum32(canon({
    v: plan.version, seed: seedStr, weather, habitat, chapters, forkS: plan.forkS, rejoinS: plan.rejoinS,
    handed, causeway: CAUSEWAY, beats, beatsWillow, beatFeatures,
    channels, banks, islands, landmarks, furniture, fronts, clouds,
    wildlife, encounters, sound, ending,
    route: { lenOpen: plan.route.lenOpen, lenWillow: plan.route.lenWillow, tOpen: plan.route.tOpen, tWillow: plan.route.tWillow },
    geom: [pre, spine, armOpen, armWillow, post].map((p) => [p.n, +p.len.toFixed(2), +p.x[p.n - 1].toFixed(2), +p.z[p.n - 1].toFixed(2), +p.y[p.n - 1].toFixed(3)]),
  }, 4));

  plan.polys = { pre, spine, open: armOpen, willow: armWillow, post };   // live typed arrays for realization
  return Object.freeze(plan);
}

function polyData(p) {
  return { n: p.n, len: +p.len.toFixed(2), x0: +p.x[0].toFixed(2), z0: +p.z[0].toFixed(2), y0: +p.y[0].toFixed(3) };
}

/** Compose the full ridden route for one arm: pre -> arm -> post. */
function composeRoute(plan, arm) {
  const a = arm === 'willow' ? plan.polys.willow : plan.polys.open;
  const { pre, post } = plan.polys;
  const n = pre.n + (a.n - 1) + (post.n - 1);
  const r = makePoly(n);
  let k = 0;
  const copy = (p, skipFirst) => { for (let i = skipFirst ? 1 : 0; i < p.n; i++) { r.x[k] = p.x[i]; r.z[k] = p.z[i]; r.y[k] = p.y[i]; k++; } };
  copy(pre, false); copy(a, true); copy(post, true);
  const ys = Float32Array.from(r.y);
  polyFinish(r);
  r.y.set(ys);
  r.arm = arm;
  r.forkIndex = pre.n - 1;
  r.rejoinIndex = pre.n - 1 + (a.n - 1);
  // ascent / descent bookkeeping
  let up = 0, dn = 0;
  for (let i = 1; i < r.n; i++) { const d = r.y[i] - r.y[i - 1]; if (d > 0) up += d; else dn -= d; }
  r.ascent = up; r.descent = dn;
  return r;
}
