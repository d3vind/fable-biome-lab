/* Recover the assembly sources from the built single-file deliverable.

   The build performs exactly two transforms, and both are reversible: it concatenates
   src/*.js under per-file banner comments into a shell template, and it rewrites the
   vendored three.js ESM build's single trailing `export{...}` statement into a
   `globalThis.THREE` assignment. So the sources can be recovered from index.html, and the
   recovery can be checked the only way worth trusting: extract, rebuild, and require the
   result to be byte-identical to the input.

   This is what reconstructed the sources after the original working tree was lost with
   its container. It is kept because that can happen again. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

const TAG = '<script type="module">';
const t1 = html.indexOf(TAG);
const t2 = html.indexOf('</script>', t1);
const threeBlob = html.slice(t1 + TAG.length, t2);

// ---- vendor: put the trailing export statement back the way npm ships it ----
const gm = threeBlob.match(/globalThis\.THREE=Object\.freeze\(\{([\s\S]*)\}\);$/);
if (!gm) throw new Error('could not find the globalThis.THREE tail');
const pairs = gm[1].split(',').map((s) => {
  const mm = s.match(/^"([^"]+)":(.+)$/);
  if (!mm) throw new Error('unparsed export pair: ' + s);
  return mm[1] === mm[2] ? mm[1] : `${mm[2]} as ${mm[1]}`;
});
const three = threeBlob.slice(0, gm.index) + `export{${pairs.join(',')}};`;
mkdirSync(join(here, 'src'), { recursive: true });
writeFileSync(join(here, 'three.module.min.js'), three);

// ---- app sources: split on the banners the build wrote ----
const re = /\n\/\* ==== (\S+\.js) =+ \*\/\n/g;
const marks = [];
let m;
while ((m = re.exec(html))) marks.push({ name: m[1], from: m.index, bodyAt: re.lastIndex });
if (!marks.length) throw new Error('no source banners found');

const srcStart = marks[0].from;
const srcEnd = html.indexOf('</script>', marks[marks.length - 1].bodyAt);
for (let i = 0; i < marks.length; i++) {
  const end = i + 1 < marks.length ? marks[i + 1].from : srcEnd;
  // sources were joined with '\n', so one trailing newline before the next banner is the join
  let body = html.slice(marks[i].bodyAt, end);
  if (i + 1 < marks.length) body = body.replace(/\n$/, '');
  writeFileSync(join(here, 'src', marks[i].name), body);
}
const src = html.slice(srcStart, srcEnd);

// ---- shell: everything else, with the two markers and the version put back ----
let shell = html.slice(0, t1 + TAG.length) + '/*__THREE__*/' + html.slice(t2);
shell = shell.replace(src, '/*__APP__*/');
shell = shell.replace(/three@0\.160\.1/g, 'three@__THREE_VERSION__');
writeFileSync(join(here, 'shell.html'), shell);

console.log(`recovered ${marks.length} sources, shell ${(shell.length / 1024).toFixed(1)} KB, three ${(three.length / 1024).toFixed(0)} KB`);
