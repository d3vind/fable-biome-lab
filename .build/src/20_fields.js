/* ==================================================================
 *  FIELDS
 *  One deterministic description of the ground: marsh, channels, banks,
 *  islands, and the made road corridor. Terrain meshes, vegetation
 *  placement, water colour and wind shelter all read from here, so they
 *  cannot disagree with each other.
 * ================================================================== */

const ROAD_INFL = 34;   // beyond this the made ground has fully handed back to the marsh

/** Uniform grid over line segments — the only spatial acceleration this world needs. */
class SegIndex {
  constructor(cell) { this.cell = cell; this.map = new Map(); this.seg = []; }
  key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }
  add(ax, az, bx, bz, payload, reach) {
    const id = this.seg.length;
    this.seg.push({ ax, az, bx, bz, p: payload });
    const c = this.cell;
    const x0 = Math.floor((Math.min(ax, bx) - reach) / c), x1 = Math.floor((Math.max(ax, bx) + reach) / c);
    const z0 = Math.floor((Math.min(az, bz) - reach) / c), z1 = Math.floor((Math.max(az, bz) + reach) / c);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
      const k = this.key(cx, cz);
      let a = this.map.get(k); if (!a) { a = []; this.map.set(k, a); }
      a.push(id);
    }
    return id;
  }
  near(x, z) { return this.map.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell))); }
}

const bell = (v, c, w) => { const t = (v - c) / w; return Math.exp(-t * t * 2.2); };

class Fields {
  constructor(plan) {
    this.plan = plan;
    const h = plan.habitat, w = plan.weather;
    this.nz = h.nz; this.tide = w.tide;
    this.windX = Math.cos(w.windDir); this.windZ = Math.sin(w.windDir);

    /* ---- hydrology indices ---- */
    this.chan = new SegIndex(64);
    for (const c of plan.channels) {
      const reach = c.w * 0.5 + 10;
      for (let i = 0; i + 3 < c.pts.length; i += 2)
        this.chan.add(c.pts[i], c.pts[i + 1], c.pts[i + 2], c.pts[i + 3], c, reach);
    }
    this.bank = new SegIndex(64);
    for (const b of plan.banks) {
      const reach = b.w * 0.5 + 14;
      for (let i = 0; i + 3 < b.pts.length; i += 2)
        this.bank.add(b.pts[i], b.pts[i + 1], b.pts[i + 2], b.pts[i + 3], b, reach);
    }
    this.isl = new SegIndex(160);
    for (const s of plan.islands) this.isl.add(s.x, s.z, s.x, s.z, s, s.r * 1.5 + 30);

    /* ---- road corridor index (all four carriageways) ---- */
    this.road = new SegIndex(28);
    this.roadPolys = [
      { id: 'pre', p: plan.polys.pre, arm: null },
      { id: 'open', p: plan.polys.open, arm: 'open' },
      { id: 'willow', p: plan.polys.willow, arm: 'willow' },
      { id: 'post', p: plan.polys.post, arm: null },
    ];
    for (const rp of this.roadPolys) {
      const p = rp.p;
      for (let i = 0; i + 1 < p.n; i++)
        this.road.add(p.x[i], p.z[i], p.x[i + 1], p.z[i + 1], { rp, i }, ROAD_INFL);
    }

    /* ---- coarse route corridor: a causeway exists because the land beside it is under
       water. This index carries the carriageway's own elevation out to ~700 m so the
       basin can be dug where the road is raised, and left alone where it is not. ---- */
    this.corr = new SegIndex(512);
    const sOff = { pre: 0, open: plan.forkS, willow: plan.forkS, post: plan.rejoinS };
    for (const rp of this.roadPolys) {
      const p = rp.p, step = Math.max(1, Math.round(180 / DS));
      const list = rp.id === 'willow' ? plan.beatsWillow : plan.beats;
      for (let i = 0; i + step < p.n; i += step) {
        const j = Math.min(p.n - 1, i + step);
        this.corr.add(p.x[i], p.z[i], p.x[j], p.z[j],
          { y0: p.y[i], y1: p.y[j], s0: sOff[rp.id] + p.s[i], s1: sOff[rp.id] + p.s[j], list }, 780);
      }
    }
    this._cw = new Map();
    this._ci = { drop: 0, bank: 0, target: 0, mass: 1, vig: 1 };
    this._bs = { digL: 1, digR: 1, massL: 1, massR: 1, vigL: 1, vigR: 1 };

    /* ---- world bounds for the baked field texture ---- */
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const rp of this.roadPolys) {
      const p = rp.p;
      for (let i = 0; i < p.n; i++) {
        if (p.x[i] < minX) minX = p.x[i]; if (p.x[i] > maxX) maxX = p.x[i];
        if (p.z[i] < minZ) minZ = p.z[i]; if (p.z[i] > maxZ) maxZ = p.z[i];
      }
    }
    const pad = 1400;
    const span = Math.max(maxX - minX, maxZ - minZ) + pad * 2;
    this.bx = (minX + maxX) * 0.5 - span * 0.5;
    this.bz = (minZ + maxZ) * 0.5 - span * 0.5;
    this.bspan = span;

    this._scratch = { d: 0, y: 0, t: 0, rp: null, i: 0, side: 0, cx: 0, cz: 0, h: 0, polyId: '', sAlong: 0 };
    this._cd = new Float64Array(12); this._cy = new Float64Array(12);
    this._hab = { reed: 0, sedge: 0, meadow: 0, edge: 0, wet: 0, depth: 0, h: 0, patch: 0 };
  }

  /** The beat governing route distance sg, cross-faded across its joins so a change of
   *  composition arrives as a change of country and not as a seam. */
  beatSides(list, sg, o) {
    const n = list.length;
    if (!n) { o.digL = o.digR = 1; o.massL = o.massR = 1; o.vigL = o.vigR = 1; return o; }
    let lo = 0, hi = n - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (list[m].s0 <= sg) lo = m; else hi = m - 1; }
    const b = list[lo];
    const BLEND = 110;
    let other = b, w = 0;
    if (sg < (b.s0 + b.s1) * 0.5) { if (lo > 0) { other = list[lo - 1]; w = 0.5 * (1 - smoothstep(b.s0, b.s0 + BLEND, sg)); } }
    else if (lo < n - 1) { other = list[lo + 1]; w = 0.5 * smoothstep(b.s1 - BLEND, b.s1, sg); }
    const mix6 = (k) => b[k] + (other[k] - b[k]) * w;
    let digL = mix6('digL'), digR = mix6('digR');
    let massL = mix6('massL'), massR = mix6('massR');
    let vigL = mix6('vigL'), vigR = mix6('vigR');
    // an aperture beat opens one hole in the wall: the country is given back for a moment
    if (b.gapW > 0) {
      const u = (sg - b.s0) / Math.max(1, b.s1 - b.s0);
      const t = (u - b.gapAt) / b.gapW;
      const g = Math.exp(-t * t * 2.2);
      digL += (0.95 - digL) * g; digR += (0.95 - digR) * g;
      massL *= 1 - g * 0.94; massR *= 1 - g * 0.94;
      vigL += (0.45 - vigL) * g; vigR += (0.45 - vigR) * g;
    }
    o.digL = digL; o.digR = digR; o.massL = massL; o.massR = massR; o.vigL = vigL; o.vigR = vigR;
    return o;
  }

  /** What the road is doing to the country here, and which of its two sides is doing it.
   *  Two opposite jobs, one rule: a raised causeway is crossing a basin, so dig it; a road
   *  running along a reed bank pulls its neighbourhood up to just under the waterline. The
   *  beat then decides how much of each job each side gets — so one hand can be open water
   *  while the other is a wall of reed, which is the whole difference between a journey and
   *  a corridor. The geometry is low-frequency and cached on a 48 m lattice; the side is
   *  resolved exactly per sample against the cached carriageway point, so the changeover
   *  happens under the road rather than in quantised steps out in the country. */
  causewayInfo(x, z) {
    const G = 48;
    const gx = Math.floor(x / G), gz = Math.floor(z / G);
    const key = gx * 131071 + gz;
    const o = this._ci;
    let rec = this._cw.get(key);
    if (rec === undefined) {
      const px = (gx + 0.5) * G, pz = (gz + 0.5) * G;
      const near = this.corr.near(px, pz);
      rec = { drop: 0, bank: 0, target: 0, cx: px, cz: pz, nx: 1, nz: 0, digL: 1, digR: 1, massL: 1, massR: 1, vigL: 1, vigR: 1 };
      if (near) {
        let best = 1e9, bestY = 0, bestP = null, bcx = 0, bcz = 0, bt = 0;
        for (let k = 0; k < near.length; k++) {
          const sg = this.corr.seg[near[k]];
          const r = segDist(px, pz, sg.ax, sg.az, sg.bx, sg.bz);
          if (r.d < best) { best = r.d; bestY = lerp(sg.p.y0, sg.p.y1, r.t); bestP = sg; bcx = r.cx; bcz = r.cz; bt = r.t; }
        }
        if (bestP && best < 820) {
          const raised = smoothstep(1.95, 3.30, bestY);
          // the basin starts at the toe of the embankment: from a 1.4 m eye the far country
          // is compressed into a few degrees, so water only reads if it comes up close
          const dig = smoothstep(11, 36, best) * (1 - smoothstep(560, 800, best));
          /* A raised causeway digs the basin it crosses; a low reed road still has water
             lying against whichever hand the beat has opened, or the first minutes of the
             ride cannot say what country this is. The beat's own per-side factor decides
             how much of this each hand actually gets. */
          rec.drop = (0.58 + 0.86 * raised) * dig;
          // a reed bank still builds against a raised causeway, just less of one
          rec.bank = (0.32 + 0.68 * (1 - raised)) * smoothstep(300, 58, best);
          rec.target = clamp(bestY - 1.05, -0.08, 0.30);
          const dx = bestP.bx - bestP.ax, dz = bestP.bz - bestP.az;
          const inv = 1 / Math.max(1e-6, Math.hypot(dx, dz));
          rec.cx = bcx; rec.cz = bcz; rec.nx = -dz * inv; rec.nz = dx * inv;
          const s = this.beatSides(bestP.p.list, lerp(bestP.p.s0, bestP.p.s1, bt), this._bs);
          rec.digL = s.digL; rec.digR = s.digR;
          rec.massL = s.massL; rec.massR = s.massR;
          rec.vigL = s.vigL; rec.vigR = s.vigR;
        }
      }
      if (this._cw.size > 160000) this._cw.clear();
      this._cw.set(key, rec);
    }
    // exact side of the carriageway, handed over across the width of the made ground
    const t = clamp(((x - rec.cx) * rec.nx + (z - rec.cz) * rec.nz) / 26, -1, 1) * 0.5 + 0.5;
    const mass = rec.massR + (rec.massL - rec.massR) * t;
    o.drop = rec.drop * (rec.digR + (rec.digL - rec.digR) * t);
    o.bank = rec.bank * mass;
    o.target = rec.target;
    o.mass = mass;
    o.vig = rec.vigR + (rec.vigL - rec.vigR) * t;
    return o;
  }

  /* ---------------- natural ground, before any made road ---------------- */
  marshH(x, z) {
    const P = this.plan.habitat, nz = this.nz;
    /* Slow basin undulation about the tide line: this single number decides where the
       country is standing water, where it is reed bed, and where it dries to pasture.
       The mean is pulled down as the plan's tide rises, so tide is a structural seed
       difference, not a colour change. */
    let h = (0.36 - this.tide * 0.92)
      + P.basinAmp * 2.15 * fbm(x * P.basinScale, z * P.basinScale, nz, 4)
      + P.basinAmp * 0.75 * fbm(x * P.basinScale * 3.1, z * P.basinScale * 3.1, nz + 71, 3);

    let lift = 0;
    // islands lift first
    const li = this.isl.near(x, z);
    if (li) for (let k = 0; k < li.length; k++) {
      const s = this.isl.seg[li[k]].p;
      const dx = x - s.x, dz = z - s.z;
      const c = Math.cos(-s.rot), si = Math.sin(-s.rot);
      const ex = (dx * c - dz * si) / s.r, ez = (dx * si + dz * c) / (s.r * s.e);
      const q = Math.sqrt(ex * ex + ez * ez);
      if (q > 1.45) continue;
      const edge = 1 + 0.24 * fbm(ex * 2.6, ez * 2.6, nz + 311, 3);
      lift += s.h * smootherstep(edge, edge * 0.52, q);
    }
    // flood banks
    const lb = this.bank.near(x, z);
    if (lb) for (let k = 0; k < lb.length; k++) {
      const sg = this.bank.seg[lb[k]], b = sg.p;
      const r = segDist(x, z, sg.ax, sg.az, sg.bx, sg.bz);
      const hw = b.w * 0.5;
      if (r.d > hw + 12) continue;
      const crest = 1 + 0.16 * fbm(r.cx * 0.02, r.cz * 0.02, nz + 512, 2);
      lift += b.hgt * crest * smootherstep(hw + 10, hw * 0.35, r.d);
    }
    // soft-cap stacked lift: an island on a bank is a knoll, never a hill
    h += lift <= 2.4 ? lift : 2.4 + (lift - 2.4) * 0.22;
    // and what the road itself has done to this country
    const ci = this.causewayInfo(x, z);
    h -= ci.drop;
    if (ci.bank > 0) h = mixv(h, ci.target, ci.bank * 0.72);   // a reed bed under the bank
    // channels carve last so a creek can cut straight through a bank
    const lc = this.chan.near(x, z);
    if (lc) for (let k = 0; k < lc.length; k++) {
      const sg = this.chan.seg[lc[k]], c = sg.p;
      const r = segDist(x, z, sg.ax, sg.az, sg.bx, sg.bz);
      const hw = c.w * 0.5 * (1 + 0.22 * fbm(r.cx * 0.01, r.cz * 0.01, nz + 733, 2));
      if (r.d > hw + 9) continue;
      const bed = -this.tide - c.d;
      const t = smootherstep(hw + 8, hw * 0.55, r.d);
      h = mixv(h, Math.min(h, bed), t);
    }
    // fine relief, flattened wherever the ground is drowned
    const dry = smoothstep(-0.35, 0.25, h);
    h += this.plan.habitat.microAmp * (0.35 + 0.65 * dry) * fbm(x * 0.055, z * 0.055, nz + 907, 3);
    return h;
  }

  /* ---------------- nearest carriageway ---------------- *
   * Returns null beyond ROAD_INFL. Heights of competing carriageways are blended by
   * proximity so the fork throat merges into one surface instead of two crossing ramps. */
  roadAt(x, z) {
    const list = this.road.near(x, z);
    if (!list) return null;
    let best = 1e9, bestY = 0, bestRp = null, bestI = 0, bestCx = 0, bestCz = 0, bestT = 0;
    let wsum = 0, ysum = 0, nc = 0;
    const cand = this._cd, candY = this._cy;
    for (let k = 0; k < list.length; k++) {
      const sg = this.road.seg[list[k]];
      const r = segDist(x, z, sg.ax, sg.az, sg.bx, sg.bz);
      if (r.d > ROAD_INFL) continue;
      const p = sg.p.rp.p, i = sg.p.i;
      const y = lerp(p.y[i], p.y[i + 1], r.t);
      if (r.d < best) { best = r.d; bestY = y; bestRp = sg.p.rp; bestI = i; bestCx = r.cx; bestCz = r.cz; bestT = r.t; }
    }
    if (!bestRp) return null;
    /* Blend competing carriageways by how nearly tied they are, not by raw distance:
       a road 15 m further away contributes ~1e-4, so a single carriageway reproduces its own
       surface exactly, while the fork throat still merges into one continuous ramp.
       Only near-ties are gathered, so a junction with dozens of segments in range is cheap. */
    for (let k = 0; k < list.length; k++) {
      const sg = this.road.seg[list[k]];
      const r = segDist(x, z, sg.ax, sg.az, sg.bx, sg.bz);
      if (r.d - best > 16) continue;
      const p = sg.p.rp.p, i = sg.p.i;
      const t = (r.d - best) / 5, wgt = Math.exp(-t * t);
      wsum += wgt; ysum += lerp(p.y[i], p.y[i + 1], r.t) * wgt;
    }
    const s = this._scratch;
    s.d = best; s.y = wsum > 0 ? ysum / wsum : bestY; s.rp = bestRp; s.i = bestI;
    s.cx = bestCx; s.cz = bestCz; s.t = bestT;
    const p = bestRp.p, hh = p.h[bestI];
    s.side = Math.sign((x - bestCx) * Math.cos(hh + PI / 2) + (z - bestCz) * Math.sin(hh + PI / 2)) || 1;
    s.h = hh;
    s.polyId = bestRp.id;
    s.sAlong = p.s[bestI] + (p.s[bestI + 1] - p.s[bestI]) * bestT;
    return s;
  }

  /* ---------------- the made cross-section ----------------
   * carriageway -> dark contact seam -> wet gravel -> sedge verge -> batter -> marsh.
   * This is the single authority: the road ribbon mesh and the terrain both call it,
   * which is what keeps surface support error at the millimetre level. */
  roadProfile(d, roadY, marsh) {
    if (d <= ROAD_HALF) {
      const u = d / ROAD_HALF;
      return roadY + 0.052 * (1 - u * u) - 0.052;            // crown camber, crown on the centreline
    }
    const shoulderY = roadY - 0.052;
    if (d <= ROAD_HALF + SEAM) return shoulderY - 0.055 * smoothstep(ROAD_HALF, ROAD_HALF + SEAM, d);
    const seamY = shoulderY - 0.055;
    if (d <= ROAD_HALF + SEAM + GRAVEL) {
      const u = smoothstep(ROAD_HALF + SEAM, ROAD_HALF + SEAM + GRAVEL, d);
      return seamY - 0.10 * u;
    }
    const gravelY = seamY - 0.10;
    if (d <= CORRIDOR) {
      const u = smoothstep(ROAD_HALF + SEAM + GRAVEL, CORRIDOR, d);
      return gravelY - 0.16 * u;
    }
    // batter slope down to whatever the marsh is doing, then a soft toe
    const vergeY = gravelY - 0.16;
    const drop = vergeY - marsh;
    const run = Math.max(1.5, Math.abs(drop) * 2.55);
    const u = sat((d - CORRIDOR) / run);
    const e = u * u * (3 - 2 * u);
    const toe = smoothstep(run * 0.62, run * 1.25, d - CORRIDOR);
    return mixv(mixv(vergeY, marsh, e), marsh, toe);
  }

  /** Full realized ground height at a world point. */
  terrainH(x, z) {
    const m = this.marshH(x, z);
    const r = this.roadAt(x, z);
    if (!r) return m;
    const prof = this.roadProfile(r.d, r.y, m);
    // hand back to the marsh well outside the made ground
    const blend = smoothstep(ROAD_INFL, ROAD_INFL - 8, r.d);
    return mixv(m, prof, blend);
  }

  /** Distance to the nearest carriageway centre (used as the strict clearance mask). */
  roadDist(x, z) { const r = this.roadAt(x, z); return r ? r.d : 999; }

  /* The Hush corridor is genuinely enclosed: the reeds there are old, tall and unbrowsed,
     and they close over the verge. Vigour falls away as the road climbs onto the causeway
     and the country opens out. */
  vigour(r) {
    if (!r || r.polyId !== 'pre') return 1;
    const hush = this.plan.chapLen.hush;
    return 1 + 0.55 * smoothstep(hush + 340, hush * 0.55, r.sAlong);
  }

  /* Reed does not grow as an even wash. This is the mid-frequency mask that gathers it
     into stands with real gaps between them, so the far field reads as shapes rather than
     as fur — and so a third of the stems can be spent somewhere they are actually seen. */
  clump(x, z) {
    const nz = this.nz;
    const a = 0.5 + 0.5 * fbm(x * 0.0135, z * 0.0135, nz + 4409, 3);
    const b = 0.5 + 0.5 * fbm(x * 0.043, z * 0.043, nz + 4413, 2);
    return sat(smoothstep(0.30, 0.68, a * 0.74 + b * 0.26) * 1.06);
  }

  /* ---------------- shelter / exposure ---------------- */
  exposure(x, z) {
    let shelter = 0;
    const li = this.isl.near(x, z);
    if (li) for (let k = 0; k < li.length; k++) {
      const s = this.isl.seg[li[k]].p;
      const dx = x - s.x, dz = z - s.z;
      const dist = Math.hypot(dx, dz);
      if (dist > s.r * 2.6 + 40) continue;
      // downwind of an island is calmer than upwind — a real wind shadow, not a radial blob
      const dw = (dx * this.windX + dz * this.windZ) / Math.max(1, dist);
      const lee = 0.45 + 0.55 * sat(dw);
      shelter += s.dens * lee * smootherstep(s.r * (1.1 + 1.5 * sat(dw)), s.r * 0.4, dist);
    }
    const lb = this.bank.near(x, z);
    if (lb) for (let k = 0; k < lb.length; k++) {
      const sg = this.bank.seg[lb[k]];
      const r = segDist(x, z, sg.ax, sg.az, sg.bx, sg.bz);
      shelter += 0.34 * smootherstep(58, 10, r.d);
    }
    return clamp(1 - shelter * 0.82, 0.05, 1);
  }

  /* ---------------- habitat ----------------
   * Returns densities for the six vegetation families plus wetness. Domain-warped so the
   * far field reads as large value shapes rather than an even wash of green. */
  habitat(x, z, hOpt) {
    const P = this.plan.habitat, nz = this.nz;
    const h = hOpt !== undefined ? hOpt : this.marshH(x, z);
    const depth = -h;                                   // >0 submerged
    const wx = P.reedWarp * fbm(x * P.reedScale * 0.7, z * P.reedScale * 0.7, nz + 1201, 3);
    const wz = P.reedWarp * fbm(x * P.reedScale * 0.7 + 51.3, z * P.reedScale * 0.7 - 22.1, nz + 1202, 3);
    const patch = 0.5 + 0.5 * fbm((x + wx) * P.reedScale, (z + wz) * P.reedScale, nz + 1301, 4);
    const fine = 0.5 + 0.5 * fbm(x * P.patchScale, z * P.patchScale, nz + 1402, 3);

    const reed = bell(depth, 0.16, 0.46) * (0.22 + 0.78 * patch) * (0.55 + 0.45 * fine);
    const sedge = bell(depth, -0.20, 0.44) * (0.30 + 0.70 * (1 - patch * 0.7)) * P.sedgeBias * 1.6;
    const meadow = bell(depth, -0.72, 0.62) * (0.35 + 0.65 * fine) * P.meadowBias * 1.9;
    const edge = bell(depth, 0.46, 0.30) * (0.4 + 0.6 * fine) * P.edgeBias * 1.5;
    const o = this._hab;
    o.reed = sat(reed); o.sedge = sat(sedge); o.meadow = sat(meadow); o.edge = sat(edge);
    o.wet = sat(smoothstep(-0.55, 0.30, depth)); o.depth = depth; o.h = h; o.patch = patch;
    return o;
  }

}

/* ==================================================================
 *  FIELD MAP
 *  R height · G exposure · B reed density · A wetness, baked into a
 *  toroidal window that follows the rider. Water colour, far-field ground
 *  underpainting and shader-side shelter all sample this, so nothing on
 *  the GPU can drift out of step with the CPU's idea of the ground.
 *  The window rides with the camera, so resolution does not degrade
 *  however far the route wanders.
 * ================================================================== */
class FieldMap {
  /** mode 'near' bakes the made ground (road corridor included); 'far' bakes the open marsh. */
  constructor(fields, size, span, mode) {
    this.F = fields; this.S = size; this.span = span; this.texel = span / size; this.mode = mode;
    this.data = new Uint8Array(size * size * 4);
    this.ox = 0; this.oz = 0;                  // absolute texel index of the window corner
    this.baked = 0; this.ready = false;
    this.tex = new THREE.DataTexture(this.data, size, size, THREE.RGBAFormat);
    this.tex.wrapS = this.tex.wrapT = THREE.RepeatWrapping;
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.center = new THREE.Vector2();
  }
  _cell(i, j) {
    const S = this.S, T = this.texel;
    const wi = ((i % S) + S) % S, wj = ((j % S) + S) % S;
    const x = (i + 0.5) * T, z = (j + 0.5) * T;
    const m = this.F.marshH(x, z);
    const rd = this.F.roadDist(x, z);
    /* Under the carriageway the shell drops 5 cm and recovers by 19 m — well inside the
       ribbon's 22 m reach — so the road mesh is unambiguously the visible surface and the
       two agree exactly where they meet. No z-fighting, no polygon-offset guesswork. */
    const h = this.mode === 'near' ? this.F.terrainH(x, z) - 0.05 * smoothstep(19, 11, rd) : m;
    const hab = this.F.habitat(x, z, m);
    // reeds are cleared from the made ground here, so no far-field green can wash the road
    const clear = this.mode === 'near' ? smoothstep(CORRIDOR - 0.6, CORRIDOR + 3.4, this.F.roadDist(x, z)) : 1;
    const o = (wj * S + wi) * 4, d = this.data;
    d[o] = clamp(Math.round((h + 4) / 9 * 255), 0, 255);
    d[o + 1] = Math.round(this.F.exposure(x, z) * 255);
    d[o + 2] = Math.round(hab.reed * clear * 255);
    d[o + 3] = Math.round(hab.wet * clear * 255);
  }
  /** Anchor the window on a world point and start a full bake. */
  reset(cx, cz) {
    const S = this.S;
    this.ox = Math.floor(cx / this.texel) - (S >> 1);
    this.oz = Math.floor(cz / this.texel) - (S >> 1);
    this.baked = 0; this.ready = false;
    this._sync();
  }
  /** Incremental initial bake; returns 0..1 progress. */
  bakeStep(rows) {
    const S = this.S, end = Math.min(S, this.baked + rows);
    for (let j = this.baked; j < end; j++) for (let i = 0; i < S; i++) this._cell(this.ox + i, this.oz + j);
    this.baked = end;
    if (end >= S) { this.ready = true; this.tex.needsUpdate = true; }
    return end / S;
  }
  /** Slide the window after the rider, baking only the newly exposed lines. */
  update(cx, cz, budget) {
    if (!this.ready) return;
    const S = this.S, half = S >> 1;
    const tx = Math.floor(cx / this.texel) - half, tz = Math.floor(cz / this.texel) - half;
    let work = 0, dirty = false;
    while (this.ox !== tx && work < budget) {
      const dir = tx > this.ox ? 1 : -1;
      const col = dir > 0 ? this.ox + S : this.ox - 1;
      for (let j = 0; j < S; j++) this._cell(col, this.oz + j);
      this.ox += dir; work++; dirty = true;
    }
    while (this.oz !== tz && work < budget) {
      const dir = tz > this.oz ? 1 : -1;
      const row = dir > 0 ? this.oz + S : this.oz - 1;
      for (let i = 0; i < S; i++) this._cell(this.ox + i, row);
      this.oz += dir; work++; dirty = true;
    }
    // a jump larger than the window (restart) is cheaper to rebuild than to scroll
    if (Math.abs(tx - this.ox) > S || Math.abs(tz - this.oz) > S) { this.reset(cx, cz); while (!this.ready) this.bakeStep(64); return; }
    if (dirty) { this.tex.needsUpdate = true; this._sync(); }
    else this._sync();
  }
  _sync() {
    this.center.set((this.ox + this.S * 0.5) * this.texel, (this.oz + this.S * 0.5) * this.texel);
  }
  /** decode one texel the way the shader would — used by diagnostics */
  sample(x, z) {
    const S = this.S;
    const i = Math.floor(x / this.texel), j = Math.floor(z / this.texel);
    const wi = ((i % S) + S) % S, wj = ((j % S) + S) % S;
    const o = (wj * S + wi) * 4, d = this.data;
    return { h: +(d[o] / 255 * 9 - 4).toFixed(3), exposure: +(d[o + 1] / 255).toFixed(3), reed: +(d[o + 2] / 255).toFixed(3), wet: +(d[o + 3] / 255).toFixed(3) };
  }
  dispose() { this.tex.dispose(); }
}
