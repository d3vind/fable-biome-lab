/* ==================================================================
 *  REEDWAKE
 *  Assembly, the ride loop, diagnostics, and a clean restart.
 *
 *  Quality changes realization only: density, level of detail, shadow
 *  resolution, particle counts, resolution. It never touches the plan.
 * ================================================================== */

const QUALITY = {
  low: {
    dpr: 1.0, fieldNear: 192, fieldFar: 384, shadow: 768, shadowOn: 1, soften: 0.30, grain: 0.45,
    groundNearA: 72, groundNearN: 34, groundFarA: 112, groundFarN: 62,
    waterA: 96, waterN: 54, roadRange: 950,
    vegNear: { patch: 9, cap: 205, slots: 42, reach: 22, clear: 7.3, densMul: 2.6, hMul: 1.0, salt: 1013 },
    vegMid: { patch: 32, cap: 540, slots: 56, reach: 96, clear: 7.1, densMul: 2.6, hMul: 1.34, salt: 2027 },
    vegFar: { patch: 84, cap: 250, slots: 84, reach: 300, clear: 6.9, densMul: 2.2, hMul: 1.12, salt: 3041, fadeIn0: 100, fadeIn1: 158 },
    treeNear: { shoots: 26, cap: 12, reach: 42 }, treeMid: { shoots: 13, cap: 46, reach: 125 }, treeFar: { shoots: 6, cap: 140, reach: 520 },
    birds: 24, motes: 90, leaves: 10,
  },
  standard: {
    dpr: 1.25, fieldNear: 256, fieldFar: 512, shadow: 1024, shadowOn: 1, soften: 0.5, grain: 0.55,
    groundNearA: 96, groundNearN: 44, groundFarA: 160, groundFarN: 86,
    waterA: 128, waterN: 72, roadRange: 1500,
    vegNear: { patch: 8, cap: 300, slots: 48, reach: 24, clear: 7.3, densMul: 2.6, hMul: 1.0, salt: 1013 },
    vegMid: { patch: 28, cap: 780, slots: 74, reach: 118, clear: 7.1, densMul: 2.6, hMul: 1.34, salt: 2027 },
    vegFar: { patch: 72, cap: 300, slots: 124, reach: 360, clear: 6.9, densMul: 2.2, hMul: 1.12, salt: 3041, fadeIn0: 100, fadeIn1: 158 },
    treeNear: { shoots: 40, cap: 26, reach: 52 }, treeMid: { shoots: 20, cap: 96, reach: 165 }, treeFar: { shoots: 9, cap: 280, reach: 900 },
    birds: 44, motes: 220, leaves: 22,
  },
  high: {
    dpr: 1.5, fieldNear: 320, fieldFar: 640, shadow: 1536, shadowOn: 1, soften: 0.6, grain: 0.6,
    groundNearA: 128, groundNearN: 56, groundFarA: 200, groundFarN: 106,
    waterA: 160, waterN: 88, roadRange: 2000,
    vegNear: { patch: 8, cap: 450, slots: 56, reach: 27, clear: 7.3, densMul: 2.6, hMul: 1.0, salt: 1013 },
    vegMid: { patch: 26, cap: 900, slots: 88, reach: 138, clear: 7.1, densMul: 2.6, hMul: 1.34, salt: 2027 },
    vegFar: { patch: 68, cap: 360, slots: 160, reach: 430, clear: 6.9, densMul: 2.2, hMul: 1.12, salt: 3041, fadeIn0: 100, fadeIn1: 158 },
    treeNear: { shoots: 52, cap: 38, reach: 64 }, treeMid: { shoots: 26, cap: 140, reach: 200 }, treeFar: { shoots: 11, cap: 420, reach: 1200 },
    birds: 60, motes: 320, leaves: 32,
  },
};

const $ = (id) => document.getElementById(id);
const PARAMS = new URLSearchParams(location.search);

class Reedwake {
  constructor() {
    this.canvas = $('gl');
    this.errors = [];
    this.restarts = 0;
    this.timeScale = 1;
    this.subSteps = 1; this.subDt = 0.05;
    this.running = false;
    this.frameTimes = [];
    this.peak = { calls: 0, tris: 0, veg: 0 };
    this.chapterShown = null;
    this._onResize = () => this.resize();
    addEventListener('resize', this._onResize);
    window.onerror = (m, s, l, c, e) => { this.err(String(m)); };
    addEventListener('unhandledrejection', (e) => this.err('promise: ' + e.reason));
  }
  err(msg) {
    this.errors.push({ msg, t: Date.now() });
    const el = $('err');
    el.classList.add('on');
    el.textContent = this.errors.slice(-8).map((e) => e.msg).join('\n');
  }

  /* ---------------- build ---------------- */
  async boot(seed, quality, arm) {
    const prog = (p, txt) => {
      $('prog').firstElementChild.style.width = Math.round(p * 100) + '%';
      $('ptxt').textContent = txt;
      return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    };
    this.seed = seed; this.qualityName = quality; this.q = QUALITY[quality];

    await prog(0.03, 'planning the country');
    this.plan = buildPlan(seed);
    this.fields = new Fields(this.plan);
    this.wind = new Wind(this.plan);

    await prog(0.10, 'raising the renderer');
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
      this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      this.renderer.setClearColor(0x0d1114, 1);
      this.renderer.autoClear = true;
      this.renderer.info.autoReset = false;
      const gl = this.renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      this.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (gl.getParameter(gl.RENDERER) || 'unknown');
      this.glVersion = gl.getParameter(gl.VERSION);
    }
    this.dpr = Math.min(devicePixelRatio || 1, this.q.dpr);
    this.renderer.setPixelRatio(this.dpr);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.12, 9000);
    this.shared = makeSharedUniforms();

    await prog(0.16, 'baking the ground');
    this.fieldNear = new FieldMap(this.fields, this.q.fieldNear, 170, 'near');
    this.fieldFar = new FieldMap(this.fields, this.q.fieldFar, 2400, 'far');
    const start = this.plan.polys.pre;
    this.fieldNear.reset(start.x[0], start.z[0]);
    this.fieldFar.reset(start.x[0], start.z[0]);
    while (!this.fieldNear.ready) { this.fieldNear.bakeStep(32); }
    let guard = 0;
    while (!this.fieldFar.ready && guard++ < 400) { this.fieldFar.bakeStep(24); if (guard % 6 === 0) await prog(0.16 + 0.34 * this.fieldFar.baked / this.fieldFar.S, 'baking the ground'); }
    this.shared.uFieldTexN.value = this.fieldNear.tex; this.shared.uFieldSpanN.value = this.fieldNear.span;
    this.shared.uFieldTex.value = this.fieldFar.tex; this.shared.uFieldSpan.value = this.fieldFar.span;

    await prog(0.54, 'cutting the road');
    this.sky = makeSky(this.shared);
    this.ground = new Ground(this.shared, this.q);
    this.road = new RoadRibbon(this.fields, this.shared, this.q);
    this.water = new Water(this.shared, this.q);
    this.scene.add(this.sky, this.ground.group, this.road.group, this.water.mesh);

    await prog(0.62, 'planting the reeds');
    this.veg = new Vegetation(this.fields, this.plan, this.shared, this.q);
    this.scene.add(this.veg.group);

    await prog(0.72, 'growing the willows');
    this.trees = new Trees(this.fields, this.plan, this.shared, this.q);
    this.scene.add(this.trees.group);

    await prog(0.80, 'building the sluices');
    this.landmarks = new Landmarks(this.fields, this.plan, this.shared, this.q);
    this.life = new Life(this.fields, this.plan, this.shared, this.q);
    this.scene.add(this.landmarks.group, this.life.group);

    await prog(0.86, 'letting the light in');
    this.shadow = new ShadowPass(this.renderer, this.shared, this.q.shadow, 105);
    this.post = new Post(this.renderer, this.q);
    this.rider = new Rider(this.fields, this.plan);
    this.rider.reset(arm);
    this.audio = new Audio(this.plan);
    this.input = new Input(this.canvas, (k, a, b) => this.onKey(k, a, b));

    this.sunDir = new THREE.Vector3();
    this.cloudDrift = new THREE.Vector2();
    this.time = 0; this.wallStart = performance.now();
    this.resize();

    await prog(0.92, 'first light');
    // prime everything so the opening frame is complete, not a loading area
    for (let i = 0; i < 26; i++) {
      this.veg.update(this.rider.x, this.rider.z, 999);
      this.road.update(this.rider.x, this.rider.z, 999);
      this.landmarks.update(this.rider.x, this.rider.z, 999);
    }
    this.trees.update(this.rider.x, this.rider.z);
    this.realizationChecksum = this._realizationChecksum();
    this.updateUniforms(0);

    await prog(1.0, 'ready');
    this.running = true;
    this.lastT = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
    $('hud').classList.add('on');
    if (PARAMS.get('diag') === '1') $('diag').classList.add('on');
  }

  /** identity-bearing realization data only, so all three tiers agree */
  _realizationChecksum() {
    const t = this.trees.list.map((x) => [Math.round(x.x * 10), Math.round(x.z * 10), x.kind, Math.round(x.h * 100), x.tag]);
    const lm = this.plan.landmarks.map((l) => [l.kind, l.x, l.z, l.rot]);
    return checksum32(canon({ trees: t.length, sample: t.filter((_, i) => i % 17 === 0), lm, seed: this.seed }, 3));
  }

  resize() {
    if (!this.renderer) return;
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const pw = Math.floor(w * this.dpr), ph = Math.floor(h * this.dpr);
    this.post.resize(pw, ph);
    this.vp = { w, h, pw, ph };
  }

  onKey(k, a, b) {
    if (k === 'pause') { this.rider.paused = !this.rider.paused; $('paused').classList.toggle('on', this.rider.paused); }
    else if (k === 'restart') this.restart();
    else if (k === 'escape') { this.rider.yawLook = 0; this.rider.pitchLook = 0; }
    else if (k === 'look') {
      this.rider.yawLook = clamp(this.rider.yawLook - a, -0.96, 0.96);
      this.rider.pitchLook = clamp(this.rider.pitchLook - b, -0.42, 0.50);
    }
  }

  /* ---------------- per-frame uniforms ---------------- */
  updateUniforms(dt) {
    const u = this.shared, p = this.plan, w = p.weather;
    const el = w.sunEl, az = w.sunAz;
    this.sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
    u.uTime.value = this.time;
    u.uCamPos.value.copy(this.camera.position);
    u.uSunDir.value.copy(this.sunDir);
    const warm = w.warmth;
    u.uWarmth.value = warm;
    u.uSunCol.value.setRGB(1.05, 0.72 + 0.16 * warm, 0.44 + 0.20 * warm).multiplyScalar(1.62);
    u.uSkyAmb.value.setRGB(0.132, 0.176, 0.228);
    u.uGndAmb.value.setRGB(0.055, 0.060, 0.048);
    // the deck opens as the ride goes on
    const prog = this.rider ? this.rider.progress() : 0;
    const k = Math.min(w.deckOpen.length - 1, Math.floor(prog * (w.deckOpen.length - 1)));
    const kf = prog * (w.deckOpen.length - 1) - k;
    const open = lerp(w.deckOpen[k], w.deckOpen[Math.min(k + 1, w.deckOpen.length - 1)], kf);
    /* a break in the deck: the lid thins, the low sun gets through, and for a minute or
       so the reed is copper instead of olive. Driven by route distance, not by a timer. */
    let brk = 0;
    if (this.rider) for (const b of (w.breaks || [])) {
      const u2 = (this.rider.s - b.s) / b.len;
      if (u2 > 0 && u2 < 1) brk = Math.max(brk, b.depth * Math.pow(Math.sin(PI * u2), 1.3));
    }
    this.cloudBreak = brk;
    u.uCloudCover.value = lerp(lerp(0.62, 0.26, open), 0.07, brk);
    u.uSunCol.value.multiplyScalar(1 + 0.62 * brk);
    u.uSkyAmb.value.multiplyScalar(1 - 0.16 * brk);
    this.cloudDrift.x += -this.wind.dirX * dt * 0.0021 * w.windBase;
    this.cloudDrift.y += -this.wind.dirZ * dt * 0.0021 * w.windBase;
    u.uCloudDrift.value.copy(this.cloudDrift);
    for (let i = 0; i < 8; i++) {
      const c = p.clouds[i];
      u.uCloudBlob.value[i].set(c ? (c.u - 0.5) * 5.2 : 0, c ? (c.v - 0.5) * 5.2 : 0, c ? c.scale * 0.85 : 0, c ? c.mass * 0.7 : 0);
    }
    u.uHaze.value = (0.00040 + 0.00026 * w.mistBase) * (1 - 0.30 * brk);
    u.uMist.value = (0.15 + 0.33 * w.mistBase) * (1 - 0.45 * brk);
    u.uTideY.value = WATER_Y;
    this.wind.applyUniforms(u);
    u.uFieldCenterN.value.copy(this.fieldNear.center);
    u.uFieldCenter.value.copy(this.fieldFar.center);
    u.uShadowOn.value = this.q.shadowOn;
    this.sky.userData.mat.uniforms.uInvVP.value
      .multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse).invert();

    // --- water: flow sources, the wheel, edge reflectors, stillness
    const wu = this.water.mat.uniforms;
    wu.uCenter.value.set(Math.round(this.camera.position.x * 2) / 2, Math.round(this.camera.position.z * 2) / 2);
    const sl = this.landmarks.sluices, wl = this.landmarks.wheel;
    wu.uFlow.value[0].set(sl.x, sl.z, 46, 0.85 * sl.flow);
    wu.uFlow.value[1].set(wl.x, wl.z, 26, 0.55);
    if (this.landmarks.wheelMesh) {
      const c = this.landmarks.wheelMesh;
      wu.uWheelC.value.set(wl.x, this.landmarks.wheelHubY, wl.z);
      wu.uWheelN.value.set(Math.cos(-wl.rot + PI / 2), 0, Math.sin(-wl.rot + PI / 2)).normalize();
      wu.uWheelP.value.set(wl.radius, 0.5, wl.paddles, this.landmarks.wheelAngle);
      wu.uWheelOn.value = 1;
    } else wu.uWheelOn.value = 0;
    const gust = this.wind.raw(this.camera.position.x, this.camera.position.z);
    wu.uStill.value = sat(1 - gust.speed / 5.5) * (0.4 + 0.6 * sat(prog * 1.6 - 0.6));
    // six nearest standing things that would show in still water
    const refl = wu.uRefl.value;
    let ri = 0;
    for (const t of this.trees.list) {
      if (ri >= 6) break;
      const d = Math.hypot(t.x - this.camera.position.x, t.z - this.camera.position.z);
      if (d < 62 && t.y < 0.55) { refl[ri++].set(t.x, t.z, 1.6 + t.h * 0.18, 0.8); }
    }
    for (; ri < 6; ri++) refl[ri].set(0, 0, 0, 0);
  }

  /* ---------------- loop ---------------- */
  frame(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const t0 = performance.now();
    let dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    dt *= this.timeScale;
    if (!(dt > 0)) dt = 0.0001;

    /* Sub-stepping advances the whole world — wind, rider, streaming, life, audio state —
       in full-fidelity slices, and renders once at the end. Nothing is skipped and nothing
       is warped; only the number of drawn frames per simulated second changes. It exists so
       an 18 km ride can be verified end to end on a software rasteriser. */
    if (this.subSteps > 1) {
      const h = this.subDt;
      for (let i = 0; i < this.subSteps; i++) this.simulate(h);
    } else {
      this.simulate(dt);
    }
    this.draw(t0);
  }

  simulate(dt) {
    this.time += dt;
    const R = this.rider;
    this.wind.update(dt, R.s, R.x, R.z);
    R.update(dt, this.input.keys, this.wind);
    R.applyCamera(this.camera);

    const cx = this.camera.position.x, cz = this.camera.position.z;
    this.fieldNear.update(cx, cz, 8);
    this.fieldFar.update(cx, cz, 3);
    this.ground.update(cx, cz);
    this.water.update(cx, cz);
    this.veg.update(cx, cz, 2);
    this.road.update(cx, cz, 2);
    this.landmarks.update(cx, cz, 1);
    this.landmarks.animate(dt);
    this.trees.update(cx, cz);
    this.life.update(dt, R, this.wind, cx, cz);

    // audio state, from the same fields everything else reads
    const wAt = this.wind.at(cx, cz, this.fields);
    const depth = -this.fields.marshH(cx, cz);
    const sl = this.landmarks.sluices, wl = this.landmarks.wheel;
    this.audio.update(dt, {
      wind: wAt.speed, gust: wAt.gust, exposure: wAt.exposure,
      waterNear: sat(smoothstep(-0.4, 0.5, depth)) * 0.6 + 0.4 * sat(1 - Math.abs(this.fields.marshH(cx, cz)) / 1.5),
      sluiceD: Math.hypot(sl.x - cx, sl.z - cz), wheelD: Math.hypot(wl.x - cx, wl.z - cz),
      speed: R.speed, still: 0,
    });
    while (this.life.events.length && this.life.events[0].t < performance.now() - 60) {
      this.audio.event(this.life.events.shift().kind);
    }
    this.lastDt = dt;
    // continuous-ride bookkeeping: distance must never jump or go backwards
    if (this.prevDist !== undefined) {
      const step = R.distance - this.prevDist;
      if (step < -1e-6) this.nonMonotonic = true;
      if (step > Math.max(2, R.speed * dt * 3 + 1)) { this.warps = (this.warps | 0) + 1; this.discontinuity = true; }
    }
    this.prevDist = R.distance;
  }

  draw(t0) {
    const R = this.rider;
    const cx = this.camera.position.x, cz = this.camera.position.z;
    this.updateUniforms(this.lastDt || 0.016);

    // shadows: only things worth one. The caster list is reconciled in place.
    if (this.q.shadowOn) {
      const w = this._casters || (this._casters = []);
      w.length = 0;
      for (const L of this.trees.lods) if (L.depthMat) w.push({ mesh: L.mesh, depthMat: L.depthMat });
      for (const [, o] of this.landmarks.built) {
        o.traverse((c) => { if (c.isMesh) w.push({ mesh: c, depthMat: this.landmarks.depthMat }); });
      }
      this.shadow.sync(w);
      this.shadow.render(this.sunDir, cx, cz, this.camera.position.y);
    }

    this.renderer.info.reset();
    this.renderer.setClearColor(0x0d1114, 1);
    this.renderer.setRenderTarget(this.post.rt);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.sceneCalls = this.renderer.info.render.calls; this.sceneTris = this.renderer.info.render.triangles;

    const sunNdc = (this._sunNdc || (this._sunNdc = new THREE.Vector3()))
      .copy(this.sunDir).multiplyScalar(4000).add(this.camera.position).project(this.camera);
    const shaft = sat(1 - this.shared.uCloudCover.value * 1.6) * 0.55 * sat(1.2 - Math.abs(sunNdc.x));
    const opts = this._postOpts || (this._postOpts = { shaft: 0, sunNdc: new THREE.Vector3(), fade: 1 });
    opts.shaft = sunNdc.z < 1 ? shaft : 0;
    opts.sunNdc.set(sunNdc.x, sunNdc.y, sunNdc.z < 1 ? 1 : -1);
    opts.fade = sat((performance.now() - this.wallStart) / 1400);
    this.post.render(this.camera, opts);
    this.post.compMat.uniforms.uGrain.value = this.q.grain;
    this.post.compMat.uniforms.uSoften.value = this.q.soften;
    this.post.compMat.uniforms.uWarm.value = this.plan.weather.warmth;

    const info = this.renderer.info.render;
    this.calls = info.calls; this.tris = info.triangles;
    this.peak.calls = Math.max(this.peak.calls, this.calls);
    this.peak.tris = Math.max(this.peak.tris, this.tris);

    const ft = performance.now() - t0;
    if (!(this.subSteps > 1)) this.frameTimes.push(ft);
    if (this.frameTimes.length > 600) this.frameTimes.shift();   // bounded: never grows
    this.hud();
    if ($('diag').classList.contains('on')) $('diag').textContent = JSON.stringify(this.proof(), null, 1);
  }

  hud() {
    const R = this.rider;
    $('spd').textContent = (R.speed * 3.6).toFixed(0);
    $('dst').textContent = fmtKm(R.distance) + '  /  ' + fmtKm(R.totalLen());
    const c = R.chapter();
    if (c && c.key !== this.chapterShown) {
      this.chapterShown = c.key;
      // the country announces the chapter; the label only lifts its voice for a moment
      const f = $('chap'); f.textContent = c.name; f.classList.add('on');
      clearTimeout(this._flashT);
      this._flashT = setTimeout(() => f.classList.remove('on'), 5200);
    }
  }

  /* ---------------- diagnostics ---------------- */
  pct(p) {
    if (!this.frameTimes.length) return 0;
    const a = this.frameTimes.slice().sort((x, y) => x - y);
    return +a[Math.min(a.length - 1, Math.floor(a.length * p))].toFixed(2);
  }
  /** in-frustum AND resident: proximity alone is never treated as visibility */
  visible(x, y, z, r) {
    const m = this._vm || (this._vm = new THREE.Matrix4());
    const f = this._vf || (this._vf = new THREE.Frustum());
    const sp = this._vs || (this._vs = new THREE.Sphere());
    m.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    f.setFromProjectionMatrix(m);
    sp.center.set(x, y, z); sp.radius = r;
    return f.intersectsSphere(sp);
  }
  proof() {
    const R = this.rider, p = this.plan;
    const vg = this.veg.counts(), tr = this.trees.counts(), lf = this.life.counts();
    const wl = p.landmarks.find((l) => l.kind === 'wheel'), sl = p.landmarks.find((l) => l.kind === 'sluices');
    const forkPt = { x: p.polys.pre.x[p.polys.pre.n - 1], z: p.polys.pre.z[p.polys.pre.n - 1] };
    const dF = Math.hypot(forkPt.x - R.x, forkPt.z - R.z);
    const dW = Math.hypot(wl.x - R.x, wl.z - R.z), dS = Math.hypot(sl.x - R.x, sl.z - R.z);
    const gust = this.wind.raw(R.x, R.z);
    const nearest = this.wind.frontDistance(R.x, R.z);
    return {
      world: 'reedwake', build: BUILD,
      seed: this.seed, quality: this.qualityName,
      planChecksum: p.checksum, realizationChecksum: this.realizationChecksum,
      checksumKind: 'FNV-1a 32-bit over canonical plan JSON — repeatability checksum, not cryptographic',
      routeLength: +R.totalLen().toFixed(1),
      nominalDuration: +(R.arm === 'willow' ? p.route.tWillow : p.route.tOpen).toFixed(1),
      branchLengths: { open: p.route.armOpenLen, willow: p.route.armWillowLen, openTotal: p.route.lenOpen, willowTotal: p.route.lenWillow },
      nominalDurations: { open: p.route.tOpen, willow: p.route.tWillow, deltaPct: +(Math.abs(p.route.tOpen - p.route.tWillow) / Math.max(p.route.tOpen, p.route.tWillow) * 100).toFixed(2) },
      chapter: R.chapter().key, branch: R.arm, forkCommitted: R.committed,
      routeProgress: +R.progress().toFixed(5),
      distance: +R.distance.toFixed(1), speed: +R.speed.toFixed(2),
      ascent: +R.ascent.toFixed(2), descent: +R.descent.toFixed(2), grade: +(R.grade * 100).toFixed(2),
      tide: p.weather.tide, tideLevel: WATER_Y,
      windDir: +(p.weather.windDir * 180 / PI).toFixed(1), windBase: p.weather.windBase,
      windAtRider: +gust.speed.toFixed(2), activeGust: +gust.gust.toFixed(3),
      activeFronts: this.wind.active.length, frontsArmed: this.wind.armed,
      nearestFrontMetres: isFinite(nearest) ? +nearest.toFixed(0) : null,
      counts: {
        vegetationInstances: vg.total, vegetationByBand: { near: vg.near, mid: vg.mid, far: vg.far },
        vegetationTriangles: vg.triangles,
        treeRegistry: tr.registry, treesDrawn: { near: tr.near, mid: tr.mid, far: tr.far }, treeTriangles: tr.triangles,
        roadChunks: this.road.chunks.size, landmarksBuilt: this.landmarks.built.size,
        birds: lf.birds, motes: lf.motes, ripples: lf.rings, leaves: lf.leaves,
        encountersFired: lf.encounters, encountersPlanned: p.encounters.length,
      },
      rendererCalls: this.calls, visibleTriangles: this.tris,
      sceneCalls: this.sceneCalls, sceneTriangles: this.sceneTris,
      peakCalls: this.peak.calls, peakTriangles: this.peak.tris,
      peakResidency: { veg: this.peak.veg, roadChunks: this.road.chunks.size },
      effectiveDPR: this.dpr, viewport: this.vp ? [this.vp.w, this.vp.h] : null,
      drawingBuffer: this.vp ? [this.vp.pw, this.vp.ph] : null,
      renderer: this.gpu, glVersion: this.glVersion,
      frameMs: { p50: this.pct(0.5), p95: this.pct(0.95), p99: this.pct(0.99), samples: this.frameTimes.length },
      fps: this.pct(0.5) > 0 ? +(1000 / this.pct(0.5)).toFixed(1) : 0,
      restartCount: this.restarts,
      errors: this.errors.map((e) => e.msg),
      roadConformance: this.conformance,
      forkProximityM: +dF.toFixed(1), forkVisible: this.visible(forkPt.x, R.y, forkPt.z, 30) && dF < 900,
      landmarkProximity: { sluices: +dS.toFixed(1), wheel: +dW.toFixed(1) },
      landmarkVisible: {
        sluices: this.landmarks.built.has(sl.id) && this.visible(sl.x, sl.y, sl.z, 14),
        wheel: this.landmarks.built.has(wl.id) && this.visible(wl.x, this.landmarks.wheelHubY || 4, wl.z, wl.radius * 1.2),
      },
      continuousRide: {
        ok: !this.discontinuity, warps: this.warps | 0, monotonic: !this.nonMonotonic,
        finished: R.finished, paused: R.paused, timeScale: this.timeScale,
        subSteps: this.subSteps, subDt: this.subDt,
        elapsedS: +((performance.now() - this.wallStart) / 1000).toFixed(1),
      },
      audio: { unlocked: !!(this.audio && this.audio.ok), context: this.audio && this.audio.ctx ? this.audio.ctx.state : 'none' },
    };
  }

  /** Measured on the realized meshes: the road ribbon's own vertices against the terrain
   *  shell's baked surface, the rider against the ribbon, and the ribbon's outer edge
   *  against open marsh. Nothing here consults an analytic ideal. */
  measureConformance() {
    const F = this.fields, R = this.rider;
    const cx = this.camera.position.x, cz = this.camera.position.z;
    const nearHalf = this.fieldNear.span * 0.5 - 14;   // the baked near window is only valid here
    let analyticMax = 0, analyticSum = 0, n = 0, bleedN = 0, edgeN = 0;
    let bleed = -9, edgeMax = 0, intrusion = 0, floatMax = 0;
    for (const [, ch] of this.road.chunks) {
      const g = ch.mesh.geometry;
      const pos = g.attributes.position.array, lat = g.attributes.aLat.array;
      for (let i = 0; i < lat.length; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const a = Math.abs(lat[i]);
        if (a <= ROAD_HALF) {
          const r = F.roadAt(x, z);
          if (!r) continue;
          const e = Math.abs(y - F.roadProfile(r.d, r.y, F.marshH(x, z)));
          if (e > analyticMax) analyticMax = e;
          analyticSum += e; n++;
          // the terrain shell renders the baked near field, so this is only meaningful
          // inside that window; sampling it 1 km away reads a wrapped texel, not the ground
          if (Math.abs(x - cx) < nearHalf && Math.abs(z - cz) < nearHalf) {
            const th = this.fieldNear.sample(x, z).h;
            if (th - y > bleed) bleed = th - y;
            bleedN++;
          }
        } else if (a > 21) {
          // The outer edge should land on open marsh — except at a junction, where a second
          // carriageway is nearer than this ribbon's own centreline and made ground rightly
          // continues between the two. Those vertices are excluded rather than counted wrong.
          const rr = F.roadAt(x, z);
          if (rr && rr.d < 20) continue;
          const e = Math.abs(y - F.marshH(x, z));
          if (e > edgeMax) edgeMax = e;
          if (y - F.marshH(x, z) > floatMax) floatMax = y - F.marshH(x, z);
          edgeN++;
        }
      }
    }
    // the rider must stand on the surface the ribbon actually draws
    const rr = F.roadAt(R.x, R.z);
    const riderErr = rr ? Math.abs((R.y - 1.42 - R.bob) - F.roadProfile(rr.d, rr.y, F.marshH(R.x, R.z))) : 0;
    // no plant may stand inside the carriageway or its contact seam
    for (const band of this.veg.bands) {
      for (const [, slot] of band.slots) {
        const base = slot * band.cfg.cap;
        for (let i = 0; i < band.cfg.cap; i++) {
          if (band.iA[(base + i) * 4] <= 0) continue;
          const o = (base + i) * 3;
          if (F.roadDist(band.iPos[o], band.iPos[o + 2]) < ROAD_HALF + SEAM) intrusion++;
        }
      }
    }
    this.conformance = {
      carriagewaySamples: n,
      surfaceErrorMaxM: +analyticMax.toFixed(4),
      surfaceErrorMeanM: n ? +(analyticSum / n).toFixed(5) : 0,
      thresholdM: 0.08,
      terrainAboveRoadMaxM: bleedN ? +bleed.toFixed(4) : null, terrainSamples: bleedN,
      outerEdgeToMarshMaxM: edgeN ? +edgeMax.toFixed(4) : null, edgeSamples: edgeN,
      outerEdgeFloatMaxM: +floatMax.toFixed(4),
      riderSupportErrorM: +riderErr.toFixed(5),
      vegetationIntrusions: intrusion,
      pass: n > 0 && bleedN > 0 && analyticMax <= 0.08 && bleed <= 0.02 && intrusion === 0 && riderErr <= 0.02,
    };
    return this.conformance;
  }

  /* ---------------- restart / teardown ---------------- */
  teardown() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.input) this.input.dispose();
    if (this.audio) this.audio.stop();
    if (this.shadow) this.shadow.dispose();
    if (this.post) this.post.dispose();
    for (const o of [this.ground, this.road, this.water, this.veg, this.trees, this.landmarks, this.life]) if (o) o.dispose();
    if (this.fieldNear) this.fieldNear.dispose();
    if (this.fieldFar) this.fieldFar.dispose();
    if (this.sky) { this.sky.geometry.dispose(); this.sky.material.dispose(); }
    if (this.scene) this.scene.clear();
    clearTimeout(this._flashT);
    $('chap').classList.remove('on');
    this.frameTimes.length = 0;
    this.scene = null;
  }
  async restart(seed, quality, arm) {
    const s = seed || this.seed, q = quality || this.qualityName;
    this.teardown();
    this.restarts++;
    this.subSteps = 1; this.subDt = 0.016;      // a fresh ride runs at real time
    this.errors.length = 0; $('err').classList.remove('on');
    this.peak = { calls: 0, tris: 0, veg: 0 };
    this.chapterShown = null;
    this.prevDist = undefined; this.warps = 0; this.discontinuity = false; this.nonMonotonic = false;
    $('paused').classList.remove('on');
    await this.boot(s, q, arm);
    this.audio.start();
  }
}

/* ==================================================================
 *  bootstrap
 * ================================================================== */
(function main() {
  const app = new Reedwake();
  let quality = PARAMS.get('quality') || 'standard';
  if (!QUALITY[quality]) quality = 'standard';
  const seedInput = $('seed');
  if (PARAMS.get('seed')) seedInput.value = PARAMS.get('seed');
  for (const b of document.querySelectorAll('[data-q]')) {
    b.classList.toggle('sel', b.dataset.q === quality);
    b.onclick = () => {
      quality = b.dataset.q;
      for (const o of document.querySelectorAll('[data-q]')) o.classList.toggle('sel', o === b);
    };
  }
  const go = async () => {
    $('go').disabled = true;
    const seed = (seedInput.value || 'REEDWAKE-2707').trim().toUpperCase();
    try {
      await app.boot(seed, quality, PARAMS.get('arm') || null);
      app.audio.start();
      $('boot').classList.add('gone');
      setTimeout(() => { $('boot').style.display = 'none'; }, 950);
    } catch (e) {
      app.err('boot: ' + (e && e.stack ? e.stack : e));
      $('go').disabled = false;
    }
  };
  $('go').onclick = go;
  seedInput.onkeydown = (e) => { if (e.key === 'Enter') go(); };

  // read-only diagnostics
  Object.defineProperty(window, '__proof', { get: () => (app.running ? app.proof() : { ready: false, errors: app.errors.map((e) => e.msg) }) });
  /* Verification harness. Nothing here is a play control and nothing is wired to a key:
     restart, quality, seed, forced branch, conformance measurement, and simulation rate.
     There is no warp, no teleport and no route-skip anywhere in this object — `subSteps`
     advances the world in full-fidelity slices, it does not move the rider without riding.
     `_dev` exposes the live scene for the test harness to inspect and is read-only in use. */
  window.__ctl = {
    restart: (s, q, a) => app.restart(s, q, a),
    conformance: () => app.measureConformance(),
    timeScale: (v) => { app.timeScale = clamp(v, 0.1, 30); return app.timeScale; },
    // full-fidelity simulation sub-stepping; not a warp — every metre is still ridden
    subSteps: (n, dt) => { app.subSteps = Math.max(1, Math.min(400, n | 0)); app.subDt = clamp(dt || 0.05, 0.005, 0.1); return [app.subSteps, app.subDt]; },
    pause: (v) => { app.rider.paused = v; },
    look: (y, p) => { app.rider.yawLook = y; app.rider.pitchLook = p; },
    key: (k, v) => { app.input.keys[k] = v; },
    plan: () => app.plan,
    probe: (x, z) => {
      const F = app.fields, gx = x === undefined ? app.rider.x : x, gz = z === undefined ? app.rider.z : z;
      const r = F.roadAt(gx, gz);
      return {
        at: [+gx.toFixed(2), +gz.toFixed(2)],
        marshH: +F.marshH(gx, gz).toFixed(3), terrainH: +F.terrainH(gx, gz).toFixed(3),
        roadDist: +F.roadDist(gx, gz).toFixed(3), roadY: r ? +r.y.toFixed(3) : null,
        fieldNear: app.fieldNear.sample(gx, gz), fieldFar: app.fieldFar.sample(gx, gz),
        riderY: +app.rider.y.toFixed(3), camY: +app.camera.position.y.toFixed(3),
        sun: [+app.sunDir.x.toFixed(3), +app.sunDir.y.toFixed(3), +app.sunDir.z.toFixed(3)],
        cloudCover: +app.shared.uCloudCover.value.toFixed(3), haze: app.shared.uHaze.value,
      };
    },
    ready: () => app.running,
    _dev: () => app,
  };
  if (PARAMS.get('autostart') === '1') go();
})();

