# fable-biome-lab

Single-file procedural world experiments. Each branch is one world.

## Summerglass Hollow (`phase-3-summerglass-hollow-v2-final-repair`)

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

See `verify/README.md` for what each check asks and for the two environment
variables (`CHROME_PATH`, `THREE_LOCAL`) that let it run against a browser you
already have, or without egress to the CDN.

## Summerglass Island 01 — The Orchard Combe (`phase-3-summerglass-island-01`)

The first authored island beyond the hollow: a bounded, composable segment of
road and land, about two kilometres long, made to be placed many times by a
host that knows nothing about its interior. Not a destination — a worked
hillside the road happens to cross. Orchard rows on the contour above a
spring-cut combe, a stock pond the spring feeds, a hay meadow opposite with
one panel mown in swathes and one grown back, three wind-combed elders on the
knoll at the head of the combe, and an aged planted boundary line along the
climb out.

Open `island-01.html` over any HTTP server. Same palette, same tree grammar,
same plan-then-realize architecture as the keeper. Authored entirely in LOCAL
coordinates — entry at the origin, tangent along +Z — and mounted by a small
test host through one rigid transform, so the page can place it at any heading
and any entry grade within the ±2 % band:

| parameter | values | meaning |
|---|---|---|
| `iseed` | any string | selects the island. Default `ISLE-8421`. |
| `quality` | `low`, `standard`, `high` | representation cost. Identity is fixed before this is read. |
| `heading` | degrees | placement rotation applied by the host. Read only after the plan hash is frozen. |
| `egrade` | −2 … 2 | the host approach's grade, blended to the island's declared entry grade. |
| `copies` | `1`, `2` | mounts the same island twice in sequence — the ride-it-twice test. |

The vocabulary is the keeper's own, and only the keeper's: `dappled-gate`
(threshold trees at entry and exit), `orchard-row` (the working rows, and the
old boundary line), `water-aperture` (the composed opening onto the pond),
`wind-sisters` (the elders on the knoll), `light-shaft` and `fernfold-shaft`
(the planned pockets of visible air). `fork-wedge` and `bellroot-approach` are
deliberately unused: there is no fork here, and the hero tree belongs to the
hollow.

`window.__SUMMERGLASS_PROOF__` (version `summerglass-island-01`) extends the
keeper's proof shape with the island's boundary contract — declared entry and
exit poses, measured length, net elevation, total heading change, max grade —
plus placement-independence guards (the plan is frozen before either the
quality tier or the placement is read), the closed-vocabulary check, the
exclusion-corridor scan, residency identity, the ambient-continues-while-paused
probe, and the island-only budget (≤ 45 draw calls, ≤ 120 000 triangles at
standard, measured from the meshes the island itself pays for).

`verify/island.mjs` drives it: determinism across loads, plan identity across
quality tiers and across three placements, rides at three headings and two
entry grades, the double-mount ride, residency and pause probes, grounding,
budget sweeps at standard and high, and the screenshot set.

## Summerglass Island 02 — The High Parting (`phase-3-summerglass-island-02`)

The second authored island, and the first one whose job is to answer a question
about the *journey* rather than about itself. Island 01 answered "is there
anything out here, or does it just keep going?" — with worked land and old
water. Between the two there is generated connective travel, so the live
question by the time a rider arrives here is the one that kills long generated
rides: **has the country changed, or am I still riding the same field?**

So this island is a crossing rather than a place to arrive at. The road leaves
enclosed lowland through one last gate and does not get shade again for a
kilometre and a half. Beyond the gate the soil has changed: thin grazed turf
over rock, terracettes banding every flank, outcrop following the contour, the
bones showing where the wind has had longest at it. The road climbs onto the
broad shoulder of a divide and crosses its crest obliquely; at the top an older
green way parts from the metalled road and commits to the other flank, and two
dry drainage lines start within a hundred metres of each other and run in
opposite directions. Then a long brow with the land falling away and the
weather running over it, and a descent to the first soil.

There is no standing water anywhere on the island, and the absence is the
subject. A watershed is the one place in a country where the water has already
gone, in two directions, and all that is left of it is the shape of the ground.

Open `island-02.html` over any HTTP server. Same palette, same tree grammar,
same plan-then-realize architecture, same boundary contract as island 01:

| parameter | values | meaning |
|---|---|---|
| `iseed` | any string | selects the island. Default `PARTING-3311`. |
| `quality` | `low`, `standard`, `high` | representation cost. Identity is fixed before this is read. |
| `heading` | degrees | placement rotation applied by the host. Read only after the plan hash is frozen. |
| `egrade` | −2 … 2 | the host approach's grade, blended to the island's declared entry grade. |
| `copies` | `1`, `2` | mounts the same island twice in sequence — the ride-it-twice test. |

### Four names out of eight

The vocabulary is closed and it is the keeper's own. This island spends four of
it: `dappled-gate` — **once**, at the entry only, because the island is a
one-way crossing and gating both ends would make it a room; `fork-wedge` — the
green way parting from the road, and the single thorn standing where the wedge
has finally opened wide enough to hold one; `wind-sisters` — solitary
wind-bitten thorns scattered over the whole open middle, each one alone, most of
them passed within a few metres, all of them leaning the same way because the
wind is a fact about this ground; and `light-shaft` — three pockets of visible
air, all of them about shade: the last of it, its complete absence, the first of
it back.

`water-aperture` is unused because there is no water. `fernfold-shaft` because
there is no fernfold. `orchard-row` because the rows belong to the combe, and
`bellroot-approach` because the hero tree belongs to the hollow. Novelty here is
arrangement, scale, light and sequence — not new nouns.

### What the ground does, and why it is the ground that does it

The composition is carried by land and weather rather than by objects, because
on open ground adding vocabulary to a thin stretch makes it thinner. Four things
do the work:

* **The divide.** One whaleback, half-width 232–286 m against a 17.0–22.5 m
  fall — between ten and seventeen to one. That ratio was fixed at plan time and
  is never to be reduced: a rise narrower than about eight times its own height
  stops reading as ground and starts reading as an object standing on the field,
  and the island's own assertion gates on it. Nothing stands on the crest. It is
  not a pedestal and it is not looked at from a composed viewpoint; the rider is
  simply on it for eight hundred metres.
* **Terracettes.** Lines of constant *height* — which is why they need no slope
  maths of their own. On flat ground the contours are metres apart and nothing
  shows; on a flank they crowd together into the horizontal banding that is the
  single most recognisable thing about grazed downland, and they are what makes
  this ground read as drawn rather than painted. They antialias against their
  own screen-space rate, so the amplitude can be honest near the rider without
  shimmering on the far hillside.
* **The stone.** Outcrop follows the contour by construction — a scar is a value
  of "across the crest", not a shape placed on a hill. Close up it is the sunlit
  tops of the beds; from across a valley it is the shaded faces, and therefore a
  dark band. Getting that the wrong way round is what filled the first captures
  of the brow with white blotches.
* **The weather habit.** Up here the cloud shadow does not drift, it runs: more
  than twice the valley's speed, a harder edge, a deeper cut, under a lower and
  larger near cloud band. On ground with no canopy of its own that is the only
  moving light there is, and it keeps running while the rider is stopped.

The island declares a prevailing wind **in its own frame**, because that is what
it is — a fact about this ground, written into the shape of everything that has
stood on it. The host's clouds keep their own drift: a gust at four hundred
metres and the wind that bent a sixty-year-old thorn are not the same wind, and
pretending they are would make the island depend on where it was placed.

### The green way

`fork-wedge` is a fork with only one rideable arm, and that is the point: an
island has to hand back exactly one road. The departing way is not a second lane
— no stone, no shoulder, no corridor mesh, nothing the host has to know about.
It is a wide shallow hollow declared against the same datum as everything else,
with two worn ruts painted per fragment from a seven-point polyline held in a
uniform. There is only ever one surface, so there is nothing for a second one to
disagree with, which is the whole reason this island can carry a fork at all.

It is evaluated per fragment rather than carried on vertices for a plain reason:
the way is five metres wide and the ground mesh is sixteen, and an attribute
would sample it away to nothing. The same arithmetic retired the first version
of the outcrop, whose 3.5–6.5 m scarp could not be represented by the mesh that
had to draw it and aliased into a random bump; scars are 14–22 m terraces now,
which is a form downland has plenty of.

### Height is declared, never added

Every imposed feature names a height it wants and a weight, and the ground is
drawn toward it from a datum that is itself controlled — the road's own height
for anything that has to read from the lane, the designed smooth surface for
anything that has to read against its own surroundings. Noise is never a datum.
Island 01 learned this the expensive way: a bump summed onto unconstrained noise
stood eight metres *below* the road on one seed, and a sunken landmark is how
three forty-metre elders vanish from their own skyline.

### The host adapts to the island

The island's authored land reaches 246 m and then stops. Anchoring the host to
the *road's* height beyond that walled this island's long view in at two hundred
and twenty metres: the ground fell away for the island's whole reach and the
host put it straight back at lane level, which is a cliff facing the rider from
the one direction the place exists to be seen in. So where a point lies in an
island's shadow the host's datum is the island's own ground at the edge of its
reach on the same bearing, easing back to the road's height over the next
several hundred metres, with the host's own undulation fading in from the seam
outward. The island never reaches out to arrange the host.

The two tile grids are not the same grid — the island's is laid out in its own
local frame and turned by the placement, the host's in the world — so they
deliberately **overlap by two tiles** rather than each taking half the ground.
Handing each of them exactly half left a ragged seam of nothing between them,
and the brow filled with pale holes that were the sky dome seen edge-on. The
overlap is safe because the island's influence is 1 all the way through it, so
both meshes are evaluating the identical function and differ only by the sag of
a triangle. Cover the ground twice rather than not at all.

### Proof surface

`window.__SUMMERGLASS_PROOF__` (version `summerglass-island-02`) keeps island
01's shape and adds what this island has to answer for: the divide's measured
aspect ratio and lateral slope; the parting's drove, wedge widths and the two
grooves with their opposed bearings; the stone bands; the thorns and the
measured euclidean spacing between deliberate things; the declared local wind;
the long view's measured reach; and `roadLeads`, which is the road's luminance
against the ground the island actually emits. That last one is not decoration:
limestone in full sun is almost exactly the value of a pale metalled road, and
the change of soil here is bought by making the turf drier, browner and slightly
*darker* than the valley's rather than paler, because paler would have stopped
the road leading its own country.

`noAbsoluteWorldCoordinates` is measured rather than argued. The plan hash being
frozen before the placement is read is necessary and not sufficient — a single
world coordinate baked into a realized vertex would still pass it. So every
static island mesh is taken back through its own copy's transform and its
vertices are required to land inside the island's own local extent.

`window.__SUMMERGLASS_TEST__` adds `surfaceIntegrity` (rays fired down at the
scene the renderer is holding: how many find nothing, how large the biggest
*connected* group of those is, and how far apart the top two surfaces are
wherever a ray finds more than one), `groundWalk` (is the ground *function*
continuous, since a discontinuity in it is inherited by every mesh that samples
it), `silhouetteProbe` (raycasts the crown itself, at the height the crown
actually is — a probe aimed at an offset above the ground passes while the thing
is invisible), `browProbe`, `partingProbe`, `localBounds`, `contrast` and
`look`, which holds the drag-look where a rider could hold it without touching
the run's provenance.

`verify/island-02.mjs` drives all of it. See `verify/README.md`.
