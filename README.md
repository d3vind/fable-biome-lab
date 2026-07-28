# fable-biome-lab

Single-file procedural world experiments. Each branch is one world.

## Summerglass Hollow (`phase-3-summerglass-hollow-v2-quiet-cut`)

A seeded bicycle passage through one remembered summer afternoon: a pale road
travelling over grassy rises, down into cool woodland hollows, around a ridge
that divides it in two, past water, and up to an ancient tree above a broad
final valley.

This branch is a subtractive editorial pass over
`phase-3-summerglass-hollow-v2-reconcile`. The journey, the route, the rolling
terrain, the fork, Glasswater, Bellroot and the streaming architecture are
unchanged. What changed is what was taken away: two thirds of the airborne
particles, half the scattered grass, ten of the twenty-one cloud formations, and
a tenth of the frame the road was occupying. What was added is grounding — every
tree now stands on the surface the renderer actually draws, not on the function
the plan used to place it.

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
   water, ecology zones, the wildlife schedule, the sound schedule and the
   weather schedule. No geometry exists yet. The result is summarised by
   `planHash`, which does not depend on quality, and by `planDigest64`, a 64-bit
   digest of a canonical serialisation of the frozen plan.
2. **Realization.** The frozen plan is spent as geometry for the chosen quality
   tier. Vegetation, growth and ground contact stream in and out of residency in
   200 m bands keyed to global route distance; the road, the ground field and the
   far country are bounded static geometry. Object identity comes from position,
   never from the order bands happened to be realised, so a band that leaves and
   re-enters residency comes back as itself.

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

Foliage lobes carry their own smooth normals while bark, ground props and cloud
puffs keep hard per-face normals. That one distinction is most of the difference
between a fluffy canopy and a heap of crystals: it lets an eighty-triangle puff
shade like a soft ball, so a crown can be built from many small overlapping
lobes instead of a few large faceted ones.

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

Proximity and visibility are distinct throughout. `proximity.fork` means the
rider came near the fork; `seen.forkBothArmsBeforeCommit` means both arms were
inside the frustum with a clear ground line before the choice was locked.
`water.proximityThisRun` and `water.seenThisRun` likewise, with a frame count.

Every run reports its **provenance**: `continuous`, `accelerated`, `warped` or
`debug`. It only ever escalates, and it resets with the ride. `continuous` and
`accelerated` both mean every metre was travelled and every frame rendered —
accelerated only fixes the timestep, which is how a ride is verified on a
software rasteriser. `warped` and `debug` mean the rider was moved by something
other than riding: such a run can be inspected, but `continuousRideEligible` is
false and the visibility assertions refuse to pass. A teleport cannot be
mistaken for a ride.

Frame time is reported twice — raw, and with harness stalls removed — together
with the count of stalls, the threshold used, the viewport, the device pixel
ratio, the renderer string, whether that renderer is software, and percentiles
per route chapter. Neither number can be quoted without the other.

Road validation is measured against the **triangles actually emitted to the
renderer**. A vertex can sit in the position buffer and be referenced by no
triangle — the fork culls exactly such vertices where one lane owns the other's
ground — and validating those is validating geometry nobody sees: surface gap, edge-above-support, unsupported edge samples, ground-field
poke-through, and the designed verge drop reported separately as design rather
than as error.

`window.__SUMMERGLASS_TEST__` is a small test-control surface used by the
verification harness (fixed-step simulation, branch selection, accelerated
traversal to a chapter, pause, restart, diagnostics, pool shelf profiles, water
screen-space probe, and a per-category triangle breakdown). Accelerated
traversal is a way to reach a chapter quickly; it is not evidence that motion
works.
