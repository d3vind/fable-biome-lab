// Diagnosis run for island 02. Measures causes; changes nothing.
//
//   node verify/island-02-diagnose.mjs
//
// Four questions, each of which has been answered wrongly at least once by
// looking at a symptom and reasoning backwards:
//   1. how much of the island reaches the common end of the turf transition
//   2. what is resident in the middle distance, in objects per km
//   3. what the far masses actually carry before fog and lighting
//   4. which COMMON_GLSL term owns the crest flank
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join, extname} from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PORT = Number(process.env.PORT || 8137);
const OUT = join(HERE, 'island-02-diagnose');
const MIME = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript'};
const THREE_LOCAL = process.env.THREE_LOCAL;

const serve = () => new Promise(res => {
  const s = createServer(async (req, rep) => {
    const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]) === '/' ? 'island-02.html' : req.url.split('?')[0]);
    try { const body = await readFile(p);
      rep.writeHead(200, {'content-type': MIME[extname(p)] || 'application/octet-stream'}); rep.end(body); }
    catch { rep.writeHead(404); rep.end('not found'); }
  });
  s.listen(PORT, () => res(s));
});

const server = await serve();
await mkdir(OUT, {recursive: true});
const {chromium} = await import('playwright');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
if (THREE_LOCAL) {
  await page.route('**/three@0.185.1/**', async route => {
    const url = route.request().url();
    const rel = url.split('three@0.185.1/')[1].split('?')[0];
    try { await route.fulfill({status: 200, contentType: 'text/javascript',
      body: await readFile(join(THREE_LOCAL, rel))}); } catch { await route.continue(); }
  });
}
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errs.push('console: ' + m.text()); });

await page.goto(`http://127.0.0.1:${PORT}/island-02.html?iseed=PARTING-3311&quality=standard`, {waitUntil: 'load'});
await page.waitForFunction(() => !!window.__SUMMERGLASS_PROOF__, null, {timeout: 240000});
await page.waitForTimeout(3000);

const report = {};
report.open     = await page.evaluate(() => window.__SUMMERGLASS_TEST__.openProbe());
report.density  = await page.evaluate(() => window.__SUMMERGLASS_TEST__.densityProbe());
report.farMass  = await page.evaluate(() => window.__SUMMERGLASS_TEST__.farMassProbe());
report.plan     = await page.evaluate(() => JSON.parse(JSON.stringify(window.__SUMMERGLASS_PLAN__)));

// --- term isolation at the crest -------------------------------------------
const st = await page.evaluate(() => window.__SUMMERGLASS_TEST__.state());
const crestG = st.entryAtG + report.plan.crestAtM;
const shots = [
  ['baseline',      [1, 1, 1], 1],
  ['rock-off',      [0, 1, 1], 1],
  ['comb-off',      [1, 0, 1], 1],
  ['distfade-off',  [1, 1, 0], 1],
  ['terracettes-off', [1, 1, 1], 0],
];
for (const [name, dbg, track] of shots) {
  await page.evaluate(g => window.__SUMMERGLASS_TEST__.warp(g), crestG);
  await page.evaluate(d => window.__SUMMERGLASS_TEST__.setDbg(d[0], d[1], d[2]), dbg);
  await page.evaluate(t => window.__SUMMERGLASS_TEST__.setTrack(t), track);
  await page.waitForTimeout(2600);
  await page.screenshot({path: join(OUT, `crest-${name}.png`)});
  console.log('captured', name, 'dbg', dbg, 'track', track);
}
report.crestG = crestG;
report.errors = errs;
await writeFile(join(OUT, 'diagnose.json'), JSON.stringify(report, null, 2));

console.log('\n--- OPEN (turf transition reach) ---');
console.log(JSON.stringify(report.open, null, 1).slice(0, 1400));
console.log('\n--- DENSITY BY DISTANCE BAND ---');
for (const b of report.density) console.log(' ', JSON.stringify(b));
console.log('\n--- FAR MASSES ---');
console.log(JSON.stringify(report.farMass, null, 1));
console.log('\nerrors:', errs.length);

await browser.close();
server.close();
