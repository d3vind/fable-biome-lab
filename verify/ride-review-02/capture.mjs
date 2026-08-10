// Taste-review capture driver for Summerglass Island 02.
//
// This file never edits either island HTML document. The local server adds a
// read-only metadata hook to the response so matched sun/camera framing can be
// calculated, and Playwright adds a manual requestAnimationFrame scheduler so
// every video frame is one sequential rendered world frame.
//
// Usage:
//   node verify/ride-review-02/capture.mjs --probe
//   node verify/ride-review-02/capture.mjs --stills
//   node verify/ride-review-02/capture.mjs --video=full
//   node verify/ride-review-02/capture.mjs --video=double
//
// Environment:
//   CAPTURE_RENDERER=auto|metal|swiftshader   default auto
//   CHROME_PATH=/path/to/Chromium             default system Chrome
//   PYTHON=/path/to/python3                    Pillow-capable Python
//   OPEN_1=station:yaw ... OPEN_4=station:yaw override open-item framing

import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {access, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import {dirname, extname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {spawn} from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = HERE;
const RAW = join(OUT, '_raw');
const META_PATH = join(OUT, 'capture-metadata.json');
const PORT = Number(process.env.PORT || 8142);
const SEED_02 = 'PARTING-3311';
const SEED_01 = 'ISLE-8421';
const QUALITY = 'standard';
const STILL_SIZE = {width: 1440, height: 900};
const VIDEO_SIZE = {width: 1280, height: 720};
const FRAME_MS = 50;
const FPS = 1000 / FRAME_MS;
const CHROME_PATH = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PYTHON = process.env.PYTHON || '/Users/devin/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';

const args = new Set(process.argv.slice(2));
const videoArg = process.argv.find(arg => arg.startsWith('--video='));

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function findPlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch {}
  const explicit = process.env.PLAYWRIGHT_ROOT;
  if (explicit) return require(explicit);
  const base = '/Users/devin/.npm/_npx';
  const entries = (await readdir(base)).sort().reverse();
  for (const entry of entries) {
    const candidate = join(base, entry, 'node_modules/playwright');
    try {
      await access(join(candidate, 'package.json'), fsConstants.R_OK);
      return require(candidate);
    } catch {}
  }
  throw new Error('Playwright not found. Run the repository verification prerequisite first.');
}

function injectReadOnlyCaptureHook(source) {
  const marker = '</script>';
  const at = source.lastIndexOf(marker);
  if (at < 0) throw new Error('island document has no module script terminator');
  const hook = `\n// capture-only read surface; no scene value is changed\n` +
    `Object.defineProperty(window,'__RIDE_REVIEW_INTERNAL__',{value:{\n` +
    `  meta(){ return {sunAzRad:sunAz,sunElRad:sunEl,islandLengthM:LFRAME.len,\n` +
    `    entryAtG:ISLAND_SEGS[0].g0,exitAtG:ISLAND_SEGS[ISLAND_SEGS.length-1].g1}; },\n` +
    `  localHeadingAt(s){const f=getFrame(LFRAME,clamp(s,0,LFRAME.len-1));return Math.atan2(f.tx,f.tz);}\n` +
    `},enumerable:false,configurable:false,writable:false});\n`;
  return source.slice(0, at) + hook + source.slice(at);
}

const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript'};
async function serve() {
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${PORT}`).pathname);
    const rel = pathname === '/' ? 'island-02.html' : pathname.replace(/^\/+/, '');
    const path = resolve(ROOT, rel);
    if (!path.startsWith(ROOT + '/') && path !== ROOT) {
      res.writeHead(403); res.end('forbidden'); return;
    }
    try {
      let body = await readFile(path);
      if (rel === 'island-01.html' || rel === 'island-02.html') {
        body = Buffer.from(injectReadOnlyCaptureHook(body.toString('utf8')));
      }
      res.writeHead(200, {'content-type': MIME[extname(path)] || 'application/octet-stream'});
      res.end(body);
    } catch (error) {
      res.writeHead(404); res.end(`not found: ${error.message}`);
    }
  });
  await new Promise(resolveListen => server.listen(PORT, '127.0.0.1', resolveListen));
  return server;
}

function launchArgs(mode) {
  if (mode === 'swiftshader') {
    return ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      '--no-sandbox', '--disable-dev-shm-usage'];
  }
  if (mode === 'metal') {
    return ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--no-sandbox', '--disable-dev-shm-usage'];
  }
  return ['--enable-gpu', '--no-sandbox', '--disable-dev-shm-usage'];
}

async function launchBrowser(chromium, mode) {
  return chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: launchArgs(mode),
  });
}

async function addManualFrameClock(context) {
  await context.addInitScript(() => {
    let nowMs = 0;
    let nextId = 1;
    const pending = new Map();
    const raf = callback => { const id = nextId++; pending.set(id, callback); return id; };
    const caf = id => pending.delete(id);
    Object.defineProperty(window, 'requestAnimationFrame', {value: raf, configurable: true});
    Object.defineProperty(window, 'cancelAnimationFrame', {value: caf, configurable: true});
    Object.defineProperty(window, '__RIDE_REVIEW_STEP__', {value: stepMs => {
      nowMs += Number(stepMs) || 0;
      const jobs = [...pending.values()];
      pending.clear();
      for (const callback of jobs) callback(nowMs);
      return {callbacks: jobs.length, nowMs, pending: pending.size};
    }});
  });
}

async function openPage(browser, islandFile, query, size, manual = true) {
  const context = await browser.newContext({viewport: size, deviceScaleFactor: 1});
  if (manual) await addManualFrameClock(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('404')) errors.push(`console: ${message.text()}`);
  });
  await page.goto(`http://127.0.0.1:${PORT}/${islandFile}?${query}`, {waitUntil: 'load', timeout: 240000});
  await page.waitForFunction(() => Boolean(window.__SUMMERGLASS_PROOF__ && window.__RIDE_REVIEW_INTERNAL__),
    null, {timeout: 240000, polling: 100});
  if (manual) {
    await page.evaluate(step => window.__SUMMERGLASS_TEST__.fixedStep(step), FRAME_MS / 1000);
    for (let i = 0; i < 24; i++) await stepFrame(page);
  } else {
    await page.waitForTimeout(2500);
  }
  return {page, context, errors};
}

async function stepFrame(page) {
  const result = await page.evaluate(ms => window.__RIDE_REVIEW_STEP__(ms), FRAME_MS);
  if (result.callbacks < 1) throw new Error(`manual frame step had ${result.callbacks} callbacks`);
  return result;
}

async function snapshotState(page) {
  return page.evaluate(() => ({
    state: window.__SUMMERGLASS_TEST__.state(),
    proof: JSON.parse(JSON.stringify(window.__SUMMERGLASS_PROOF__)),
    internal: window.__RIDE_REVIEW_INTERNAL__.meta(),
  }));
}

async function rendererProbe(chromium) {
  const modes = process.env.CAPTURE_RENDERER ? [process.env.CAPTURE_RENDERER] : ['metal', 'auto', 'swiftshader'];
  const results = [];
  for (const mode of modes) {
    let browser;
    try {
      browser = await launchBrowser(chromium, mode);
      const opened = await openPage(browser, 'island-02.html', `iseed=${SEED_02}&quality=${QUALITY}`, {width: 900, height: 560});
      const snap = await snapshotState(opened.page);
      results.push({mode, renderer: snap.proof.render.renderer, vendor: snap.proof.render.vendor,
        software: snap.proof.render.softwareRenderer, errors: opened.errors});
      await opened.context.close();
    } catch (error) {
      results.push({mode, error: error.message});
    } finally {
      if (browser) await browser.close();
    }
  }
  console.log(JSON.stringify(results, null, 2));
  return results;
}

function parseOpenSpec(number, fallbackStation, fallbackYaw) {
  const raw = process.env[`OPEN_${number}`];
  if (!raw) return {stationM: fallbackStation, yawRad: fallbackYaw};
  const [station, yaw] = raw.split(':').map(Number);
  if (!Number.isFinite(station) || !Number.isFinite(yaw)) throw new Error(`invalid OPEN_${number}: ${raw}`);
  return {stationM: station, yawRad: yaw};
}

async function captureAt(page, entryAtG, stationM, yawRad, path) {
  await page.evaluate(({g, yaw}) => {
    const test = window.__SUMMERGLASS_TEST__;
    test.warp(g);
    test.pause(true);
    if (test.look) test.look(yaw, 0);
  }, {g: entryAtG + stationM, yaw: yawRad});
  for (let i = 0; i < 8; i++) await stepFrame(page);
  await page.screenshot({path, type: 'png'});
  return snapshotState(page);
}

async function captureStills(browser) {
  await rm(RAW, {recursive: true, force: true});
  await mkdir(RAW, {recursive: true});
  const opened = await openPage(browser, 'island-02.html', `iseed=${SEED_02}&quality=${QUALITY}&heading=0`, STILL_SIZE);
  const first = await snapshotState(opened.page);
  const entry = first.internal.entryAtG;
  const length = first.internal.islandLengthM;
  const crest = first.proof.divide.crestCrossedAtM;
  const fallSide = first.proof.divide.fallSide;
  const stationValues = [];
  for (let station = 0; station <= Math.floor(length / 100) * 100; station += 100) stationValues.push(station);
  if (Math.abs(stationValues.at(-1) - length) > 1) stationValues.push(Math.round(length));
  for (const station of stationValues) {
    console.log(`still station ${station} m`);
    await captureAt(opened.page, entry, station, 0, join(RAW, `station-${String(station).padStart(4, '0')}.png`));
  }

  const openSpecs = [
    {...parseOpenSpec(1, 470, 0), item: 1,
      caption: 'Open 1 — mid-distance element scale: stone runs emit at 30–100 m but do not read. Look beyond both verges for pale marks that collapse into ground noise.'},
    {...parseOpenSpec(2, crest + 240, 0.80 * fallSide), item: 2,
      caption: 'Open 2 — far-mass volume: horizon forms read as flat slabs with hard cut edges. Look across the falling-side horizon.'},
    {...parseOpenSpec(3, crest, 0), item: 3,
      caption: 'Open 3 — crest flank: brown non-periodic smear at grazing incidence. Look along the near flank beside the road.'},
    {...parseOpenSpec(4, crest + 380, 0), item: 4,
      caption: 'Open 4 — tree palette: vegetation keeps the bright lime palette after the turf shifts muted/brown. Compare crowns with the ground carrying them.'},
  ];
  for (const spec of openSpecs) {
    console.log(`open ${spec.item}: ${Math.round(spec.stationM)} m yaw ${spec.yawRad.toFixed(2)}`);
    await captureAt(opened.page, entry, spec.stationM, spec.yawRad, join(RAW, `open-${spec.item}.png`));
  }
  const baseRenderer = (await snapshotState(opened.page)).proof.render;
  const pageErrors = [...opened.errors];
  await opened.context.close();

  const headingStationM = Math.round(crest + 240);
  const headings = [0, 137, 262];
  for (const heading of headings) {
    const h = await openPage(browser, 'island-02.html', `iseed=${SEED_02}&quality=${QUALITY}&heading=${heading}`, STILL_SIZE);
    const hs = await snapshotState(h.page);
    await captureAt(h.page, hs.internal.entryAtG, headingStationM, 0.80 * hs.proof.divide.fallSide,
      join(RAW, `heading-${heading}.png`));
    pageErrors.push(...h.errors);
    await h.context.close();
  }

  const compareStationM = 900;
  const probe01 = await openPage(browser, 'island-01.html', `iseed=${SEED_01}&quality=${QUALITY}&heading=0`, STILL_SIZE);
  const meta01AtZero = await snapshotState(probe01.page);
  const probe02 = await openPage(browser, 'island-02.html', `iseed=${SEED_02}&quality=${QUALITY}&heading=0`, STILL_SIZE);
  const meta02AtZero = await snapshotState(probe02.page);
  const headingsAtStation = await Promise.all([
    probe01.page.evaluate(s => window.__RIDE_REVIEW_INTERNAL__.localHeadingAt(s), compareStationM),
    probe02.page.evaluate(s => window.__RIDE_REVIEW_INTERNAL__.localHeadingAt(s), compareStationM),
  ]);
  await probe01.context.close();
  await probe02.context.close();
  const rel02 = meta02AtZero.internal.sunAzRad - headingsAtStation[1];
  let heading01Rad = meta01AtZero.internal.sunAzRad - headingsAtStation[0] - rel02;
  heading01Rad = Math.atan2(Math.sin(heading01Rad), Math.cos(heading01Rad));
  const heading01Deg = heading01Rad * 180 / Math.PI;

  const compare01 = await openPage(browser, 'island-01.html',
    `iseed=${SEED_01}&quality=${QUALITY}&heading=${heading01Deg}`, STILL_SIZE);
  const compare01Meta = await snapshotState(compare01.page);
  await captureAt(compare01.page, compare01Meta.internal.entryAtG, compareStationM, 0,
    join(RAW, 'compare-01.png'));
  pageErrors.push(...compare01.errors);
  await compare01.context.close();
  const compare02 = await openPage(browser, 'island-02.html',
    `iseed=${SEED_02}&quality=${QUALITY}&heading=0`, STILL_SIZE);
  const compare02Meta = await snapshotState(compare02.page);
  await captureAt(compare02.page, compare02Meta.internal.entryAtG, compareStationM, 0,
    join(RAW, 'compare-02.png'));
  pageErrors.push(...compare02.errors);
  await compare02.context.close();

  const metadata = {
    seed: SEED_02,
    island01Seed: SEED_01,
    quality: QUALITY,
    renderer: baseRenderer.renderer,
    vendor: baseRenderer.vendor,
    softwareRenderer: baseRenderer.softwareRenderer,
    stillViewport: STILL_SIZE,
    islandLengthM: length,
    stationValues,
    openSpecs,
    headings: {valuesDeg: headings, stationM: headingStationM, yawRad: 0.80 * fallSide},
    comparison: {
      stationM: compareStationM,
      island01HeadingDeg: heading01Deg,
      island02HeadingDeg: 0,
      island01SunElevationDeg: meta01AtZero.internal.sunElRad * 180 / Math.PI,
      island02SunElevationDeg: meta02AtZero.internal.sunElRad * 180 / Math.PI,
      sunAzimuthMatchedRelativeToLocalTravel: true,
    },
    pageErrors,
    sourceHashes: {
      island01: sha256(await readFile(join(ROOT, 'island-01.html'))),
      island02: sha256(await readFile(join(ROOT, 'island-02.html'))),
    },
  };
  await writeFile(META_PATH, JSON.stringify(metadata, null, 2));
  await runProcess(PYTHON, [join(OUT, 'compose.py'), META_PATH], ROOT,
    {env: {...process.env, PYTHONNOUSERSITE: '1'}});
  console.log(`wrote still review packet to ${OUT}`);
}

async function runProcess(command, processArgs, cwd, options = {}) {
  const child = spawn(command, processArgs, {
    cwd,
    env: options.env || process.env,
    stdio: options.stdio || 'inherit',
  });
  const [code, signal] = await once(child, 'exit');
  if (code !== 0) throw new Error(`${command} exited ${code ?? signal}`);
}

async function captureVideo(browser, kind) {
  const copies = kind === 'double' ? 2 : 1;
  const name = kind === 'double' ? 'ride-double.mp4' : 'ride-full.mp4';
  const path = join(OUT, name);
  const opened = await openPage(browser, 'island-02.html',
    `iseed=${SEED_02}&quality=${QUALITY}&heading=0&copies=${copies}`, VIDEO_SIZE);
  let snap = await snapshotState(opened.page);
  const entryAtG = snap.internal.entryAtG;
  const exitAtG = snap.internal.exitAtG;
  while (snap.state.g < entryAtG) {
    await stepFrame(opened.page);
    snap = await snapshotState(opened.page);
  }

  const ffmpeg = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'warning',
    '-f', 'image2pipe', '-framerate', String(FPS), '-vcodec', 'png', '-i', 'pipe:0',
    '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', path], {cwd: ROOT, stdio: ['pipe', 'inherit', 'inherit']});
  const ffmpegExit = once(ffmpeg, 'exit');
  let frames = 0;
  let lastProgress = -1;
  while (snap.state.g <= exitAtG) {
    const png = await opened.page.screenshot({type: 'png'});
    if (!ffmpeg.stdin.write(png)) await once(ffmpeg.stdin, 'drain');
    frames++;
    const progress = Math.floor((snap.state.g - entryAtG) / 100);
    if (progress > lastProgress) {
      lastProgress = progress;
      console.log(`${name}: ${Math.max(0, Math.round(snap.state.g - entryAtG))} m, ${frames} frames`);
    }
    await stepFrame(opened.page);
    snap = await snapshotState(opened.page);
    if (frames > 20000) throw new Error('video frame guard exceeded');
  }
  ffmpeg.stdin.end();
  const [code, signal] = await ffmpegExit;
  if (code !== 0) throw new Error(`ffmpeg exited ${code ?? signal}`);
  const end = await snapshotState(opened.page);
  const result = {
    kind, path, seed: SEED_02, quality: QUALITY, copies,
    viewport: VIDEO_SIZE, frameIntervalMs: FRAME_MS, fps: FPS, frames,
    durationSeconds: frames / FPS,
    routeFromG: entryAtG, routeToG: exitAtG,
    distanceCapturedM: exitAtG - entryAtG,
    renderer: end.proof.render.renderer,
    vendor: end.proof.render.vendor,
    softwareRenderer: end.proof.render.softwareRenderer,
    provenance: end.proof.run.provenance,
    continuousRideEligible: end.proof.run.continuousRideEligible,
    errors: [...opened.errors, ...end.proof.errors],
  };
  await opened.context.close();
  let metadata = {};
  try { metadata = JSON.parse(await readFile(META_PATH, 'utf8')); } catch {}
  metadata.videos = {...metadata.videos, [kind]: result};
  metadata.sourceHashes = {
    island01: sha256(await readFile(join(ROOT, 'island-01.html'))),
    island02: sha256(await readFile(join(ROOT, 'island-02.html'))),
  };
  await writeFile(META_PATH, JSON.stringify(metadata, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

const server = await serve();
const {chromium} = await findPlaywright();
let browser;
try {
  if (args.has('--probe')) {
    await rendererProbe(chromium);
  } else {
    const requested = process.env.CAPTURE_RENDERER || 'auto';
    const modes = requested === 'auto' ? ['metal', 'auto', 'swiftshader'] : [requested];
    for (const mode of modes) {
      const candidate = await launchBrowser(chromium, mode);
      const probe = await openPage(candidate, 'island-02.html', `iseed=${SEED_02}&quality=${QUALITY}`, {width: 900, height: 560});
      const renderer = (await snapshotState(probe.page)).proof.render;
      await probe.context.close();
      if (!renderer.softwareRenderer || mode === modes.at(-1)) {
        browser = candidate;
        console.log(`capture renderer mode=${mode} renderer=${renderer.renderer} software=${renderer.softwareRenderer}`);
        break;
      }
      await candidate.close();
    }
    if (args.has('--stills')) await captureStills(browser);
    if (videoArg) {
      const kind = videoArg.split('=')[1];
      if (!['full', 'double'].includes(kind)) throw new Error(`unknown video kind: ${kind}`);
      await captureVideo(browser, kind);
    }
  }
} finally {
  if (browser) await browser.close();
  server.close();
}
