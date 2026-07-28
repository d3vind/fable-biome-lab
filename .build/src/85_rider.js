/* ==================================================================
 *  THE RIDER
 *  A bicycle at road speed: it carries momentum, it feels the grade and
 *  the headwind, and it steers. It does not walk, fly, or teleport.
 * ================================================================== */
const EYE = 1.42;

class Rider {
  constructor(fields, plan) {
    this.F = fields; this.plan = plan;
    this.reset();
    this.yawLook = 0; this.pitchLook = 0;
    this.dragging = false;
    this._dir = new THREE.Vector3(); this._up = new THREE.Vector3();
  }
  reset(arm) {
    const p = this.plan;
    this.seg = 'pre'; this.sLocal = 0; this.lat = 0; this.latV = 0;
    this.speed = 5.4; this.pedal = 0;
    this.forcedArm = arm || null; this.arm = null;
    this.head = p.polys.pre.h[0];
    this.headSmooth = this.head; this.roll = 0; this.bob = 0;
    this.x = p.polys.pre.x[0]; this.z = p.polys.pre.z[0];
    this.y = this.F.terrainH(this.x, this.z) + EYE;
    this.grade = 0; this.windPress = 0; this.camLat = 0;
    this.yawComp = 0; this.laneComp = 0; this._bi = 0; this._camWind = 0;
    this.s = 0; this.ascent = 0; this.descent = 0; this.lastY = this.y;
    this.paused = false; this.finished = false; this.committed = false;
    this.yawLook = 0; this.pitchLook = 0;
    this.distance = 0;
  }
  poly() {
    const P = this.plan.polys;
    return this.seg === 'pre' ? P.pre : this.seg === 'post' ? P.post : (this.seg === 'open' ? P.open : P.willow);
  }
  sOffset() {
    const p = this.plan;
    if (this.seg === 'pre') return 0;
    if (this.seg === 'post') return p.rejoinS;
    return p.forkS;
  }
  /** total nominal route length for the arm currently being ridden */
  totalLen() {
    const p = this.plan;
    const armLen = (this.arm === 'willow') ? p.route.armWillowLen : p.route.armOpenLen;
    return p.polys.pre.len + armLen + p.polys.post.len;
  }

  sample(poly, s) {
    const f = clamp(s / Math.max(1e-6, poly.len), 0, 1) * (poly.n - 1);
    const i = Math.min(poly.n - 2, Math.floor(f)), u = f - i;
    return {
      x: lerp(poly.x[i], poly.x[i + 1], u),
      z: lerp(poly.z[i], poly.z[i + 1], u),
      h: poly.h[i] + angDiff(poly.h[i], poly.h[i + 1]) * u,
    };
  }

  update(dt, keys, wind) {
    const P = this.plan.polys;
    if (!this.paused && !this.finished) {
      // ---- longitudinal: cruise, plus the rider's own effort
      const cruiseBase = this.arm === 'willow' ? this.plan.route.vWillow : this.plan.route.vOpen;
      let target = cruiseBase;
      if (keys.fwd) target = cruiseBase * 1.42;
      if (keys.brake) target = cruiseBase * 0.30;
      // grade and headwind both cost real speed
      const w = wind.at(this.x, this.z, this.F);
      const head = -(Math.cos(w.angle) * Math.cos(this.head) + Math.sin(w.angle) * Math.sin(this.head));
      this.windPress = head * w.speed;
      target -= this.grade * 26;
      target -= Math.max(0, this.windPress) * 0.16;
      target = clamp(target, 1.6, 15);
      const rate = target > this.speed ? (keys.fwd ? 0.55 : 0.32) : (keys.brake ? 2.2 : 0.55);
      this.speed = approach(this.speed, target, rate, dt);

      // ---- steering: lateral position on the carriageway
      const steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      this.latV = approach(this.latV, -steer * 1.5, 3.4, dt);
      // the wind leans on the bike a little; never enough to make steering unpleasant
      this.latV += -Math.sin(w.angle - this.head) * w.speed * 0.020 * dt;
      this.lat = clamp(this.lat + this.latV * dt, -1.52, 1.52);
      if (steer === 0) this.lat = approach(this.lat, 0, 0.55, dt);

      // ---- advance
      const ds = this.speed * dt;
      this.sLocal += ds;
      this.distance += ds;
      this.pedal += ds * 0.62;

      const poly = this.poly();
      if (this.sLocal >= poly.len) {
        const over = this.sLocal - poly.len;
        if (this.seg === 'pre') {
          // ---- the fork commits here, on the rider's own steering
          const handed = this.plan.handed;
          this.arm = this.forcedArm || ((this.lat * handed >= 0) ? 'open' : 'willow');
          this.seg = this.arm; this.sLocal = over; this.committed = true;
        } else if (this.seg === 'open' || this.seg === 'willow') {
          this.seg = 'post'; this.sLocal = over;
        } else {
          this.sLocal = poly.len; this.finished = true; this.speed = 0;
        }
      }
    }

    // ---- place the bike on the actual road surface
    const poly = this.poly();
    const c = this.sample(poly, this.sLocal);
    const nx = -Math.sin(c.h), nz = Math.cos(c.h);
    this.x = c.x + nx * this.lat; this.z = c.z + nz * this.lat;
    this.head = c.h;
    this.s = this.sOffset() + this.sLocal;

    const surf = this.F.terrainH(this.x, this.z);
    const ahead = 4;
    const g = (this.F.terrainH(this.x + Math.cos(c.h) * ahead, this.z + Math.sin(c.h) * ahead) - surf) / ahead;
    this.grade = approach(this.grade, clamp(g, -0.12, 0.12), 3.0, dt);

    if (!this.paused) {
      const dy = surf - (this.lastY - EYE);
      if (dy > 0) this.ascent += dy; else this.descent -= dy;
      this.lastY = surf + EYE;
    }

    // ---- camera: stable eye, damped heading, tiny bob, bounded roll
    this.headSmooth += angDiff(this.headSmooth, this.head) * (1 - Math.exp(-4.5 * dt));
    const targetRoll = clamp(-this.latV * 0.020 + Math.sin(0) * 0, -0.035, 0.035);
    this.roll = approach(this.roll, targetRoll, 3.0, dt);
    const bobAmp = 0.0075 * clamp(this.speed / 7, 0.2, 1.4);
    this.bob = Math.sin(this.pedal * 2.0) * bobAmp + Math.sin(this.pedal * 4.0) * bobAmp * 0.3;
    const wa = wind.at(this.x, this.z, this.F);
    const side = Math.sin(wa.angle - this.head) * wa.speed;
    /* Sightline. A rider on an embankment does not stare at the vanishing point: the eye
       drifts toward whichever hand the country has opened, and the wheels drift away from
       the drop. Both are slow, both are small, and together they take the road off the
       centre of the frame and let it travel across it. Suppressed near the fork, where
       the road ahead is the thing that has to be read. */
    const b = this.beatNow();
    if (b) {
      const p = this.plan;
      const guard = smoothstep(300, 720, Math.abs(this.s - p.forkS)) * smoothstep(140, 460, Math.abs(this.s - p.rejoinS));
      const open = clamp((b.digL - b.digR) * 1.2, -1, 1) * guard;
      this.yawComp = approach(this.yawComp, open * 0.185, 0.42, dt);
      this.laneComp = approach(this.laneComp, -open * 0.95, 0.38, dt);
    }
    this.camLat = this.camLatBase(side, dt);
    this.y = surf + EYE + this.bob;
  }

  /** the beat the rider is inside, tracked forward so this is O(1) per frame */
  beatNow() {
    const p = this.plan, s = this.s;
    const list = (this.arm === 'willow' && s > p.forkS && s < p.rejoinS) ? p.beatsWillow : p.beats;
    if (!list || !list.length) return null;
    if (this._bi >= list.length || list[this._bi].s0 > s) this._bi = 0;
    while (this._bi + 1 < list.length && list[this._bi + 1].s0 <= s) this._bi++;
    return list[this._bi];
  }
  camLatBase(side, dt) {
    this._camWind = approach(this._camWind || 0, clamp(side * 0.014, -0.09, 0.09), 1.6, dt);
    return this._camWind + this.laneComp;
  }

  applyCamera(cam) {
    const yaw = this.headSmooth + this.yawLook + this.yawComp;
    cam.position.set(this.x + Math.cos(this.head + PI / 2) * this.camLat, this.y, this.z + Math.sin(this.head + PI / 2) * this.camLat);
    const pitch = this.pitchLook - this.grade * 0.35;
    const dir = this._dir.set(Math.cos(yaw) * Math.cos(pitch), Math.sin(pitch), Math.sin(yaw) * Math.cos(pitch));
    const up = this._up.set(Math.sin(this.roll) * Math.sin(yaw), Math.cos(this.roll), -Math.sin(this.roll) * Math.cos(yaw));
    cam.up.copy(up);
    cam.lookAt(cam.position.x + dir.x, cam.position.y + dir.y, cam.position.z + dir.z);
    cam.updateMatrixWorld(true);
  }

  chapter() {
    const s = this.s, ch = this.plan.chapters;
    // the fork chapter spans whichever arm is being ridden
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      if (i === 4) { if (s >= this.plan.forkS && s < this.plan.rejoinS) return c; continue; }
      const s0 = i < 4 ? c.s0 : c.s0 + (this.plan.route.armOpenLen - (this.arm === 'willow' ? this.plan.route.armWillowLen : this.plan.route.armOpenLen)) * 0;
      if (s >= c.s0 && s < c.s1) return c;
    }
    return ch[ch.length - 1];
  }
  progress() { return sat(this.distance / this.totalLen()); }
}

/* ------------------------------------------------------------------ *
 *  input
 * ------------------------------------------------------------------ */
class Input {
  constructor(canvas, onKey) {
    this.keys = { fwd: false, brake: false, left: false, right: false };
    this.canvas = canvas; this.onKey = onKey;
    this._down = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') this.keys.fwd = true;
      else if (k === 's' || k === 'arrowdown') this.keys.brake = true;
      else if (k === 'a' || k === 'arrowleft') this.keys.left = true;
      else if (k === 'd' || k === 'arrowright') this.keys.right = true;
      else if (k === ' ') { e.preventDefault(); onKey('pause'); }
      else if (k === 'r') onKey('restart');
      else if (k === 'm') onKey('mute');
      else if (k === 'escape') onKey('escape');
      else return;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    };
    this._up = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') this.keys.fwd = false;
      else if (k === 's' || k === 'arrowdown') this.keys.brake = false;
      else if (k === 'a' || k === 'arrowleft') this.keys.left = false;
      else if (k === 'd' || k === 'arrowright') this.keys.right = false;
    };
    this._blur = () => { for (const k in this.keys) this.keys[k] = false; };
    this._pd = (e) => { this.drag = true; this.px = e.clientX; this.py = e.clientY; canvas.setPointerCapture?.(e.pointerId); };
    this._pm = (e) => {
      if (!this.drag) return;
      onKey('look', (e.clientX - this.px) * 0.0032, (e.clientY - this.py) * 0.0026);
      this.px = e.clientX; this.py = e.clientY;
    };
    this._pu = (e) => { this.drag = false; try { canvas.releasePointerCapture?.(e.pointerId); } catch (err) { } };
    addEventListener('keydown', this._down); addEventListener('keyup', this._up); addEventListener('blur', this._blur);
    canvas.addEventListener('pointerdown', this._pd);
    addEventListener('pointermove', this._pm); addEventListener('pointerup', this._pu);
  }
  dispose() {
    removeEventListener('keydown', this._down); removeEventListener('keyup', this._up); removeEventListener('blur', this._blur);
    this.canvas.removeEventListener('pointerdown', this._pd);
    removeEventListener('pointermove', this._pm); removeEventListener('pointerup', this._pu);
  }
}
