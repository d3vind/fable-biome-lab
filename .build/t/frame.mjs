import { serve, browser, page, start, shot } from './lib.mjs';
const SEED = process.env.SEED || 'REEDWAKE-2707';
const ARM = process.env.ARM || 'open';
const marks = (process.argv[2] || '1000').split(',').map(Number);
const srv = await serve(); const br = await browser();
const p = await page(br, { w: 480, h: 270, url: `http://127.0.0.1:8137/index.html?seed=${SEED}&quality=standard&arm=${ARM}` });
await start(p);
for (const m of marks) {
  await p.evaluate(() => window.__ctl.subSteps(240, 0.05));
  await p.waitForFunction((d) => window.__proof.distance >= d - 700, m, { timeout: 900000, polling: 300 });
  await p.evaluate(() => window.__ctl.subSteps(14, 0.05));
  await p.waitForFunction((d) => window.__proof.distance >= d, m, { timeout: 900000, polling: 120 });
  await p.evaluate(() => window.__ctl.pause(true));
  const r = await p.evaluate(() => { const pr = window.__proof; return { d: Math.round(pr.distance), ch: pr.chapter, tris: pr.visibleTriangles, calls: pr.rendererCalls, lm: pr.counts.landmarksBuilt, veg: pr.counts.vegetationInstances, err: pr.errors.length }; });
  await p.setViewportSize({ width: 1152, height: 648 });
  await p.waitForTimeout(1000);
  await shot(p, `${process.env.TAG || 'f'}-${String(r.d).padStart(5, '0')}`);
  await p.setViewportSize({ width: 480, height: 270 });
  await p.waitForTimeout(200);
  await p.evaluate(() => window.__ctl.pause(false));
  console.log(`${r.d}m ${r.ch} tri ${r.tris} calls ${r.calls} built ${r.lm} veg ${r.veg} err ${r.err}`);
}
console.log('console:', p.logs.slice(0,5).join(' | ') || '(clean)');
await br.close(); srv.close();
