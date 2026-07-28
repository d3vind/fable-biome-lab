/* ==================================================================
 *  SOUND
 *  Entirely synthesised — no recordings, no files. Multi-band reed wind
 *  that answers the same gust the reeds are answering, water against
 *  stone, faster water at the gates, insects, sparse marsh birds, the
 *  wheel's timber groan, and a two-note accident where wind crosses the
 *  sluice pipes.
 * ================================================================== */
let SHARED_CTX = null;

class Audio {
  constructor(plan) {
    this.plan = plan; this.ok = false; this.nodes = []; this.started = false;
    this.muted = Audio.mutedPref();
    this.t = 0; this.nextInsect = 0; this.nextBird = 0; this.nextCreak = 0;
    this.gain = 0;
  }
  _n(node) { this.nodes.push(node); return node; }

  start() {
    if (this.started) return this.ok;
    this.started = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      if (!SHARED_CTX || SHARED_CTX.state === 'closed') SHARED_CTX = new AC();
      const ctx = this.ctx = SHARED_CTX;
      if (ctx.state === 'suspended') ctx.resume();

      // one pink-ish noise bed, reused by every band
      const len = Math.floor(ctx.sampleRate * 3);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      const R = new Rng(this.plan.seedU, 'audio:noise');
      for (let i = 0; i < len; i++) {
        const w = R.f(-1, 1);
        b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16;
      }
      this.noiseBuf = buf;

      this.master = this._n(ctx.createGain()); this.master.gain.value = 0;
      const comp = this._n(ctx.createDynamicsCompressor());
      comp.threshold.value = -18; comp.ratio.value = 4;
      this.master.connect(comp); comp.connect(ctx.destination);

      const src = () => { const s = this._n(ctx.createBufferSource()); s.buffer = buf; s.loop = true; s.start(); return s; };

      // --- reed wind in three bands: body, hiss, and the fine rasp of seed heads
      this.wind = this.plan.sound.reedBands.map((f, i) => {
        const s = src(), bp = this._n(this.ctx.createBiquadFilter()), g = this._n(ctx.createGain());
        bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 0.8 + i * 0.7;
        g.gain.value = 0;
        s.connect(bp); bp.connect(g); g.connect(this.master);
        return { g, bp, base: [0.34, 0.22, 0.12][i] };
      });
      // low pressure under everything
      {
        const s = src(), lp = this._n(ctx.createBiquadFilter()), g = this._n(ctx.createGain());
        lp.type = 'lowpass'; lp.frequency.value = 150; g.gain.value = 0.0;
        s.connect(lp); lp.connect(g); g.connect(this.master);
        this.rumble = g;
      }
      // --- water against stone
      {
        const s = src(), lp = this._n(ctx.createBiquadFilter()), g = this._n(ctx.createGain());
        lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.6; g.gain.value = 0;
        s.connect(lp); lp.connect(g); g.connect(this.master);
        this.water = { g, lp };
      }
      // --- the gates: faster, brighter, with a resonance from the opening
      {
        const s = src(), bp = this._n(ctx.createBiquadFilter()), g = this._n(ctx.createGain());
        bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.4; g.gain.value = 0;
        s.connect(bp); bp.connect(g); g.connect(this.master);
        this.sluice = { g, bp };
      }
      // --- the two-note pipe tone: physics that accidentally became music
      this.pipes = this.plan.sound.sluiceTone.map((f, i) => {
        const o = this._n(ctx.createOscillator()), g = this._n(ctx.createGain());
        o.type = 'sine'; o.frequency.value = f; g.gain.value = 0;
        o.connect(g); g.connect(this.master); o.start();
        // a breath of noise riding with each note
        const s = src(), bp = this._n(ctx.createBiquadFilter()), bg = this._n(ctx.createGain());
        bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 9; bg.gain.value = 0;
        s.connect(bp); bp.connect(bg); bg.connect(this.master);
        return { o, g, bg, f };
      });
      // --- the wheel: low timber groan plus structure resonance
      {
        const o = this._n(ctx.createOscillator()), g = this._n(ctx.createGain()), lp = this._n(ctx.createBiquadFilter());
        o.type = 'sawtooth'; o.frequency.value = this.plan.sound.wheelGroan;
        lp.type = 'lowpass'; lp.frequency.value = 260; g.gain.value = 0;
        o.connect(lp); lp.connect(g); g.connect(this.master); o.start();
        const o2 = this._n(ctx.createOscillator()), g2 = this._n(ctx.createGain());
        o2.type = 'sine'; o2.frequency.value = this.plan.sound.wheelGroan * 2.51; g2.gain.value = 0;
        o2.connect(g2); g2.connect(this.master); o2.start();
        this.wheel = { g, g2, o, lp };
      }
      this.ok = true;
      this.master.gain.setTargetAtTime(this.muted ? 0.0001 : 0.85, ctx.currentTime, this.muted ? 0.05 : 2.2);
      return true;
    } catch (e) { this.ok = false; return false; }
  }

  /** one-shot voices */
  _blip(freq, dur, type, vol, bend) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * bend), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  _burst(freq, q, dur, vol) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    s.loop = true; s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.05);
  }
  event(kind) {
    if (!this.ok) return;
    if (kind.startsWith('lift:1') || kind === 'heron') { this._burst(900, 2, 0.5, 0.12); this._blip(760, 0.35, 'sine', 0.06, 0.7); }
    else if (kind.startsWith('lift:')) this._burst(2400, 3, 0.28, 0.07);
    else if (kind === 'frog') this._blip(150 + Math.random() * 90, 0.16, 'triangle', 0.10, 0.55);
    else if (kind === 'gust') this._burst(520, 0.7, 1.8, 0.10);
  }

  /** state: {wind, gust, exposure, waterNear, sluiceD, wheelD, speed, chapter, still} */
  update(dt, st) {
    if (!this.ok) return;
    this.t += dt;
    // parameter automation runs at ~30 Hz however finely the world is stepped
    this._acc = (this._acc || 0) + dt;
    if (this._acc < 0.033) return;
    dt = this._acc; this._acc = 0;
    const ctx = this.ctx, T = ctx.currentTime;
    const set = (p, v, tau) => p.setTargetAtTime(Math.max(0.0001, v), T, tau);

    const w = clamp(st.wind / 7, 0, 1.6);
    const shel = 0.25 + 0.75 * st.exposure;
    // exposed wind is broad and hissing; sheltered wind is body only
    set(this.wind[0].g.gain, this.wind[0].base * w * (0.55 + 0.45 * shel), 0.22);
    set(this.wind[1].g.gain, this.wind[1].base * Math.pow(w, 1.4) * shel, 0.18);
    set(this.wind[2].g.gain, this.wind[2].base * Math.pow(w, 1.9) * shel * (0.4 + 0.6 * st.exposure), 0.14);
    this.wind[1].bp.frequency.setTargetAtTime(this.plan.sound.reedBands[1] * (0.85 + 0.4 * w), T, 0.3);
    set(this.rumble.gain, 0.10 * Math.pow(w, 1.6) + st.speed * 0.004, 0.4);

    set(this.water.g.gain, 0.16 * st.waterNear * (0.5 + 0.5 * w), 0.5);
    this.water.lp.frequency.setTargetAtTime(500 + 700 * w, T, 0.6);

    const sl = sat(1 - st.sluiceD / 130);
    set(this.sluice.g.gain, 0.30 * sl * sl, 0.35);

    // the pipes only speak when the wind is actually crossing the openings
    const voice = sl * smoothstep(2.4, 5.5, st.wind);
    const alt = 0.5 + 0.5 * Math.sin(this.t * 0.21);
    set(this.pipes[0].g.gain, 0.055 * voice * (0.35 + 0.65 * alt), 0.9);
    set(this.pipes[1].g.gain, 0.045 * voice * (0.35 + 0.65 * (1 - alt)), 1.1);
    set(this.pipes[0].bg.gain, 0.020 * voice, 0.7);
    set(this.pipes[1].bg.gain, 0.016 * voice, 0.7);

    const wd = sat(1 - st.wheelD / 110);
    set(this.wheel.g.gain, 0.075 * wd * (0.55 + 0.45 * Math.sin(this.t * 0.7)), 0.5);
    set(this.wheel.g2.gain, 0.020 * wd * (0.5 + 0.5 * Math.sin(this.t * 0.31 + 1.1)), 0.7);
    this.wheel.o.frequency.setTargetAtTime(this.plan.sound.wheelGroan * (0.96 + 0.08 * Math.sin(this.t * 0.43)), T, 0.8);
    if (wd > 0.25 && this.t > this.nextCreak) {
      this.nextCreak = this.t + 1.4 + Math.random() * 2.6;
      this._burst(230 + Math.random() * 180, 6, 0.28, 0.05 * wd);
    }
    // insects and birds: sparse, and quieter when the wind is up
    if (this.t > this.nextInsect) {
      this.nextInsect = this.t + 0.9 + Math.random() * 4.5 / Math.max(0.2, 1 - st.exposure * 0.5);
      if (Math.random() < 0.75 - w * 0.35) this._burst(3200 + Math.random() * 2600, 14, 0.10 + Math.random() * 0.3, 0.020 * (1 - st.exposure * 0.4));
    }
    if (this.t > this.nextBird) {
      this.nextBird = this.t + 4 + Math.random() * 16;
      if (Math.random() < 0.6) this._blip(1400 + Math.random() * 1800, 0.10 + Math.random() * 0.12, 'sine', 0.035, 1.6);
    }
  }
  setMaster(v) { if (this.ok && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.3); }

  /* Mute is a gate on the master bus, not a teardown: the whole graph keeps running and
     keeps tracking the wind, so unmuting drops you back into the sound the country is
     making at that moment rather than restarting it from silence. The choice is
     remembered, because someone who rides with the sound off wants it off next time. */
  static mutedPref() {
    try { return localStorage.getItem('reedwake:mute') === '1'; } catch (e) { return false; }
  }
  setMuted(v) {
    this.muted = !!v;
    try { localStorage.setItem('reedwake:mute', this.muted ? '1' : '0'); } catch (e) { }
    if (this.ok) this.master.gain.setTargetAtTime(this.muted ? 0.0001 : 0.85, this.ctx.currentTime, 0.12);
    return this.muted;
  }
  toggleMute() { return this.setMuted(!this.muted); }
  stop() {
    if (!this.ok) return;
    try {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setValueAtTime(0, this.ctx.currentTime);
      for (const n of this.nodes) { try { if (n.stop) n.stop(); } catch (e) { } try { n.disconnect(); } catch (e) { } }
    } catch (e) { }
    this.nodes.length = 0; this.ok = false;
  }
}
