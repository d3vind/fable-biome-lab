// Assembles the single self-contained root index.html from src/*.js + shell.html
// + a pinned, inlined three.js ESM build. index.html is the deliverable; these sources
// are what it is assembled from, and are committed so it stays maintainable.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// ---- 1. vendored three: rewrite the single trailing `export{...}` into a global ----
const THREE_VERSION = '0.160.1';
let three = readFileSync(join(here, 'three.module.min.js'), 'utf8');
const m = three.match(/export\{([^}]*)\};?\s*$/);
if (!m) throw new Error('could not locate trailing export statement in three build');
const pairs = m[1].split(',').map((s) => {
  const t = s.trim();
  const mm = t.match(/^(\S+)\s+as\s+(\S+)$/);
  if (mm) return `${JSON.stringify(mm[2])}:${mm[1]}`;
  return `${JSON.stringify(t)}:${t}`;
});
three = three.slice(0, m.index) + `globalThis.THREE=Object.freeze({${pairs.join(',')}});`;

// ---- 2. concat sources in filename order ----
const files = readdirSync(join(here, 'src')).filter((f) => f.endsWith('.js')).sort();
const src = files
  .map((f) => `\n/* ==== ${f} ${'='.repeat(Math.max(2, 66 - f.length))} */\n` + readFileSync(join(here, 'src', f), 'utf8'))
  .join('\n');

// ---- 3. shell ----
const shell = readFileSync(join(here, 'shell.html'), 'utf8');
const out = shell
  .replace('/*__THREE__*/', () => three)
  .replace('/*__APP__*/', () => src)
  .replace(/__THREE_VERSION__/g, THREE_VERSION);

if (out.includes('/*__THREE__*/') || out.includes('/*__APP__*/')) throw new Error('template markers left');
writeFileSync(join(root, 'index.html'), out);
console.log(
  `index.html written: ${(out.length / 1024).toFixed(0)} KB  (three ${THREE_VERSION} inlined ${(three.length / 1024).toFixed(0)} KB, app ${(src.length / 1024).toFixed(0)} KB, ${files.length} sources)`
);
