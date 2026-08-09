// Verification runner for Summerglass Island 01.
// Serves the shipped island-01.html and drives it in Chromium via Playwright.
//
//   node verify/island.mjs [--only=<prefix>]
//
// THREE_LOCAL: path to a local three@0.185.1 package dir; served in place of
// the CDN request without modifying the shipped file.
// CHROME_PATH: a Chromium executable to use instead of Playwright's download.
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join, extname} from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = Number(process.env.PORT || 8124);
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1];
const SHOTS = join(HERE, 'island-shots');
const MIME = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript'};

const serve = () => new Promise(res => {
  const s = createServer(async (req, rep) => {
    const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'island-01.html'
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
  await page.goto(`http://127.0.0.1:${PORT}/island-01.html?${query}`, {waitUntil: 'load'});
  await page.waitForFunction(() => !!window.__SUMMERGLASS_PROOF__, null, {timeout: 180000});
  await page.waitForTimeout(3000);
  page._errs = errs;
  return page;
}
const proof = page => page.evaluate(() => JSON.parse(JSON.stringify(window.__SUMMERGLASS_PROOF__)));

async function checkDeterminism() {
  const a = await open(browser, 'iseed=ISLE-8421&quality=standard', {width: 900, height: 560});
  const A = await proof(a); await a.close();
  const b = await open(browser, 'iseed=ISLE-8421&quality=standard', {width: 900, height: 560});
  const B = await proof(b); await b.close();
  record('determinism/repeat-load',
    A.planHash === B.planHash && A.realizationHash === B.realizationHash && A.errors.length === 0,
    {planA: A.planHash, planB: B.planHash, realA: A.realizationHash, realB: B.realizationHash});
}

async function checkTiers() {
  const seen = {};
  for (const q of ['low', 'standard', 'high']) {
    const p = await open(browser, `iseed=ISLE-8421&quality=${q}`, {width: 900, height: 560});
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
    const p = await open(browser, `iseed=ISLE-8421&quality=standard&heading=${h}&egrade=${g}`, {width: 900, height: 560});
    const P = await proof(p); await p.close();
    seen.push({h, g, plan: P.planHash, real: P.realizationHash, trees: P.counts.plannedTrees,
               excl: P.assertions.exclusionCorridorClear, errors: P.errors.length});
  }
  record('placement/plan-invariance',
    seen.every(x => x.plan === seen[0].plan && x.real === seen[0].real && x.trees === seen[0].trees &&
                    x.excl && x.errors === 0),
    seen);
}

async function ride(page, deadlineMin = 40) {
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
  const p = await open(browser, `iseed=ISLE-8421&quality=standard&heading=${h}&egrade=${g}`);
  const timedOut = await ride(p);
  const P = await proof(p);
  const errs = p._errs;
  await p.close();
  const A = P.assertions;
  record(`ride/${label}`,
    P.run.completedRide && !timedOut && errs.length === 0 &&
    A.entryGradeWithin2Pct && A.exitGradeWithin2Pct && A.headingWithin90Deg &&
    A.netElevationWithin40M && A.gradeCapKept && A.exclusionCorridorClear &&
    A.vocabularySubsetOfAllowlist && A.islandBudget && A.roadEdgeSupported &&
    P.run.seen.water && P.run.seen.sisters,
    {completed: P.run.completedRide, provenance: P.run.provenance, timedOut,
     distanceM: P.run.distanceRiddenM, seenWater: P.run.seen.water, seenSisters: P.run.seen.sisters,
     peakIslandCalls: P.render.peakIslandDrawCalls, peakIslandTris: P.render.peakIslandTriangles,
     assertions: Object.entries(A).filter(([k, v]) => v === false).map(([k]) => k),
     errors: errs.length});
}

async function checkDoubleRide() {
  // the same island, placed back to back: it will happen in a long journey
  const p = await open(browser, 'iseed=ISLE-8421&quality=standard&copies=2');
  const timedOut = await ride(p, 60);
  const P = await proof(p);
  const errs = p._errs;
  await p.close();
  record('ride/double',
    P.run.completedRide && !timedOut && errs.length === 0 && P.assertions.residencyIdentityStable,
    {completed: P.run.completedRide, timedOut, distanceM: P.run.distanceRiddenM,
     bandsRealized: P.residency.bandsRealizedTotal, bandsDisposed: P.residency.bandsDisposedTotal,
     errors: errs.length});
}

async function checkResidencyAndPause() {
  const p = await open(browser, 'iseed=ISLE-8421&quality=standard', {width: 900, height: 560});
  // residency identity: leave and re-enter
  const id = await p.evaluate(() => window.__SUMMERGLASS_TEST__.identityProbe);
  // pause: ambient continues. The world clock advances at most 50 ms per
  // rendered frame, so on a slow software rasteriser real seconds are not
  // world seconds — fix the timestep for this probe.
  await p.evaluate(() => window.__SUMMERGLASS_TEST__.warp(600));
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
    {exercised: P.run.pauseExercised, proven: P.run.ambientProvenWhilePaused});
  record('grounding', g.floating === 0 && g.maxAboveM <= 0.05,
    {sampled: g.sampled, floating: g.floating, maxAboveM: g.maxAboveM, worst: g.worst, seated: g.seated});
}

async function checkBudget(quality) {
  // Deterministic swept maximum, not a sample: fixed stations every 24 m from
  // g=40 to route end, rider camera posed analytically at each, residency
  // settled synchronously, maximum over the sweep. A visible-triangle count is
  // camera-dependent; only a stated sweep is comparable against a ceiling.
  const p = await open(browser, `iseed=ISLE-8421&quality=${quality}`, {width: 1440, height: 900});
  const r = await p.evaluate(() => window.__SUMMERGLASS_TEST__.budgetSweep(24));
  const r2 = await p.evaluate(() => window.__SUMMERGLASS_TEST__.budgetSweep(24));
  const P = await proof(p);
  await p.close();
  record(`budget/${quality}`,
    r.maxTris <= 120000 && r.maxCalls <= 45 && r.maxTris === r2.maxTris && P.errors.length === 0,
    {sweptMaxTriangles: r.maxTris, sweptMaxCalls: r.maxCalls, atG: r.atG,
     atYawRad: r.atYawRad, bearings: r.bearings,
     stations: r.stations, stepM: r.stepM, repeatIdentical: r.maxTris === r2.maxTris,
     renderer: P.render.renderer, software: P.render.softwareRenderer, errors: P.errors.length});
}

async function checkShots() {
  await mkdir(SHOTS, {recursive: true});
  const p = await open(browser, 'iseed=ISLE-8421&quality=standard');
  const entryG = await p.evaluate(() => window.__SUMMERGLASS_TEST__.state().entryAtG);
  const anchors = [
    ['entry', entryG - 12],
    ['rows', entryG + 470],
    ['pond', entryG + 985],
    ['headland', entryG + 1380],
    ['exit', entryG + 1985],
  ];
  for (const [name, g] of anchors) {
    await p.evaluate(x => window.__SUMMERGLASS_TEST__.warp(x), g);
    await p.waitForTimeout(2600);
    await p.screenshot({path: join(SHOTS, `${name}.png`)});
  }
  const P = await proof(p);
  await p.close();
  record('shots', P.errors.length === 0, {dir: SHOTS, count: anchors.length, errors: P.errors.length});
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
  if (wanted('residency') || wanted('pause') || wanted('grounding')) await checkResidencyAndPause();
  if (wanted('budget'))      for (const q of ['standard', 'high']) await checkBudget(q);
  if (wanted('ride'))        { await checkRide(0, 1.8, 'h0-up');
                               await checkRide(137, -1.6, 'h137-down');
                               await checkRide(262, 0.9, 'h262-up'); }
  if (wanted('ride'))        await checkDoubleRide();
  if (wanted('shots'))       await checkShots();
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.name).join(', ')); process.exitCode = 1; }
