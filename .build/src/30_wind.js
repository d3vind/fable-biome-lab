/* ==================================================================
 *  WIND
 *  One authority. Reeds, grass, seed heads, willow shoots, leaf flutter,
 *  water ripple and foam, cloud drift, particles, birds, audio and the
 *  rider's own camera all read the same field — the CPU copy below and
 *  the GLSL copy further down are the same arithmetic, so nothing can
 *  disagree about what the weather is doing.
 *
 *  A gust is a travelling LINE with a wavy edge, advancing along the wind
 *  vector: it arrives at the far reeds first and the rider last. It is not
 *  a radial ripple and not a screen effect.
 * ================================================================== */

const MAX_FRONTS = 3;

class Wind {
  constructor(plan) {
    this.plan = plan;
    const w = plan.weather;
    this.dirX = Math.cos(w.windDir); this.dirZ = Math.sin(w.windDir);
    this.perpX = -this.dirZ; this.perpZ = this.dirX;
    this.base = w.windBase;
    this.dirAngle = w.windDir;
    this.active = [];                 // live fronts
    this.armed = 0;                   // index of the next front to arm
    this.t = 0;
    // packed for the shaders: (posAlongWind, width, amp, k) and (ph, k2, ph2, spare)
    this.uA = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
    this.uB = [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()];
    this.lastGust = 0; this.justArrived = 0;
    this.frontEvents = 0;
    this._raw = { speed: 0, gust: 0, swing: 0 };
    this._at = { speed: 0, gust: 0, angle: 0, exposure: 1 };
  }

  reset() { this.active.length = 0; this.armed = 0; this.t = 0; this.frontEvents = 0; }

  /** Arm any front whose route trigger the rider has passed, and retire the spent ones. */
  update(dt, riderS, riderX, riderZ) {
    this.t += dt;
    this.justArrived = 0;      // set for the one step a front crosses the rider
    const F = this.plan.fronts;
    while (this.armed < F.length && riderS >= F[this.armed].armS) {
      const f = F[this.armed++];
      if (this.active.length >= MAX_FRONTS) { this.active.shift(); }
      const a = riderX * this.dirX + riderZ * this.dirZ;
      this.active.push({ f, pos: a - f.lead, born: this.t, arrived: false });
      this.frontEvents++;
    }
    for (let i = this.active.length - 1; i >= 0; i--) {
      const A = this.active[i];
      A.pos += A.f.speed * dt;
      const a = riderX * this.dirX + riderZ * this.dirZ;
      if (!A.arrived && A.pos > a) { A.arrived = true; this.justArrived = A.f.amp; }
      if (A.pos - (riderX * this.dirX + riderZ * this.dirZ) > A.f.run) this.active.splice(i, 1);
    }
    for (let i = 0; i < MAX_FRONTS; i++) {
      const A = this.active[i];
      if (A) {
        this.uA[i].set(A.pos, A.f.width, A.f.amp, A.f.k);
        this.uB[i].set(A.f.ph, A.f.k2, A.f.ph2, 0);
      } else { this.uA[i].set(0, 1, 0, 0); this.uB[i].set(0, 0, 0, 0); }
    }
  }

  /** Raw field strength (before local shelter). Mirrors windRaw() in GLSL exactly. */
  raw(x, z) {
    const a = x * this.dirX + z * this.dirZ;
    const q = x * this.perpX + z * this.perpZ;
    const t = this.t;
    let gust = 0, swing = 0;
    for (let i = 0; i < MAX_FRONTS; i++) {
      const A = this.uA[i], B = this.uB[i];
      if (A.z <= 0) continue;
      const u = (a - A.x) / A.y;
      if (u < -1 || u > 1) continue;
      const c = Math.cos(u * PI * 0.5);
      const prof = c * c;
      const lat = 0.66 + 0.34 * Math.sin(q * A.w + B.x) * 0.62 + 0.22 * Math.sin(q * B.y + B.z);
      gust += A.z * prof * lat;
      swing += A.z * prof * Math.sin(q * A.w * 0.6 + B.x + 1.7);
    }
    const turb = 0.17 * Math.sin(a * 0.021 - t * 1.55 + q * 0.013)
      + 0.11 * Math.sin(a * 0.047 + t * 2.45 - q * 0.031)
      + 0.07 * Math.sin(q * 0.062 + t * 3.7);
    const breathe = 0.80 + 0.20 * Math.sin(t * 0.093 + a * 0.00061);
    const speed = (this.base * breathe + gust * this.base * 1.45) * (0.88 + turb);
    const o = this._raw;
    o.speed = Math.max(0.15, speed); o.gust = gust; o.swing = swing * 0.20 + turb * 0.10;
    return o;
  }

  /** Field strength at a point including local shelter, plus the local direction. */
  at(x, z, fields) {
    const r = this.raw(x, z);
    const ex = fields ? fields.exposure(x, z) : 1;
    const shelter = 0.30 + 0.70 * ex;
    const o = this._at;
    o.speed = r.speed * shelter; o.gust = r.gust * shelter;
    o.angle = this.dirAngle + r.swing * (1.25 - 0.5 * ex); o.exposure = ex;
    return o;
  }

  /** How near the nearest front is to the rider, in metres along the wind (for HUD / proof). */
  frontDistance(x, z) {
    const a = x * this.dirX + z * this.dirZ;
    let best = Infinity;
    for (const A of this.active) { const d = A.pos - a; if (Math.abs(d) < Math.abs(best)) best = d; }
    return best;
  }
  applyUniforms(u) {
    u.uWindDir.value.set(this.dirX, this.dirZ);
    u.uWindBase.value = this.base;
    u.uWindAng.value = this.dirAngle;
    for (let i = 0; i < MAX_FRONTS; i++) { u.uFrontA.value[i].copy(this.uA[i]); u.uFrontB.value[i].copy(this.uB[i]); }
  }
}

/* ------------------------------------------------------------------ *
 *  the GLSL half of the same authority
 * ------------------------------------------------------------------ */
const GLSL_WIND = /* glsl */`
uniform vec2  uWindDir;
uniform float uWindBase;
uniform float uWindAng;
uniform vec4  uFrontA[3];   // x pos along wind, y width, z amplitude, w lateral k
uniform vec4  uFrontB[3];   // x phase, y k2, z phase2

// returns vec3(speed, gust, directional swing)
vec3 windRaw(vec2 p){
  vec2 dir = uWindDir;
  vec2 per = vec2(-dir.y, dir.x);
  float a = dot(p, dir);
  float q = dot(p, per);
  float gust = 0.0, swing = 0.0;
  for (int i = 0; i < 3; i++){
    vec4 A = uFrontA[i], B = uFrontB[i];
    if (A.z <= 0.0) continue;
    float u = (a - A.x) / A.y;
    if (abs(u) > 1.0) continue;
    float c = cos(u * 1.5707963);
    float prof = c * c;
    float lat = 0.66 + 0.34 * sin(q * A.w + B.x) * 0.62 + 0.22 * sin(q * B.y + B.z);
    gust  += A.z * prof * lat;
    swing += A.z * prof * sin(q * A.w * 0.6 + B.x + 1.7);
  }
  float turb = 0.17 * sin(a * 0.021 - uTime * 1.55 + q * 0.013)
             + 0.11 * sin(a * 0.047 + uTime * 2.45 - q * 0.031)
             + 0.07 * sin(q * 0.062 + uTime * 3.7);
  float breathe = 0.80 + 0.20 * sin(uTime * 0.093 + a * 0.00061);
  float speed = (uWindBase * breathe + gust * uWindBase * 1.45) * (0.88 + turb);
  return vec3(max(speed, 0.15), gust, swing * 0.20 + turb * 0.10);
}

// local wind vector after shelter; ex is the baked exposure at this point
vec3 windAt(vec2 p, float ex){
  vec3 r = windRaw(p);
  float shelter = 0.30 + 0.70 * ex;
  float ang = uWindAng + r.z * (1.25 - 0.5 * ex);
  return vec3(cos(ang), sin(ang), r.x * shelter);
}

// Per-material response: different things bend at different rates, so the marsh never
// turns into one lump of wind jelly.
//   stiffness : how hard it resists (1 = reed, 3 = willow trunk)
//   freq      : its own sway frequency
float windSway(vec2 p, float ex, float phase, float stiffness, float freq){
  vec3 w = windAt(p, ex);
  float s = w.z / stiffness;
  float carrier = sin(uTime * freq + phase + dot(p, uWindDir) * 0.09);
  float flutter = sin(uTime * freq * 2.7 + phase * 1.7 + dot(p, uWindDir) * 0.21);
  return s * (0.62 + 0.38 * carrier) + s * 0.16 * flutter;
}
`;
