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
| `restart` | does a restarted ride inherit anything from the last one — distance, elevation, life, bands, proof state? Run from four chapters (early, fork, water, late) and once twice in a row. The accelerant is cleared and the new run held before measuring, so the result does not depend on how fast the machine rides. |
| `provenance` | can a warped or accelerated run be relabelled as a continuous one, including by restarting? |
| `fork` | is there drawn ground everywhere between the two lanes, and is any of it drawn twice? Fires rays at the scene rather than asking the code. |
| `road` | is the stone supported, does anything poke through it, and is the validation reading the triangles that were actually emitted? |
| `grounding` | does every planted trunk stand on the surface the renderer draws? Real rays at the meshes in the scene, walked along both arms — and it reports how far the analytic reconstruction disagrees with them, because a probe that reads different geometry from the renderer is not a probe. |
| `quality` | do low, standard and high plan the same world? Per-tree identity, not a count of trees — equal counts of different trees is not the same world. Seated height is realization and is reported as a distribution with a stated bound rather than asserted equal. |
| `seeds` | does the seed matrix hold its route, grade, fork and grounding contracts? |
| `ride` | can both fork arms be ridden end to end, and what did the rider actually see? |
| `budget` | walking the whole route at each tier, what is the worst draw-call and triangle count the world ever asks for? Warped on purpose — it asks what is resident, not whether motion works. Each pass sets the arm outright and re-reads it from the world, because `chooseBranch` only decides what a RIDE would resolve at the fork and a warped sweep therefore scanned one arm twice. |
| `perf` | draw calls, triangles, and frame-time percentiles — with the renderer named, so a software rasteriser is never quoted as hardware, and with the resolution the world settled on. Rides the WHOLE route at the tier's own device pixel ratio and takes the verdict per chapter; standing at the gate for twenty seconds measured the opening chapter at a DPR nobody ships. |

Rows are `PASS`, `FAIL`, or `NO-VERDICT`. The third exists because a check that
runs cleanly on hardware that cannot answer the question it asks is not a pass; a
row that reads green while its own detail says the measurement is meaningless is
worse than no row at all. `perf` returns `NO-VERDICT` in two cases:

* **Software rasteriser.** The runner uses whatever GPU the machine has
  (`--ignore-gpu-blocklist`); `SOFTWARE_GL=1` forces SwiftShader for environments
  with no GPU. Either way the frame time is measured and reported, and then
  explicitly refused as evidence about hardware. It used to force SwiftShader
  unconditionally *and* gate the row on geometry alone, so `perf` printed `PASS`
  beside its own `framePass: false`: a check that could neither fail nor be true.
* **The traversal skipped terrain.** The world counts how far the rider moved
  between rendered frames and marks the run debug the moment that exceeds the
  corridor's own row spacing. A fixed TIMESTEP cannot bound this on its own — the
  same step covers twice the ground at twice the speed — so a run that outran the
  guard is refused rather than reported.
* **Fewer than four chapters sampled.** A frame-time claim from part of the route
  is not a claim about the route.
* **Budget met at reduced resolution.** The world steps its own device pixel
  ratio down when it is missing frame budget. Reaching 60 fps that way is a real
  result and a different one from holding the tier's resolution, so it gets its
  own row rather than a green `perf`. `dprHeld`, `dprRung` and `dprSteps` in the
  detail say what happened.

The performance question can only be answered on the hardware the world is meant
to run on. Nothing this runner prints on a software rasteriser is a substitute.

The `ride` check rides the whole route in real time; on a software rasteriser one
arm can take an hour. It is bounded by wall clock rather than by a poll count —
counting polls times out a slow renderer that is riding perfectly well, which is
a statement about the harness and not about the world. `RIDE_MAX_MIN` sets that
bound (default 90) and `harnessTimedOut` in the result says whether it was hit.
