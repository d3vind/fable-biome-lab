# fable-biome-lab

Single-file procedural world experiments. Each branch is one world.

## Summerglass Hollow (`claude/summerglass-hollow-v2-mt6zus`)

A seeded bicycle passage through one remembered summer afternoon: a pale road
travelling over grassy rises, down into cool woodland hollows, around a ridge
that divides it in two, past water, and up to an ancient tree above a broad
final valley.

This branch is a repair pass over `phase-3-summerglass-hollow-v2-quiet-cut`. The
journey, the route, the rolling terrain, the fork, Glasswater, Bellroot and the
streaming architecture are unchanged. Four things changed:

* **The fork no longer tears.** The ground field and the road corridor disagreed
  about how close to a lane the open country was allowed to come, and the gap
  between the two answers was a ring of nothing around every lane. One ring is
  invisible — the corridor covers it. At the fork, where two lanes run side by
  side, the two rings met in the middle and the world opened onto the sky.
* **The clouds are accumulations again**, not plates. Each formation is built
  from overlapping smooth-shaded puffs with a bright crown, a cool flank and one
  flat shadowed base, so it reads as vapour lit from above rather than as a
  low-poly mountain hung in the air.
* **Trees are visually connected to the ground**, not merely numerically seated
  on it. A trunk widens into a root collar, its thickness is derived from the
  crown it carries, the crown descends far enough to overlap the trunk, and a
  contact shadow is laid on the surface the renderer actually draws.
* **The ground is quieter still**, and the road occupies about a quarter of the
  lower frame rather than a third.

A later pass, from field testing on hardware, changed five things and
nothing about the composition — every landmark, road, cloud, seed and chapter
decision is where it was:

* **The spiked vegetation is gone.** A tussock was four to six triangles twice
  as tall as they were wide, fanned from a point. At the distance they are
  actually seen from that is not grass, it is a scatter of dark needles standing
  on a clean field. Blades are now about as wide as they are tall and lean
  further off vertical, so a handful overlaps into one soft mass; and growth out
  in the open field has to be in a genuinely strong patch, so when it appears it
  appears as a group instead of one lonely spike in ten metres of sward.
* **The trunks are trees again.** Girth had been tuned up until a seventeen-metre
  beech carried a bole nearly two metres across that barely tapered — a concrete
  column with foliage resting on it. That, not thinness, was the pole. The bole
  is now about a fourteenth of the tree's height at the root and narrows to a
  quarter of that, and a parallel-transported frame runs the bark unbroken
  instead of stepping at every bend.
* **The crowns are softer**: the shaded underside is held nearer the mid green,
  so it reads as foliage seen from below rather than a dark disc slung under the
  tree, and it sits a little lower on the trunk.
* **The per-pixel cost is much lower.** The world light — cloud shadow, canopy
  dapple, and the meadow's own paint — evaluated a value noise up to thirteen
  times per fragment on every lit surface, and each evaluation needed four
  `sin`-based hashes. That is fifty-odd transcendentals per ground pixel, and it,
  not geometry, was the frame budget. The four corner hashes of a noise cell are
  now baked into one texel and fetched in a single tap.
* **The world sizes itself to the machine.** The device pixel ratio is no longer
  a fixed guess per quality tier; it is the top of a ladder the world walks down
  from its own measured frame time, and back up when it has headroom. The proof
  surface reports which rung it settled on, and a run that only met budget by
  spending resolution cannot report a clean pass without saying so.
* **A rabbit, and a squirrel** on a trunk the renderer actually drew.

A final pass repaired the proof surface itself, because a report that reads all
green is worse than a report that reads red if the checks are not asking what
they claim to ask. Six of them were not:

* **An accelerated ride could skip terrain and still call itself eligible.**
  Bounding the fixed timestep does not bound the distance covered — the same step
  covers twice the ground at twice the speed. The world now measures how far the
  rider actually moved between two rendered frames and marks the run debug the
  moment that exceeds the corridor's own row spacing, and eligibility depends on
  it rather than merely reporting it.
* **The restart check contradicted itself.** It commanded a quarter-second
  accelerated step, restarted, waited four wall-clock seconds and then asserted
  the new run had ridden under sixty metres. That holds on a five-frame-a-second
  rasteriser and fails on real hardware for no reason but speed. The accelerant is
  cleared and the run held before measuring, and the assertion is now exact.
* **The grounding probe read different geometry from the renderer.** It asked a
  reconstruction of the drawn surface rather than the surface. It now fires real
  rays at the meshes in the scene, walked along both arms, and reports how far the
  reconstruction disagrees with them.
* **Quality tiers were compared by counting.** Equal counts of different trees is
  not the same world. Per-tree identity — position, family, scale, lean — is now
  hashed and must be identical; seated height is realization, follows the surface
  each tier draws, and is reported as a distribution against a stated bound. That
  measurement immediately found the low tier resampling the landform at seven
  metres where the others use five, moving trees near the road by three quarters
  of a metre at the ninety-ninth percentile. `row` is no longer a cost knob.
* **The budget sweep scanned one arm twice.** `chooseBranch` sets what a RIDE
  would resolve at the fork; the sweep warps and never reaches it, so both passes
  stayed on the default arm. The arm is set outright and re-read from the world
  every sample.
* **The performance check measured two hundred metres at the wrong resolution.**
  It stood at the gate for twenty seconds on a page that had never been asked for
  the device pixel ratio the tier ships. It now rides the whole route at the
  tier's own DPR and takes its verdict per chapter.

Open `index.html` over any HTTP server. No build step, no assets, no
dependencies beyond the pinned Three.js module in the import map.

```
python3 -m http.server 8080     # then open http://localhost:8080/
```

### Controls

`W` / `↑` accelerate · `S` / `↓` brake · `A` `D` / `←` `→` steer and choose at
the fork · drag to look around · `Space` pauses the rider while the world keeps
going · `R` restarts the same world from the beginning.

### URL parameters

| parameter | values | meaning |
|---|---|---|
| `seed` | any string | selects the world. Default `SUMMERGLASS-8421`. |
| `quality` | `low`, `standard`, `high` | selects how much geometry is spent, and the device-pixel ceiling (1.0 / 1.25 / 1.5). The world itself is identical across all three. |

### How it is built

Two stages, in this order:

1. **Plan.** The seed is expanded through named, independent PRNG streams into
   the complete identity of the world — chapters, route centreline, elevation
   profile, both fork arms, terrain regions, groves, grove windows, landmarks,
   water, ecology zones, the wildlife schedule, the sound schedule, the weather
   schedule, the cloud formations and the airborne pockets. No geometry exists
   yet. The result is summarised by `planHash`, which does not depend on quality,
   and by `planDigest64`, a 64-bit digest of a canonical serialisation of the
   frozen plan.
2. **Realization.** The frozen plan is spent as geometry for the chosen quality
   tier. Vegetation, growth and ground contact stream in and out of residency in
   200 m bands keyed to global route distance; the road, the ground field and the
   far country are bounded static geometry. Object identity comes from position,
   never from the order bands happened to be realised, so a band that leaves and
   re-enters residency comes back as itself.

Quality decides how much of the plan is drawn and how finely, and nothing else.
It cannot change what exists: the counts of planned trees, cloud formations,
scheduled life events and declined seatings are identical at all three tiers, the
plan hash and digest are identical, and the realization hash differs at each —
which is the whole claim, checked as `quality` in the verification runner.

The route is generated before anything stands on it. The land is then written
around the realised route with cut, fill, shoulder and drainage relationships,
and the road surface, contact band, shoulder and verge are one conformal mesh
built from the route's own frames — so nothing can bleed over the stone and
nothing can float. Two guarantees bracket the corridor: within 2.5 m of a lane
the ground may never rise above that lane's designed shoulder, and within 1.7 m
it may never fall below it, whatever a pool basin, a shelf or a ditch wants to
do further out.

Each pool is composed rather than sampled. Its station is chosen so the water
stays inside the rider's own view cone on the approach, its surface is set a
known few metres below the lane, and a shelf of ground is cut between the lane
and the near bank so the rider looks down onto water instead of at a bank. The
far bank is deliberately left high, because water needs something dark behind it
to read against.

Foliage lobes and cloud puffs carry their own smooth normals while bark and
ground props keep hard per-face normals. That one distinction is most of the
difference between a fluffy canopy and a heap of crystals: it lets an
eighty-triangle puff shade like a soft ball, so a crown can be built from many
small overlapping lobes instead of a few large faceted ones, and a cloud from
many overlapping puffs instead of a few flat plates.

### Two surfaces meeting at the fork

At the fork, three meshes want the same ground: the Sunpath corridor, the
Mosswater corridor, and the coarse field beyond both. Ground drawn by nobody is
a hole; ground drawn twice, differently, is a shelf hanging in the air. Four
rules keep them apart, and each one is there because its absence was visible.

* **Ownership is decided by the most-owning corner of a quad, not by the average
  of four.** Take any point between the lanes: whichever lane is nearer to it is
  at least as near to the nearest corner of the quad around it, so that lane's
  test clears and the quad is drawn. Coverage is a property of the rule, not a
  hope. Averaging instead let two grids sampling different quad centres both
  decline the same ground — a strip fifteen to forty-five metres long and about
  five wide, running beside the lane. That was the tear.
* **A ground tile is dropped only when the whole tile is inside the corridor's
  reach, and that reach is the corridor's own apron** rather than an unrelated
  number. Dropping on any corner retreated the field a cell further than the
  corridor extended, leaving an annulus nothing drew. Holding off at
  thirty-six metres while the corridor reached sixty-six had both surfaces
  drawing the same thirty metres and disagreeing by up to five.
* **Between the lanes, the corridor draws a shared bank.** Both corridors
  necessarily reach the ground between the arms, and each triangulates it from
  its own lane's direction at its own column spacing — five metres near the
  road, twelve out at the apron. Whatever the land does in there, two grids
  reading it differently means one of them ends five metres above the other. So
  in the wedge the height comes from a straight ramp between the two lanes'
  beds, evaluated from the place and not from the lane doing the reading. Both
  grids interpolate the same nearly-linear function and land on each other. The
  ramp fades out well before either shoulder, so each lane keeps its own bed,
  cut and drainage.
* **Where a point could lie between the arms, both lanes' distances are measured
  properly.** The scan radius is normally sized from a coarse field that knows
  only the nearest lane, so a point close to one arm stopped searching before
  reaching the other and reported it as infinitely far — and the two corridors,
  disagreeing about where they were, drew the same ground two different ways.
  The radius is floored inside the ring where the shared bank can be non-zero,
  and only there: outside it, a lane reported as merely "farther than the scan"
  gives the same answer as a lane reported exactly, and the scan is not worth
  paying for.
* **Where the lanes have converged, one mesh draws the ground.** Through the
  split and the rejoin the Sunpath owns the country beside the road and the
  Mosswater arm keeps only its own stone and the shoulder holding it up. Two
  aprons a few metres apart triangulate the same ground differently, and the step
  where the shorter one ended ran dead straight beside the stone at the rejoin.
* **The designed lift that separates the two arms vertically rides on the
  stone**, and fades laterally across the shoulder that carries it, so the verge
  arrives at open ground at open-ground height. Lifting the road without fading
  the lift is what left unsupported edges in an earlier pass.

Whether it worked is not asserted from those rules. `forkIntegrity()` fires rays
down through the fork region from above and reports three things: how many find
no surface at all, how large the biggest *connected* group of those misses is,
and how far apart the top two surfaces are wherever a ray finds more than one. A
lone ray slipping between two triangles is invisible; a contiguous block of them
is a window onto the sky, and a percentage cannot tell the two apart. That is a
measurement of the scene the renderer holds, taken after realization, and it is
what the verification runner gates on.

### The editorial rules

Three rules decide what exists, and they are worth stating because they are the
whole design:

* **Fewer objects, stronger silhouettes.** A meadow is not an even sprinkle of
  grass. A coarse field decides whether a patch of ground has growth on it at
  all — most does not — and a finer field varies density inside a patch so its
  edges are ragged. The emptiness between is the composition, not a gap in it.
* **Airborne life is an event.** The plan schedules a handful of pockets: one
  shaft of light in the Dappled Gate, a breeze on the open ground, one deep in
  Fernfold, the water margins, and Bellroot. Everywhere else the air is nearly
  empty, which is what makes a pocket read as something rather than as a filter
  over the lens.
* **Everything stands on the drawn surface.** The plan places things with a
  continuous ground function; the renderer draws a triangulated approximation of
  it. Wherever the triangles fall below the function — every convex cell, every
  crease where the two lanes' shoulders cross — a trunk placed by the plan hangs
  in the air. Every planted position is therefore re-seated onto the drawn mesh
  and bedded slightly into it, once, before residency begins. Where the two
  disagree by more than a tree can be seated through, realization declines to
  build the tree and says so; the plan keeps it, so the world's identity is the
  same at every quality.

Seating a trunk is not the same as connecting it. A trunk that ends exactly at
the terrain height still reads as a pole pushed into a lawn. Three further things
are what make the contact look real: the trunk flares into a root collar over its
lowest metre, its radius is scaled by the mass of the crown it is carrying — so a
wide crown never arrives on a broomstick — and the crown is grown down to overlap
the trunk rather than resting on top of it. The contact shadow is then laid on
the height the renderer draws, not the height the plan used, which is why it
stays under the tree when the ground beneath is coarse.

### Proof surface

`window.__SUMMERGLASS_PROOF__` (version `summerglass-hollow-2r`) reports runtime
truth, and keeps three kinds of claim apart:

* **Plan and realization** — hashes, the canonical plan digest, route and grade
  measurements, object counts by category, resident versus planned residency.
  The hashes are deterministic repeatability checksums, not cryptographic proof;
  `hashNote` says so in the surface itself.
* **`run`** — everything true only of the current run: distance actually ridden,
  ascent and descent actually ridden, peak draw calls and triangles this run,
  which named moments were *seen* by the rider's own camera as opposed to merely
  approached, and which marks were reached. `R` resets all of it.
* **`lifetime`** — counters that deliberately survive restart (restarts, runs,
  bands realised and disposed), labelled separately so they are never mistaken
  for run evidence.

`render.framePass` is the frame-time gate: p95 ≤ 16.67 ms, p99 ≤ 25 ms, and no
chapter under 55 fps. It refuses to claim anything on a software rasteriser, and
it now also reports `dprHeld` — whether that budget was met at the quality tier's
own device pixel ratio, or reached only after the resolution governor stepped
down. `render.dprGovernor` carries the ladder, the rung, and every step it took
with the distance and chapter it took it at. Meeting budget by spending
resolution is a real result and a different one, so the verification runner gives
it its own row rather than a green `perf`.

Proximity and visibility are distinct throughout. `proximity.fork` means the
rider came near the fork; `seen.forkBothArmsBeforeCommit` means both arms were
inside the frustum with a clear ground line before the choice was locked.
`water.proximityThisRun` and `water.seenThisRun` likewise, with a frame count.

Every run reports its **provenance**: `continuous`, `accelerated`, `warped` or
`debug`. It only ever escalates, and it resets with the ride. `continuous` and
`accelerated` both mean every metre was travelled and every frame rendered —
accelerated only fixes the timestep, which is how a ride is verified on a
software rasteriser, and the fixed step is bounded so it cannot be widened until
a frame skips terrain. A restart clears the ladder because it clears the run; it
cannot be used to launder a warped run into a clean one, because a restart also
clears the distance, the ascent, the fired events and the marks that a claim
would have to be made from. `warped` and `debug` mean the rider was moved by
something other than riding: such a run can be inspected, but
`continuousRideEligible` is false and the visibility assertions refuse to pass. A
teleport cannot be mistaken for a ride.

Frame time is reported twice — raw, and with harness stalls removed — together
with the count of stalls, the threshold used, the viewport, the device pixel
ratio, the renderer string, whether that renderer is software, and percentiles
per route chapter. Neither number can be quoted without the other. The
`performanceBudget` assertion is not satisfied by draw calls and triangles alone:
it also requires measured frame time inside budget, and it refuses outright on a
software rasteriser, where a frame-time measurement is not evidence about
hardware. On this branch that assertion is therefore expected to read false in a
sandbox and says why in `framePass.note`.

Road validation is measured against the **triangles actually emitted to the
renderer** — the exact indexed triangle a sample falls in, resolved by which side
of the shared diagonal it lies on, not a bilinear blend of four corners that
belongs to no triangle at all. A vertex can sit in the position buffer and be
referenced by no triangle — the fork culls exactly such vertices where one lane
owns the other's ground — and validating those is validating geometry nobody
sees. `emittedTrianglesOnly` is not a constant: it is set from a probe that asks
the reader for heights it should refuse, and is true only because the reader
refused them. What is then measured: surface gap, edge-above-support, unsupported
edge samples, ground-field poke-through, and the designed verge drop reported
separately as design rather than as error.

The same applies to the coarse field beyond the corridor. Its reader mirrors the
emitter's retention rule exactly — testing one corner declared "no geometry
here" for every tile that straddles the hold-off line, tiles that are in fact
drawn — and it resolves the exact triangle rather than blending four corners. A
reader that disagrees with the emitter is worse than no reader at all, because
everything that stands on the world reads it.

`window.__SUMMERGLASS_TEST__` is a small test-control surface used by the
verification harness (fixed-step simulation, branch selection, accelerated
traversal to a chapter, pause, restart, fork integrity raycasts, grounding
probes, road frame share, per-category triangle breakdown, pool shelf profiles
and a water screen-space probe). Accelerated traversal is a way to reach a
chapter quickly; it is not evidence that motion works.

### Verification

`verify/` holds the runner that produces the evidence quoted for this branch. It
serves the shipped `index.html` unmodified and drives it in Chromium.

```
npm i -D playwright && npx playwright install chromium
node verify/run.mjs                 # everything
node verify/run.mjs --only=fork     # one group
```

See `verify/README.md` for what each check asks and for the environment variables
(`CHROME_PATH`, `THREE_LOCAL`) that let it run against a browser you already
have, or without egress to the CDN.

The runner answers the performance question on **whatever GPU the machine has**.
It used to force SwiftShader unconditionally and then gate `perf` on geometry
alone, so the row printed `PASS` beside its own `framePass: false` — a check that
could neither fail nor be true. Frame time is now part of the verdict, and a
software rasteriser yields `NO-VERDICT` rather than a green row: it is measured
honestly and then explicitly refused as evidence about hardware. `SOFTWARE_GL=1`
forces software for environments that have no GPU at all, and gets the same
`NO-VERDICT`. **`perf` can only be answered on the target hardware.**
