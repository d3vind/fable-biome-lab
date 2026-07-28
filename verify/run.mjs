// Retained verification runner for Summerglass Hollow.
// Serves the shipped index.html and drives it in Chromium via Playwright.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join, extname} from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = Number(process.env.PORT || 8123);
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1];
const SEEDS = ['SUMMERGLASS-8421', '1189', '777', 'GLASSWOOD-42', 'HOLLOWBELL-77'];
const MIME = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css'};

const serve = () => new Promise(res => {
  const s = createServer(async (req, rep) => {
    const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'index.html'
                                                                          : req.url.split('?')[0]);
    try {
      const body = await readFile(p);
      rep.writeHead(200, {'content-type': MIME[extname(p)] || 'application/octet-stream'});
      rep.end(body);
    } catch { rep.writeHead(404); rep.end('not found'); }
  });
  s.listen(PORT, () => res(s));
});

const results = [];
const record = (name, pass, detail) => {
  results.push({name, state: pass ? 'PASS' : 'FAIL', detail});
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`);
};
// A third state, for a check that ran cleanly on hardware that cannot answer the
// question it asks. It is not a pass: a row that reads green while its own detail
// says the measurement is meaningless is worse than no row at all.
const recordNoVerdict = (name, detail) => {
  results.push({name, state: 'NO-VERDICT', detail});
  console.log(`NO-VERDICT  ${name}  ${JSON.stringify(detail)}`);
};

// The page loads three.js from a CDN. In a sandbox without egress, point
// THREE_LOCAL at a local copy of the same pinned version and it is served in
// place of the CDN request — the shipped file is not modified either way.
const THREE_LOCAL = process.env.THREE_LOCAL;

// `dpr` sets the page's real devicePixelRatio. Without it every page runs at 1
// and the standard tier's 1.25 ceiling is never exercised — so the performance
// check measured a resolution nobody ships at and called it a result.
async function open(browser, query, size = {width: 1600, height: 900}, dpr) {
  const page = await browser.newPage(
    dpr ? {viewport: size, deviceScaleFactor: dpr} : {viewport: size});
  if (THREE_LOCAL) {
    await page.route('**/three@0.185.1/**', async route => {
      const url = route.request().url();
      const rel = url.split('three@0.185.1/')[1].split('?')[0];
      try {
        const body = await readFile(join(THREE_LOCAL, rel));
        await route.fulfill({status: 200, contentType: 'text/javascript', body});
      } catch { await route.continue(); }
    });
  }
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html?${query}`, {waitUntil: 'load'});
  await page.waitForFunction(() => !!window.__SUMMERGLASS_PROOF__, null, {timeout: 120000});
  await page.waitForTimeout(4000);
  page._errs = errs;
  return page;
}
const proof = page => page.evaluate(() => JSON.parse(JSON.stringify(window.__SUMMERGLASS_PROOF__)));

// Restart must leave nothing of the previous run behind, from any chapter, and
// twice in a row. `where` is a global route distance inside the named chapter.
async function checkRestart(browser, label, where, twice = false) {
  const p = await open(browser, 'seed=SUMMERGLASS-8421&quality=standard', {width: 900, height: 560});
  await p.evaluate(g => window.__SUMMERGLASS_TEST__.warp(g), where);
  await p.evaluate(() => window.__SUMMERGLASS_TEST__.fixedStep(0.25));
  await p.waitForTimeout(9000);
  // This check used to command a quarter-second fixed step, restart, then wait
  // four WALL-CLOCK seconds and assert the new run had ridden under sixty metres.
  // Those two things contradict each other: four seconds of a still-accelerated
  // step is four seconds times the frame rate of simulated time, so the assertion
  // held on a five-frame-a-second rasteriser and failed on real hardware purely
  // because real hardware is faster. The step is cleared BEFORE the restart, and
  // the new run is then frozen, so what is measured is what restart cleared
  // rather than how fast the machine happens to ride.
  await p.evaluate(() => window.__SUMMERGLASS_TEST__.fixedStep(0));
  await p.evaluate(() => window.__SUMMERGLASS_TEST__.restart());
  await p.evaluate(() => window.__SUMMERGLASS_TEST__.pause(true));
  await p.waitForTimeout(1500);
  if (twice) {
    await p.evaluate(() => window.__SUMMERGLASS_TEST__.restart());
    await p.evaluate(() => window.__SUMMERGLASS_TEST__.pause(true));
    await p.waitForTimeout(1500);
  }
  const P = await proof(p), g = await p.evaluate(() => window.__SUMMERGLASS_TEST__.state().g);
  await p.close();
  const inherited = Math.max(P.run.ascentRiddenM, P.run.descentRiddenM);
  // With the accelerant off and the ride held, restart's contract is exact:
  // back at the start, nothing ridden, nothing inherited, and the provenance
  // ladder cleared all the way to continuous rather than merely "not warped".
  record(`restart/${label}`,
    g < 5 && inherited <= 0.5 && P.run.lifeFired === 0 && P.run.distanceRiddenM < 5 &&
    P.run.provenance === 'continuous' && P.run.stepOverruns === 0 && P.errors.length === 0,
    {gAfter: Math.round(g * 100) / 100, ascent: P.run.ascentRiddenM, descent: P.run.descentRiddenM,
     distanceRiddenM: P.run.distanceRiddenM, provenance: P.run.provenance,
     maxStepM: P.run.maxStepM, stepOverruns: P.run.stepOverruns,
     lifeFired: P.run.lifeFired, restarts: P.lifetime.restarts, errors: P.errors.length,
     note: 'fixed step cleared and ride paused before measuring, so this is hardware-independent'});
}

async function checkProvenance(browser) {
  const p = await open(browser, 'seed=SUMMERGLASS-8421&quality=standard', {width: 900, height: 560});
  await p.evaluate(() => window.__SUMMERGLASS_TEST__.warp(6300));
  await p.waitForTimeout(2000);
  const warped = (await proof(p)).run;
  await p.evaluate(() => window.__SUMMERGLASS_TEST__.fixedStep(0.3));
  await p.evaluate(() => window.__SUMMERGLASS_TEST__.restart());
  await p.waitForTimeout(3000);
  const after = (await proof(p)).run;
  await p.close();
  record('provenance',
    warped.provenance === 'warped' && !warped.continuousRideEligible && after.provenance === 'accelerated',
    {afterWarp: warped.provenance, warpEligible: warped.continuousRideEligible,
     afterRestartWithFixedStep: after.provenance});
}

async function checkFork(browser, seed, quality) {
  const p = await open(browser, `seed=${encodeURIComponent(seed)}&quality=${quality}`, {width: 900, height: 560});
  const f = await p.evaluate(() => window.__SUMMERGLASS_TEST__.forkIntegrity());
  const P = await proof(p);
  await p.close();
  // A miss rate is not a picture. What decides whether the ground looks torn is
  // the largest *connected* opening: lone rays slipping between triangles are
  // invisible, a contiguous block is a window onto the sky.
  const big = f.largestOpening || {cells: 0};
  // Two meshes that meet have to overlap somewhere; what must not exist is a
  // surface hanging metres above the one under it.
  record(`fork/${seed}/${quality}`,
    f.holes === 0 && big.cells === 0 && f.worstOverlapM <= 2.0 && P.errors.length === 0,
    {holes: f.holes, holePct: f.holePct, samples: f.samples, isolated: f.isolatedMisses,
     largestOpening: f.largestOpening,
     overlap: {under8cm: f.overlapUnder8cm, cm8to40: f.overlap8to40cm, over40cm: f.overlapOver40cm},
     worstOverlapM: f.worstOverlapM, worstOverlapAt: f.worstOverlapAt, firstMiss: f.worstHole});
}

async function checkRoad(browser, seed, quality) {
  const p = await open(browser, `seed=${encodeURIComponent(seed)}&quality=${quality}`, {width: 900, height: 560});
  const P = await proof(p);
  await p.close();
  const R = P.road;
  record(`road/${seed}/${quality}`,
    R.unsupportedEdgeSamples === 0 && R.groundFieldPokeThroughSamples === 0 &&
    R.clearanceViolations === 0 && R.emittedTrianglesOnly === true && P.errors.length === 0,
    {unsupported: R.unsupportedEdgeSamples, pokeThrough: R.groundFieldPokeThroughSamples,
     emittedTrianglesOnly: R.emittedTrianglesOnly, worst: R.worstStation, errors: P.errors.length});
}

async function checkGrounding(browser, seed) {
  const p = await open(browser, `seed=${encodeURIComponent(seed)}&quality=standard`, {width: 900, height: 560});
  const analytic = await p.evaluate(() => window.__SUMMERGLASS_TEST__.groundingProbe());
  const len = await p.evaluate(() => window.__SUMMERGLASS_PROOF__.route.lengthM);
  // The analytic probe asks a RECONSTRUCTION of the drawn surface. This walks the
  // route on both arms and fires real rays at the meshes in the scene, which is
  // the only ground a rider can stand on. Trees are only built where a band is
  // resident, so coverage is accumulated station by station and reported — a
  // count of what was actually tested, not a claim about what was not.
  const seen = new Set();
  let cast = 0, noHit = 0, floating = 0, buried = 0, maxAbove = -1e9, deepest = 0;
  let worstAbove = null, worstBelow = null, disagreeMax = 0, disagreeAt = null, analyticNull = 0;
  for (const arm of ['sun', 'moss']) {
    await p.evaluate(a => window.__SUMMERGLASS_TEST__.setBranch(a), arm);
    for (let g = 40; g < len - 40; g += 140) {
      await p.evaluate(x => window.__SUMMERGLASS_TEST__.warp(x), g);
      await p.waitForTimeout(70);
      const r = await p.evaluate(() => window.__SUMMERGLASS_TEST__.groundingCast());
      for (const id of r.ids) seen.add(id);
      cast += r.cast; noHit += r.noHit; floating += r.floating; buried += r.buried;
      if (r.maxAboveM !== null && r.maxAboveM > maxAbove) { maxAbove = r.maxAboveM; worstAbove = r.worstAbove; }
      if (r.deepestBelowM > deepest) { deepest = r.deepestBelowM; worstBelow = r.worstBelow; }
      if (r.analyticDisagreeMax > disagreeMax) { disagreeMax = r.analyticDisagreeMax; disagreeAt = r.analyticDisagreeAt; }
      analyticNull += r.analyticNull;
    }
  }
  await p.close();
  // Contact fails in two directions: a trunk above the drawn surface hovers, a
  // trunk far below it comes out of the ground with its root flare buried.
  record(`grounding/${seed}`,
    floating === 0 && maxAbove <= 0.05 && deepest <= 1.2 && noHit === 0,
    {distinctTreesRayTested: seen.size, raysCast: cast, plannedTrees: analytic.seated.plannedTotal,
     noGroundUnderTrunk: noHit,
     floating, maxAboveM: Math.round(maxAbove * 1000) / 1000, worstAbove,
     buriedOver0_9m: buried, deepestBelowDrawnM: deepest, worstBelow,
     // if this is not ~0 the analytic probe and the renderer disagree, and every
     // claim made from the analytic probe alone is worth exactly that much less
     analyticVsDrawnMaxDeltaM: disagreeMax, analyticVsDrawnAt: disagreeAt,
     analyticReturnedNoSurface: analyticNull,
     analyticProbeSaid: {sampled: analytic.sampled, floating: analytic.floating,
       maxAboveM: analytic.maxAboveM, deepestBelowDrawnM: analytic.deepestBelowDrawnM},
     seated: analytic.seated});
}

async function checkQuality(browser) {
  const seen = {}; const heights = {};
  for (const q of ['low', 'standard', 'high']) {
    const p = await open(browser, `seed=SUMMERGLASS-8421&quality=${q}`, {width: 900, height: 560});
    const P = await proof(p);
    const id = await p.evaluate(() => window.__SUMMERGLASS_TEST__.identityDigest());
    heights[q] = await p.evaluate(() => window.__SUMMERGLASS_TEST__.seatedHeights());
    await p.close();
    seen[q] = {plan: P.planHash, digest: P.planDigest64, realization: P.realizationHash,
               trees: P.counts.plannedTrees, unseatable: P.counts.unseatableTrees,
               clouds: P.counts.cloudFormations, life: P.life.planned,
               qualityReadsBeforePlan: P.qualityReadsBeforePlanFrozen,
               // per-tree, not per-count: position, family, scale and lean of every
               // tree in the world, hashed. Equal counts of different trees is not
               // the same world, and the count comparison could not tell them apart.
               treeIdentity: id.identity, seatedElevation: id.elevation};
  }
  const v = Object.values(seen);
  const samePlan = v.every(x => x.plan === v[0].plan && x.digest === v[0].digest);
  const sameIdentity = v.every(x => x.trees === v[0].trees && x.clouds === v[0].clouds &&
                                    x.life === v[0].life && x.unseatable === v[0].unseatable);
  const sameTrees = v.every(x => x.treeIdentity === v[0].treeIdentity);
  const realDiffers = new Set(v.map(x => x.realization)).size === 3;
  // Seated height is realization: a tree is lowered onto the surface the tier
  // actually draws, and coarser tiles draw a different surface. That difference
  // is legitimate and is therefore MEASURED and reported rather than asserted
  // away — but it is bounded, because a tier that moves a trunk by metres is not
  // drawing the same world at lower cost, it is drawing a different world.
  // Where the tree stands decides whether a difference in how high it stands is
  // visible. Inside the corridor's apron the rider looks straight at the contact
  // and a difference of half a metre is a tree in a different place; two hundred
  // metres out across the valley the same difference is below one pixel. The
  // assertion is therefore tight near the road and reported, not asserted, far
  // from it — and the far figure is printed so it can never be quietly ignored.
  const NEAR_M = 70;
  const base = heights.standard;
  const drift = {};
  let worstNear = 0, worstNearTier = null;
  for (const q of ['low', 'high']) {
    const nearD = [], farD = [];
    let atN = null, atF = null, mxN = 0, mxF = 0;
    for (let i = 0; i < base.length; i++) {
      const d = Math.abs(heights[q][i][0] - base[i][0]);
      if (base[i][1] <= NEAR_M) { nearD.push(d); if (d > mxN) { mxN = d; atN = {i, latM: base[i][1], deltaM: Math.round(d*100)/100}; } }
      else { farD.push(d); if (d > mxF) { mxF = d; atF = {i, latM: base[i][1], deltaM: Math.round(d*100)/100}; } }
    }
    // A single worst case is not a description of a distribution. Nearly every
    // tree sits where it sat; a two per cent tail moves because a coarser mesh
    // aliases a hard edge in the landform it is sampling. The gate is on the
    // ninety-ninth percentile so that tail cannot be waved through, and the
    // maximum is printed beside it so it cannot be hidden either.
    const q99 = a => { const x = a.slice().sort((u, v) => u - v);
      return x.length ? Math.round(x[Math.floor(x.length * 0.99)] * 100) / 100 : 0; };
    const q50 = a => { const x = a.slice().sort((u, v) => u - v);
      return x.length ? Math.round(x[Math.floor(x.length * 0.5)] * 100) / 100 : 0; };
    drift[q] = {near: {withinM: NEAR_M, trees: nearD.length, p50DeltaM: q50(nearD),
                       p99DeltaM: q99(nearD), maxDeltaM: Math.round(mxN * 100) / 100, at: atN,
                       treesOver0_25m: nearD.filter(d => d > 0.25).length},
                far: {trees: farD.length, p50DeltaM: q50(farD), p99DeltaM: q99(farD),
                      maxDeltaM: Math.round(mxF * 100) / 100, at: atF,
                      treesOver0_5m: farD.filter(d => d > 0.5).length}};
    if (drift[q].near.p99DeltaM > worstNear) { worstNear = drift[q].near.p99DeltaM; worstNearTier = q; }
  }
  // The bound the design can actually hold, stated rather than discovered after
  // the fact: half a metre at the ninety-ninth percentile within seventy metres
  // of the road. The median is zero — nearly every tree is in exactly the same
  // place at every tier — and the maximum is reported beside it, because a
  // percentile that passes while one tree has moved four metres is still a fact
  // the reader is entitled to. Low is the loose tier; high sits at twelve
  // centimetres.
  const heightsBounded = worstNear <= 0.5 && heights.low.length === base.length &&
                         heights.high.length === base.length;
  record('quality', samePlan && sameIdentity && sameTrees && realDiffers &&
    heightsBounded && v[0].qualityReadsBeforePlan === 0,
    {...seen, perTreeIdentityIdentical: sameTrees,
     seatedHeightDriftVsStandard: drift, worstNearDriftTier: worstNearTier,
     worstNearP99DriftM: worstNear,
     note: 'plan and per-tree identity must be identical across tiers; seated height is realization and is bounded, not asserted equal'});
}

async function checkSeed(browser, seed) {
  const a = await open(browser, `seed=${encodeURIComponent(seed)}&quality=standard`, {width: 900, height: 560});
  const A = await proof(a); const g = await a.evaluate(() => window.__SUMMERGLASS_TEST__.groundingProbe());
  await a.close();
  const b = await open(browser, `seed=${encodeURIComponent(seed)}&quality=standard`, {width: 900, height: 560});
  const B = await proof(b); await b.close();
  record(`seed/${seed}`,
    A.planHash === B.planHash && A.route.lengthM > 5700 && A.route.lengthM < 6800 &&
    A.route.maxGradePct <= 7.2 && A.assertions.roadContinuity && g.floating === 0 && A.errors.length === 0,
    {planHash: A.planHash, deterministic: A.planHash === B.planHash, lengthM: A.route.lengthM,
     ascentM: A.route.totalAscentM, rollers: A.route.rollerCount, maxGradePct: A.route.maxGradePct,
     forkSeparationM: A.route.forkMaxSeparationM, continuity: A.assertions.roadContinuity,
     floatingTrees: g.floating, errors: A.errors.length});
}

async function checkRide(browser, branch) {
  const p = await open(browser, 'seed=SUMMERGLASS-8421&quality=standard');
  await p.evaluate(() => window.__SUMMERGLASS_TEST__.fixedStep(0.34));
  // The ride is frame-limited, so the only honest way to bound it is wall clock
  // plus a no-progress check. Counting polls times out a slow rasteriser that is
  // riding perfectly well, which is a statement about the harness, not the world.
  const RIDE_DEADLINE = Number(process.env.RIDE_MAX_MIN || 90) * 60_000;
  const t0 = Date.now();
  let last = -1, stall = 0, timedOut = false;
  for (;;) {
    const s = await p.evaluate(() => {
      const T = window.__SUMMERGLASS_TEST__.state();
      return {g: T.g, committed: T.committed, ended: T.ended};
    });
    if (!s.committed) await p.evaluate(b => window.__SUMMERGLASS_TEST__.chooseBranch(b), branch);
    if (s.ended) break;
    if (Date.now() - t0 > RIDE_DEADLINE) { timedOut = true; break; }
    if (Math.abs(s.g - last) < 0.05 && s.g > 60) { if (++stall > 240) break; } else stall = 0;
    last = s.g;
    await p.waitForTimeout(250);
  }
  const P = await proof(p);
  const errs = p._errs;
  await p.close();
  record(`ride/${branch}`,
    P.run.completedContinuousRide && P.run.continuousRideEligible &&
    P.run.marks.rested && P.run.marks.rejoined && errs.length === 0,
    {provenance: P.run.provenance, completed: P.run.completedContinuousRide,
     maxStepM: P.run.maxStepM, stepCeilingM: P.run.stepCeilingM, stepOverruns: P.run.stepOverruns,
     harnessTimedOut: timedOut, minutes: Math.round((Date.now() - t0) / 6000) / 10,
     branchRidden: P.run.branchRidden, distanceM: P.run.distanceRiddenM,
     forkLegibleSeconds: P.run.seen.forkLegibleSeconds, seen: P.run.seen,
     marks: P.run.marks, peakCalls: P.run.peakDrawCalls, peakTriangles: P.run.peakTriangles,
     errors: errs.length});
}

// The geometry ceiling is a property of the world, not of a ride, so it is
// probed by walking the route at the most expensive tier and keeping the worst
// numbers seen. This traversal is warped on purpose: it is asking what is
// resident, not whether motion works, and the run it produces is marked
// `warped` and can never be quoted as a ride.
async function checkBudget(browser, quality) {
  const p = await open(browser, `seed=SUMMERGLASS-8421&quality=${quality}`, {width: 1600, height: 900});
  const len = await p.evaluate(() => window.__SUMMERGLASS_PROOF__.route.lengthM);
  let calls = 0, tris = 0, at = null;
  // `chooseBranch` only sets the choice a RIDE would resolve at the fork. This
  // sweep never rides through the fork — it warps — so both passes stayed on the
  // default arm and the sweep scanned one arm twice while reporting two. The arm
  // is now set outright, and each pass records the arm the world says it is on,
  // so a repeat cannot hide inside a loop that merely intended to change it.
  const armsProven = [];
  for (const arm of ['sun', 'moss']) {
    await p.evaluate(a => window.__SUMMERGLASS_TEST__.setBranch(a), arm);
    let armCalls = 0, armTris = 0;
    for (let g = 20; g < len - 20; g += 100) {
      await p.evaluate(x => window.__SUMMERGLASS_TEST__.warp(x), g);
      await p.waitForTimeout(90);
      const r = await p.evaluate(() => ({c: window.__SUMMERGLASS_PROOF__.render.drawCalls,
                                         t: window.__SUMMERGLASS_PROOF__.render.triangles,
                                         arm: window.__SUMMERGLASS_TEST__.state().branch}));
      if (r.arm !== arm) throw new Error(`budget: asked for ${arm}, world is on ${r.arm}`);
      if (r.c > armCalls) armCalls = r.c;
      if (r.t > armTris) armTris = r.t;
      if (r.c > calls) calls = r.c;
      if (r.t > tris) { tris = r.t; at = {arm, g}; }
    }
    armsProven.push({arm, peakDrawCalls: armCalls, peakTriangles: armTris});
  }
  const P = await proof(p);
  await p.close();
  const bothArms = armsProven.length === 2 &&
    armsProven[0].arm !== armsProven[1].arm &&
    armsProven.every(a => a.peakTriangles > 0);
  record(`budget/${quality}`, calls <= 115 && tris <= 360000 && bothArms && P.errors.length === 0,
    {peakDrawCalls: calls, peakTriangles: tris, worstAt: at, provenance: P.run.provenance,
     perArm: armsProven, bothArmsProven: bothArms, errors: P.errors.length});
}

// Frame time is a property of the whole route, not of the first two hundred
// metres of it. Standing at the gate for twenty seconds measured the opening
// chapter and nothing else — at a device pixel ratio of 1, because the page had
// never been asked for the 1.25 the standard tier actually ships. Both are fixed
// here: the route is ridden end to end, at the tier's own DPR, and the verdict is
// taken per chapter so one expensive chapter cannot hide inside a route-wide
// percentile.
async function checkPerf(browser) {
  const p = await open(browser, 'seed=SUMMERGLASS-8421&quality=standard',
    {width: 1600, height: 900}, Number(process.env.PERF_DPR || 1.25));
  const askedDpr = await p.evaluate(() => window.devicePixelRatio);
  // Accelerated, not warped: every metre is travelled and every frame rendered,
  // and the world's own per-frame step guard marks the run debug if the step ever
  // outruns the corridor's row spacing — so a ride that skipped terrain to go
  // faster cannot be quoted here.
  await p.evaluate(() => window.__SUMMERGLASS_TEST__.fixedStep(0.28));
  const DEADLINE = Number(process.env.PERF_MAX_MIN || 45) * 60_000;
  const t0 = Date.now();
  let last = -1, stall = 0, timedOut = false;
  for (;;) {
    const s = await p.evaluate(() => window.__SUMMERGLASS_TEST__.state());
    if (s.ended) break;
    if (Date.now() - t0 > DEADLINE) { timedOut = true; break; }
    if (Math.abs(s.g - last) < 0.05 && s.g > 60) { if (++stall > 240) break; } else stall = 0;
    last = s.g;
    await p.waitForTimeout(400);
  }
  const P = await proof(p);
  await p.close();
  const r = P.render;
  const geometry = Math.max(r.drawCalls, P.run.peakDrawCalls) <= 115 &&
                   Math.max(r.triangles, P.run.peakTriangles) <= 360000;
  const gov = r.dprGovernor || {held: true, rung: 0, stepCount: 0};
  const chapters = r.byChapter || {};
  const chapterNames = Object.keys(chapters);
  const plannedChapters = (P.chapters || []).map(c => c.name);
  const worstChapter = chapterNames.reduce((w, k) =>
    (w === null || chapters[k].p95 > chapters[w].p95) ? k : w, null);
  const detail = {renderer: r.renderer, software: r.softwareRenderer, viewport: r.viewport,
    devicePixelRatioRequested: askedDpr, dpr: r.dpr, dprCap: r.dprCap,
    dprHeld: gov.held, dprRung: gov.rung, dprSteps: gov.stepCount,
    routeRiddenM: P.run.distanceRiddenM, provenance: P.run.provenance,
    maxStepM: P.run.maxStepM, stepOverruns: P.run.stepOverruns,
    chaptersSampled: chapterNames.length, worstChapter,
    worstChapterP95Ms: worstChapter ? chapters[worstChapter].p95 : null,
    harnessTimedOut: timedOut,
    peakDrawCalls: Math.max(r.drawCalls, P.run.peakDrawCalls),
    peakTriangles: Math.max(r.triangles, P.run.peakTriangles),
    geometryWithinBudget: geometry, steady: r.steady, stallSamples: r.stallSamples,
    framePass: r.framePass, byChapter: chapters};
  // A route ridden at an accelerated step that outran its own guard is a debug
  // run, and a debug run is not evidence of anything.
  if (P.run.provenance === 'debug' || P.run.stepOverruns > 0) {
    return recordNoVerdict('perf', {...detail,
      note: `the traversal itself skipped terrain (${P.run.stepOverruns} frames over the ` +
            `${P.run.stepCeilingM} m ceiling, worst ${P.run.maxStepM} m). Not a measurement of this world.`});
  }
  // Every chapter, not most of them. A frame-time claim from part of the route is
  // not a claim about the route, and the chapter a run happens to skip is exactly
  // the chapter that would have failed.
  const missing = plannedChapters.filter(n => !chapters[n]);
  if (missing.length) {
    return recordNoVerdict('perf', {...detail, plannedChapters, missingChapters: missing,
      note: `${missing.length} of ${plannedChapters.length} chapters were never sampled ` +
            `(${missing.join(', ')}). The route was not ridden through.`});
  }
  // and the verdict is per chapter, so one expensive chapter cannot hide inside a
  // route-wide percentile
  const chapterFails = chapterNames.filter(k => chapters[k].p95 > 16.67 || chapters[k].fps < 55);
  // This check used to gate on geometry alone while printing a framePass of false
  // beside it, so the row read PASS on a software rasteriser that had measured
  // nothing of the kind. Frame time is now part of the verdict, and where frame
  // time cannot mean anything the row refuses to be a verdict at all.
  if (r.softwareRenderer) {
    return recordNoVerdict('perf', {...detail,
      note: `software renderer — geometry ${geometry ? 'within' : 'OVER'} budget; ` +
            'frame time measured but not evidence about hardware. Re-run on the target GPU.'});
  }
  // The world can now step its own resolution down to hold frame budget. That is
  // a legitimate way to reach sixty frames a second and an illegitimate way to
  // claim the tier's resolution was affordable, so the two outcomes get different
  // rows: a full pass only when budget was met at the tier's own device pixel
  // ratio, and a distinct row when it was met by spending pixels instead.
  if (geometry && r.framePass.ok === true && !gov.held) {
    return recordNoVerdict('perf', {...detail,
      note: `frame budget met, but only after the governor stepped device pixel ratio ` +
            `from ${r.dprCap} to ${r.dpr} (rung ${gov.rung}). The world runs; this GPU ` +
            `cannot hold the standard tier's resolution at 60fps.`});
  }
  record('perf', geometry && r.framePass.ok === true && chapterFails.length === 0,
    {...detail, plannedChapters, chaptersOverBudget: chapterFails});
}

const wanted = n => !ONLY || n.startsWith(ONLY);

const server = await serve();
const {chromium} = await import('playwright');
// CHROME_PATH lets you point at a Chromium you already have; otherwise
// Playwright's own download is used.
// The performance question can only be answered by the GPU the world is meant to run
// on, so the runner uses whatever GPU the machine has. SOFTWARE_GL=1 forces
// SwiftShader for environments that have no GPU at all — and then `perf` returns
// NO-VERDICT instead of a green row. Forcing software unconditionally, as this file
// used to, meant the performance check could never fail and never be true.
const SOFTWARE_GL = process.env.SOFTWARE_GL === '1';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage',
    ...(SOFTWARE_GL
      ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
      : ['--ignore-gpu-blocklist'])],
});
try {
  if (wanted('restart'))    for (const [l, g, twice] of [['early', 380, false], ['fork', 2300, false],
                                                         ['water', 4420, false], ['late', 6250, false],
                                                         ['double', 4420, true]])
                              await checkRestart(browser, l, g, twice);
  if (wanted('provenance')) await checkProvenance(browser);
  if (wanted('fork'))       for (const [s, q] of [['SUMMERGLASS-8421','low'],['SUMMERGLASS-8421','standard'],
                                                  ['SUMMERGLASS-8421','high'],['1189','low'],['1189','standard'],
                                                  ['777','standard'],['GLASSWOOD-42','standard']])
                              await checkFork(browser, s, q);
  if (wanted('road'))       for (const [s, q] of [['SUMMERGLASS-8421','standard'],['1189','low'],['1189','standard'],
                                                  ['777','standard'],['GLASSWOOD-42','standard']])
                              await checkRoad(browser, s, q);
  if (wanted('grounding'))  for (const s of SEEDS.slice(0, 3)) await checkGrounding(browser, s);
  if (wanted('quality'))    await checkQuality(browser);
  if (wanted('seeds'))      for (const s of SEEDS) await checkSeed(browser, s);
  if (wanted('ride'))       for (const b of ['sun', 'moss']) await checkRide(browser, b);
  if (wanted('budget'))     for (const q of ['standard', 'high']) await checkBudget(browser, q);
  if (wanted('perf'))       await checkPerf(browser);
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter(r => r.state === 'FAIL');
const noVerdict = results.filter(r => r.state === 'NO-VERDICT');
console.log(`\n${results.filter(r => r.state === 'PASS').length}/${results.length} passed` +
  (noVerdict.length ? `, ${noVerdict.length} no-verdict (${noVerdict.map(n => n.name).join(', ')})` : '') +
  (failed.length ? `, ${failed.length} failed` : ''));
if (noVerdict.length) console.log('NO VERDICT: ' + noVerdict.map(n => n.name).join(', ') +
  ' — ran cleanly but on hardware that cannot answer. Not a pass.');
if (failed.length) console.log('FAILED: ' + failed.map(f => f.name).join(', '));
// A NO-VERDICT is not a pass, so the process must not exit as though it were.
// An unanswered gate and a failed gate are different facts and get different
// codes, but neither is zero: zero means every gate was asked and every gate
// held, and nothing else may claim it.
if (failed.length) process.exitCode = 1;
else if (noVerdict.length) process.exitCode = 2;
