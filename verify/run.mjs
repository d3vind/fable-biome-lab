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
  results.push({name, pass, detail});
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${JSON.stringify(detail)}`);
};

// The page loads three.js from a CDN. In a sandbox without egress, point
// THREE_LOCAL at a local copy of the same pinned version and it is served in
// place of the CDN request — the shipped file is not modified either way.
const THREE_LOCAL = process.env.THREE_LOCAL;

async function open(browser, query, size = {width: 1600, height: 900}) {
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
  await p.evaluate(() => window.__SUMMERGLASS_TEST__.restart());
  await p.waitForTimeout(4000);
  if (twice) {
    await p.evaluate(() => window.__SUMMERGLASS_TEST__.restart());
    await p.waitForTimeout(4000);
  }
  const P = await proof(p), g = await p.evaluate(() => window.__SUMMERGLASS_TEST__.state().g);
  await p.close();
  const inherited = Math.max(P.run.ascentRiddenM, P.run.descentRiddenM);
  record(`restart/${label}`,
    g < 60 && inherited <= 1.5 && P.run.lifeFired === 0 && P.run.distanceRiddenM < 60 &&
    P.run.provenance !== 'warped' && P.errors.length === 0,
    {gAfter: Math.round(g), ascent: P.run.ascentRiddenM, descent: P.run.descentRiddenM,
     distanceRiddenM: P.run.distanceRiddenM, provenance: P.run.provenance,
     lifeFired: P.run.lifeFired, restarts: P.lifetime.restarts, errors: P.errors.length});
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
  const g = await p.evaluate(() => window.__SUMMERGLASS_TEST__.groundingProbe());
  await p.close();
  // Contact fails in two directions: a trunk above the drawn surface hovers, a
  // trunk far below it comes out of the ground with its root flare buried.
  record(`grounding/${seed}`,
    g.floating === 0 && g.maxAboveM <= 0.05 && g.deepestBelowDrawnM <= 1.2,
    {sampled: g.sampled, floating: g.floating, maxAboveM: g.maxAboveM,
     buriedOver0_9m: g.buriedOver0_9m, deepestBelowDrawnM: g.deepestBelowDrawnM,
     deepestAt: g.deepestAt, seated: g.seated});
}

async function checkQuality(browser) {
  const seen = {};
  for (const q of ['low', 'standard', 'high']) {
    const p = await open(browser, `seed=SUMMERGLASS-8421&quality=${q}`, {width: 900, height: 560});
    const P = await proof(p);
    await p.close();
    seen[q] = {plan: P.planHash, digest: P.planDigest64, realization: P.realizationHash,
               trees: P.counts.plannedTrees, unseatable: P.counts.unseatableTrees,
               clouds: P.counts.cloudFormations, life: P.life.planned,
               qualityReadsBeforePlan: P.qualityReadsBeforePlanFrozen};
  }
  const v = Object.values(seen);
  const samePlan = v.every(x => x.plan === v[0].plan && x.digest === v[0].digest);
  const sameIdentity = v.every(x => x.trees === v[0].trees && x.clouds === v[0].clouds &&
                                    x.life === v[0].life && x.unseatable === v[0].unseatable);
  const realDiffers = new Set(v.map(x => x.realization)).size === 3;
  record('quality', samePlan && sameIdentity && realDiffers && v[0].qualityReadsBeforePlan === 0, seen);
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
  for (const arm of ['sun', 'moss']) {
    await p.evaluate(a => window.__SUMMERGLASS_TEST__.chooseBranch(a), arm);
    for (let g = 20; g < len - 20; g += 100) {
      await p.evaluate(x => window.__SUMMERGLASS_TEST__.warp(x), g);
      await p.waitForTimeout(90);
      const r = await p.evaluate(() => ({c: window.__SUMMERGLASS_PROOF__.render.drawCalls,
                                         t: window.__SUMMERGLASS_PROOF__.render.triangles}));
      if (r.c > calls) calls = r.c;
      if (r.t > tris) { tris = r.t; at = {arm, g}; }
    }
  }
  const P = await proof(p);
  await p.close();
  record(`budget/${quality}`, calls <= 115 && tris <= 360000 && P.errors.length === 0,
    {peakDrawCalls: calls, peakTriangles: tris, worstAt: at, provenance: P.run.provenance,
     errors: P.errors.length});
}

async function checkPerf(browser) {
  const p = await open(browser, 'seed=SUMMERGLASS-8421&quality=standard');
  await p.waitForTimeout(20000);
  const P = await proof(p);
  await p.close();
  const r = P.render;
  record('perf', r.drawCalls <= 115 && r.triangles <= 360000,
    {renderer: r.renderer, software: r.softwareRenderer, viewport: r.viewport, dpr: r.dpr,
     drawCalls: r.drawCalls, triangles: r.triangles, steady: r.steady,
     stallSamples: r.stallSamples, framePass: r.framePass, byChapter: r.byChapter});
}

const wanted = n => !ONLY || n.startsWith(ONLY);

const server = await serve();
const {chromium} = await import('playwright');
// CHROME_PATH lets you point at a Chromium you already have; otherwise
// Playwright's own download is used.
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--disable-dev-shm-usage'],
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
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.name).join(', ')); process.exitCode = 1; }
