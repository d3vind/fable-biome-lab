/* ==================================================================
 *  AMBIENT LIFE
 *  Pooled, sparse and event-driven. The marsh has to be alive while
 *  nothing is happening — and it has to be genuinely quiet in between,
 *  so nothing here runs on a metronome and nothing snows confetti.
 * ================================================================== */

const K_SWALLOW = 0, K_MARSH = 1, K_DRAGON = 2, K_HARE = 3, K_HERON = 4;

function birdGeometry() {
  // body diamond + two wings; the wings are folded and flapped in the shader
  const p = [], v = [], idx = [];
  const add = (x, y, z, part, side) => { p.push(x, y, z); v.push(part, side); return p.length / 3 - 1; };
  const a = add(0, 0, -1.0, 0, 0), b = add(0.10, 0, 0.35, 0, 0), c = add(-0.10, 0, 0.35, 0, 0), d = add(0, 0.05, 1.05, 0, 0);
  idx.push(a, b, c, b, d, c);
  for (const s of [-1, 1]) {
    const w0 = add(0, 0, -0.15, 1, s), w1 = add(s * 1.0, 0, 0.05, 1, s), w2 = add(s * 0.85, 0, 0.55, 1, s), w3 = add(0, 0, 0.42, 1, s);
    if (s > 0) idx.push(w0, w1, w2, w0, w2, w3); else idx.push(w0, w2, w1, w0, w3, w2);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
  g.setAttribute('aPV', new THREE.BufferAttribute(new Float32Array(v), 2));
  g.setIndex(idx);
  return g;
}
function quadGeometry() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0]), 3));
  g.setAttribute('aPV', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

function makeBirdMaterial(shared) {
  return new THREE.ShaderMaterial({
    uniforms: withShared(shared, {}), side: THREE.DoubleSide, transparent: false,
    vertexShader: /* glsl */`
      ${GLSL_HEAD}
      attribute vec2 aPV; attribute vec3 iPos; attribute vec4 iA; attribute vec4 iB;
      varying float vKind; varying float vShade; varying vec3 vWorld;
      void main(){
        float head = iA.x, ph = iA.y, sc = iA.z; vKind = iA.w;
        float bank = iB.x, rate = iB.y;
        vec3 P = position;
        if (aPV.x > 0.5){
          float f = sin(uTime*rate + ph);
          float bendUp = vKind < 0.5 ? 0.85 : (vKind < 1.5 ? 0.62 : 0.30);
          P.y += f * bendUp * abs(P.x);
          P.x *= 1.0 - 0.16*abs(f);
        }
        P *= sc;
        // bank into the turn, then yaw to heading
        float cb = cos(bank), sb = sin(bank);
        P = vec3(P.x*cb - P.y*sb, P.x*sb + P.y*cb, P.z);
        float ch = cos(head), sh = sin(head);
        vec3 wp = iPos + vec3(P.z*ch - P.x*sh, P.y, P.z*sh + P.x*ch);
        vWorld = wp; vShade = aPV.x;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        if (sc <= 0.0) gl_Position = vec4(2.0,2.0,2.0,1.0);
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_HEAD}${GLSL_SKY}${GLSL_AIR}
      varying float vKind; varying float vShade; varying vec3 vWorld;
      void main(){
        vec3 c = vKind < 0.5 ? vec3(0.028,0.032,0.040)                     // swallow: near black
               : vKind < 1.5 ? vec3(0.62,0.63,0.60)                        // marsh bird: white
               : vKind < 2.5 ? vec3(0.055,0.075,0.085)                     // dragonfly
               : vKind < 3.5 ? vec3(0.10,0.085,0.065) : vec3(0.30,0.31,0.30);
        c *= 0.75 + 0.35*vShade;
        gl_FragColor = vec4(applyAir(c, vWorld, normalize(vWorld-uCamPos)), 1.0);
      }`,
  });
}
function makeSpriteMaterial(shared, mode) {
  return new THREE.ShaderMaterial({
    uniforms: withShared(shared, { uMode: { value: mode } }),
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    vertexShader: /* glsl */`
      ${GLSL_HEAD}
      attribute vec2 aPV; attribute vec3 iPos; attribute vec4 iA; attribute vec4 iB;
      varying vec2 vUv; varying vec4 vA; varying vec4 vB; varying vec3 vWorld;
      uniform float uMode;
      void main(){
        vUv = aPV; vA = iA; vB = iB;
        vec3 wp;
        if (uMode < 0.5){                       // camera-facing mote
          vec3 f = normalize(uCamPos - iPos);
          vec3 r = normalize(cross(vec3(0.0,1.0,0.0), f));
          vec3 u = cross(f, r);
          wp = iPos + (r*position.x + u*position.y) * iA.x;
        } else if (uMode < 1.5){                // flat ring on the water
          float s = iA.x;
          wp = iPos + vec3(position.x*s, 0.0, position.y*s);
        } else {                                 // tumbling leaf
          float a = iA.y;
          vec3 r = vec3(cos(a), 0.0, sin(a));
          vec3 u = normalize(vec3(sin(a)*0.5, 1.0, -cos(a)*0.5));
          wp = iPos + (r*position.x + u*position.y) * iA.x;
        }
        vWorld = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        if (iA.x <= 0.0) gl_Position = vec4(2.0,2.0,2.0,1.0);
      }`,
    fragmentShader: /* glsl */`
      ${GLSL_HEAD}${GLSL_SKY}${GLSL_AIR}
      varying vec2 vUv; varying vec4 vA; varying vec4 vB; varying vec3 vWorld;
      uniform float uMode;
      void main(){
        float alpha; vec3 c;
        if (uMode < 0.5){
          float d = length(vUv - 0.5)*2.0;
          alpha = smoothstep(1.0, 0.25, d) * vB.x;
          c = mix(s2l(C_STRAW), s2l(C_SKYPALE), vB.y);
        } else if (uMode < 1.5){
          float d = length(vUv - 0.5)*2.0;
          alpha = smoothstep(0.55, 0.86, d) * (1.0 - smoothstep(0.94, 1.0, d)) * vB.x;
          c = s2l(C_SKYPALE);
        } else {
          float d = length((vUv - 0.5)*vec2(1.0,2.0))*2.0;
          alpha = smoothstep(1.0, 0.6, d) * vB.x;
          c = mix(s2l(C_LICHEN), s2l(C_STRAW), vB.y);
        }
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(applyAir(c, vWorld, normalize(vWorld-uCamPos)), alpha);
      }`,
  });
}

class Pool {
  constructor(geo, mat, cap, group) {
    this.cap = cap;
    this.iPos = new Float32Array(cap * 3); this.iA = new Float32Array(cap * 4); this.iB = new Float32Array(cap * 4);
    this.aPos = new THREE.InstancedBufferAttribute(this.iPos, 3);
    this.aA = new THREE.InstancedBufferAttribute(this.iA, 4);
    this.aB = new THREE.InstancedBufferAttribute(this.iB, 4);
    for (const a of [this.aPos, this.aA, this.aB]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos); geo.setAttribute('iA', this.aA); geo.setAttribute('iB', this.aB);
    geo.instanceCount = cap;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false;
    group.add(this.mesh);
    this.items = [];
    for (let i = 0; i < cap; i++) this.items.push({ live: false, i });
  }
  spawn() { for (const it of this.items) if (!it.live) { it.live = true; return it; } return null; }
  kill(it) { it.live = false; this.iA[it.i * 4] = 0; }
  flush() { this.aPos.needsUpdate = true; this.aA.needsUpdate = true; this.aB.needsUpdate = true; }
  count() { let n = 0; for (const it of this.items) if (it.live) n++; return n; }
  clear() { for (const it of this.items) { it.live = false; } this.iA.fill(0); this.flush(); }
}

class Life {
  constructor(fields, plan, shared, q) {
    this.F = fields; this.plan = plan; this.q = q;
    this.group = new THREE.Group();
    this.birds = new Pool(birdGeometry(), makeBirdMaterial(shared), q.birds, this.group);
    this.motes = new Pool(quadGeometry(), makeSpriteMaterial(shared, 0), q.motes, this.group);
    this.rings = new Pool(quadGeometry(), makeSpriteMaterial(shared, 1), 12, this.group);
    this.leaves = new Pool(quadGeometry(), makeSpriteMaterial(shared, 2), q.leaves, this.group);
    this.rng = new Rng(plan.seedU, 'realize:life');
    this.nextLift = 0; this.frogIdx = 0; this.liftIdx = 0;
    this.encIdx = 0; this.active = [];
    this.events = [];                 // recent notable events, for audio + proof
    this.shadowBlob = new THREE.Vector4(0, 0, 0, 0);
    this.stats = { birds: 0, motes: 0, rings: 0, leaves: 0, encounters: 0 };
  }
  reset() {
    for (const p of [this.birds, this.motes, this.rings, this.leaves]) p.clear();
    this.liftIdx = 0; this.frogIdx = 0; this.encIdx = 0; this.active.length = 0;
    this.events.length = 0; this.shadowBlob.set(0, 0, 0, 0);
    this.rng = new Rng(this.plan.seedU, 'realize:life');
  }

  _spawnBird(kind, x, y, z, head, speed) {
    const it = this.birds.spawn(); if (!it) return null;
    it.kind = kind; it.x = x; it.y = y; it.z = z; it.head = head; it.speed = speed;
    it.bank = 0; it.ph = this.rng.f(0, TAU); it.t = 0;
    it.life = kind === K_SWALLOW ? this.rng.f(14, 34) : kind === K_DRAGON ? this.rng.f(9, 22) : this.rng.f(16, 40);
    it.turn = this.rng.f(-0.5, 0.5); it.climb = 0;
    it.sc = kind === K_SWALLOW ? 0.20 : kind === K_MARSH ? 0.42 : kind === K_DRAGON ? 0.075 : kind === K_HERON ? 0.72 : 0.24;
    return it;
  }

  /** one lift: a group leaves the ground because something arrived, not because a timer fired */
  lift(kind, x, z, n, awayFrom) {
    const F = this.F;
    for (let i = 0; i < n; i++) {
      const a = this.rng.f(0, TAU), r = this.rng.f(2, 22);
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      const head = awayFrom !== undefined ? awayFrom + this.rng.f(-0.7, 0.7) : this.rng.f(0, TAU);
      const b = this._spawnBird(kind, px, F.marshH(px, pz) + 0.35, pz, head, kind === K_MARSH ? 7.5 : 11);
      if (b) { b.climb = this.rng.f(1.4, 3.2); b.t = -this.rng.f(0, 0.5); }
    }
    this.events.push({ kind: 'lift:' + kind, t: performance.now() });
    if (this.events.length > 24) this.events.shift();
  }

  update(dt, rider, wind, camX, camZ) {
    const F = this.F, plan = this.plan, W = wind;
    const s = rider.s;

    /* -------- scheduled lifts -------- */
    while (this.liftIdx < plan.wildlife.lifts.length && s >= plan.wildlife.lifts[this.liftIdx].s) {
      const L = plan.wildlife.lifts[this.liftIdx++];
      const ahead = 34 + this.rng.f(0, 26);
      const x = rider.x + Math.cos(rider.head) * ahead, z = rider.z + Math.sin(rider.head) * ahead;
      const side = this.rng.sgn() * this.rng.f(8, 30);
      this.lift(L.kind === 'swallow' ? K_SWALLOW : K_MARSH,
        x + Math.cos(rider.head + PI / 2) * side, z + Math.sin(rider.head + PI / 2) * side, L.n, rider.head + this.rng.f(-1.6, 1.6));
    }
    /* -------- frogs: a plop and a ring, no animal shown -------- */
    while (this.frogIdx < plan.wildlife.frogs.length && s >= plan.wildlife.frogs[this.frogIdx].s) {
      const f = plan.wildlife.frogs[this.frogIdx++];
      for (let i = 0; i < f.n; i++) {
        const a = this.rng.f(0, TAU), r = this.rng.f(10, 40);
        const x = rider.x + Math.cos(a) * r, z = rider.z + Math.sin(a) * r;
        if (F.marshH(x, z) < -0.12) this.ripple(x, z, 0.6);
      }
      this.events.push({ kind: 'frog', t: performance.now() });
    }
    /* -------- a front landing puts the marsh up: birds leave because something arrived */
    if (W.justArrived > 0.55) {
      const ahead = 26 + this.rng.f(0, 44);
      const lat = this.rng.sgn() * this.rng.f(10, 44);
      this.lift(this.rng.u() < 0.55 ? K_MARSH : K_SWALLOW,
        rider.x + Math.cos(rider.head) * ahead + Math.cos(rider.head + PI / 2) * lat,
        rider.z + Math.sin(rider.head) * ahead + Math.sin(rider.head + PI / 2) * lat,
        this.rng.i(3, 8), W.dirAngle + PI);
    }

    /* -------- rare encounters (arm-tagged ones only happen on their own arm) -------- */
    while (this.encIdx < plan.encounters.length && s >= plan.encounters[this.encIdx].s) {
      const e = plan.encounters[this.encIdx++];
      if (!e.arm || e.arm === rider.arm) this._beginEncounter(e, rider);
    }

    /* -------- ambient population, gated by habitat and quiet intervals -------- */
    const ex = F.exposure(camX, camZ);
    const wantSwallow = Math.round(this.q.birds * 0.22 * plan.wildlife.swallow.base * ex);
    const wantDragon = Math.round(this.q.birds * 0.30 * plan.wildlife.dragonfly.base * (1 - ex * 0.7));
    let nS = 0, nD = 0;
    for (const it of this.birds.items) if (it.live) { if (it.kind === K_SWALLOW) nS++; else if (it.kind === K_DRAGON) nD++; }
    if (nS < wantSwallow && this.rng.u() < dt * 0.7) {
      const a = this.rng.f(0, TAU), r = this.rng.f(40, 130);
      const x = camX + Math.cos(a) * r, z = camZ + Math.sin(a) * r;
      if (F.marshH(x, z) < 0.25) this._spawnBird(K_SWALLOW, x, 1.6 + this.rng.f(0, 5), z, this.rng.f(0, TAU), this.rng.f(9, 15));
    }
    if (nD < wantDragon && this.rng.u() < dt * 1.1) {
      const a = this.rng.f(0, TAU), r = this.rng.f(6, 26);
      const x = camX + Math.cos(a) * r, z = camZ + Math.sin(a) * r;
      if (F.marshH(x, z) < 0.1 && F.roadDist(x, z) > CORRIDOR) this._spawnBird(K_DRAGON, x, 0.45 + this.rng.f(0, 0.9), z, this.rng.f(0, TAU), this.rng.f(1.2, 3.4));
    }

    /* -------- flight -------- */
    const B = this.birds;
    for (const it of B.items) {
      if (!it.live) continue;
      it.t += dt; it.life -= dt;
      const d = Math.hypot(it.x - camX, it.z - camZ);
      if (it.life <= 0 || d > 420) { B.kill(it); continue; }
      const w = W.at(it.x, it.z, F);
      if (it.kind === K_HARE) {
        it.head += Math.sin(it.t * 0.7 + it.ph) * dt * 0.4;
        if (this.rng.u() < dt * 0.25) { it.x += Math.cos(it.head) * 1.6; it.z += Math.sin(it.head) * 1.6; it.y = F.marshH(it.x, it.z) + 0.16; }
      } else {
        // wander, plus a real push from the wind
        const wob = Math.sin(it.t * (it.kind === K_DRAGON ? 3.1 : 0.62) + it.ph);
        it.turn = approach(it.turn, wob * (it.kind === K_DRAGON ? 2.4 : 0.65), 1.4, dt);
        it.head += it.turn * dt;
        it.bank = approach(it.bank, -it.turn * 0.65, 4.0, dt);
        const drift = (w.speed / Math.max(1, W.base)) * 0.55;
        it.x += (Math.cos(it.head) * it.speed + Math.cos(w.angle) * drift) * dt;
        it.z += (Math.sin(it.head) * it.speed + Math.sin(w.angle) * drift) * dt;
        const ground = F.marshH(it.x, it.z);
        const cruise = it.kind === K_SWALLOW ? 2.2 + 3.0 * (0.5 + 0.5 * Math.sin(it.t * 0.5 + it.ph))
          : it.kind === K_DRAGON ? 0.55 : it.kind === K_HERON ? 6.5 : 4.5;
        if (it.climb > 0) { it.y += it.climb * dt; it.climb -= dt * 0.9; }
        else it.y = approach(it.y, Math.max(ground, 0) + cruise, 0.8, dt);
      }
      const o3 = it.i * 3, o4 = it.i * 4;
      B.iPos[o3] = it.x; B.iPos[o3 + 1] = it.y; B.iPos[o3 + 2] = it.z;
      B.iA[o4] = -it.head + PI / 2; B.iA[o4 + 1] = it.ph; B.iA[o4 + 2] = it.sc; B.iA[o4 + 3] = it.kind;
      B.iB[o4] = it.bank; B.iB[o4 + 1] = it.kind === K_SWALLOW ? 13 : it.kind === K_DRAGON ? 42 : 5.2;
    }
    B.flush();

    /* -------- drifting motes: sparse, and only where the habitat suggests them -------- */
    const M = this.motes;
    const wantM = Math.round(this.q.motes * 0.45 * plan.wildlife.drift.base * (0.35 + 0.65 * sat(W.raw(camX, camZ).gust)));
    let nM = 0; for (const it of M.items) if (it.live) nM++;
    if (nM < wantM && this.rng.u() < dt * 8) {
      const it = M.spawn();
      if (it) {
        const a = this.rng.f(0, TAU), r = this.rng.f(3, 34);
        it.x = camX + Math.cos(a) * r; it.z = camZ + Math.sin(a) * r;
        it.y = F.marshH(it.x, it.z) + this.rng.f(0.3, 2.6);
        it.life = this.rng.f(4, 12); it.sc = this.rng.f(0.020, 0.075);
        it.sail = 0; it.tone = this.rng.u();
      }
    }
    for (const it of M.items) {
      if (!it.live) continue;
      it.life -= dt;
      const w = W.at(it.x, it.z, F);
      const sp = w.speed * (it.sail ? -0.30 : 0.42);
      it.x += Math.cos(w.angle) * sp * dt; it.z += Math.sin(w.angle) * sp * dt;
      it.y += Math.sin(it.life * 2.1) * 0.28 * dt - 0.05 * dt;
      const d = Math.hypot(it.x - camX, it.z - camZ);
      if (it.life <= 0 || d > 80) { M.kill(it); continue; }
      const o3 = it.i * 3, o4 = it.i * 4;
      M.iPos[o3] = it.x; M.iPos[o3 + 1] = it.y; M.iPos[o3 + 2] = it.z;
      M.iA[o4] = it.sc * (it.sail ? 5.5 : 1); M.iB[o4] = sat(it.life * 0.5) * 0.75; M.iB[o4 + 1] = it.tone;
    }
    M.flush();

    /* -------- rings and leaves -------- */
    const Rg = this.rings;
    for (const it of Rg.items) {
      if (!it.live) continue;
      it.t += dt; if (it.t > it.dur) { Rg.kill(it); continue; }
      const u = it.t / it.dur;
      const o3 = it.i * 3, o4 = it.i * 4;
      Rg.iPos[o3] = it.x; Rg.iPos[o3 + 1] = 0.015; Rg.iPos[o3 + 2] = it.z;
      Rg.iA[o4] = it.r0 + u * it.grow; Rg.iB[o4] = (1 - u) * 0.6;
    }
    Rg.flush();
    const Lv = this.leaves;
    if (this.rng.u() < dt * 0.18 * plan.wildlife.drift.base) this._releaseLeaf(camX, camZ, W);
    for (const it of Lv.items) {
      if (!it.live) continue;
      it.life -= dt;
      const w = W.at(it.x, it.z, F);
      it.x += Math.cos(w.angle) * w.speed * 0.5 * dt; it.z += Math.sin(w.angle) * w.speed * 0.5 * dt;
      it.y -= 0.55 * dt; it.a += dt * 2.4;
      const ground = F.marshH(it.x, it.z);
      if (it.life <= 0 || it.y < ground) { Lv.kill(it); continue; }
      const o3 = it.i * 3, o4 = it.i * 4;
      Lv.iPos[o3] = it.x; Lv.iPos[o3 + 1] = it.y; Lv.iPos[o3 + 2] = it.z;
      Lv.iA[o4] = it.sc; Lv.iA[o4 + 1] = it.a; Lv.iB[o4] = sat(it.life * 0.6) * 0.9; Lv.iB[o4 + 1] = it.tone;
    }
    Lv.flush();

    /* -------- active encounters -------- */
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.t += dt;
      if (e.kind === 'long-shadow') {
        const w = W.at(camX, camZ, F);
        e.x += Math.cos(w.angle + 0.6) * 9 * dt; e.z += Math.sin(w.angle + 0.6) * 9 * dt;
        this.shadowBlob.set(e.x, e.z, 26 + 8 * Math.sin(e.t), sat(1 - Math.abs(e.t / e.dur * 2 - 1)) * 0.55);
      } else if (e.kind === 'otter-wake') {
        e.x += Math.cos(e.head) * 2.4 * dt; e.z += Math.sin(e.head) * 2.4 * dt;
        if (e.t - e.last > 0.32) { e.last = e.t; this.ripple(e.x, e.z, 0.35, 2.6, 3.0); }
      }
      if (e.t > e.dur) {
        if (e.kind === 'long-shadow') this.shadowBlob.set(0, 0, 0, 0);
        this.active.splice(i, 1);
      }
    }

    this.stats.birds = B.count(); this.stats.motes = M.count();
    this.stats.rings = Rg.count(); this.stats.leaves = Lv.count();
    this.stats.encounters = this.encIdx;
  }

  ripple(x, z, r0, grow = 2.2, dur = 2.4) {
    const it = this.rings.spawn(); if (!it) return;
    it.x = x; it.z = z; it.r0 = r0; it.grow = grow; it.dur = dur; it.t = 0;
  }
  _releaseLeaf(camX, camZ, W) {
    const it = this.leaves.spawn(); if (!it) return;
    const a = this.rng.f(0, TAU), r = this.rng.f(8, 40);
    it.x = camX + Math.cos(a) * r; it.z = camZ + Math.sin(a) * r;
    it.y = this.F.marshH(it.x, it.z) + this.rng.f(2.5, 5.5);
    it.sc = this.rng.f(0.10, 0.22); it.a = this.rng.f(0, TAU);
    it.life = this.rng.f(5, 11); it.tone = this.rng.u();
  }
  _beginEncounter(enc, rider) {
    const F = this.F;
    const ahead = 46, x = rider.x + Math.cos(rider.head) * ahead, z = rider.z + Math.sin(rider.head) * ahead;
    const lx = x + Math.cos(rider.head + PI / 2) * 22 * enc.side, lz = z + Math.sin(rider.head + PI / 2) * 22 * enc.side;
    const e = { kind: enc.kind, t: 0, dur: 12, x: lx, z: lz, head: rider.head + PI / 2 * enc.side, last: 0 };
    switch (enc.kind) {
      case 'heron-lift': {
        const b = this._spawnBird(K_HERON, lx, F.marshH(lx, lz) + 0.5, lz, rider.head + this.rng.f(-1.2, 1.2) + PI * 0.5, 6.5);
        if (b) { b.climb = 2.4; b.life = 26; }
        e.dur = 2; break;
      }
      case 'two-hares': {
        const fx = rider.x + Math.cos(rider.head) * 120 + Math.cos(rider.head + PI / 2) * 150 * enc.side;
        const fz = rider.z + Math.sin(rider.head) * 120 + Math.sin(rider.head + PI / 2) * 150 * enc.side;
        for (let i = 0; i < 2; i++) {
          const b = this._spawnBird(K_HARE, fx + i * 2.4, F.marshH(fx, fz) + 0.16, fz + i * 1.1, this.rng.f(0, TAU), 0);
          if (b) b.life = 40;
        }
        e.dur = 40; break;
      }
      case 'otter-wake': e.dur = 9; break;
      case 'seed-sails': {
        for (let i = 0; i < 6; i++) {
          const it = this.motes.spawn(); if (!it) break;
          it.x = lx + this.rng.f(-14, 14); it.z = lz + this.rng.f(-14, 14);
          it.y = F.marshH(it.x, it.z) + this.rng.f(1.2, 3.5);
          it.life = this.rng.f(9, 15); it.sc = this.rng.f(0.05, 0.09); it.sail = 1; it.tone = 0.85;
        }
        e.dur = 14; break;
      }
      case 'long-shadow': e.dur = 11; e.x = rider.x + Math.cos(rider.head) * 90; e.z = rider.z + Math.sin(rider.head) * 90; break;
      case 'gate-moves': e.dur = 6; break;
    }
    this.active.push(e);
    this.events.push({ kind: 'encounter:' + enc.kind, t: performance.now(), strange: enc.strange });
  }
  counts() { return { ...this.stats }; }
  dispose() {
    for (const p of [this.birds, this.motes, this.rings, this.leaves]) { p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
  }
}
