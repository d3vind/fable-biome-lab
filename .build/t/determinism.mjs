import { serve, browser, page, start, proof } from './lib.mjs';
const SEEDS = ['REEDWAKE-2707','THREE-SLUICES-11','LOW-TIDE-88','WHITE-BIRD-7319','WILLOW-CUT-41'];
const srv = await serve(); const br = await browser();
const rows = [];
for (const seed of SEEDS) for (const q of ['low','standard','high']) for (const pass of [1,2]) {
  if (q !== 'standard' && pass === 2) continue;
  const p = await page(br, { w: 480, h: 270, url: `http://127.0.0.1:8137/index.html?seed=${seed}&quality=${q}` });
  await start(p);
  const pr = await proof(p);
  const st = await p.evaluate(() => window.__ctl.plan().stakes.length);
  rows.push({ seed, q, pass, plan: pr.planChecksum, real: pr.realizationChecksum, len: pr.branchLengths.openTotal,
    dPct: pr.nominalDurations.deltaPct, veg: pr.counts.vegetationInstances, trees: pr.counts.treeRegistry,
    stakes: st, tris: pr.visibleTriangles, calls: pr.rendererCalls, err: pr.errors.length, logs: p.logs.length });
  await p.context().close();
}
console.log('seed              q         p plan     realization len(open) dT%  vegInst trees stake tris    calls err logs');
for (const r of rows) console.log(`${r.seed.padEnd(17)} ${r.q.padEnd(9)} ${r.pass} ${r.plan} ${r.real}   ${String(r.len).padEnd(9)} ${String(r.dPct).padEnd(4)} ${String(r.veg).padEnd(7)} ${String(r.trees).padEnd(5)} ${String(r.stakes).padEnd(5)} ${String(r.tris).padEnd(7)} ${String(r.calls).padEnd(5)} ${r.err}   ${r.logs}`);
let ok = true; const by = {};
for (const r of rows) (by[r.seed] = by[r.seed] || []).push(r);
for (const s in by) {
  const g = by[s];
  for (const k of ['plan','real','len','trees','stakes']) {
    if (new Set(g.map(r=>r[k])).size !== 1) { console.log(`FAIL ${k} varies for ${s}`); ok = false; }
  }
}
const distinct = new Set(rows.map(r=>r.plan));
const anyErr = rows.some(r=>r.err>0), anyLog = rows.some(r=>r.logs>0);
console.log(`\ndistinct plan checksums across ${SEEDS.length} seeds: ${distinct.size}`);
console.log(`runtime errors: ${anyErr?'PRESENT':'none'}   console errors/warnings: ${anyLog?'PRESENT':'none'}`);
console.log(ok && distinct.size===SEEDS.length && !anyErr ? 'DETERMINISM + CROSS-QUALITY IDENTITY: PASS' : 'DETERMINISM: FAIL');
await br.close(); srv.close();
