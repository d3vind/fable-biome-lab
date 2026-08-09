# Verifying Summerglass Hollow

A small retained packet so the claims in the commit message can be re-run rather
than taken on trust. It drives the shipped `index.html` in a real browser and
reports what it measured.

```
npm  install playwright        # or use any Chromium you already have
CHROME_PATH=/path/to/chrome node verify/run.mjs   # serves ../index.html and runs everything
THREE_LOCAL=./node_modules/three node verify/run.mjs   # no-egress sandbox
node verify/run.mjs --only=fork
```

Checks, and what each one is actually asking:

| check | question |
|---|---|
| `restart` | does a restarted ride inherit anything from the last one — distance, elevation, life, bands, proof state? Run from four chapters (early, fork, water, late) and once twice in a row. |
| `provenance` | can a warped or accelerated run be relabelled as a continuous one, including by restarting? |
| `fork` | is there drawn ground everywhere between the two lanes, and is any of it drawn twice? Fires rays at the scene rather than asking the code. |
| `road` | is the stone supported, does anything poke through it, and is the validation reading the triangles that were actually emitted? |
| `grounding` | does every planted trunk stand on the surface the renderer draws? |
| `quality` | do low, standard and high plan the same world? |
| `seeds` | does the seed matrix hold its route, grade, fork and grounding contracts? |
| `ride` | can both fork arms be ridden end to end, and what did the rider actually see? |
| `budget` | walking the whole route at each tier, what is the worst draw-call and triangle count the world ever asks for? Warped on purpose — it asks what is resident, not whether motion works. |
| `perf` | draw calls, triangles, and frame-time percentiles — with the renderer named, so a software rasteriser is never quoted as hardware. |

Frame-time results are only claimed as a pass on hardware. On SwiftShader or any
other software renderer the numbers are still reported, and the performance
assertion deliberately reads false.

The `ride` check rides the whole route in real time; on a software rasteriser one
arm can take an hour. It is bounded by wall clock rather than by a poll count —
counting polls times out a slow renderer that is riding perfectly well, which is
a statement about the harness and not about the world. `RIDE_MAX_MIN` sets that
bound (default 90) and `harnessTimedOut` in the result says whether it was hit.

## Verifying Island 01

`verify/island.mjs` does the same job for `island-01.html`, with the island's
own questions: `determinism` (same seed, same plan and realization hashes),
`tiers` (three tiers, one identity), `placement` (three headings, one island —
the plan hash may not move), `residency`/`pause`/`grounding`, `budget`
(island-only draw calls and triangles, swept along the whole route at standard
and high), `ride` (three headings × two entry grades, then the same island
mounted twice back to back), and `shots` (1440×900 frames at entry, rows,
pond, headland and exit).
