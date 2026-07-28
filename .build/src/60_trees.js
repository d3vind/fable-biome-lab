/* ==================================================================
 *  TREES
 *  Pollarded willows and island alders. One template per level of detail;
 *  every tree's silhouette — shoot count, lengths, droop, lean, the gaps in
 *  its crown — is sculpted in the vertex shader from its own seed, so no two
 *  are alike and there is no broccoli sphere or canopy slab anywhere.
 *  Trunks barely move, shoots bend slowly, leafy tips flutter.
 * ================================================================== */

/** Topology only: the shader decides where every vertex actually goes. */
function treeTemplate(shoots, segs, crossed, sides, rings) {
  const pos = [], part = [], sho = [], tt = [], sd = [];
  const idx = [];
  const add = (x, y, z, p, s, t, side) => { pos.push(x, y, z); part.push(p); sho.push(s); tt.push(t); sd.push(side); return pos.length / 3 - 1; };

  // trunk + pollard knuckle: one tube, radius profile applied in the shader
  let prev = null;
  for (let r = 0; r <= rings; r++) {
    const t = r / rings, row = [];
    for (let a = 0; a < sides; a++) {
      const an = (a / sides) * TAU;
      row.push(add(Math.cos(an), t, Math.sin(an), t > 0.80 ? 1 : 0, 0, t, an));
    }
    if (prev) for (let a = 0; a < sides; a++) {
      const b = (a + 1) % sides;
      idx.push(prev[a], row[a], prev[b], prev[b], row[a], row[b]);
    }
    prev = row;
  }
  // shoots as ribbons; width profile (twig -> leafy) is applied in the shader
  const planes = crossed ? 2 : 1;
  for (let s = 0; s < shoots; s++) {
    for (let pl = 0; pl < planes; pl++) {
      let pL = -1, pR = -1;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const l = add(pl, 0, -1, 2 + pl * 0.5, s, t, -1);
        const r = add(pl, 0, 1, 2 + pl * 0.5, s, t, 1);
        if (i > 0) idx.push(pL, pR, l, l, pR, r);
        pL = l; pR = r;
      }
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(part), 1));
  g.setAttribute('aShoot', new THREE.BufferAttribute(new Float32Array(sho), 1));
  g.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(tt), 1));
  g.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(sd), 1));
  g.setIndex(idx);
  return { geo: g, tris: idx.length / 3, shoots };
}

const GLSL_TREE = /* glsl */`
attribute float aPart;    // 0 trunk, 1 knuckle, 2/2.5 shoot ribbon planes
attribute float aShoot;
attribute float aT;
attribute float aSide;
attribute vec3 iPos;
attribute vec4 iA;        // height, yaw, seed, kind (0 willow, 1 alder)
attribute vec4 iB;        // lean, crown scale, hue, wet
uniform float uShoots;
varying vec3 vWorld; varying vec3 vNormal; varying float vPart; varying float vT;
varying vec4 vIB; varying float vKind; varying float vLeaf;

float h11(float n){ return fract(sin(n*127.1)*43758.5453); }

void treeVertex(float lodFade){
  float H    = iA.x * lodFade;
  float yaw  = iA.y;
  float S    = iA.z;
  float kind = floor(iA.w);           // kind and baked exposure share one slot
  float ex   = fract(iA.w) * 1.111;
  vKind = kind; vPart = aPart; vT = aT; vIB = iB;

  vec3 wv = windAt(iPos.xz, ex);

  float trunkH = (kind < 0.5 ? 0.46 : 0.30) * H;      // pollards are cut low; alders run higher
  float headR  = (kind < 0.5 ? 0.16 : 0.075) * H;
  vec3 p;
  vec3 nrm;

  if (aPart < 1.5){
    // --- trunk and knuckle: lumpy taper, and it barely moves
    float t = aT;
    float taper = mix(1.0, kind < 0.5 ? 0.72 : 0.45, t);
    float knuckle = kind < 0.5 ? (1.0 + 1.35 * smoothstep(0.78, 1.0, t) * (1.0 - smoothstep(1.0, 1.06, t))) : 1.0;
    float lump = 1.0 + 0.16*sin(aSide*3.0 + S*6.3 + t*5.0) + 0.10*sin(aSide*5.0 - S*2.1 + t*11.0);
    float rad = (kind < 0.5 ? 0.105 : 0.055) * H * taper * knuckle * lump;
    p = vec3(position.x * rad, t * trunkH, position.z * rad);
    nrm = normalize(vec3(position.x, 0.25, position.z));
    vLeaf = 0.0;
  } else {
    // --- one shoot: direction, length, droop and presence all from its own hash
    float sh = aShoot;
    float r1 = h11(sh*13.7 + S*3.1), r2 = h11(sh*29.3 + S*1.7);
    float r3 = h11(sh*41.1 + S*2.3), r4 = h11(sh*57.9 + S*5.9);
    float az = (sh / uShoots) * 6.2831853 + (r1 - 0.5) * 1.15;
    // an asymmetric crown with deliberate gaps, not an even fan
    float dens = 0.52 + 0.48 * sin(az * (kind < 0.5 ? 2.0 : 3.0) + S * 6.28);
    float present = step(r4, 0.45 + 0.62 * dens);
    float el = kind < 0.5 ? mix(0.30, 1.30, r2*r2) : mix(0.55, 1.45, r2);
    float len = (kind < 0.5 ? 0.62 : 0.55) * H * iB.y * mix(0.45, 1.30, r3) * present;
    float droop = kind < 0.5 ? mix(0.42, 1.05, r3) : mix(0.08, 0.34, r3);

    vec3 base = vec3(cos(az), 0.0, sin(az)) * headR * 0.85 + vec3(0.0, trunkH * (kind<0.5?1.0:mix(0.45,1.0,r1)), 0.0);
    vec3 dir = vec3(cos(az)*cos(el), sin(el), sin(az)*cos(el));
    float t = aT;
    p = base + dir * len * t;
    p.y -= droop * len * t * t;

    // ribbon width: bare twig at the base, leafy toward the tip
    float leafy = smoothstep(0.22, 0.62, t) * (1.0 - smoothstep(0.94, 1.03, t));
    vLeaf = leafy;
    float w = (0.006 + 0.023 * leafy * iB.y) * H * (kind<0.5?1.0:1.35);
    vec3 axis = normalize(dir);
    vec3 sideV = normalize(cross(axis, vec3(0.0,1.0,0.0) + vec3(0.001)));
    if (aPart > 2.25) sideV = normalize(cross(axis, sideV));      // the crossed plane
    p += sideV * aSide * w;

    // wind: shoots bend slowly along the shoot, fine leaf mass flutters on top
    float bendAmt = wv.z * 0.030 * (0.6 + 0.4*sin(uTime*0.85 + S*4.0 + dot(iPos.xz,uWindDir)*0.05));
    float flutter = wv.z * 0.0075 * leafy * sin(uTime*4.3 + sh*2.1 + S*7.0);
    p += vec3(wv.x, 0.0, wv.y) * (bendAmt * t * t * H * 0.55 + flutter * H);
    p.y -= bendAmt * t * t * H * 0.10;
    nrm = normalize(mix(normalize(vec3(sideV.x, 0.55, sideV.z)), vec3(0.0,1.0,0.0), 0.35));
  }

  // whole-tree lean (pollards lean off the prevailing wind), then yaw
  p.x += iB.x * (p.y / max(H,0.5)) * (p.y / max(H,0.5)) * H * 0.14;
  float cy = cos(yaw), sy = sin(yaw);
  vec3 rp = vec3(p.x*cy - p.z*sy, p.y, p.x*sy + p.z*cy);
  vec3 rn = vec3(nrm.x*cy - nrm.z*sy, nrm.y, nrm.x*sy + nrm.z*cy);
  vWorld = iPos + rp;
  vNormal = rn;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

function makeTreeMaterial(shared, shoots, fade, depthOnly) {
  const vs = /* glsl */`
    ${GLSL_HEAD}${GLSL_WIND}${GLSL_TREE}
    uniform vec4 uFade;
    void main(){
      float d = distance(iPos.xz, uCamPos.xz);
      float fade = smoothstep(uFade.x, uFade.y, d) * (1.0 - smoothstep(uFade.z, uFade.w, d));
      if (iA.x <= 0.0) fade = 0.0;
      treeVertex(fade);
    }`;
  const uniforms = withShared(shared, { uShoots: { value: shoots }, uFade: { value: new THREE.Vector4(...fade) } });
  if (depthOnly) {
    return new THREE.ShaderMaterial({
      uniforms, side: THREE.DoubleSide, vertexShader: vs,
      fragmentShader: `precision highp float; varying vec3 vWorld; varying vec3 vNormal; varying float vPart;
        varying float vT; varying vec4 vIB; varying float vKind; varying float vLeaf;
        void main(){ gl_FragColor = vec4(1.0); }`,
    });
  }
  return new THREE.ShaderMaterial({
    uniforms, side: THREE.DoubleSide, vertexShader: vs,
    fragmentShader: /* glsl */`
      ${GLSL_HEAD}${GLSL_SKY}${GLSL_SHADOW}${GLSL_LIGHT}${GLSL_AIR}
      varying vec3 vWorld; varying vec3 vNormal; varying float vPart; varying float vT;
      varying vec4 vIB; varying float vKind; varying float vLeaf;
      void main(){
        vec3 V = vWorld - uCamPos;
        vec3 N = normalize(vNormal);
        if (!gl_FrontFacing) N = -N;
        float bark = 1.0 - vLeaf;
        vec3 barkC = mix(s2l(C_WOOD)*0.55, s2l(C_STONE)*0.62, 0.30 + 0.45*fbm2(vWorld.xz*3.0 + vWorld.y*2.0, 2));
        barkC = mix(barkC, barkC*vec3(0.62,0.68,0.66), vIB.w*0.6);
        // willow leaf: cool grey-green; alder: deeper and warmer
        vec3 leafC = vKind < 0.5 ? mix(s2l(C_REED)*0.85, s2l(C_LICHEN)*0.72, 0.15 + 0.40*vIB.z)
                                 : mix(s2l(C_REED_D), s2l(C_REED), 0.35 + 0.45*vIB.z);
        leafC *= 0.80 + 0.35*fbm2(vWorld.xz*1.7 + vec2(vT*4.0), 2);
        vec3 alb = mix(barkC, leafC, vLeaf);
        float ao = mix(0.62, 1.0, smoothstep(0.1, 0.8, vT)) * mix(0.80, 1.0, vLeaf);
        vec3 col = shade(N, alb, vWorld, ao, 0.48, vLeaf * 0.95);
        gl_FragColor = vec4(applyAir(col, vWorld, normalize(V)), 1.0);
      }`,
  });
}

/* ------------------------------------------------------------------ *
 *  registry + LOD streaming
 * ------------------------------------------------------------------ */
class Trees {
  constructor(fields, plan, shared, q) {
    this.F = fields; this.plan = plan; this.q = q;
    this.group = new THREE.Group();
    this.list = [];
    this._buildRegistry();

    const specs = [
      { name: 'near', tpl: treeTemplate(q.treeNear.shoots, 5, true, 7, 5), cap: q.treeNear.cap, fade: [0, 0.001, q.treeNear.reach - 12, q.treeNear.reach] },
      { name: 'mid', tpl: treeTemplate(q.treeMid.shoots, 3, false, 5, 4), cap: q.treeMid.cap, fade: [q.treeNear.reach - 14, q.treeNear.reach - 2, q.treeMid.reach - 30, q.treeMid.reach] },
      { name: 'far', tpl: treeTemplate(q.treeFar.shoots, 2, false, 4, 3), cap: q.treeFar.cap, fade: [q.treeMid.reach - 34, q.treeMid.reach - 6, q.treeFar.reach - 90, q.treeFar.reach] },
    ];
    this.lods = specs.map((s) => {
      const geo = s.tpl.geo;
      const iPos = new Float32Array(s.cap * 3), iA = new Float32Array(s.cap * 4), iB = new Float32Array(s.cap * 4);
      const aPos = new THREE.InstancedBufferAttribute(iPos, 3), aA = new THREE.InstancedBufferAttribute(iA, 4), aB = new THREE.InstancedBufferAttribute(iB, 4);
      for (const a of [aPos, aA, aB]) a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('iPos', aPos); geo.setAttribute('iA', aA); geo.setAttribute('iB', aB);
      geo.instanceCount = s.cap;
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
      const mat = makeTreeMaterial(shared, s.tpl.shoots, s.fade, false);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      const o = { ...s, geo, iPos, iA, iB, aPos, aA, aB, mat, mesh, live: 0, tris: s.tpl.tris };
      if (s.name !== 'far') o.depthMat = makeTreeMaterial(shared, s.tpl.shoots, s.fade, true);
      return o;
    });
    this.lastX = 1e9; this.lastZ = 1e9;
  }

  /** Every tree in the world, placed by rule from the plan — never an authored list. */
  _buildRegistry() {
    const plan = this.plan, F = this.F;
    const R = new Rng(plan.seedU, 'realize:trees');
    const push = (x, z, kind, hBase, tag) => {
      const y = F.marshH(x, z);
      if (F.roadDist(x, z) < CORRIDOR + 1.2) return;
      if (y < -1.35) return;                                    // but not out in the deep channels
      const g = R.gauss(0, 1);
      this.list.push({
        x, z, y: y - 0.08, kind,
        h: hBase * (1 + g * 0.22), yaw: R.f(0, TAU), seed: R.f(0, 40),
        lean: R.f(-0.5, 0.5) + (kind === 0 ? 0.35 : 0.1), crown: R.f(0.72, 1.28),
        hue: R.f(0, 1), wet: sat(smoothstep(-0.4, 0.5, -y)), tag,
        ex: Math.min(0.9, F.exposure(x, z) * 0.9),
      });
    };

    // -- the Drowned Orchard: rows that never become a grid
    const o = plan.landmarks.find((l) => l.kind === 'orchard');
    if (o) {
      const c = Math.cos(o.rot), s = Math.sin(o.rot);
      for (let r = 0; r < o.rows; r++) {
        const rowOff = (r - (o.rows - 1) / 2) * o.rowGap;
        for (let i = 0; i < o.perRow; i++) {
          if (R.u() < o.gapChance) continue;                    // missing trees, as in any old planting
          const along = (i - (o.perRow - 1) / 2) * o.treeGap + R.f(-1, 1) * o.jitter * o.treeGap;
          const drift = R.f(-1, 1) * o.jitter * o.rowGap * 0.7;
          const lx = along, lz = rowOff + drift;
          push(o.x + lx * c - lz * s, o.z + lx * s + lz * c, 0, R.f(4.6, 7.4), 'orchard');
        }
      }
    }
    // -- willow islands and alder stands
    for (const isl of plan.islands) {
      const n = Math.round(clamp(isl.r * isl.dens * 0.34, 3, 30));
      for (let i = 0; i < n; i++) {
        const a = R.f(0, TAU), rr = Math.sqrt(R.u()) * isl.r * 0.86;
        const lx = Math.cos(a) * rr, lz = Math.sin(a) * rr * isl.e;
        const cc = Math.cos(isl.rot), ss = Math.sin(isl.rot);
        const kind = R.bool(0.42) ? 0 : 1;
        push(isl.x + lx * cc - lz * ss, isl.z + lx * ss + lz * cc, kind,
          kind === 0 ? R.f(4.2, 7.0) : R.f(6.0, 10.5), 'island');
      }
    }
    // -- pollards worked along the banks of the Willow Cut and the closing canal
    for (const [poly, every, lat] of [[plan.polys.willow, 26, 17], [plan.polys.post, 30, 15]]) {
      for (let s = 40; s < poly.len - 40; s += every * R.f(0.6, 1.5)) {
        const i = clamp(Math.round((s / poly.len) * (poly.n - 1)), 0, poly.n - 1);
        const side = R.sgn(), off = lat + R.f(-5, 16);
        const nx = -Math.sin(poly.h[i]), nz = Math.cos(poly.h[i]);
        push(poly.x[i] + nx * off * side, poly.z[i] + nz * off * side, 0, R.f(3.8, 6.6), 'canal');
      }
    }
    this.count = this.list.length;
  }

  update(camX, camZ) {
    if (Math.hypot(camX - this.lastX, camZ - this.lastZ) < 3.5) return 0;
    this.lastX = camX; this.lastZ = camZ;
    for (const l of this.lods) l.live = 0;
    const bands = [this.q.treeNear.reach, this.q.treeMid.reach, this.q.treeFar.reach];
    for (const t of this.list) {
      const d = Math.hypot(t.x - camX, t.z - camZ);
      let li = -1;
      // overlap: a tree inside a fade band is written into both levels and cross-fades
      for (let i = 0; i < 3; i++) if (d < bands[i]) { li = i; break; }
      if (li < 0) continue;
      const targets = (li > 0 && d < bands[li - 1] + 16) ? [li - 1, li] : [li];
      for (const k of targets) {
        const L = this.lods[k];
        if (L.live >= L.cap) continue;
        const n = L.live++;
        L.iPos[n * 3] = t.x; L.iPos[n * 3 + 1] = t.y; L.iPos[n * 3 + 2] = t.z;
        L.iA[n * 4] = t.h; L.iA[n * 4 + 1] = t.yaw; L.iA[n * 4 + 2] = t.seed; L.iA[n * 4 + 3] = t.kind + t.ex;
        L.iB[n * 4] = t.lean; L.iB[n * 4 + 1] = t.crown; L.iB[n * 4 + 2] = t.hue; L.iB[n * 4 + 3] = t.wet;
      }
    }
    for (const L of this.lods) {
      for (let n = L.live; n < L.cap; n++) L.iA[n * 4] = 0;
      L.aPos.needsUpdate = true; L.aA.needsUpdate = true; L.aB.needsUpdate = true;
      L.geo.instanceCount = Math.max(1, L.live);
    }
    return 1;
  }
  counts() {
    const o = { registry: this.list.length, triangles: 0 };
    for (const L of this.lods) { o[L.name] = L.live; o.triangles += L.live * L.tris; }
    return o;
  }
  shadowMeshes() { return this.lods.filter((l) => l.depthMat).map((l) => l.mesh); }
  dispose() { for (const L of this.lods) { L.geo.dispose(); L.mat.dispose(); if (L.depthMat) L.depthMat.dispose(); } }
}
