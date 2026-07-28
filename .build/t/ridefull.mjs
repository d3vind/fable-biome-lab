import { serve, browser, page, start } from './lib.mjs';
const ARM = process.env.ARM || 'open';
const srv = await serve(); const br = await browser();
const p = await page(br, { w: 480, h: 270, url: `http://127.0.0.1:8137/index.html?seed=REEDWAKE-2707&quality=standard&arm=${ARM}` });
await start(p);
await p.evaluate(() => window.__ctl.subSteps(6, 0.05));
await p.evaluate(() => {
  const a = window.__ctl._dev();
  window.__marks = []; window.__peak = { tris: 0, calls: 0, veg: 0 }; let last = null;
  window.__watch = setInterval(() => {
    const pr = window.__proof;
    if (pr.chapter !== last) { window.__marks.push({ ch: pr.chapter, t: +a.time.toFixed(1), d: +pr.distance.toFixed(0) }); last = pr.chapter; }
    if (pr.visibleTriangles > window.__peak.tris) window.__peak.tris = pr.visibleTriangles;
    if (pr.rendererCalls > window.__peak.calls) window.__peak.calls = pr.rendererCalls;
    if (pr.counts.vegetationInstances > window.__peak.veg) window.__peak.veg = pr.counts.vegetationInstances;
  }, 100);
});
await p.waitForFunction(() => window.__proof.distance > 900, null, { timeout: 2400000, polling: 300 });
await p.evaluate(() => window.__ctl.subSteps(300, 0.06));
await p.waitForFunction(() => window.__proof.continuousRide.finished, null, { timeout: 3000000, polling: 1000 });
const out = await p.evaluate(() => { const pr = window.__proof; clearInterval(window.__watch); return { marks: window.__marks, peak: window.__peak, pr }; });
const pr = out.pr;
console.log(`ARM=${ARM} finished=${pr.continuousRide.finished} distance=${pr.distance}m progress=${(pr.routeProgress*100).toFixed(1)}% warps=${pr.continuousRide.warps} monotonic=${pr.continuousRide.monotonic} errors=${pr.errors.length}`);
for (const m of out.marks) console.log(`  ${m.ch.padEnd(10)} from t=${String(m.t).padEnd(8)} d=${m.d} m`);
console.log(`PEAK whole route: triangles ${out.peak.tris}, calls ${out.peak.calls}, veg ${out.peak.veg}`);
console.log(`encounters ${pr.counts.encountersFired}/${pr.counts.encountersPlanned}  errors ${JSON.stringify(pr.errors)}`);
console.log('console:', p.logs.slice(0,8).join(' | ') || '(clean)');
await br.close(); srv.close();
