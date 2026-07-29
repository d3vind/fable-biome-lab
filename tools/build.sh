#!/bin/sh
set -e
D="$(cd "$(dirname "$0")/../src" && pwd)"
OUT="$(cd "$(dirname "$0")/.." && pwd)/index.html"
cat "$D/p00-head.html" \
    "$D/p10-core.js" \
    "$D/p20-plan-route.js" \
    "$D/p30-plan-terrain.js" \
    "$D/p40-plan-eco.js" \
    "$D/p50-plan-life.js" \
    "$D/p60-render.js" \
    "$D/p70-corridor.js" \
    "$D/p80-trees.js" \
    "$D/p85-bands.js" \
    "$D/p90-world.js" \
    "$D/p95-ride.js" \
    "$D/p99-loop.js" > "$OUT"
printf '</script>\n</body>\n</html>\n' >> "$OUT"
wc -l "$OUT"
