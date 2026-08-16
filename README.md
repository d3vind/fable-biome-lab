# fable-biome-lab

Single-file procedural world experiments. Each branch is one world.

This branch carries **Summerglass Island 03 — The Narrows**. The two islands it
answers to live on their own branches: `phase-3-summerglass-island-01` (The
Orchard Combe — soft enclosure: trees, canopy, ambient intimacy) and
`phase-3-summerglass-island-02` (The High Parting — opening and choice: a high
parting, a fork, a divide). Read those branches' READMEs for the keeper's
architecture; everything structural here is inherited from them on purpose.

## Summerglass Island 03 — The Narrows

The third authored island, and the third answer to what an island is for.
Island 01 encloses softly; island 02 opens and offers a choice. This island
**closes and commits**: the road is taken in through one green gate, the
country gathers on both sides until the sky is a slot rather than a ceiling,
the throat is blind around its own bend — there is nothing to decide, and for
four hundred metres nothing to see but the way through — and then the walls
let go in sixty metres of earned release onto the widest ground of the ride.
Compression is the whole idea, and the release is priced by how tight it got.

It is honest to the world's standing direction: lush summer green, dreamy,
luminous. **Stone is a shape here, not a new palette** — every rock colour is
mixed from the keeper's eight, green survives on the flanks, the benches and
in whatever grows in the cracks of the walls, and the narrows is dark by value
contrast and enclosure, never by draining the colour (the slot's shading is a
multiply, and A1 cuts both ways: a multiplier cannot desaturate, which is
exactly the property wanted).

Open `island-03.html` over any HTTP server. Same palette, same tree grammar,
same plan-then-realize architecture, same boundary contract as islands 01 and
02:

| parameter | values | meaning |
|---|---|---|
| `iseed` | any string | selects the island. Default `NARROWS-2741`. |
| `quality` | `low`, `standard`, `high` | representation cost. Identity is fixed before this is read. |
| `heading` | degrees | placement rotation applied by the host. Read only after the plan hash is frozen. |
| `egrade` | −2 … 2 | the host approach's grade, blended to the island's declared entry grade. |
| `copies` | `1`, `2` | mounts the same island twice in sequence — the ride-it-twice test. |

### Eight families, exactly

The cycling-app intake is one generalized contract keyed to eight source
families — `plan`, `routeFrames`, `terrain`, `formations`, `groves`, `trees`,
`lifeEvents`, `airPockets` — and this island populates all eight and nothing
else. A ninth family, or a missing one, would break the generality that makes
islands cheap and turn a data record back into engineering. Contents differ
freely: a narrows is formation-heavy and grove-light, its `terrain` family is
a massif, two walls, two noses, benches and a floor, and its whole middle
plants nothing. The schema does not differ. The proof reports the counts under
`families`, and `eightFamilies` is an assertion, not a habit.

### Four names out of eight

The vocabulary is closed and it is the keeper's own. This island spends four:
`dappled-gate` — **once**, at the entry: the last soft trees before the stone
takes over. The release needs no gate, because the walls themselves let the
rider out, and gating both ends of a narrows would make it a corridor between
rooms. `wind-sisters` — solitary wind-combed trees on the **rims**,
silhouetted against the slot of sky, every one leaning along the funnel
because up on the rims the funnel is the weather. `light-shaft` — the last of
the open light at the gate, one shaft finding the floor of the slot as a
**light pool** the shader paints and the particles thicken in, and the first
full light back at the mouth. `fernfold-shaft` — the throat's own cool air:
the one reach of the ride deep enough in shade for ferns, and the verge grows
them.

`fork-wedge` is unused because **there is nothing to decide** — that is the
island's whole argument. `water-aperture` because the water that cut this
defile has been gone since before the trees; the island rides down the empty
bed of it. `orchard-row` belongs to the combe and `bellroot-approach` to the
hollow.

### Effectively flat, and the walls do all the work

The substrate this island mounts into has only ever carried near-neutral
segments, so flatness is a contract, not a mood: net elevation 0.15 m over
2,036 m, max grade 1.2 %, entry and exit grades zero to two decimal places,
gated at plan time by its own assertion (`effectivelyFlat`: |net| ≤ 6 m,
grades ≤ 3 %, boundary grades ≤ 0.8 %). Every metre of drama is in the walls
rising, never in the road falling.

### The walls read as terrain, and the ratio that guarantees it

A rise of roughly hemispherical proportion reads as an object and competes
with the road — island 01 paid four passes learning that. The walls of a
narrows court exactly that failure, as two boulders flanking a lane, and the
escape is the same lesson applied sideways: **widen, never shrink**. Each wall
is one continuous standing face nearly a kilometre long against thirty metres
of height — run over height ≈ 31, gated at ≥ 8, the same object-vs-ground
ratio island 02 gated its divide with, turned on its side. The wall line
breathes at a ~200 m octave (the wavelength that reads at riding speed), is
ribbed at ~50 m and ~17 m, is notched along its rim at ~30 m, and behind every
rim the ground keeps going as the massif's own top, so the cut sits **in** a
hill rather than between two screens of rock. The faces are painted per pixel
in axis coordinates — beds long along the defile, layered in height, joints in
courses offset per panel so no line can run the length of the wall — and their
profile is walked through a wobbled coordinate so the surface refuses to be
ruled.

### The slot, the commitment and the release are one instrument

`aperture` is measured the way the rider meets it: the horizon elevation the
ground holds on each side, from eye height on the lane. On this seed the walls
hold better than 40° of horizon on **both** sides for 550 continuous metres
and peak at 54.5°; the sky directly over the throat narrows to 72°. The same
instrument gates the entry and exit (≤ 14° — both ends hand over open
country), the commitment (the first sixty percent of the hold is blind at
≤ 340 m forward — the throat cannot see its own exit around the committed
bend), and the release (from the last ≥ 40° station to the first ≤ 14° one is
**sixty metres**: the walls let go all at once, which is what makes the
release read as earned rather than dribbled away). The one view the throat is
allowed ahead of time is the bright mouth framed between the dark walls late
in the hold — `mouthRevealAtM` reports where the promise is made.

### Road-first contrast, measured per movement

Enclosure must never make the surface ambiguous. The road darkens **with** the
defile — a road glowing in a shaded slot would be a worse lie than a dim one —
but at 0.72 of the ground's slot strength, so the contrast the rider steers by
*rises* at the tightest point. Road-over-ground luminance is measured per
movement, never as an aggregate (an average hides a hole): 1.85 / 1.46 / 1.81
/ 1.32 / 1.45 across the five movements, gated ≥ 1.25 in every one, with the
seam gate untouched at 3.40:1.

### What lives here

Six scheduled life events (a hare in the last meadow, a burst of daws off the
wall at the gathering, the funnel gust running the slot as a silver front in
the verge grass, moths in the fernfold air, birds crossing the slot high
against the band of sky, a flock over the opened country) and two **resident
daws** that are never scheduled at all: they work the updraught over their own
buttress, on the world's clock, and they are the pause proof — stand in the
throat as long as you like and they are still turning.

### Proof surface

`window.__SUMMERGLASS_PROOF__` (version `summerglass-island-03`) keeps island
02's shape and adds what this island has to answer for: the eight `families`
counts; the `narrows` block (walls as planned and as measured, noses, benches,
clearances, the blind distance and the reveal station); `aperture` (the slot
instrument); `lightPools`; `sisters`; the funnel `wind`; `releaseView`;
`roadLeads` by movement; and the narrows' own assertions — `effectivelyFlat`,
`skySlotAtThroat`, `wallsReadAsGround`, `releaseIsQuick`, `endsHandOverOpen`,
`committedBlind`, `throatClearance`, `roadLeadsEveryMovement`,
`eightFamilies` — alongside every gate inherited from islands 01 and 02
(plan-before-quality/placement, local-bounds, exclusion, budget, seams,
grounding, residency identity, pause).

`window.__SUMMERGLASS_TEST__` adds `apertureProbe`, `slotProbe`,
`throatProbe`, `wallProbe`, `contrastProbe` (by movement), `coverProbe` (who
owns a strip of ground, and does anyone draw it — written to find a hole,
kept because the next hole will want it), and this island's `densityProbe`,
split for the narrows and the open ends separately, because in a narrows an
aggregate would hide exactly the emptiness that is the composition.

`verify/island-03.mjs` drives all of it, including a **continuously ridden
moving sequence** through entry, throat and release captured every ~40 m with
no warp anywhere in the run — compression is a temporal effect, and a still
cannot prove it. See `verify/README.md`.
