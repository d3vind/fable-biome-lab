/* ==================================================================
 *  VEGETATION
 *  Six families, three overlapping representations, one wind authority.
 *
 *  Everything is solid geometry — no alpha cards anywhere — so there is no
 *  card forest, no black fringing, no moire and no shimmering one-pixel stem.
 *  Distant marks get wider and simpler rather than thinner and denser, and
 *  the ground shader underpaints the rest of the coverage.
 *
 *  Placement is a pure function of the world cell, so a patch rebuilt an hour
 *  later contains exactly the same plants in exactly the same places.
 * ================================================================== */

const FAM = {
  REED: 0,      // common reed — tall, supple, seed head
  SEDGE: 1,     // sedge / rush — shorter, stiffer, blue-olive
  MEADOW: 2,    // wet meadow grass — fine, fast, straw heads
  EDGE: 3,      // aquatic edge plant — broad, dark, low
};

/** stem template: `segs` tapered segments plus an optional seed head */
function stemTemplate(segs, head) {
  const pos = [], vert = [], idx = [];
  const push = (x, y, t, s) => { pos.push(x, y, 0); vert.push(t, s); return pos.length / 3 - 1; };
  const w = (t) => 0.5 * (1 - t * 0.82) * (0.35 + 0.65 * (1 - t * t * 0.5));
  let prevL = -1, prevR = -1;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const l = push(-w(t), t, t, -1), r = push(w(t), t, t, 1);
    if (i > 0) idx.push(prevL, prevR, l, l, prevR, r);
    prevL = l; prevR = r;
  }
  if (head === 'tri') {
    const a = push(-w(0.9) * 2.3, 0.84, 0.84, -1), b = push(w(0.9) * 2.3, 0.84, 0.84, 1);
    const c = push(0, 1.16, 1.16, 0);
    idx.push(a, b, c);
  } else if (head) {
    const a = push(-w(0.9) * 2.4, 0.84, 0.84, -1), b = push(w(0.9) * 2.4, 0.84, 0.84, 1);
    const c = push(-w(1) * 1.0, 1.16, 1.16, -1), d = push(w(1) * 1.0, 1.16, 1.16, 1);
    idx.push(a, b, c, c, b, d);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aVert', new THREE.BufferAttribute(new Float32Array(vert), 2));
  g.setIndex(idx);
  return { geo: g, tris: idx.length / 3 };
}
/** far mark: one wide tapered triangle standing for a whole clump */
function markTemplate() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0]), 3));
  g.setAttribute('aVert', new THREE.BufferAttribute(new Float32Array([0.10, -1, 0.10, 1, 0.78, 0]), 2));
  g.setIndex([0, 1, 2]);
  return { geo: g, tris: 1 };
}

const GLSL_VEG = /* glsl */`
attribute vec2 aVert;      // x: height along the stem, y: side
attribute vec3 iPos;
attribute vec4 iA;         // height, yaw, phase, family
attribute vec4 iB;         // bend, wet, hue, value
varying vec3 vWorld; varying vec3 vNormal; varying vec4 vIB; varying float vT; varying float vFam;
varying float vLee;

void vegVertex(float widthScale, float lodFade){
  float t = aVert.x;
  float H = iA.x * lodFade;
  float yaw = iA.y, phase = iA.z;
  float fam = floor(iA.w);            // family and baked exposure share one slot, so the
  float ex  = fract(iA.w) * 1.111;    // vertex stage needs no texture fetch at all
  vFam = fam; vT = t; vIB = iB;

  // family temperament: reeds are supple and slow, sedges stiff, meadow grass fine and quick
  float stiff = fam < 0.5 ? 1.0 : (fam < 1.5 ? 1.75 : (fam < 2.5 ? 0.82 : 1.35));
  float freq  = fam < 0.5 ? 1.35 : (fam < 1.5 ? 2.05 : (fam < 2.5 ? 3.10 : 1.70));

  vLee = ex;
  vec3 wv = windAt(iPos.xz, ex);
  float carrier = sin(uTime*freq + phase + dot(iPos.xz, uWindDir)*0.085);
  float flut    = sin(uTime*freq*2.9 + phase*1.9 + dot(iPos.xz, uWindDir)*0.23);
  float amp = (wv.z / stiff) * 0.055 * (0.60 + 0.40*carrier) + (wv.z/stiff)*0.014*flut;

  float lean = pow(t, 1.7);
  vec3 local = vec3(position.x * widthScale, position.y * H, 0.0);
  // its own resting curve, then the wind on top of that
  local.x += iB.x * t * t * H * 0.26;
  float cy = cos(yaw), sy = sin(yaw);
  vec3 rot = vec3(local.x*cy, local.y, local.x*sy);
  vec3 push = vec3(wv.x, 0.0, wv.y) * amp * lean * H;
  vec3 wp = iPos + rot + push;
  wp.y -= dot(push,push) * 0.16 / max(H,0.4);      // bending shortens the stem

  // blade normal, tilted toward the sky so a marsh full of stems is not a mosaic
  vec3 bladeN = normalize(vec3(-sy, 0.0, cy));
  if (dot(bladeN, uCamPos - wp) < 0.0) bladeN = -bladeN;
  vNormal = normalize(mix(bladeN, vec3(0.0,1.0,0.0), 0.55));
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const GLSL_VEG_FRAG = /* glsl */`
varying vec3 vWorld; varying vec3 vNormal; varying vec4 vIB; varying float vT; varying float vFam;
varying float vLee;
vec3 vegColor(){
  vec3 reed   = mix(s2l(C_REED_D), s2l(C_REED), 0.45);
  vec3 sedge  = mix(s2l(C_REED), s2l(C_OLIVE), 0.38);
  vec3 meadow = mix(s2l(C_OLIVE), s2l(C_LICHEN), 0.38);
  vec3 edgep  = mix(s2l(C_REED_D), s2l(C_MUD), 0.35);
  vec3 c = vFam < 0.5 ? reed : (vFam < 1.5 ? sedge : (vFam < 2.5 ? meadow : edgep));
  c *= 1.26;                                   // marsh green sits above the water it grows out of
  // straw at the tips, wet dark at the root — reeds are never one flat green
  c = mix(c * 0.72, c, smoothstep(0.0, 0.35, vT));
  c = mix(c, s2l(C_STRAW), smoothstep(0.80, 1.10, vT) * (0.18 + 0.42*vIB.z));
  c *= 0.80 + 0.40 * vIB.w;
  c = mix(c, c * vec3(0.62,0.68,0.62), vIB.y * 0.55);
  return c;
}
`;

function makeVegMaterial(shared, opts) {
  return new THREE.ShaderMaterial({
    uniforms: withShared(shared, { uWidth: { value: opts.width }, uValue: { value: opts.value === undefined ? 1 : opts.value }, uFade: { value: new THREE.Vector4(...opts.fade) } }),
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      ${GLSL_HEAD}${GLSL_WIND}${GLSL_VEG}
      uniform float uWidth; uniform vec4 uFade;   // inLo, inHi, outLo, outHi
      void main(){
        float d = distance(iPos.xz, uCamPos.xz);
        float fade = smoothstep(uFade.x, uFade.y, d) * (1.0 - smoothstep(uFade.z, uFade.w, d));
        if (iA.x <= 0.0) fade = 0.0;
        vegVertex(uWidth, fade);
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_HEAD}${GLSL_SKY}${GLSL_SHADOW}${GLSL_LIGHT}${GLSL_AIR}${GLSL_VEG_FRAG}
      uniform float uValue;
      void main(){
        vec3 V = vWorld - uCamPos;
        vec3 N = normalize(vNormal);
        if (!gl_FrontFacing) N = -N;
        vec3 c = vegColor() * uValue;   // a distant band is mass and value, not lit blades
        float ao = mix(0.55, 1.0, smoothstep(0.0, 0.55, vT));     // light does not reach the litter
        vec3 col = shade(N, c, vWorld, ao, 0.55, 0.85);
        gl_FragColor = vec4(applyAir(col, vWorld, normalize(V)), 1.0);
      }`,
  });
}

/* ------------------------------------------------------------------ *
 *  one streamed band
 * ------------------------------------------------------------------ */
class VegBand {
  constructor(name, tpl, mat, cfg) {
    this.name = name; this.cfg = cfg;
    this.geo = tpl.geo; this.triPer = tpl.tris;
    this.mat = mat;
    const total = cfg.slots * cfg.cap;
    this.total = total;
    this.iPos = new Float32Array(total * 3);
    this.iA = new Float32Array(total * 4);
    this.iB = new Float32Array(total * 4);
    this.aPos = new THREE.InstancedBufferAttribute(this.iPos, 3);
    this.aA = new THREE.InstancedBufferAttribute(this.iA, 4);
    this.aB = new THREE.InstancedBufferAttribute(this.iB, 4);
    for (const a of [this.aPos, this.aA, this.aB]) a.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iPos', this.aPos);
    this.geo.setAttribute('iA', this.aA);
    this.geo.setAttribute('iB', this.aB);
    this.geo.instanceCount = total;
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false;
    this.slots = new Map();                 // patchKey -> slot
    this.free = []; for (let i = cfg.slots - 1; i >= 0; i--) this.free.push(i);
    this.dirtyLo = Infinity; this.dirtyHi = -Infinity;
    this.live = 0;
  }
  _touch(lo, hi) { if (lo < this.dirtyLo) this.dirtyLo = lo; if (hi > this.dirtyHi) this.dirtyHi = hi; }

  fill(slot, px, pz, F, plan) {
    const c = this.cfg, base = slot * c.cap, cell = c.patch;
    const salt = c.salt;
    let n = 0;
    for (let k = 0; k < c.cap; k++) {
      const hx = ihashf(px, pz, k * 7919 + salt);
      const hz = ihashf(px, pz, k * 6971 + salt + 13);
      const x = px * cell + hx * cell, z = pz * cell + hz * cell;
      const ra = F.roadAt(x, z);
      const rd = ra ? ra.d : 999;
      if (rd < c.clear) continue;                              // strict road clearance mask
      const h = F.marshH(x, z);
      /* Stand on the ground that is actually visible. Inside the road's influence that is
         the embankment, not the marsh underneath it — planting on the marsh buried every
         stem within a batter's width of the carriageway and left a mown-looking bare band
         down both sides of the whole route. Habitat is still classified by the marsh, so a
         bank of reed climbs the batter instead of turning into dry meadow. */
      let gy = h;
      if (ra) gy = h + (F.roadProfile(ra.d, ra.y, h) - h) * smoothstep(ROAD_INFL, ROAD_INFL - 8, ra.d);
      /* the beat decides what this side of the road is for: a wall of old reed, a low
         saltmarsh sward, or nothing at all because the water is out to the horizon */
      const comp = F.causewayInfo(x, z);
      const vig = clamp(F.vigour(ra) * comp.vig, 0.24, 1.85);
      const mass = comp.mass;
      const hab = F.habitat(x, z, h);
      const r3 = ihashf(px, pz, k * 5231 + salt + 29);
      // pick a family by habitat weight; inside a corridor beat the old reed beds win,
      // and on the open hand they lose to low sedge and saltmarsh grass
      /* Low vigour means saltmarsh, not hayfield: an open, wind-scoured, half-drowned
         hand of the road goes to sedge and edge plant, never to dry straw meadow. */
      const wR = hab.reed * vig * vig, wS = hab.sedge * (0.55 + 0.95 * vig);
      const wM = hab.meadow * Math.max(0.12, 1.30 - 0.58 * vig), wE = hab.edge * Math.max(0.4, 1.55 - 0.48 * vig);
      const tot = wR + wS + wM + wE;
      if (tot < 0.10) continue;
      // stands, not fur: a mid-frequency mask spends the stems where they read as shape
      const dens = sat(tot * c.densMul * (0.20 + 1.18 * F.clump(x, z)) * (0.30 + 0.86 * mass));
      if (r3 > dens) continue;
      let fam, pick = ihashf(px, pz, k * 4021 + salt + 41) * tot;
      if (pick < wR) fam = FAM.REED; else if (pick < wR + wS) fam = FAM.SEDGE;
      else if (pick < wR + wS + wM) fam = FAM.MEADOW; else fam = FAM.EDGE;

      const g = ihashf(px, pz, k * 3373 + salt + 53);
      const baseH = fam === FAM.REED ? 1.74 : fam === FAM.SEDGE ? 0.85 : fam === FAM.MEADOW ? 0.55 : 0.68;
      let H = baseH * (0.55 + 0.9 * g) * c.hMul * (fam === FAM.REED || fam === FAM.SEDGE ? vig : 1);
      // duck under the road edge so nothing ever leans onto the carriageway
      H *= smoothstep(c.clear - 0.2, c.clear + 3.2, rd) * 0.55 + 0.45;
      const o3 = (base + n) * 3, o4 = (base + n) * 4;
      this.iPos[o3] = x; this.iPos[o3 + 1] = gy - 0.04; this.iPos[o3 + 2] = z;
      this.iA[o4] = H;
      this.iA[o4 + 1] = ihashf(px, pz, k * 2791 + salt + 61) * TAU;
      this.iA[o4 + 2] = ihashf(px, pz, k * 2377 + salt + 67) * TAU;
      this.iA[o4 + 3] = fam + Math.min(0.9, F.exposure(x, z) * 0.9);
      this.iB[o4] = (ihashf(px, pz, k * 1949 + salt + 71) - 0.5) * 1.5;
      this.iB[o4 + 1] = hab.wet;
      this.iB[o4 + 2] = ihashf(px, pz, k * 1699 + salt + 79);
      this.iB[o4 + 3] = 0.35 + 0.65 * ihashf(px, pz, k * 1523 + salt + 83);
      n++;
    }
    for (let k = n; k < c.cap; k++) { this.iA[(base + k) * 4] = 0; }   // park unused slots
    this._touch(base, base + c.cap);
    return n;
  }

  update(camX, camZ, F, plan, budget) {
    const c = this.cfg, cell = c.patch;
    const reach = c.reach;
    const p0x = Math.floor((camX - reach) / cell), p1x = Math.floor((camX + reach) / cell);
    const p0z = Math.floor((camZ - reach) / cell), p1z = Math.floor((camZ + reach) / cell);
    const want = this._want || (this._want = new Set());
    want.clear();
    for (let px = p0x; px <= p1x; px++) for (let pz = p0z; pz <= p1z; pz++) {
      const cx = (px + 0.5) * cell, cz = (pz + 0.5) * cell;
      if (Math.hypot(cx - camX, cz - camZ) > reach + cell) continue;
      want.add(px * 65536 + pz);
    }
    for (const [k, slot] of this.slots) {
      if (!want.has(k)) {
        const base = slot * c.cap;
        for (let i = 0; i < c.cap; i++) this.iA[(base + i) * 4] = 0;
        this._touch(base, base + c.cap);
        this.free.push(slot); this.slots.delete(k);
      }
    }
    let built = 0;
    for (const k of want) {
      if (this.slots.has(k)) continue;
      if (built >= budget || this.free.length === 0) break;
      const slot = this.free.pop();
      const px = Math.round((k - (((k % 65536) + 98304) % 65536 - 32768)) / 65536);
      const pz = ((k % 65536) + 98304) % 65536 - 32768;
      this.live += this.fill(slot, px, pz, F, plan);
      this.slots.set(k, slot);
      built++;
    }
    if (this.dirtyHi >= this.dirtyLo) {
      for (const a of [this.aPos, this.aA, this.aB]) a.needsUpdate = true;
      this.dirtyLo = Infinity; this.dirtyHi = -Infinity;
    }
    return built;
  }
  /** honest count of instances currently carrying a plant */
  count() {
    let n = 0;
    for (const [, slot] of this.slots) {
      const base = slot * this.cfg.cap;
      for (let i = 0; i < this.cfg.cap; i++) if (this.iA[(base + i) * 4] > 0) n++;
    }
    return n;
  }
  clear() {
    this.slots.clear(); this.free.length = 0;
    for (let i = this.cfg.slots - 1; i >= 0; i--) this.free.push(i);
    this.iA.fill(0); this.aA.needsUpdate = true; this.live = 0;
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

class Vegetation {
  constructor(fields, plan, shared, q) {
    this.F = fields; this.plan = plan;
    this.group = new THREE.Group();
    this.bands = [];
    const mk = (name, tpl, matOpts, cfg) => {
      const b = new VegBand(name, tpl, makeVegMaterial(shared, matOpts), cfg);
      this.bands.push(b); this.group.add(b.mesh); return b;
    };
    // overlapping bands: each fades in and out in world space, so no ring can form
    this.near = mk('near', stemTemplate(2, true), { width: 0.098, value: 1.0, fade: [0, 0.001, q.vegNear.reach - 10, q.vegNear.reach] }, q.vegNear);
    this.mid = mk('mid', stemTemplate(1, 'tri'), { width: 0.105, value: 0.88, fade: [2.5, 13, q.vegMid.reach - 24, q.vegMid.reach] }, q.vegMid);
    this.far = mk('far', markTemplate(), { width: 1.24, value: 0.70, fade: [q.vegFar.fadeIn0, q.vegFar.fadeIn1, q.vegFar.reach - 70, q.vegFar.reach] }, q.vegFar);
    this.tris = 0;
  }
  update(camX, camZ, budget) {
    let b = 0;
    for (const band of this.bands) b += band.update(camX, camZ, this.F, this.plan, budget);
    return b;
  }
  counts() {
    const o = {};
    let total = 0, tris = 0;
    for (const band of this.bands) { const c = band.count(); o[band.name] = c; total += c; tris += c * band.triPer; }
    o.total = total; o.triangles = tris;
    return o;
  }
  clear() { for (const b of this.bands) b.clear(); }
  dispose() { for (const b of this.bands) b.dispose(); }
}
