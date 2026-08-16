// Verification runner for Summerglass Island 03 — The Narrows.
// Serves the shipped island-03.html and drives it in Chromium via Playwright.
//
//   node verify/island-03.mjs [--only=<prefix>]
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
const PORT = Number(process.env.PORT || 8127);
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1];
const SHOTS = join(HERE, 'island-03-shots');
const MIME = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript'};
const SEED = 'NARROWS-2741';
const ALT_SEEDS = ['NARROWS-2741', 'CLOVENSTONE-88', 'DEFILE-517', 'THROATGATE-9'];
const RIDE_SIZE = (() => {
  const v = (process.env.RIDE_SIZE || '1000x640').split('x').map(Number);
  return {width: v[0] || 1000, height: v[1] || 640};
})();

const serve = () => new Promise(res => {
  const s = createServer(async (req, rep) => {
    const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'island-03.html'
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
  await page.goto(`http://127.0.0.1:${PORT}/island-03.html?${query}`, {waitUntil: 'load'});
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
               families: P.families,
               qReads: P.qualityReadsBeforePlanFrozen, pReads: P.placementReadsBeforePlanFrozen};
  }
  const v = Object.values(seen);
  record('tiers/plan-identity',
    v.every(x => x.plan === v[0].plan && x.trees === v[0].trees && x.qReads === 0 && x.pReads === 0 &&
                 JSON.stringify(x.families) === JSON.stringify(v[0].families)) &&
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

async function checkContract() {
  const p = await open(browser, `iseed=${SEED}&quality=standard`, {width: 900, height: 560});
  const P = await proof(p);
  await p.close();
  const C = P.contract, A = P.assertions, N = P.narrows, AP = P.aperture;
  const wantVocab = ['dappled-gate', 'fernfold-shaft', 'light-shaft', 'wind-sisters'];
  const vocabExact = JSON.stringify(P.vocabulary.used.slice().sort()) === JSON.stringify(wantVocab);
  record('contract/boundary',
    C.measuredLengthM >= 1500 && C.measuredLengthM <= 2500 &&
    Math.abs(C.declaredEntryPose.gradePct) <= 0.8 && Math.abs(C.declaredExitPose.gradePct) <= 0.8 &&
    Math.abs(C.totalHeadingChangeDeg) <= 90 && Math.abs(C.netElevationM) <= 6 &&
    C.maxGradePct <= 3.0 && A.effectivelyFlat,
    {lengthM: C.measuredLengthM, entry: C.declaredEntryPose, exit: C.declaredExitPose,
     netElevationM: C.netElevationM, headingDeg: C.totalHeadingChangeDeg,
     maxGradePct: C.maxGradePct, ascentM: C.ascentM, descentM: C.descentM});
  record('contract/narrows',
    A.skySlotAtThroat && A.wallsReadAsGround && A.releaseIsQuick && A.endsHandOverOpen &&
    A.committedBlind && A.throatClearance,
    {peakMinSideDeg: AP.peakMinSideDeg, sustained40M: AP.sustained40M,
     releaseRunM: AP.releaseRunM, entryMaxDeg: AP.entryMaxDeg, exitMaxDeg: AP.exitMaxDeg,
     blindForwardM: N.throatBlindForwardM, mouthRevealAtM: N.mouthRevealAtM,
     minClearanceAt2mM: N.minClearanceAt2mM,
     wallRuns: N.walls.measuredRuns});
  record('contract/road-leads',
    A.roadLeadsEveryMovement && A.roadContrastPass && P.roadLeads.seamContrast >= 3.40,
    {seamContrast: P.roadLeads.seamContrast, worstMovementRatio: P.roadLeads.worstMovementRatio,
     byMovement: P.roadLeads.byMovement.map(m => [m.movement, m.ratioMedian])});
  record('contract/families-and-vocabulary',
    A.eightFamilies && A.vocabularySubsetOfAllowlist && vocabExact && A.deliberateSpacingKept,
    {families: P.families, used: P.vocabulary.used, unused: P.vocabulary.unused,
     spacingM: P.sisters.minFormationSpacingM,
     failing: Object.entries(A).filter(([k, v]) => v === false).map(([k]) => k)});
}

async function checkGround() {
  const p = await open(browser, `iseed=${SEED}&quality=standard`, {width: 900, height: 560});
  const I = await p.evaluate(() => window.__SUMMERGLASS_TEST__.surfaceIntegrity(18, 560));
  // Continuity is asked at the resolution the ground is DRAWN at. The walls
  // live inside the corridor apron and are drawn by 1-3 m columns, so they
  // are not walked here; the massif top and the open flanks are, at the tile
  // grid's own 16 m. Beyond the island's reach the ground is the mount's,
  // reported and not gated.
  const W = await p.evaluate(() => {
    const T = window.__SUMMERGLASS_TEST__;
    const own = [], host = [];
    for (const s of [300, 560, 830, 990, 1200, 1600]) {
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
    {...W, gate: 'island land outside the wall corridor, <= 8 m per 16 m tile',
     hostNote: 'beyond the island reach the ground is the mount\'s; reported, not gated'});
  record('ground/local-frame-only', B.outside === 0, {...B});
}

async function checkResidencyAndPause() {
  const p = await open(browser, `iseed=${SEED}&quality=standard`, {width: 900, height: 560});
  const id = await p.evaluate(() => window.__SUMMERGLASS_TEST__.identityProbe);
  // pause probe held in the throat itself: the daws must keep working the
  // wall while the rider stands in the slot
  await p.evaluate(() => window.__SUMMERGLASS_TEST__.warp(1270));
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

async function checkBudget(quality, seed) {
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
    A.effectivelyFlat && A.headingWithin90Deg && A.gradeCapKept &&
    A.exclusionCorridorClear && A.vocabularySubsetOfAllowlist && A.islandBudget &&
    A.roadEdgeSupported && A.roadLeadsEveryMovement && A.skySlotAtThroat &&
    A.wallsReadAsGround && A.committedBlind &&
    P.run.marks.committed && P.run.marks.throated && P.run.marks.released &&
    P.run.seen.sisters >= 2 && P.run.seen.throatFrames > 50,
    {completed: P.run.completedRide, provenance: P.run.provenance, timedOut,
     distanceM: P.run.distanceRiddenM, marks: P.run.marks,
     sistersSeen: P.run.seen.sisters, throatFrames: P.run.seen.throatFrames,
     poolSeen: P.run.seen.poolSeen, releaseForwardM: P.run.seen.releaseForwardM,
     peakIslandCalls: P.render.peakIslandDrawCalls, peakIslandTris: P.render.peakIslandTriangles,
     assertions: Object.entries(A).filter(([k, v]) => v === false).map(([k]) => k),
     errors: errs.length});
}

async function checkDoubleRide() {
  const p = await open(browser, `iseed=${SEED}&quality=standard&copies=2`, RIDE_SIZE);
  const timedOut = await ride(p, 70);
  const P = await proof(p);
  const errs = p._errs;
  await p.close();
  record('ride/double',
    P.run.completedRide && !timedOut && errs.length === 0 && P.assertions.residencyIdentityStable,
    {completed: P.run.completedRide, timedOut, distanceM: P.run.distanceRiddenM,
     sistersSeen: P.run.seen.sisters,
     bandsRealized: P.residency.bandsRealizedTotal, bandsDisposed: P.residency.bandsDisposedTotal,
     peakIslandTris: P.render.peakIslandTriangles, errors: errs.length});
}

async function checkShots() {
  await mkdir(SHOTS, {recursive: true});
  const p = await open(browser, `iseed=${SEED}&quality=standard`);
  const st = await p.evaluate(() => window.__SUMMERGLASS_TEST__.state());
  const P0 = await proof(p);
  const E = st.entryAtG, N = P0.narrows;
  const pool = P0.lightPools.length ? P0.lightPools[0].atM : N.throatAtM - 60;
  const anchors = [
    ['approach',     E - 70,               0],
    ['gate',         E + 205,              0],
    ['gather',       E + 560,              0],
    ['commit',       E + N.commitAtM + 170, 0],
    ['throat-entry', E + N.holdFromM + 50, 0],
    ['pool',         E + pool - 45,        0],
    ['throat',       E + N.throatAtM - 5,  0],
    ['throat-wall',  E + N.throatAtM - 5,  0.75],
    ['late-hold',    E + N.releaseFromM - 80, 0],
    ['release',      E + N.releaseFromM + 35, 0],
    ['mouth',        E + N.releasedByM - 30,  0],
    ['open',         E + 1700,             0],
    ['exit',         E + 2010,             0],
  ];
  for (const [name, g, yaw] of anchors) {
    await p.evaluate(x => window.__SUMMERGLASS_TEST__.warp(x), g);
    await p.waitForTimeout(2600);
    if (yaw) await p.evaluate(y => window.__SUMMERGLASS_TEST__.look(y), yaw);
    await p.waitForTimeout(700);
    await p.screenshot({path: join(SHOTS, `${name}.png`)});
    if (yaw) await p.evaluate(() => window.__SUMMERGLASS_TEST__.look(0));
  }
  // the throat's sky, looked at: the slot is the composition and the shot
  // set must contain the view that proves it is a slot
  await p.evaluate(x => window.__SUMMERGLASS_TEST__.warp(x), E + N.throatAtM - 5);
  await p.waitForTimeout(2600);
  await p.evaluate(() => window.__SUMMERGLASS_TEST__.look(0, 0.36));
  await p.waitForTimeout(700);
  await p.screenshot({path: join(SHOTS, 'throat-sky.png')});
  await p.evaluate(() => window.__SUMMERGLASS_TEST__.look(0, 0));
  const P = await proof(p);
  await p.close();
  // THE SEAM: both mounts, gated at the emitted vertices
  const q = await open(browser, `iseed=${SEED}&quality=standard&copies=2`);
  const seam = await q.evaluate(() => window.__SUMMERGLASS_TEST__.seamProbe());
  const seamJoin = seam.find(b => b.to === 'island-copy-1');
  for (const [name, off] of [['seam-approach', -46], ['seam-on', -6], ['seam-past', 30]]) {
    await q.evaluate(x => window.__SUMMERGLASS_TEST__.warp(x), seamJoin.atG + off);
    await q.waitForTimeout(2600);
    await q.screenshot({path: join(SHOTS, `${name}.png`)});
  }
  const PQ = await proof(q);
  await q.close();
  const worstSeam = Math.max(...seam.map(b => b.vertexMaxGapM));
  record('shots', P.errors.length === 0 && PQ.errors.length === 0 && worstSeam <= 0.05,
    {dir: SHOTS, count: anchors.length + 4, seamAtG: seamJoin.atG,
     seamVertexGapM: seamJoin.vertexMaxGapM, worstBoundaryGapM: worstSeam,
     errors: P.errors.length + PQ.errors.length});
}

// The moving sequence. Compression is a temporal effect: a frame at 150 m
// and a ride at 30 km/h disagree, and both are true — so the delivery
// includes a continuously ridden pass through entry, throat and release,
// captured every ~40 m with no warp anywhere in the run. Provenance stays
// 'accelerated': every metre travelled, every frame rendered.
async function checkRideSequence() {
  const dir = join(SHOTS, 'ride-seq');
  await mkdir(dir, {recursive: true});
  const p = await open(browser, `iseed=${SEED}&quality=standard`, {width: 1280, height: 720});
  await p.evaluate(() => window.__SUMMERGLASS_TEST__.fixedStep(0.34));
  const manifest = [];
  let next = 160;
  const t0 = Date.now();
  let timedOut = false;
  for (;;) {
    const s = await p.evaluate(() => window.__SUMMERGLASS_TEST__.state());
    if (s.g >= next) {
      const name = `seq-${String(Math.round(next)).padStart(4, '0')}.png`;
      await p.screenshot({path: join(dir, name)});
      manifest.push({file: name, atG: Math.round(s.g), islandS: s.islandS, movement: s.movement});
      next += 40;
    }
    if (next > 1900) break;
    if (Date.now() - t0 > 30 * 60000) { timedOut = true; break; }
    await p.waitForTimeout(120);
  }
  const P = await proof(p);
  await p.close();
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  record('ride-sequence',
    !timedOut && manifest.length >= 40 && P.run.provenance === 'accelerated' &&
    P.run.marks.committed && P.run.marks.throated && P.run.marks.released && P.errors.length === 0,
    {frames: manifest.length, dir, provenance: P.run.provenance,
     marks: P.run.marks, timedOut, errors: P.errors.length});
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
  if (wanted('budget-std'))  for (const s of ALT_SEEDS) await checkBudget('standard', s);
  if (wanted('budget-high')) for (const s of ALT_SEEDS.slice(0, 2)) await checkBudget('high', s);
  if (wanted('ride-h0'))     await checkRide(0, 1.8, 'h0-up');
  if (wanted('ride-h137'))   await checkRide(137, -1.6, 'h137-down');
  if (wanted('ride-h262'))   await checkRide(262, 0.9, 'h262-up');
  if (wanted('ride-double')) await checkDoubleRide();
  if (wanted('shots'))       await checkShots();
  if (wanted('seq'))         await checkRideSequence();
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter(r => !r.pass);
await writeFile(join(HERE, 'island-03-results.json'), JSON.stringify(results, null, 1));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.name).join(', ')); process.exitCode = 1; }
