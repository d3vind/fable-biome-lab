const THREE = globalThis.THREE;
if (!THREE) throw new Error('three.js failed to initialise');

const BUILD = { three: THREE.REVISION, world: 'reedwake', rev: 1 };

/* ------------------------------------------------------------------ *
 *  math
 * ------------------------------------------------------------------ */
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (e0, e1, x) => { const t = sat((x - e0) / (e1 - e0 || 1e-9)); return t * t * (3 - 2 * t); };
const smootherstep = (e0, e1, x) => { const t = sat((x - e0) / (e1 - e0 || 1e-9)); return t * t * t * (t * (t * 6 - 15) + 10); };
const mixv = (a, b, t) => a + (b - a) * t;
const sign = Math.sign;
const hypot2 = (x, z) => Math.sqrt(x * x + z * z);
/** shortest signed angular difference b-a, in (-PI,PI] */
function angDiff(a, b) { let d = (b - a) % TAU; if (d > PI) d -= TAU; if (d <= -PI) d += TAU; return d; }
/** frame-rate independent exponential approach */
const approach = (cur, tgt, rate, dt) => cur + (tgt - cur) * (1 - Math.exp(-rate * dt));

/* ------------------------------------------------------------------ *
 *  hashing + deterministic RNG
 *  Plan RNG and realization RNG are separate streams (see WorldPlan).
 * ------------------------------------------------------------------ */
function hashStr(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** FNV-1a over a string -> 8 hex chars. Honest label: repeatability checksum, not cryptographic. */
function checksum32(str) { return hashStr(str).toString(16).padStart(8, '0'); }

/** sfc32 — small, fast, well-distributed; 128-bit state from four derived words. */
function makeRandom(seedU32, salt) {
  let a = (seedU32 ^ 0x9e3779b9) >>> 0;
  let b = (Math.imul(seedU32, 0x85ebca6b) ^ hashStr(salt)) >>> 0;
  let c = (Math.imul(seedU32 ^ hashStr(salt), 0xc2b2ae35) + 0x165667b1) >>> 0;
  let d = (seedU32 + hashStr(salt + '')) >>> 0;
  for (let i = 0; i < 12; i++) { // warm up
    const t = (a + b) | 0;
    a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0; const t2 = (t + d) | 0; c = (c + t2) | 0;
    a = a >>> 0; b = b >>> 0; c = c >>> 0;
  }
  return function () {
    const t = (a + b) | 0;
    a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0; const t2 = (t + d) | 0; c = (c + t2) | 0;
    return ((t2 >>> 0) / 4294967296);
  };
}

class Rng {
  constructor(seedU32, salt) { this._n = makeRandom(seedU32, salt); this.calls = 0; }
  u() { this.calls++; return this._n(); }
  f(a = 0, b = 1) { return a + (b - a) * this.u(); }
  i(a, b) { return a + Math.floor(this.u() * (b - a + 1)); }
  bool(p = 0.5) { return this.u() < p; }
  sgn() { return this.u() < 0.5 ? -1 : 1; }
  pick(arr) { return arr[Math.floor(this.u() * arr.length) % arr.length]; }
  /** Box-Muller, clamped — used for natural-looking size / age spreads */
  gauss(mu = 0, sd = 1, lim = 2.6) {
    const u1 = Math.max(1e-7, this.u()), u2 = this.u();
    const g = Math.sqrt(-2 * Math.log(u1)) * Math.cos(TAU * u2);
    return mu + sd * clamp(g, -lim, lim);
  }
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.u() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }
}

/* Stateless spatial hash: identical result for the same cell forever, so scattered
   content never swims or re-rolls when a patch is rebuilt. */
function ihash(x, y, s) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}
const ihashf = (x, y, s) => ihash(x, y, s) / 4294967296;

/* ------------------------------------------------------------------ *
 *  gradient noise (2D)  — CPU authority for terrain + habitat fields
 * ------------------------------------------------------------------ */
const GRAD = new Float32Array([1, 0, -1, 0, 0, 1, 0, -1, 0.7071, 0.7071, -0.7071, 0.7071, 0.7071, -0.7071, -0.7071, -0.7071]);
function gnoise(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
  const v = zf * zf * zf * (zf * (zf * 6 - 15) + 10);
  let g, a, b, c, d;
  g = (ihash(xi, zi, s) & 7) << 1; a = GRAD[g] * xf + GRAD[g + 1] * zf;
  g = (ihash(xi + 1, zi, s) & 7) << 1; b = GRAD[g] * (xf - 1) + GRAD[g + 1] * zf;
  g = (ihash(xi, zi + 1, s) & 7) << 1; c = GRAD[g] * xf + GRAD[g + 1] * (zf - 1);
  g = (ihash(xi + 1, zi + 1, s) & 7) << 1; d = GRAD[g] * (xf - 1) + GRAD[g + 1] * (zf - 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 1.4142;
}
/** fbm with inter-octave rotation so ridges never align to the world axes */
function fbm(x, z, s, oct = 4, lac = 2.03, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, px = x, pz = z;
  for (let i = 0; i < oct; i++) {
    sum += amp * gnoise(px, pz, s + i * 1013);
    norm += amp; amp *= gain;
    const nx = px * 0.8046 - pz * 0.5939, nz = px * 0.5939 + pz * 0.8046;
    px = nx * lac; pz = nz * lac;
  }
  return sum / norm;
}
/** billowed / absolute-value fbm — used for cloud mass and reed-bed patchiness */
function fbmAbs(x, z, s, oct = 4) {
  let sum = 0, amp = 1, norm = 0, px = x, pz = z;
  for (let i = 0; i < oct; i++) {
    sum += amp * (1 - Math.abs(gnoise(px, pz, s + i * 733)));
    norm += amp; amp *= 0.5;
    const nx = px * 0.8046 - pz * 0.5939, nz = px * 0.5939 + pz * 0.8046;
    px = nx * 2.07; pz = nz * 2.07;
  }
  return sum / norm;
}

/* ------------------------------------------------------------------ *
 *  canonical serialisation — the basis of the plan checksum
 * ------------------------------------------------------------------ */
function canon(v, dp = 4) {
  if (v === null || v === undefined) return 'n';
  const t = typeof v;
  if (t === 'number') {
    if (!isFinite(v)) return 'x';
    const r = Math.round(v * 10 ** dp) / 10 ** dp;
    return (Object.is(r, -0) ? 0 : r).toString();
  }
  if (t === 'boolean') return v ? 'T' : 'F';
  if (t === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map((e) => canon(e, dp)).join(',') + ']';
  if (ArrayBuffer.isView(v)) { let o = '<'; for (let i = 0; i < v.length; i++) o += canon(v[i], dp) + ','; return o + '>'; }
  const keys = Object.keys(v).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canon(v[k], dp)).join(',') + '}';
}

/* ------------------------------------------------------------------ *
 *  small helpers
 * ------------------------------------------------------------------ */
/** catmull-rom through a 1D control array, clamped ends */
function crSample(arr, t) {
  const n = arr.length; if (n === 0) return 0; if (n === 1) return arr[0];
  const f = clamp(t, 0, 1) * (n - 1), i = Math.min(n - 2, Math.floor(f)), u = f - i;
  const p0 = arr[Math.max(0, i - 1)], p1 = arr[i], p2 = arr[i + 1], p3 = arr[Math.min(n - 1, i + 2)];
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}
/** distance from point to segment, plus the parametric position along it.
 *  Writes into a shared record: this runs millions of times and must not allocate. */
const _SEG = { d: 0, t: 0, cx: 0, cz: 0 };
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t, cz = az + dz * t;
  _SEG.d = Math.hypot(px - cx, pz - cz); _SEG.t = t; _SEG.cx = cx; _SEG.cz = cz;
  return _SEG;
}
const fmtKm = (m) => (m / 1000).toFixed(2) + ' km';
const fmtMin = (s) => Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');
