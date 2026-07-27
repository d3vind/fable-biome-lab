# fable-biome-lab

Single-file procedural world experiments. Each branch is one world.

## Summerglass Hollow (`phase-3-summerglass-hollow-v2`)

A seeded bicycle passage through one remembered summer afternoon: a pale road
travelling over grassy rises, down into cool woodland hollows, around a ridge
that divides it in two, past water, and up to an ancient tree above a broad
final valley.

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
| `quality` | `low`, `standard`, `high` | selects how much geometry is spent. Default `standard`. The world itself is identical across all three. |

### How it is built

Two stages, in this order:

1. **Plan.** The seed is expanded through named, independent PRNG streams into
   the complete identity of the world — chapters, route centreline, elevation
   profile, both fork arms, terrain regions, groves, grove windows, landmarks,
   water, ecology zones, the wildlife schedule, the sound schedule and the
   weather schedule. No geometry exists yet. The result is summarised by
   `planHash`, which does not depend on quality.
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
nothing can float.

### Proof surface

`window.__SUMMERGLASS_PROOF__` reports runtime truth: hashes, route and grade
measurements, road/terrain deviation, object counts by category, resident versus
planned residency, wildlife and weather state, renderer, draw calls, triangles,
frame-time percentiles, captured errors, and a set of assertions measured
against the realised world rather than the plan.

`window.__SUMMERGLASS_TEST__` is a small test-control surface used by the
verification harness (fixed-step simulation, branch selection, accelerated
traversal to a chapter, pause, restart, diagnostics). Accelerated traversal is a
way to reach a chapter quickly; it is not evidence that motion works.
