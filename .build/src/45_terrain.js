/* ==================================================================
 *  GROUND
 *  Two camera-following radial shells displaced on the GPU from the baked
 *  field windows, plus the road as its own exact ribbon. Nothing here is
 *  rebuilt on the CPU per frame, so the ground cannot hitch, swim or breathe.
 * ================================================================== */

const GLSL_GROUND_ALBEDO = /* glsl */`
/* One ground palette for both shells and for the ribbon's outer batter, so the road
   edge dissolves into the marsh instead of ending on an outline. */
vec3 groundAlbedo(vec2 wp, float h, float reed, float wet, float dist, out float gloss){
  vec2 warp = vec2(fbm2(wp*0.0015, 3), fbm2(wp*0.0015 + vec2(19.3,7.1), 3));
  float broad = fbm2(wp*0.0034 + (warp-0.5)*1.7, 4);       // the large value shapes
  float mid   = fbm2(wp*0.019, 3);
  float fine  = fbm2(wp*0.21, 2);
  float grain = 1.0 - smoothstep(26.0, 130.0, dist);        // micro texture fades out: no moire

  vec3 silt    = mix(s2l(C_MUD)*0.72, s2l(C_OLIVE)*0.5, mid);
  vec3 reedCol = mix(s2l(C_REED_D), s2l(C_REED), 0.30 + 0.70*broad);
  vec3 lowMead = mix(s2l(C_OLIVE)*0.80, s2l(C_LICHEN)*0.78, 0.25 + 0.55*mid);
  vec3 dryTop  = mix(s2l(C_LICHEN)*0.86, s2l(C_STRAW)*0.72, 0.30 + 0.60*broad);

  vec3 c = mix(silt, reedCol, smoothstep(-0.40, 0.12, h));
  c = mix(c, lowMead, smoothstep(0.20, 0.95, h));
  c = mix(c, dryTop,  smoothstep(1.45, 2.60, h));
  c = mix(c, reedCol * 0.60, reed * 0.66);                   // under a stand it is litter, not lawn
  c *= 0.86 + 0.22 * mix(0.5, fine, grain) + 0.30*(broad-0.5) + 0.14*(mid-0.5);
  c = mix(c, c * vec3(0.56,0.62,0.60), wet * 0.62);          // wet ground goes dark and cool
  gloss = wet * (0.35 + 0.4*grain);
  return c;
}
`;

/** Radial template: dense underfoot, geometric out to the haze.
 *  Growth is solved so the shell ends exactly where it is asked to. */
function radialGeometry(angular, rings, r0, outer, rStart) {
  const A = angular, N = rings;
  const span = outer - rStart;
  let lo = 1.0001, hi = 1.4;
  for (let it = 0; it < 60; it++) {
    const g = (lo + hi) / 2;
    const tot = r0 * (Math.pow(g, N) - 1) / (g - 1);
    if (tot > span) hi = g; else lo = g;
  }
  const growth = (lo + hi) / 2;
  const pos = new Float32Array((N + 1) * A * 3);
  const idx = [];
  let r = rStart, step = r0;
  const radii = new Float32Array(N + 1);
  for (let i = 0; i <= N; i++) { radii[i] = r; r += step; step *= growth; }
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j < A; j++) {
      const a = (j / A) * TAU;
      const o = (i * A + j) * 3;
      pos[o] = Math.cos(a) * radii[i]; pos[o + 1] = 0; pos[o + 2] = Math.sin(a) * radii[i];
    }
  }
  // wound so the surface faces up: radial x tangential must come out +Y
  for (let i = 0; i < N; i++) for (let j = 0; j < A; j++) {
    const j2 = (j + 1) % A;
    const a = i * A + j, b = i * A + j2, c = (i + 1) * A + j, d = (i + 1) * A + j2;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radii[N] * 1.05);
  return { geo: g, outer: radii[N] };
}

function makeGroundMaterial(shared, opts) {
  return new THREE.ShaderMaterial({
    uniforms: withShared(shared, { uCenter: { value: new THREE.Vector2() }, uSampleStep: { value: opts.step } }),
    side: THREE.FrontSide,
    polygonOffset: !!opts.offset, polygonOffsetFactor: opts.offset || 0, polygonOffsetUnits: opts.offset || 0,
    vertexShader: /* glsl */`
      ${GLSL_HEAD}
      uniform vec2 uCenter; uniform float uSampleStep;
      varying vec3 vWorld; varying vec3 vNormal; varying vec4 vFld;
      void main(){
        vec2 wp = position.xz + uCenter;
        vec4 f = sampleGround(wp);
        float e = uSampleStep;
        float hx = sampleGround(wp + vec2(e,0.0)).x - sampleGround(wp - vec2(e,0.0)).x;
        float hz = sampleGround(wp + vec2(0.0,e)).x - sampleGround(wp - vec2(0.0,e)).x;
        vNormal = normalize(vec3(-hx, 2.0*e, -hz));
        vWorld = vec3(wp.x, f.x, wp.y);
        vFld = f;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_HEAD}${GLSL_SKY}${GLSL_SHADOW}${GLSL_LIGHT}${GLSL_AIR}${GLSL_GROUND_ALBEDO}
      varying vec3 vWorld; varying vec3 vNormal; varying vec4 vFld;
      void main(){
        vec3 V = vWorld - uCamPos;
        float dist = length(V);
        vec3 N = normalize(vNormal);
        float gloss;
        vec3 alb = groundAlbedo(vWorld.xz, vFld.x, vFld.z, vFld.w, dist, gloss);
        vec3 col = shade(N, alb, vWorld, 0.86 + 0.14*N.y, 0.42, 0.0);
        // damp wet sheen at grazing angles rather than adding plastic highlights
        vec3 H = normalize(uSunDir - normalize(V));
        col += uSunCol * pow(max(dot(N,H),0.0), 42.0) * gloss * 0.16 * cloudShadow(vWorld.xz);
        gl_FragColor = vec4(applyAir(col, vWorld, normalize(V)), 1.0);
      }`,
  });
}

class Ground {
  constructor(shared, quality) {
    const q = quality;
    // near shell: 0 -> 112 m, driven by the 0.66 m field window
    const nr = radialGeometry(q.groundNearA, q.groundNearN, 0.55, 112, 0.0);
    this.nearMat = makeGroundMaterial(shared, { step: 0.7 });
    this.near = new THREE.Mesh(nr.geo, this.nearMat);
    // far shell: overlaps the near band, then runs out to the haze
    const fr = radialGeometry(q.groundFarA, q.groundFarN, 1.5, 4300, 55.0);
    this.farMat = makeGroundMaterial(shared, { step: 4.5, offset: 1 });
    this.far = new THREE.Mesh(fr.geo, this.farMat);
    for (const m of [this.near, this.far]) { m.frustumCulled = false; m.matrixAutoUpdate = false; }
    this.group = new THREE.Group();
    this.group.add(this.far, this.near);
    this.outer = fr.outer;
    this.tris = (q.groundNearA * q.groundNearN + q.groundFarA * q.groundFarN) * 2;
  }
  update(cx, cz) {
    // snap so the tessellation never crawls under a stationary camera
    const sx = Math.round(cx * 2) / 2, sz = Math.round(cz * 2) / 2;
    this.nearMat.uniforms.uCenter.value.set(sx, sz);
    this.farMat.uniforms.uCenter.value.set(Math.round(cx / 4) * 4, Math.round(cz / 4) * 4);
  }
  dispose() { this.near.geometry.dispose(); this.far.geometry.dispose(); this.nearMat.dispose(); this.farMat.dispose(); }
}

/* ==================================================================
 *  ROAD RIBBON
 *  Built directly from the same cross-section the terrain field uses, so the
 *  carriageway is supported by construction rather than by luck. Streamed in
 *  chunks by world distance, so both fork arms are drawn whenever visible.
 * ================================================================== */

// carriageway | seam | wet gravel | sedge verge | batter | marsh
const RIB_LAT = [-22, -16, -11.5, -9.2, -7.75, -6.3, -4.85, -3.8, -2.70, -2.36, -1.55, -0.78,
  0, 0.78, 1.55, 2.36, 2.70, 3.8, 4.85, 6.3, 7.75, 9.2, 11.5, 16, 22];
const RIB_W = RIB_LAT.length;

const GLSL_ROAD = /* glsl */`
varying float vLat; varying float vAlong; varying float vWear;
`;

function makeRoadMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: withShared(shared, {}),
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: /* glsl */`
      ${GLSL_HEAD}
      attribute float aLat; attribute float aAlong; attribute float aWear;
      varying vec3 vWorld; varying vec3 vNormal; ${GLSL_ROAD}
      void main(){
        vWorld = position; vNormal = normal;
        vLat = aLat; vAlong = aAlong; vWear = aWear;
        gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_HEAD}${GLSL_SKY}${GLSL_SHADOW}${GLSL_LIGHT}${GLSL_AIR}${GLSL_GROUND_ALBEDO}
      varying vec3 vWorld; varying vec3 vNormal; ${GLSL_ROAD}
      void main(){
        vec3 V = vWorld - uCamPos; float dist = length(V);
        float a = abs(vLat);
        float grain = 1.0 - smoothstep(46.0, 190.0, dist);

        // --- carriageway: graphite, not grey. Aggregate, patching, wheel polish.
        float agg  = fbm2(vWorld.xz * 4.3, 3);
        float agg2 = fbm2(vWorld.xz * 22.0, 2);
        float wornPatch = smoothstep(0.52, 0.78, fbm2(vWorld.xz*0.09 + vec2(3.1,8.4), 3));
        vec3 road = mix(s2l(C_ROAD), s2l(C_ROAD2), 0.30 + 0.55*agg);
        road = mix(road, s2l(C_ROAD)*0.74, wornPatch*0.62);
        road *= 0.84 + 0.34*mix(0.5, agg2, grain);
        // two faint polished wheel tracks, and grit gathering at the edges
        float track = exp(-pow((a-0.86)/0.42, 2.0)) + exp(-pow((a-1.62)/0.34, 2.0));
        road *= 1.0 + 0.10*track*grain;
        float edgeGrit = smoothstep(1.55, 2.36, a);
        road = mix(road, mix(road, s2l(C_MUD), 0.42), edgeGrit * (0.35 + 0.5*vWear));

        // --- dark contact seam: the road's own shadow line into the ground
        float seam = smoothstep(2.36, 2.44, a) * (1.0 - smoothstep(2.62, 2.74, a));
        // --- wet gravel / broken loam
        float gv = fbm2(vWorld.xz*3.1, 3), gv2 = fbm2(vWorld.xz*13.0, 2);
        vec3 gravel = mix(s2l(C_STONE)*0.62, s2l(C_MUD)*1.05, 0.35+0.5*gv);
        gravel *= 0.82 + 0.34*mix(0.5, gv2, grain);
        gravel = mix(gravel, gravel*0.66, smoothstep(0.45,0.85,fbm2(vWorld.xz*0.5,2)));  // puddled patches
        // --- sedge verge, then the batter handing over to open marsh
        float gloss;
        // the batter is made ground, not upland: read it at bank height so a 4 m causeway
        // does not paint itself dry straw all the way down to the waterline
        vec3 marsh = groundAlbedo(vWorld.xz, min(vWorld.y, 1.15), 0.60, 0.35, dist, gloss);
        vec3 verge = mix(s2l(C_REED_D)*0.82, s2l(C_OLIVE)*0.78, 0.35 + 0.4*fbm2(vWorld.xz*0.8,3));

        vec3 col = road;
        col = mix(col, gravel, smoothstep(2.62, 3.05, a));
        col = mix(col, verge,  smoothstep(3.60, 5.00, a));
        col = mix(col, marsh,  smoothstep(5.80, 8.00, a));
        col *= 1.0 - seam * 0.42;
        // no continuous bright outline anywhere: the edge is a seam, then gravel, then green

        vec3 N = normalize(vNormal);
        float wet = smoothstep(3.1, 5.4, a) * 0.5;
        vec3 lit = shade(N, col, vWorld, 0.92, 0.35, 0.0);
        vec3 H = normalize(uSunDir - normalize(V));
        float sheen = smoothstep(2.36, 0.0, a) * 0.10 + wet*0.22;
        lit += uSunCol * pow(max(dot(N,H),0.0), 60.0) * sheen * cloudShadow(vWorld.xz);
        gl_FragColor = vec4(applyAir(lit, vWorld, normalize(V)), 1.0);
      }`,
  });
}

class RoadRibbon {
  constructor(fields, shared, quality) {
    this.F = fields; this.q = quality;
    this.mat = makeRoadMaterial(shared);
    this.group = new THREE.Group();
    this.chunks = new Map();       // key -> {mesh, key}
    this.pool = [];
    this.tris = 0;
    this.CHUNK = 96;               // metres of carriageway per chunk
  }

  /** One chunk of one carriageway, built entirely from the field cross-section. */
  _build(poly, s0, s1, seedBase) {
    const F = this.F;
    // stations get sparser with distance from the chunk start; the ribbon is cheap either way
    const stations = [];
    for (let s = s0; s < s1; s += 4) stations.push(s);
    stations.push(s1);
    const NS = stations.length;
    const pos = new Float32Array(NS * RIB_W * 3);
    const nrm = new Float32Array(NS * RIB_W * 3);
    const lat = new Float32Array(NS * RIB_W);
    const alo = new Float32Array(NS * RIB_W);
    const wea = new Float32Array(NS * RIB_W);
    const P = { x: 0, z: 0, y: 0, h: 0 };

    const at = (s, out) => {
      const f = clamp(s / Math.max(1e-6, poly.len), 0, 1) * (poly.n - 1);
      const i = Math.min(poly.n - 2, Math.floor(f)), u = f - i;
      out.x = lerp(poly.x[i], poly.x[i + 1], u);
      out.z = lerp(poly.z[i], poly.z[i + 1], u);
      out.y = lerp(poly.y[i], poly.y[i + 1], u);
      out.h = poly.h[i] + angDiff(poly.h[i], poly.h[i + 1]) * u;
    };

    for (let si = 0; si < NS; si++) {
      const s = stations[si];
      at(s, P);
      const nx = -Math.sin(P.h), nz = Math.cos(P.h);
      const wear = 0.5 + 0.5 * fbm(s * 0.011, seedBase * 0.37, F.nz + 4242, 3);
      for (let li = 0; li < RIB_W; li++) {
        const t = RIB_LAT[li];
        const x = P.x + nx * t, z = P.z + nz * t;
        // the single authority — identical call the terrain field bakes from
        const r = F.roadAt(x, z);
        const marsh = F.marshH(x, z);
        const y = r ? F.roadProfile(r.d, r.y, marsh) : marsh;
        const o = (si * RIB_W + li) * 3;
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        lat[si * RIB_W + li] = t;
        alo[si * RIB_W + li] = s;
        wea[si * RIB_W + li] = wear;
      }
    }
    // normals from the built grid
    for (let si = 0; si < NS; si++) for (let li = 0; li < RIB_W; li++) {
      const i0 = (si * RIB_W + li) * 3;
      const iA = (Math.max(0, si - 1) * RIB_W + li) * 3, iB = (Math.min(NS - 1, si + 1) * RIB_W + li) * 3;
      const iL = (si * RIB_W + Math.max(0, li - 1)) * 3, iR = (si * RIB_W + Math.min(RIB_W - 1, li + 1)) * 3;
      const ax = pos[iB] - pos[iA], ay = pos[iB + 1] - pos[iA + 1], az = pos[iB + 2] - pos[iA + 2];
      const bx = pos[iR] - pos[iL], by = pos[iR + 1] - pos[iL + 1], bz = pos[iR + 2] - pos[iL + 2];
      let nx2 = ay * bz - az * by, ny2 = az * bx - ax * bz, nz2 = ax * by - ay * bx;
      const l = Math.hypot(nx2, ny2, nz2) || 1;
      if (ny2 < 0) { nx2 = -nx2; ny2 = -ny2; nz2 = -nz2; }
      nrm[i0] = nx2 / l; nrm[i0 + 1] = ny2 / l; nrm[i0 + 2] = nz2 / l;
    }
    const idx = [];
    // along x lateral must come out +Y, or the carriageway is a back face
    for (let si = 0; si < NS - 1; si++) for (let li = 0; li < RIB_W - 1; li++) {
      const a = si * RIB_W + li, b = a + 1, c = a + RIB_W, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('aLat', new THREE.BufferAttribute(lat, 1));
    g.setAttribute('aAlong', new THREE.BufferAttribute(alo, 1));
    g.setAttribute('aWear', new THREE.BufferAttribute(wea, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return { geo: g, tris: idx.length / 3 };
  }

  /** Keep chunks resident by world distance so the far arm of the fork is drawn too. */
  update(camX, camZ, budget) {
    const want = new Set();
    const R = this.q.roadRange;
    for (const rp of this.F.roadPolys) {
      const poly = rp.p, nC = Math.ceil(poly.len / this.CHUNK);
      // coarse proximity test per chunk using its mid-station
      for (let c = 0; c < nC; c++) {
        const sMid = (c + 0.5) * this.CHUNK;
        const i = clamp(Math.round((sMid / poly.len) * (poly.n - 1)), 0, poly.n - 1);
        const d = Math.hypot(poly.x[i] - camX, poly.z[i] - camZ);
        if (d < R) want.add(rp.id + ':' + c);
      }
    }
    for (const [k, ch] of this.chunks) {
      if (!want.has(k)) { this.group.remove(ch.mesh); ch.mesh.geometry.dispose(); this.tris -= ch.tris; this.chunks.delete(k); }
    }
    let built = 0;
    for (const k of want) {
      if (this.chunks.has(k)) continue;
      if (built >= budget) break;
      const [id, cs] = k.split(':');
      const rp = this.F.roadPolys.find((r) => r.id === id);
      const c = +cs;
      const s0 = c * this.CHUNK, s1 = Math.min(rp.p.len, (c + 1) * this.CHUNK + 4);
      if (s1 - s0 < 1) continue;
      const r = this._build(rp.p, s0, s1, hashStr(k));
      const mesh = new THREE.Mesh(r.geo, this.mat);
      mesh.frustumCulled = true; mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.chunks.set(k, { mesh, tris: r.tris });
      this.tris += r.tris; built++;
    }
    return built;
  }
  clear() {
    for (const [, ch] of this.chunks) { this.group.remove(ch.mesh); ch.mesh.geometry.dispose(); }
    this.chunks.clear(); this.tris = 0;
  }
  dispose() { this.clear(); this.mat.dispose(); }
}
