#!/bin/sh
# Split a committed index.html back into src/p*.js.
#
# src/ lives in the scratchpad and is not under version control; index.html is.
# Since build.sh is a plain concatenation and every part begins with a banner
# comment that appears exactly once, the split is exact and reversible — this
# recovers the source tree from any commit, which is what makes it safe to let
# throwaway experiments loose on src/.
#
#   usage: unbuild.sh <index.html> <outdir>
set -e
SRC="${1:?usage: unbuild.sh <index.html> <outdir>}"; OUT="${2:?usage: unbuild.sh <index.html> <outdir>}"
mkdir -p "$OUT"
python3 - "$SRC" "$OUT" <<'PY'
import sys, os
src, out = sys.argv[1], sys.argv[2]
text = open(src, encoding='utf-8').read()
# first line of each part, in build order
MARKS = [
 ('p00-head.html', None),
 ('p10-core.js',        '// SUMMERGLASS HOLLOW'),
 ('p20-plan-route.js',  '// PLAN — CHAPTERS'),
 ('p30-plan-terrain.js','// PLAN — ENCLOSURE AND RELEASE'),
 ('p40-plan-eco.js',    '// PLAN — SIGHTLINES'),
 ('p50-plan-life.js',   '// PLAN — AMBIENT LIFE'),
 ('p60-render.js',      '// REALIZATION — quality tiers'),
 ('p70-corridor.js',    '// THE ROAD AND ITS CORRIDOR'),
 ('p80-trees.js',       '// TREE GRAMMAR'),
 ('p85-bands.js',       '// UNDERSTORY AND GROUND CONTACT'),
 ('p90-world.js',       '// SKY AND CLOUDS'),
 ('p95-ride.js',        '// SOUND — synthesised weather'),
 ('p99-loop.js',        '// WARM-UP, IDENTITY PROBE, MAIN LOOP'),
]
RULE = '// ============================================================\n'
FOOTER = '</script>\n</body>\n</html>\n'
if text.endswith(FOOTER):
    text = text[:-len(FOOTER)]
else:
    sys.exit('index.html does not end with the expected footer')
idx = []
for name, mark in MARKS:
    if mark is None:
        idx.append((name, 0)); continue
    hits = []
    j = text.find(mark)
    while j >= 0:
        hits.append(j); j = text.find(mark, j + 1)
    if not hits:
        sys.exit('could not locate the start of ' + name)
    if len(hits) > 1:
        sys.exit('marker for ' + name + ' is not unique (%d hits)' % len(hits))
    # the part begins at the banner rule above its title line
    i = text.rfind(RULE, 0, hits[0])
    if i < 0:
        sys.exit('no banner rule above ' + name)
    idx.append((name, i))
for k, (name, start) in enumerate(idx):
    end = idx[k + 1][1] if k + 1 < len(idx) else len(text)
    open(os.path.join(out, name), 'w', encoding='utf-8').write(text[start:end])
print('wrote %d parts to %s' % (len(idx), out))
PY
