/* ==================================================================
 *  BUILT THINGS
 *  Masonry, timber and iron that has been repaired more than once.
 *  Everything is assembled from primitives with per-piece wear, so the
 *  Three Sluices and the Tide Wheel hold up to being ridden right past.
 * ================================================================== */

const MAT_STONE = 0, MAT_TIMBER = 1, MAT_IRON = 2, MAT_EARTH = 3;

class Builder {
  constructor() { this.p = []; this.n = []; this.m = []; this.w = []; this.a = []; this.i = []; this.g = []; }
  _push(v, nv, mat, wear, ao, grain) {
    this.p.push(v.x, v.y, v.z); this.n.push(nv.x, nv.y, nv.z);
    this.m.push(mat); this.w.push(wear); this.a.push(ao); this.g.push(grain);
    return this.p.length / 3 - 1;
  }
  /** axis-aligned box then transformed; ao is per-box, wear per-box */
  box(M, sx, sy, sz, mat, wear, ao, grain = 0) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const V = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
    [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]];
    const F = [[0, 3, 2, 1, 0, 0, -1], [4, 5, 6, 7, 0, 0, 1], [0, 1, 5, 4, 0, -1, 0],
    [3, 7, 6, 2, 0, 1, 0], [0, 4, 7, 3, -1, 0, 0], [1, 2, 6, 5, 1, 0, 0]];
    const nm = new THREE.Matrix3().setFromMatrix4(M).invert().transpose();
    const tv = new THREE.Vector3(), tn = new THREE.Vector3();
    for (const f of F) {
      const base = [];
      for (let k = 0; k < 4; k++) {
        tv.set(V[f[k]][0], V[f[k]][1], V[f[k]][2]).applyMatrix4(M);
        tn.set(f[4], f[5], f[6]).applyMatrix3(nm).normalize();
        base.push(this._push(tv, tn, mat, wear, k < 2 ? ao * 0.82 : ao, grain));
      }
      this.i.push(base[0], base[1], base[2], base[0], base[2], base[3]);
    }
  }
  /** tube along local +Y */
  cyl(M, r0, r1, h, seg, mat, wear, ao, grain = 0, lump = 0, seed = 0) {
    const nm = new THREE.Matrix3().setFromMatrix4(M).invert().transpose();
    const tv = new THREE.Vector3(), tn = new THREE.Vector3();
    let prev = null;
    for (let k = 0; k <= 1; k++) {
      const row = [], r = k ? r1 : r0, y = k ? h : 0;
      for (let s = 0; s < seg; s++) {
        const a = (s / seg) * TAU;
        const rr = r * (1 + lump * Math.sin(a * 3 + seed) * 0.5 + lump * Math.sin(a * 5 - seed * 2) * 0.3);
        tv.set(Math.cos(a) * rr, y, Math.sin(a) * rr).applyMatrix4(M);
        tn.set(Math.cos(a), 0, Math.sin(a)).applyMatrix3(nm).normalize();
        row.push(this._push(tv, tn, mat, wear, k ? ao : ao * 0.86, grain));
      }
      if (prev) for (let s = 0; s < seg; s++) {
        const t = (s + 1) % seg;
        this.i.push(prev[s], row[s], prev[t], prev[t], row[s], row[t]);
      }
      prev = row;
    }
    // caps
    for (const k of [0, 1]) {
      const r = k ? r1 : r0, y = k ? h : 0;
      tn.set(0, k ? 1 : -1, 0).applyMatrix3(nm).normalize();
      tv.set(0, y, 0).applyMatrix4(M);
      const c = this._push(tv, tn, mat, wear, ao, grain);
      const ring = [];
      for (let s = 0; s < seg; s++) {
        const a = (s / seg) * TAU;
        tv.set(Math.cos(a) * r, y, Math.sin(a) * r).applyMatrix4(M);
        ring.push(this._push(tv, tn, mat, wear, ao, grain));
      }
      for (let s = 0; s < seg; s++) {
        const t = (s + 1) % seg;
        if (k) this.i.push(c, ring[s], ring[t]); else this.i.push(c, ring[t], ring[s]);
      }
    }
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('aMat', new THREE.BufferAttribute(new Float32Array(this.m), 1));
    g.setAttribute('aWear', new THREE.BufferAttribute(new Float32Array(this.w), 1));
    g.setAttribute('aAo', new THREE.BufferAttribute(new Float32Array(this.a), 1));
    g.setAttribute('aGrain', new THREE.BufferAttribute(new Float32Array(this.g), 1));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
  get tris() { return this.i.length / 3; }
}

const M4 = () => new THREE.Matrix4();
function trs(x, y, z, ry, rx = 0, rz = 0) {
  const m = M4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1));
  return m;
}

function makeStructureMaterial(shared, depthOnly) {
  const vs = /* glsl */`
    ${GLSL_HEAD}${GLSL_WIND}
    attribute float aMat; attribute float aWear; attribute float aAo; attribute float aGrain;
    varying vec3 vWorld; varying vec3 vNormal; varying float vMat; varying float vWear;
    varying float vAo; varying float vGrain;
    void main(){
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      vNormal = normalize(mat3(modelMatrix) * normal);
      vMat = aMat; vWear = aWear; vAo = aAo; vGrain = aGrain;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  if (depthOnly) {
    return new THREE.ShaderMaterial({
      uniforms: withShared(shared, {}), vertexShader: vs,
      fragmentShader: `precision highp float; varying vec3 vWorld; varying vec3 vNormal; varying float vMat;
        varying float vWear; varying float vAo; varying float vGrain; void main(){ gl_FragColor = vec4(1.0); }`,
    });
  }
  return new THREE.ShaderMaterial({
    uniforms: withShared(shared, {}), side: THREE.DoubleSide,
    vertexShader: vs,
    fragmentShader: /* glsl */`
      ${GLSL_HEAD}${GLSL_SKY}${GLSL_SHADOW}${GLSL_LIGHT}${GLSL_AIR}
      varying vec3 vWorld; varying vec3 vNormal; varying float vMat; varying float vWear;
      varying float vAo; varying float vGrain;
      void main(){
        vec3 V = vWorld - uCamPos; float dist = length(V);
        vec3 N = normalize(vNormal); if(!gl_FrontFacing) N = -N;
        float grain = 1.0 - smoothstep(30.0, 140.0, dist);
        vec2 wp = vWorld.xz;

        // --- coursed masonry: irregular blocks, recessed mortar, no repeat
        vec3 up = abs(N.y) > 0.7 ? vec3(1.0,0.0,0.0) : vec3(0.0,1.0,0.0);
        vec3 tx = normalize(cross(N, up));
        vec2 muv = vec2(dot(vWorld, tx), vWorld.y);
        float course = floor(muv.y / 0.34);
        float jog = fract(sin(course*17.3)*4371.7);
        float bx = floor((muv.x + jog*0.7) / 0.62);
        float mortar = smoothstep(0.035, 0.075, abs(fract(muv.y/0.34)-0.5)*0.34)
                     * smoothstep(0.035, 0.075, abs(fract((muv.x+jog*0.7)/0.62)-0.5)*0.62);
        float blockV = fract(sin(bx*31.7 + course*11.9)*9731.3);
        // wet estuary masonry: dark, cool, and never the colour of dry sandstone
        vec3 stone = mix(s2l(C_STONE)*0.20, s2l(C_STONE)*0.46, blockV) * vec3(0.90,0.97,1.02);
        stone *= 0.70 + 0.52*mix(0.5, fbm2(vWorld.xz*7.0 + vWorld.y*3.0, 3), grain);
        stone = mix(stone*0.52, stone, mix(1.0, mortar, 0.85));

        // --- timber: grain along the piece, split and silvered where it is dry
        float gr = fbm2(vec2(dot(vWorld, tx)*(2.0+vGrain*22.0), vWorld.y*1.7 + vGrain*3.0), 3);
        vec3 timber = mix(s2l(C_WOOD)*0.55, s2l(C_WOOD)*1.15, gr);
        timber = mix(timber, s2l(C_STONE)*0.72, vWear*0.35);           // silvering
        timber *= 0.86 + 0.28*mix(0.5, fbm2(vWorld.xz*22.0, 2), grain);

        // --- iron: dark, with rust blooming out of the joints
        float rust = smoothstep(0.45, 0.85, fbm2(vWorld.xz*3.4 + vWorld.y*2.2, 3));
        vec3 iron = mix(vec3(0.028,0.030,0.034), s2l(C_COPPER)*0.42, rust*(0.4+0.6*vWear));

        vec3 earth = mix(s2l(C_MUD), s2l(C_OLIVE)*0.6, fbm2(vWorld.xz*1.4,3));

        vec3 alb = vMat < 0.5 ? stone : (vMat < 1.5 ? timber : (vMat < 2.5 ? iron : earth));

        // --- tide marks: the water writes its own history on everything it touches
        float band = smoothstep(uTideY + 0.95, uTideY + 0.10, vWorld.y) * smoothstep(uTideY - 2.0, uTideY - 0.2, vWorld.y);
        float wetLo = smoothstep(uTideY + 0.30, uTideY - 0.45, vWorld.y);
        alb = mix(alb, alb * vec3(0.38,0.44,0.38), band*0.72);
        alb = mix(alb, alb * vec3(0.24,0.29,0.27), wetLo*0.88);

        // --- moss and weed: upward-facing ledges and the damp north of every joint
        float mossN = smoothstep(-0.1, 0.75, N.y) * 0.55 + (1.0-abs(N.y))*0.25;
        float mossMask = smoothstep(0.42, 0.80, fbm2(vWorld.xz*2.1 + vWorld.y*1.3, 3)) * mossN;
        mossMask *= smoothstep(uTideY + 3.6, uTideY + 0.2, vWorld.y) * (0.30 + 0.70*vWear);
        mossMask *= (1.0 - mortar*0.4);
        alb = mix(alb, mix(s2l(C_REED_D), s2l(C_LICHEN)*0.7, 0.30), mossMask*0.82);

        float ao = vAo * (0.72 + 0.28*mortar);
        vec3 col = shade(N, alb, vWorld, ao, 0.30, 0.0);
        vec3 H = normalize(uSunDir - normalize(V));
        float spec = vMat > 1.5 && vMat < 2.5 ? 0.22 : (wetLo*0.28);
        col += uSunCol * pow(max(dot(N,H),0.0), 46.0) * spec * cloudShadow(vWorld.xz);
        gl_FragColor = vec4(applyAir(col, vWorld, normalize(V)), 1.0);
      }`,
  });
}

/* ------------------------------------------------------------------ *
 *  THE THREE SLUICES
 * ------------------------------------------------------------------ */
function buildSluices(lm, F, R) {
  const B = new Builder();
  const y0 = -1.9, deckY = lm.y - 0.30;
  const pierW = lm.pierW, wear = lm.moss;
  const openings = lm.gates;
  // lay the three openings out symmetrically about the road centre
  let totalW = 0; for (const g of openings) totalW += g.w;
  totalW += pierW * (openings.length + 1);
  let cursor = -totalW / 2;
  const piers = [];
  const deckH = lm.deck;
  const wallT = 1.15;

  const put = (lx, ly, lz, sx, sy, sz, mat, w, ao, grain = 0) => {
    B.box(trs(lx, ly, lz, 0), sx, sy, sz, mat, w, ao, grain);
  };
  // upstream + downstream abutment walls with battered faces
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const t = k / 3;
      put(0, y0 + (deckY - y0) * (t + 0.125), side * (3.4 + t * 0.55), totalW + 3.2 - t * 0.7,
        (deckY - y0) * 0.25, wallT - t * 0.18, MAT_STONE, wear, 0.86 - t * 0.05);
    }
    // coping course on top
    put(0, deckY + 0.14, side * 3.9, totalW + 3.6, 0.28, 1.05, MAT_STONE, wear * 0.7, 1.0);
  }
  for (let i = 0; i <= openings.length; i++) {
    const w = pierW;
    const cx = cursor + w / 2;
    // pier: battered stone, cutwater on the seaward face
    B.box(trs(cx, (y0 + deckY) / 2, 0), w, deckY - y0, 7.6, MAT_STONE, wear, 0.88);
    B.box(trs(cx, (y0 + deckY) / 2, -4.1), w * 0.86, (deckY - y0) * 0.95, 1.5, MAT_STONE, wear, 0.8);
    B.cyl(trs(cx, y0, -4.6).multiply(M4().makeRotationX(0)), w * 0.42, w * 0.36, deckY - y0, 7, MAT_STONE, wear, 0.82, 0, 0.10, i * 3.1);
    piers.push(cx);
    cursor += w;
    if (i < openings.length) cursor += openings[i].w;
  }
  // deck slab + parapets + coping
  put(0, deckY + deckH / 2, 0, totalW + 3.2, deckH, 8.4, MAT_STONE, wear * 0.8, 0.95);
  for (const side of [-1, 1]) {
    put(0, deckY + deckH + 0.42, side * 3.55, totalW + 3.4, 0.84, 0.42, MAT_STONE, wear * 0.6, 1.0);
    put(0, deckY + deckH + 0.90, side * 3.55, totalW + 3.5, 0.14, 0.56, MAT_STONE, wear * 0.4, 1.0);
  }
  // gates, guides and winding gear
  cursor = -totalW / 2 + pierW;
  for (let i = 0; i < openings.length; i++) {
    const g = openings[i];
    const cx = cursor + g.w / 2;
    const gateMat = g.gate === 'iron' ? MAT_IRON : MAT_TIMBER;
    const sillY = y0 + 0.55;
    const gateH = deckY - sillY - 0.15;
    const lift = g.open * gateH;
    // the leaf itself, built from separate boards with iron straps
    const boards = Math.max(3, Math.round(g.w / 0.42));
    for (let b = 0; b < boards; b++) {
      const bw = g.w / boards;
      const bx = cx - g.w / 2 + bw * (b + 0.5);
      B.box(trs(bx, sillY + lift + gateH / 2, 0), bw * 0.94, gateH, 0.16, gateMat, g.wear, 0.92, 0.5 + b * 0.13);
    }
    for (const fy of [0.22, 0.72]) {
      B.box(trs(cx, sillY + lift + gateH * fy, 0.13), g.w * 1.02, 0.13, 0.06, MAT_IRON, g.wear, 0.95);
      for (let b = 0; b < boards; b++) {
        const bx = cx - g.w / 2 + (g.w / boards) * (b + 0.5);
        B.cyl(trs(bx, sillY + lift + gateH * fy - 0.035, 0.17).multiply(M4().makeRotationX(PI / 2)), 0.035, 0.035, 0.05, 6, MAT_IRON, g.wear, 1.0);
      }
    }
    // vertical guides in the pier faces
    for (const s of [-1, 1]) B.box(trs(cx + s * (g.w / 2 + 0.09), (sillY + deckY) / 2, 0), 0.18, deckY - sillY, 0.34, MAT_IRON, g.wear * 0.8, 0.86);
    // sill
    B.box(trs(cx, sillY - 0.18, 0), g.w + 0.5, 0.36, 3.0, MAT_STONE, wear, 0.8);
    // winding gear on the deck: frame, spindle, handwheel
    const gy = deckY + deckH;
    for (const s of [-1, 1]) B.box(trs(cx + s * 0.34, gy + 0.62, 0), 0.13, 1.24, 0.13, MAT_IRON, g.wear, 0.9);
    B.box(trs(cx, gy + 1.26, 0), 0.95, 0.16, 0.20, MAT_IRON, g.wear, 0.95);
    B.cyl(trs(cx, gy + 0.10, 0), 0.055, 0.055, 1.20, 6, MAT_IRON, g.wear, 0.95);
    B.cyl(trs(cx, gy + 1.42, 0).multiply(M4().makeRotationX(PI / 2)), 0.30, 0.30, 0.07, 12, MAT_IRON, g.wear, 1.0);
    B.cyl(trs(cx, gy + 1.42, 0).multiply(M4().makeRotationX(PI / 2)), 0.055, 0.055, 0.16, 6, MAT_IRON, g.wear, 1.0);
    for (let sp = 0; sp < 5; sp++) {
      const a = (sp / 5) * TAU;
      B.box(trs(cx + Math.cos(a) * 0.15, gy + 1.42 + Math.sin(a) * 0.15, 0), 0.30, 0.045, 0.045, MAT_IRON, g.wear, 1.0);
    }
    cursor += g.w + pierW;
  }
  // maintenance ladder down the end pier
  if (lm.ladder) {
    const lx = piers[piers.length - 1] + pierW * 0.5 + 0.10;
    for (const s of [-1, 1]) B.box(trs(lx, (y0 + deckY) / 2 + 0.2, s * 0.22), 0.07, deckY - y0 - 0.4, 0.07, MAT_IRON, wear, 0.9);
    const rungs = Math.floor((deckY - y0 - 0.6) / 0.32);
    for (let r = 0; r < rungs; r++) B.cyl(trs(lx, y0 + 0.5 + r * 0.32, -0.22).multiply(M4().makeRotationX(PI / 2)), 0.026, 0.026, 0.44, 5, MAT_IRON, wear, 1.0);
  }
  // an old repair: one pier has a newer concrete patch and a steel brace
  B.box(trs(piers[1], y0 + 1.1, 3.9), pierW * 1.1, 1.5, 0.5, MAT_STONE, 0.15, 0.9);
  B.box(trs(piers[1] + 0.6, y0 + 2.2, 3.5).multiply(M4().makeRotationZ(0.5)), 2.4, 0.13, 0.13, MAT_IRON, 0.9, 0.95);
  return { geo: B.geometry(), tris: B.tris, width: totalW };
}

/* ------------------------------------------------------------------ *
 *  THE TIDE WHEEL
 * ------------------------------------------------------------------ */
function buildWheel(lm, R) {
  /* Two bodies: the wheel proper (built about its own hub so it can actually turn)
     and the trestle it turns in. */
  const S = new Builder(), B = new Builder();
  const rad = lm.radius, wid = lm.width, ay = 0, np = lm.paddles, wear = lm.wear;
  const AY = lm.axleY;
  const rimR = rad;
  // two rims, each built from separate felloes with visible joints
  for (const side of [-1, 1]) {
    const zz = side * wid / 2;
    for (let i = 0; i < np; i++) {
      const a0 = (i / np) * TAU, a1 = ((i + 1) / np) * TAU;
      const am = (a0 + a1) / 2;
      const len = 2 * rimR * Math.sin((a1 - a0) / 2) * 1.02;
      const cx = Math.cos(am) * (rimR - 0.21), cy = Math.sin(am) * (rimR - 0.21);
      const m = trs(cx, ay + cy, zz).multiply(M4().makeRotationZ(am + PI / 2));
      S.box(m, 0.30, len, 0.26, MAT_TIMBER, wear * (0.6 + 0.4 * ihashf(i, side, 7)), 0.9, 0.4 + i * 0.07);
      // iron strap over each joint
      const mj = trs(Math.cos(a0) * rimR, ay + Math.sin(a0) * rimR, zz).multiply(M4().makeRotationZ(a0 + PI / 2));
      S.box(mj, 0.40, 0.14, 0.30, MAT_IRON, wear, 0.95);
    }
  }
  // hub
  S.cyl(trs(0, ay, -wid / 2 - 0.6).multiply(M4().makeRotationX(-PI / 2)), 0.44, 0.44, wid + 1.2, 12, MAT_TIMBER, wear * 0.7, 0.9, 0.2);
  // spokes: paired, with wedges at the hub
  const spokes = Math.max(6, Math.round(np / 2));
  for (const side of [-1, 1]) {
    const zz = side * wid / 2;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * TAU + (side > 0 ? PI / spokes : 0);
      const m = trs(Math.cos(a) * rimR * 0.5, ay + Math.sin(a) * rimR * 0.5, zz).multiply(M4().makeRotationZ(a + PI / 2));
      S.box(m, 0.16, rimR * 1.0, 0.20, MAT_TIMBER, wear * 0.8, 0.88, 0.3 + i * 0.11);
      S.box(trs(Math.cos(a) * 0.55, ay + Math.sin(a) * 0.55, zz).multiply(M4().makeRotationZ(a + PI / 2)), 0.26, 0.34, 0.26, MAT_IRON, wear, 0.92);
    }
  }
  // paddles — individually varied in width, set angle and how much is left of them
  for (let i = 0; i < np; i++) {
    const a = (i / np) * TAU;
    const h1 = ihashf(i, 11, 3), h2 = ihashf(i, 23, 5), h3 = ihashf(i, 41, 9);
    const pw = 0.62 + h1 * 0.26;
    const tilt = (h2 - 0.5) * 0.16;
    const missing = h3 < 0.06 ? 0.35 : 1.0;          // one or two are half gone
    const m = trs(Math.cos(a) * (rimR - 0.18), ay + Math.sin(a) * (rimR - 0.18), 0).multiply(M4().makeRotationZ(a + PI / 2 + tilt));
    S.box(m, 0.09, pw * missing, wid * (0.92 + h1 * 0.06), MAT_TIMBER, 0.5 + h2 * 0.5, 0.88, 0.5 + i * 0.09);
    // the cleat that holds it
    S.box(trs(Math.cos(a) * (rimR - 0.42), ay + Math.sin(a) * (rimR - 0.42), 0).multiply(M4().makeRotationZ(a + PI / 2)), 0.16, 0.24, wid * 0.5, MAT_IRON, wear, 0.9);
  }

  /* --- the trestle, in the landmark's own local space (y measured from its base) --- */
  B.cyl(trs(0, AY, -wid / 2 - 1.5).multiply(M4().makeRotationX(-PI / 2)), 0.17, 0.17, wid + 3.0, 10, MAT_IRON, wear, 0.95);
  if (lm.housing !== 'open') {
    for (const side of [-1, 1]) {
      const zz = side * (wid / 2 + 0.95);
      B.box(trs(0, AY / 2 - 0.4, zz), 0.42, AY + 0.8, 0.42, MAT_TIMBER, wear, 0.88, 0.6);
      B.box(trs(1.55, AY / 2 - 0.4, zz).multiply(M4().makeRotationZ(-0.62)), 0.30, AY * 1.15, 0.30, MAT_TIMBER, wear, 0.86, 0.7);
      B.box(trs(-1.55, AY / 2 - 0.4, zz).multiply(M4().makeRotationZ(0.62)), 0.30, AY * 1.15, 0.30, MAT_TIMBER, wear, 0.86, 0.7);
      B.box(trs(0, AY + 0.30, zz), 0.85, 0.55, 0.70, MAT_TIMBER, wear, 0.92, 0.4);
      B.box(trs(0, AY, zz), 0.55, 0.36, 0.52, MAT_IRON, wear, 0.95);
      B.box(trs(0, -1.5, zz), 1.6, 0.5, 1.6, MAT_STONE, wear, 0.8);
    }
    B.box(trs(0, AY + 0.62, 0), 0.34, 0.30, wid + 2.4, MAT_TIMBER, wear, 0.9, 0.5);
  }
  // ladder to the bearing
  const lx = -(rimR + 0.9);
  for (const s of [-1, 1]) B.box(trs(lx, (AY + 0.4) / 2 - 1.0, wid / 2 + 0.95 + s * 0.20), 0.07, AY + 1.4, 0.07, MAT_TIMBER, wear, 0.9, 0.3);
  for (let r = 0; r < Math.floor((AY + 0.6) / 0.34); r++)
    B.cyl(trs(lx, -1.5 + r * 0.34, wid / 2 + 0.75).multiply(M4().makeRotationX(PI / 2)), 0.025, 0.025, 0.40, 5, MAT_TIMBER, wear, 1.0);
  // the race walls the wheel turns between
  for (const s of [-1, 1]) B.box(trs(0, -1.3, s * (wid / 2 + 1.75)), 7.5, 2.4, 0.7, MAT_STONE, wear, 0.85);
  return { spin: S.geometry(), frame: B.geometry(), tris: S.tris + B.tris, axleY: AY };
}

/* ------------------------------------------------------------------ *
 *  smaller built things
 * ------------------------------------------------------------------ */
function buildCulvert(lm, F) {
  const B = new Builder();
  const y = F.terrainH(lm.x, lm.z), span = lm.span, stone = lm.style === 'timber' ? MAT_TIMBER : MAT_STONE;
  for (const s of [-1, 1]) {
    B.box(trs(0, y - 1.5, s * (span / 2 + 0.45)), 9.5, 2.6, 0.9, stone, lm.wear, 0.86);
    B.box(trs(0, y - 0.28, s * (span / 2 + 0.45)), 9.9, 0.30, 1.15, stone, lm.wear * 0.6, 0.95);
    // splayed wing walls
    for (const e of [-1, 1]) B.box(trs(e * 5.1, y - 1.2, s * (span / 2 + 1.15)).multiply(M4().makeRotationY(e * s * 0.5)), 2.6, 2.0, 0.7, stone, lm.wear, 0.82);
  }
  if (lm.rail) for (const s of [-1, 1]) {
    for (const e of [-1, 1]) B.box(trs(e * 3.6, y + 0.42, s * (span / 2 + 0.45)), 0.14, 1.1, 0.14, MAT_TIMBER, lm.wear, 0.9, 0.4);
    B.box(trs(0, y + 0.86, s * (span / 2 + 0.45)), 7.4, 0.11, 0.13, MAT_TIMBER, lm.wear, 0.95, 0.8);
  }
  return { geo: B.geometry(), tris: B.tris };
}
function buildGauge(lm, F) {
  const B = new Builder();
  const y = F.marshH(lm.x, lm.z);
  B.cyl(trs(0, y - 1.2, 0), 0.15, 0.11, lm.h + 1.2, 8, MAT_TIMBER, lm.wear, 0.9, 0.7, 3.1);
  for (let i = 0; i < Math.floor(lm.h * 2); i++)
    B.box(trs(0.13, y + 0.2 + i * 0.5, 0), 0.06, 0.05, 0.34, MAT_IRON, lm.wear, 1.0);
  B.box(trs(0, y + lm.h + 0.1, 0), 0.55, 0.36, 0.05, MAT_IRON, lm.wear, 1.0);
  for (const s of [-1, 1]) B.box(trs(s * 0.9, y + 0.4, 0).multiply(M4().makeRotationZ(-s * 0.55)), 0.10, 2.4, 0.10, MAT_TIMBER, lm.wear, 0.9, 0.5);
  return { geo: B.geometry(), tris: B.tris };
}
function buildEndGate(lm, F) {
  const B = new Builder();
  const y = F.terrainH(lm.x, lm.z);
  for (const s of [-1, 1]) B.box(trs(0, y + 0.75, s * 2.6), 0.26, 2.1, 0.26, MAT_TIMBER, lm.wear, 0.9, 0.4);
  for (let i = 0; i < 5; i++) B.box(trs(0, y + 0.35 + i * 0.28, 0), 0.07, 0.11, 4.9, MAT_TIMBER, lm.wear, 0.92, 0.6 + i * 0.2);
  B.box(trs(0, y + 0.9, 0).multiply(M4().makeRotationX(0.58)), 0.07, 0.11, 5.4, MAT_TIMBER, lm.wear, 0.9, 1.1);
  B.box(trs(0, y + 0.44, -2.6), 0.16, 0.22, 0.30, MAT_IRON, lm.wear, 0.95);
  // last tide marker on the bank
  B.cyl(trs(3.4, y - 0.4, 1.8), 0.13, 0.10, 2.3, 7, MAT_TIMBER, lm.wear, 0.9, 0.6, 1.7);
  B.box(trs(3.4, y + 1.55, 1.8), 0.42, 0.30, 0.05, MAT_IRON, lm.wear, 1.0);
  return { geo: B.geometry(), tris: B.tris };
}
function buildFurniture(f, F) {
  const B = new Builder();
  const y = F.terrainH(f.x + Math.cos(f.rot + PI / 2) * f.lat * f.side, f.z + Math.sin(f.rot + PI / 2) * f.lat * f.side);
  const m = M4().makeRotationZ(f.lean);
  if (f.kind === 'marker') {
    B.cyl(M4().makeTranslation(0, -0.35, 0).multiply(m), 0.075, 0.065, f.h + 0.35, 6, MAT_TIMBER, 0.8, 0.9, 0.5, 2.2);
    B.box(M4().makeTranslation(0, f.h - 0.06, 0).multiply(m), 0.20, 0.16, 0.04, MAT_IRON, 0.7, 1.0);
  } else if (f.kind === 'tidepost') {
    B.cyl(M4().makeTranslation(0, -0.5, 0).multiply(m), 0.10, 0.085, f.h + 0.9, 7, MAT_TIMBER, 0.9, 0.9, 0.6, 5.1);
    for (let i = 0; i < 3; i++) B.box(M4().makeTranslation(0.085, 0.15 + i * 0.35, 0), 0.045, 0.045, 0.24, MAT_IRON, 0.9, 1.0);
  } else if (f.kind === 'gatepost') {
    B.box(M4().makeTranslation(0, (f.h + 0.4) / 2 - 0.4, 0).multiply(m), 0.22, f.h + 0.4, 0.22, MAT_TIMBER, 0.85, 0.9, 0.4);
    B.box(M4().makeTranslation(0, f.h - 0.12, 0).multiply(m), 0.30, 0.10, 0.30, MAT_TIMBER, 0.6, 1.0, 0.3);
  } else {
    B.cyl(M4().makeTranslation(0, -0.3, 0).multiply(m), 0.062, 0.052, f.h + 0.3, 5, MAT_TIMBER, 0.9, 0.9, 0.7, 7.7);
  }
  const g = B.geometry();
  g.translate(f.x + Math.cos(f.rot + PI / 2) * f.lat * f.side, y, f.z + Math.sin(f.rot + PI / 2) * f.lat * f.side);
  return { geo: g, tris: B.tris };
}

/* ------------------------------------------------------------------ *
 *  registry: builds on demand, keeps only what is near enough to matter
 * ------------------------------------------------------------------ */
class Landmarks {
  constructor(fields, plan, shared, q) {
    this.F = fields; this.plan = plan; this.q = q;
    this.mat = makeStructureMaterial(shared, false);
    this.depthMat = makeStructureMaterial(shared, true);
    this.group = new THREE.Group();
    this.built = new Map();
    this.tris = 0;
    this.wheel = plan.landmarks.find((l) => l.kind === 'wheel');
    this.sluices = plan.landmarks.find((l) => l.kind === 'sluices');
    this.wheelAngle = 0;
    this.items = [];
    for (const l of plan.landmarks) if (l.kind !== 'orchard') this.items.push({ kind: l.kind, id: l.id, x: l.x, z: l.z, lm: l, r: l.kind === 'wheel' ? 900 : l.kind === 'sluices' ? 1100 : l.far ? 800 : 340 });
    for (const f of plan.furniture) this.items.push({ kind: 'furniture', id: 'f' + f.s + f.side, x: f.x, z: f.z, lm: f, r: 190 });
  }
  _make(it) {
    const F = this.F;
    let r, obj;
    if (it.kind === 'sluices') {
      r = buildSluices(it.lm, F, null);
      obj = new THREE.Mesh(r.geo, this.mat);          // built in absolute world height already
      obj.position.set(it.lm.x, 0, it.lm.z); obj.rotation.y = -it.lm.rot;
    } else if (it.kind === 'wheel') {
      r = buildWheel(it.lm, null);
      // sit the wheel so its lowest paddle dips a little under the tide
      const baseY = it.lm.radius - it.lm.axleY - 0.55;
      obj = new THREE.Group();
      obj.position.set(it.lm.x, baseY, it.lm.z); obj.rotation.y = -it.lm.rot;
      const frame = new THREE.Mesh(r.frame, this.mat);
      const spin = new THREE.Mesh(r.spin, this.mat);
      spin.position.y = r.axleY;
      obj.add(frame, spin);
      this.wheelMesh = obj; this.wheelSpin = spin;
      this.wheelHubY = baseY + r.axleY;
    } else if (it.kind === 'culvert') {
      r = buildCulvert(it.lm, F);
      obj = new THREE.Mesh(r.geo, this.mat);
      obj.position.set(it.lm.x, 0, it.lm.z); obj.rotation.y = -it.lm.rot;
    } else if (it.kind === 'gauge') {
      r = buildGauge(it.lm, F); obj = new THREE.Mesh(r.geo, this.mat);
      obj.position.set(it.lm.x, 0, it.lm.z); obj.rotation.y = it.lm.rot;
    } else if (it.kind === 'endgate') {
      r = buildEndGate(it.lm, F); obj = new THREE.Mesh(r.geo, this.mat);
      obj.position.set(it.lm.x, 0, it.lm.z); obj.rotation.y = -it.lm.rot;
    } else {
      r = buildFurniture(it.lm, F); obj = new THREE.Mesh(r.geo, this.mat);
    }
    if (it.kind !== 'wheel') { obj.matrixAutoUpdate = false; obj.updateMatrix(); }
    obj.userData.tris = r.tris;
    return obj;
  }
  update(camX, camZ, budget) {
    let built = 0;
    for (const it of this.items) {
      const d = Math.hypot(it.x - camX, it.z - camZ);
      const has = this.built.has(it.id);
      if (d < it.r && !has) {
        if (built >= budget) continue;
        const o = this._make(it);
        this.group.add(o); this.built.set(it.id, o); this.tris += o.userData.tris; built++;
      } else if (d > it.r * 1.15 && has) {
        const o = this.built.get(it.id);
        this._drop(o); this.tris -= o.userData.tris; this.built.delete(it.id);
        if (o === this.wheelMesh) { this.wheelMesh = null; this.wheelSpin = null; }
      }
    }
    return built;
  }
  /** the wheel turns with the water, slowly */
  animate(dt) {
    if (this.wheel) this.wheelAngle += (this.wheel.rpm * TAU / 60) * dt;
    if (this.wheelSpin) this.wheelSpin.rotation.z = this.wheelAngle;
  }
  _drop(o) {
    this.group.remove(o);
    o.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
  }
  clear() {
    for (const [, o] of this.built) this._drop(o);
    this.built.clear(); this.tris = 0; this.wheelMesh = null; this.wheelSpin = null;
  }
  shadowMeshes() { return [...this.built.values()]; }
  dispose() { this.clear(); this.mat.dispose(); this.depthMat.dispose(); }
}
