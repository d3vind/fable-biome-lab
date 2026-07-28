import { serve, browser, page, start, proof, shot } from './lib.mjs';
const srv = await serve(); const br = await browser();
const p = await page(br, { w: 1152, h: 648, url: 'http://127.0.0.1:8137/index.html?seed=REEDWAKE-2707&quality=standard' });
await start(p);
const pr = await proof(p);
const st = await p.evaluate(() => ({ stakes: window.__ctl.plan().stakes.length, muted: window.__ctl._dev().audio.muted }));
console.log(JSON.stringify({ plan: pr.planChecksum, real: pr.realizationChecksum, len: pr.routeLength,
  veg: pr.counts.vegetationInstances, tris: pr.visibleTriangles, calls: pr.rendererCalls,
  lm: pr.counts.landmarksBuilt, stakeLines: st.stakes, muted: st.muted, errors: pr.errors }));
await shot(p, 'smoke');
// mute round-trip
const a = await p.evaluate(() => { const m = window.__ctl._dev(); m.setMuted(true); return { muted: m.audio.muted, gain: m.audio.master.gain.value, btn: document.getElementById('mute').className }; });
await p.waitForTimeout(500);
const b = await p.evaluate(() => { const m = window.__ctl._dev(); m.setMuted(false); return { muted: m.audio.muted, btn: document.getElementById('mute').className }; });
console.log('mute on ->', JSON.stringify(a), ' off ->', JSON.stringify(b));
console.log('console:', p.logs.join(' | ') || '(clean)');
await br.close(); srv.close();
