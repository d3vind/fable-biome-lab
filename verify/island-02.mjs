// Verification runner for Summerglass Island 02 — The High Parting.
// Serves the shipped island-02.html and drives it in Chromium via Playwright.
//
//   node verify/island-02.mjs [--only=<prefix>]
//
// THREE_LOCAL: path to a local three@0.185.1 package dir; served in place of
// the CDN request without modifying the shipped file.
// CHROME_PATH: a Chromium executable to use instead of Playwright's download.
// RIDE_SIZE:   viewport for the ride checks (default 1000x640). The rides are
//              about whether the island can be ridden end to end, not about how
//              it looks; the screenshot set is what is captured at 1440x900.
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join, extname} from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = Number(process.env.PORT || 8126);
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1];
const SHOTS = join(HERE, 'island-02-shots');
const MIME = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript'};
const SEED = 'PARTING-3311';
const ALT_SEEDS = ['PARTING-3311', 'DOWNHEAD-51', 'WETHERBANK-7', 'COLDCOMB-2201'];
const RIDE_SIZE = (() => {
  const v = (process.env.RIDE_SIZE || '1000x640').split('x').map(Number);
  return {width: v[0] || 1000, height: v[1] || 640};
})();

const serve = () => new Promise(res => {
  const s = createServer(async (req, rep) => {
    const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'island-02.html'
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
  results.push({name, pass, detail});
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`);
};

const THREE_LOCAL = process.env.THREE_LOCAL;

async function open(browser, query, size = {width: 1440, height: 900}) {
  const page = await browser.newPage({viewport: size});
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
  await page.goto(`http://127.0.0.1:${PORT}/island-02.html?${query}`, {waitUntil: 'load'});
  await page.waitForFunction(() => !!window.__SUMMERGLASS_PROOF__, null, {timeout: 180000});
  await page.waitForTimeout(3000);
  page._errs = errs;
  return page;
}
const proof = page => page.evaluate(() => JSON.parse(JSON.stringify(window.__SUMMERGLASS_PROOF__)));

async function checkDeterminism() {
  const a = await open(browser, `iseed=${SEED}&quality=standard`, {width: 900, height: 560});
  const A = await proof(a); await a.close();
  const b = await open(browser, `iseed=${SEED}&quality=standard`, {width: 900, height: 560});
  const B = await proof(b); await b.close();
  record('determinism/repeat-load',
    A.planHash === B.planHash && A.realizationHash === B.realizationHash && A.errors.length === 0,
    {planA: A.planHash, planB: B.planHash, realA: A.realizationHash, realB: B.realizationHash});
}

async function checkTiers() {
  const seen = {};
  for (const q of ['low', 'standard', 'high']) {
    const p = await open(browser, `iseed=${SEED}&quality=${q}`, {width: 900, height: 560});
    const P = await proof(p); await p.close();
    seen[q] = {plan: P.planHash, real: P.realizationHash, trees: P.counts.plannedTrees,
               qReads: P.qualityReadsBeforePlanFrozen, pReads: P.placementReadsBeforePlanFrozen};
  }
  const v = Object.values(seen);
  record('tiers/plan-identity',
    v.every(x => x.plan === v[0].plan && x.trees === v[0].trees && x.qReads === 0 && x.pReads === 0) &&
    new Set(v.map(x => x.real)).size === 3,
    seen);
}

async function checkPlacements() {
  // the island must be the same island at any heading and any entry grade
  const seen = [];
  for (const [h, g] of [[0, 0], [137, 1.8], [262, -1.6]]) {
    const p = await open(browser, `iseed=${SEED}&quality=standard&heading=${h}&egrade=${g}`, {width: 900, height: 560});
    const P = await proof(p); await p.close();
    seen.push({h, g, plan: P.planHash, real: P.realizationHash, trees: P.counts.plannedTrees,
               excl: P.assertions.exclusionCorridorClear,
               noAbs: P.assertions.noAbsoluteWorldCoordinates,
               boundsOutside: P.localBounds.outside, errors: P.errors.length});
  }
  record('placement/plan-invariance',
    seen.every(x => x.plan === seen[0].plan && x.real === seen[0].real && x.trees === seen[0].trees &&
                    x.excl && x.noAbs && x.boundsOutside === 0 && x.errors === 0),
    seen);
}

async function ride(page, deadlineMin = 45) {
  await page.evaluate(() => window.__SUMMERGLASS_TEST__.fixedStep(0.34));
  const t0 = Date.now();
  let last = -1, stall = 0, timedOut = false;
  for (;;) {
    const s = await page.evaluate(() => window.__SUMMERGLASS_TEST__.state());
    if (s.ended) break;
    if (Date.now() - t0 > deadlineMin * 60000) { timedOut = true; break; }
    if (Math.abs(s.g - last) < 0.05 && s.g > 60) { if (++stall > 240) break; } else stall = 0;
    last = s.g;
    await page.waitForTimeout(250);
  }
  return timedOut;
}

async function checkRide(h, g, label) {
  const p = await open(browser, `iseed=${SEED}&quality=standard&heading=${h}&egrade=${g}`, RIDE_SIZE);
  const timedOut = await ride(p);
  const P = await proof(p);
  const errs = p._errs;
  await p.close();
  const A = P.assertions;
  record(`ride/${label}`,
    P.run.completedRide && !timedOut && errs.length === 0 &&
    A.entryGradeWithin2Pct && A.exitGradeWithin2Pct && A.headingWithin90Deg &&
    A.netElevationWithin40M && A.gradeCapKept && A.exclusionCorridorClear &&
    A.droveCorridorClear && A.vocabularySubsetOfAllowlist && A.islandBudget &&
    A.roadEdgeSupported && A.roadLeadsGround && A.landmarkRisesReadAsGround &&
    P.run.seen.parting && P.run.seen.thorns >= 2,
    {completed: P.run.completedRide, provenance: P.run.provenance, timedOut,
     distanceM: P.run.distanceRiddenM, marks: P.run.marks,
     seenParting: P.run.seen.parting, seenThorns: P.run.seen.thorns,
     longViewM: P.run.seen.longViewM,
     peakIslandCalls: P.render.peakIslandDrawCalls, peakIslandTris: P.render.peakIslandTriangles,
     assertions: Object.entries(A).filter(([k, v]) => v === false).map(([k]) => k),
     errors: errs.length});
}

async function checkDoubleRide() {
  // the same island, placed back to back: it will happen in a long journey
  const p = await open(browser, `iseed=${SEED}&quality=standard&copies=2`, RIDE_SIZE);
  const timedOut = await ride(p, 70);
  const P = await proof(p);
  const errs = p._errs;
  await p.close();
  record('ride/double',
    P.run.completedRide && !timedOut && errs.length === 0 && P.assertions.residencyIdentityStable,
    {completed: P.run.completedRide, timedOut, distanceM: P.run.distanceRiddenM,
     seenThorns: P.run.seen.thorns, seenParting: P.run.seen.parting,
     bandsRealized: P.residency.bandsRealizedTotal, bandsDisposed: P.residency.bandsDisposedTotal,
     peakIslandTris: P.render.peakIslandTriangles, errors: errs.length});
}

async function checkResidencyAndPause() {
  const p = await open(browser, `iseed=${SEED}&quality=standard`, {width: 900, height: 560});
  // residency identity: leave and re-enter
  const id = await p.evaluate(() => window.__SUMMERGLASS_TEST__.identityProbe);
  // pause: ambient continues. The world clock advances at most 50 ms per
  // rendered frame, so on a slow software rasteriser real seconds are not
  // world seconds — fix the timestep for this probe.
  await p.evaluate(() => window.__SUMMERGLASS_TEST__.warp(700));
  await p.evaluate(() => window.__SUMMERGLASS_TEST__.fixedStep(0.2));
  await p.waitForTimeout(800);
  await p.evaluate(() => window.__SUMMERGLASS_TEST__.pause(true));
  await p.waitForTimeout(4500);
  const P = await proof(p);
  const g = await p.evaluate(() => window.__SUMMERGLASS_TEST__.groundingProbe());
  await p.close();
  record('residency/identity', id.stable, {signature: (id.signature || '').slice(0, 60)});
  record('pause/ambient-continues',
    P.run.pauseExercised && P.run.ambientProvenWhilePaused,
    {exercised: P.run.pauseExercised, proven: P.run.ambientProvenWhilePaused,
     roster: P.ambientRoster.filter(r => r.clock === 'ambient-clock').map(r => r.name)});
  record('grounding', g.floating === 0 && g.maxAboveM <= 0.05,
    {sampled: g.sampled, floating: g.floating, maxAboveM: g.maxAboveM, worst: g.worst, seated: g.seated});
}

async function checkGround() {
  // Two questions the combe learned to ask of a surface, asked here of a
  // hillside instead of a fork: is there drawn ground everywhere, is any of it
  // drawn twice — and is the ground FUNCTION itself continuous, because a
  // discontinuity in the function is inherited by every mesh that samples it.
  const p = await open(browser, `iseed=${SEED}&quality=standard`, {width: 900, height: 560});
  const I = await p.evaluate(() => window.__SUMMERGLASS_TEST__.surfaceIntegrity(18, 560));
  // Continuity is asked at the resolution the ground is DRAWN at, not at an
  // arbitrary one: island tiles are sixteen metres, so a spike four metres wide
  // in the function is never emitted and measuring it measures nothing the
  // rider can see. The island's own authored land is the part gated; the host's
  // terrain beyond its reach is reported separately because it is the mount's,
  // not the island's, and it inherits the keeper's coarse route field along
  // with that field's seams.
  const W = await p.evaluate(() => {
    const T = window.__SUMMERGLASS_TEST__;
    const own = [], host = [];
    for (const s of [300, 510, 762, 1062, 1194, 1500]) {
      for (const dir of [1, -1]) {
        own.push(T.groundWalk(s, 60 * dir, 240 * dir, 16 * dir).maxStepM);
        host.push(T.groundWalk(s, 260 * dir, 900 * dir, 16 * dir).maxStepM);
      }
    }
    return {islandMaxStepM: Math.max.apply(null, own),
            hostMaxStepM: Math.max.apply(null, host), walks: own.length + host.length};
  });
  const B = await p.evaluate(() => window.__SUMMERGLASS_TEST__.localBounds());
  await p.close();
  record('ground/integrity',
    I.largestConnectedMiss <= 2 && I.maxSurfaceGapM <= 6.0,
    {...I});
  record('ground/continuity', W.islandMaxStepM <= 8.0,
    {...W, gate: 'island land only, <= 8 m per 16 m tile (a 27 degree facet)',
     hostNote: 'beyond the island reach the ground is the mount\'s; reported, not gated'});
  record('ground/local-frame-only', B.outside === 0, {...B});
}

async function checkBudget(quality, seed) {
  // Deterministic swept maximum, not a sample: fixed stations every 24 m from
  // g=40 to route end, the rider's camera posed analytically at each, residency
  // settled synchronously, maximum over the sweep. Seven bearings per station —
  // exactly the range a rider can hold, because the view this island is
  // composed around lives sixty degrees off the travel direction.
  const p = await open(browser, `iseed=${seed}&quality=${quality}`, {width: 1440, height: 900});
  const r = await p.evaluate(() => window.__SUMMERGLASS_TEST__.budgetSweep(24));
  const r2 = await p.evaluate(() => window.__SUMMERGLASS_TEST__.budgetSweep(24));
  const P = await proof(p);
  await p.close();
  record(`budget/${quality}/${seed}`,
    r.maxTris <= 120000 && r.maxCalls <= 45 && r.maxTris === r2.maxTris && P.errors.length === 0,
    {sweptMaxTriangles: r.maxTris, sweptMaxCalls: r.maxCalls, atG: r.atG,
     atYawRad: r.atYawRad, bearings: r.bearings, bearingSetDeg: r.bearingSetDeg,
     stations: r.stations, stepM: r.stepM, repeatIdentical: r.maxTris === r2.maxTris,
     planHash: P.planHash, renderer: P.render.renderer,
     software: P.render.softwareRenderer, errors: P.errors.length});
}

async function checkContract() {
  const p = await open(browser, `iseed=${SEED}&quality=standard`, {width: 900, height: 560});
  const P = await proof(p);
  await p.close();
  const C = P.contract, A = P.assertions, D = P.dreamyLuminance || {};
  record('contract/boundary',
    C.measuredLengthM >= 1800 && C.measuredLengthM <= 2200 &&
    Math.abs(C.declaredEntryPose.gradePct) <= 2 && Math.abs(C.declaredExitPose.gradePct) <= 2 &&
    Math.abs(C.totalHeadingChangeDeg) <= 90 && Math.abs(C.netElevationM) <= 40 &&
    C.maxGradePct <= 6.65 && A.landmarkRisesReadAsGround && A.deliberateSpacingKept &&
    D.sunBleachLift >= 0.10 && D.scrubFollowerLift >= 1.05 && D.crownFollowerLift >= 1.05 &&
    D.broadOctaveInvM === 0.026 && A.roadLeadsGround &&
    P.roadLeads.roadOverGroundMedian >= 1.25 && P.roadLeads.seamContrast >= 3.40,
    {lengthM: C.measuredLengthM, entry: C.declaredEntryPose, exit: C.declaredExitPose,
     netElevationM: C.netElevationM, headingDeg: C.totalHeadingChangeDeg,
     maxGradePct: C.maxGradePct, ascentM: C.ascentM, descentM: C.descentM,
     divideAspect: P.divide.aspectRatio, spacingM: P.thorns.minFormationSpacingM,
     vocabulary: P.vocabulary.used, unused: P.vocabulary.unused,
     roadLeads: P.roadLeads, dreamyLuminance: D,
     failing: Object.entries(A).filter(([k, v]) => v === false).map(([k]) => k)});
}

async function checkShots() {
  await mkdir(SHOTS, {recursive: true});
  const p = await open(browser, `iseed=${SEED}&quality=standard`);
  const st = await p.evaluate(() => window.__SUMMERGLASS_TEST__.state());
  const P0 = await proof(p);
  const E = st.entryAtG, drove = P0.parting.droveAtM, crest = P0.divide.crestCrossedAtM;
  const fall = P0.divide.fallSide, dside = P0.parting.droveSide;
  const anchors = [
    ['entry',       E - 14,            0],
    ['gate',        E + 210,           0],
    ['thin-ground', E + 470,           0],
    ['parting',     E + drove - 30,    0.5 * dside],
    ['wedge',       E + drove + 130,   0.75 * dside],
    ['crest',       E + crest,         0],
    ['brow',        E + crest + 240,   0.8 * fall],
    ['first-soil',  E + crest + 380,   0],
    ['exit',        E + 1862,          0],
  ];
  // the near thorn: the island's only vertical motif is small on purpose, and
  // a shot set that shows it only at ninety metres shows the claim without the
  // evidence for it
  const th = await p.evaluate(() => window.__SUMMERGLASS_TEST__.thornProbe());
  const near = th.filter(t => t.formation === 'wind-sisters').sort((a, b) => a.lateralM - b.lateralM)[0];
  if (near) anchors.push(['thorn-close', E + near.s - 34, 0]);
  for (const [name, g, yaw] of anchors) {
    await p.evaluate(x => window.__SUMMERGLASS_TEST__.warp(x), g);
    await p.waitForTimeout(2600);
    if (yaw) await p.evaluate(y => window.__SUMMERGLASS_TEST__.look(y), yaw);
    await p.waitForTimeout(700);
    await p.screenshot({path: join(SHOTS, `${name}.png`)});
    if (yaw) await p.evaluate(() => window.__SUMMERGLASS_TEST__.look(0));
  }
  const P = await proof(p);
  await p.close();
  // THE SEAM. A white line where two placements meet was visible at 1x to the
  // naked eye and had never been captured, because the shot set only ever
  // mounted one copy. It is captured now, from both sides, every run.
  const q = await open(browser, `iseed=${SEED}&quality=standard&copies=2`);
  const qs = await q.evaluate(() => window.__SUMMERGLASS_TEST__.state());
  const seam = await q.evaluate(() => window.__SUMMERGLASS_TEST__.seamProbe());
  const seamJoin = seam.find(b => b.to === 'island-copy-1');
  for (const [name, off] of [['seam-approach', -46], ['seam-on', -6], ['seam-past', 30]]) {
    await q.evaluate(x => window.__SUMMERGLASS_TEST__.warp(x), seamJoin.atG + off);
    await q.waitForTimeout(2600);
    await q.screenshot({path: join(SHOTS, `${name}.png`)});
  }
  const PQ = await proof(q);
  await q.close();
  // The seam is GATED, not merely reported. It shipped through four green
  // runs because the harness asked "does the double ride complete" and a rider
  // crosses a two-metre hole without failing to complete. Every boundary must
  // now close to within 5 cm at the emitted vertices or the run is red.
  const worstSeam = Math.max(...seam.map(b => b.vertexMaxGapM));
  record('shots', P.errors.length === 0 && PQ.errors.length === 0 && worstSeam <= 0.05,
    {dir: SHOTS, count: anchors.length + 3, seamAtG: seamJoin.atG,
     seamVertexGapM: seamJoin.vertexMaxGapM, worstBoundaryGapM: worstSeam,
     errors: P.errors.length + PQ.errors.length});
}

const wanted = n => !ONLY || n.startsWith(ONLY);

const server = await serve();
const {chromium} = await import('playwright');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  if (wanted('determinism')) await checkDeterminism();
  if (wanted('tiers'))       await checkTiers();
  if (wanted('placement'))   await checkPlacements();
  if (wanted('contract'))    await checkContract();
  if (wanted('ground'))      await checkGround();
  if (wanted('residency') || wanted('pause') || wanted('grounding')) await checkResidencyAndPause();
  if (wanted('budget')) {
    for (const s of ALT_SEEDS) await checkBudget('standard', s);
    for (const s of ALT_SEEDS.slice(0, 2)) await checkBudget('high', s);
  }
  if (wanted('ride'))        { await checkRide(0, 1.8, 'h0-up');
                               await checkRide(137, -1.6, 'h137-down');
                               await checkRide(262, 0.9, 'h262-up');
                               await checkDoubleRide(); }
  if (wanted('shots'))       await checkShots();
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter(r => !r.pass);
await writeFile(join(HERE, 'island-02-results.json'), JSON.stringify(results, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.name).join(', ')); process.exitCode = 1; }
