# fable-biome-lab

Single-file procedural world experiments. Each branch is one world.

## Summerglass Hollow (`phase-3-summerglass-hollow-v2-reconcile`)

A seeded bicycle passage through one remembered summer afternoon: a pale road
travelling over grassy rises, down into cool woodland hollows, around a ridge
that divides it in two, past water, and up to an ancient tree above a broad
final valley.

This branch is a reconciliation of `phase-3-summerglass-hollow-v2`. The journey,
the route, the rolling terrain, the fork and the streaming architecture are
unchanged; what has been repaired is the soft canopy and cloud language of the
original Summerglass Vale, the composition of the water, the road and its verge,
the honesty of the proof surface, and the runtime budget.

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

Road validation is measured against the **realized corridor and ground-field
meshes** — the vertices actually emitted — not against the analytic ground
function: surface gap, edge-above-support, unsupported edge samples, ground-field
poke-through, and the designed verge drop reported separately as design rather
than as error.

`window.__SUMMERGLASS_TEST__` is a small test-control surface used by the
verification harness (fixed-step simulation, branch selection, accelerated
traversal to a chapter, pause, restart, diagnostics, pool shelf profiles, water
screen-space probe, and a per-category triangle breakdown). Accelerated
traversal is a way to reach a chapter quickly; it is not evidence that motion
works.
