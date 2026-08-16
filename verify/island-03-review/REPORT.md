# Summerglass Island 03 — measurement and delivery report

Delivered source: `island-03.html`, SHA-256
`654ac3d607a1aa3c7a547484d386b5bda9b0f1030f487d57bf16b0a2c922910d` — the
retained suite in `verify/island-03-results.json` and every committed capture
were produced from exactly this content.

Default seed: `NARROWS-2741` · Quality for measurement: `standard`
Plan hash `8fbbd3b8` · Realization hash `10ef5b71410e9300` (standard;
`f1cff768a800e527` low, `038f475311052dd1` high — three spends, one identity)

Renderer for every delivered-pixel measurement and capture:
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))` — software
rasteriser, declared as such; no frame-time claim is made anywhere in this
delivery, and the proof says so itself.

## The plan harness output

| | |
|---|---|
| id | `summerglass-island-03` |
| plan hash | `8fbbd3b8` (frozen before quality or placement was read; read-counters 0/0, machine-checked) |
| length | **2,036 m** measured on the built frames |
| entry pose | (0, 0, 0), heading 0.00°, grade **0.00 %** |
| exit pose | (−134.58, 0.15, 2004.93), heading **−0.22°**, grade **0.00 %** |
| exit heading | −0.22° net (max excursion 26.1°); derived once from the last frame of the built table — every consumer references it |
| net elevation | **+0.15 m** over 2,036 m (ascent 3.8, descent 3.6, max grade 1.23 %) |
| declared vocabulary | `dappled-gate, fernfold-shaft, light-shaft, wind-sisters` — four of the eight, and the four unused are each unused for a stated reason |

## The eight families

| family | count | contents |
|---|---:|---|
| plan | 1 | five movements: The Last Meadow, The Gathering, The Throat, The Mouth, The Opened Country |
| routeFrames | 1,019 | 2 m arc-length frames, eight channels, the keeper's exact shape |
| terrain | 9 | one massif, two walls (near 8.2–9.2 m base / 26–30 m rim; far 9.6–10.8 m / 23–27 m), one swept floor, two noses at the bends, three benches |
| formations | 10 | one dappled-gate (four trees, entry only) and six wind-sisters on the rims |
| groves | 20 | the two open ends only; the massif's whole reach plans nothing |
| trees | 213 | 0 unseatable; all 213 seated on the drawn mesh, worst contact −0.24 m (bedded in, none floating) |
| lifeEvents | 6 | hare, daw-burst, funnel gust, moths, slot-crossing birds, flock |
| airPockets | 4 | three light-shafts and the throat's fernfold-shaft |

Identical at all three quality tiers and all three placements
(`eightFamilies` asserted, tier equality gated in `tiers/plan-identity`).

## The narrows, measured

All aperture numbers are horizon elevation from eye height on the lane —
the slot, the commitment and the release are one instrument.

| measurement | value | gate |
|---|---|---|
| peak held horizon, weaker side | **54.5°** at s = 890 | ≥ 42° |
| sustained ≥ 40° both sides | **550 m** continuous | ≥ 160 m at 35° |
| sky over the throat, at minimum | **72°** of 180 | reported |
| entry / exit horizon (open ends) | −2.8° / −0.5° | ≤ 14° |
| deep-hold forward view (blind) | **230 m** | ≤ 340 m |
| mouth reveal | s = 1,169 — the bright mouth shows framed between the walls for the last stretch of the hold, which is the release being promised | reported, not suppressed |
| release run (last ≥ 40° → first ≤ 14°) | **60 m** | ≤ 260 m |
| wall runs (standing wall ≥ 6 m) | near 990 m / 32.4 m = **30.5**; far 980 m / 31.0 m = **31.7** | run/height ≥ 8 per side |
| clearance at head height, tightest | **19.1 m** wall-to-wall | ≥ 16 m |
| formation spacing (euclidean, deliberate things) | 131 m | ≥ 100 m |

## Road-first contrast, per movement (authored, slot shading applied at the shader's own strengths)

| movement | road/ground median |
|---|---:|
| The Last Meadow | 1.85 |
| The Gathering | 1.46 |
| The Throat | **1.81** |
| The Mouth | 1.32 |
| The Opened Country | 1.45 |

Gate ≥ 1.25 in every movement; seam contrast 3.40:1 (luminance-solved
constant, untouched). The road darkens *with* the defile at 0.72 of the
ground's slot strength, so the steering contrast rises at the tightest point
— visible in the throat row above.

Delivered pixels at the throat (SwiftShader, 1280×720 authoring captures):
road 188 / floor verge 133 / wall faces 110 median luminance — the road is
the palest thing in the slot by 1.7:1 — and the throat verge carries **more**
saturation than the open verge (0.52 vs 0.37 median): dark by value and
enclosure, colour intact, which is what A1 was for. The slot term's delivery
was proven by isolation, not assumption: `uDbg.y` off lifts the throat road
215 → 192 on (the first open-vs-throat comparison was confounded by cloud
shadow — island 02's isolation lesson, re-paid at a discount).

## Budget (swept maximum: stations every 24 m × seven stated bearings, residency settled, run twice for identity)

| tier / seed | triangles | calls |
|---|---:|---:|
| standard NARROWS-2741 | 84,755 | 22 |
| standard CLOVENSTONE-88 | 78,642 | 21 |
| standard DEFILE-517 | 74,864 | 22 |
| standard THROATGATE-9 | 75,129 | 21 |
| high NARROWS-2741 | 90,317 | 23 |
| high CLOVENSTONE-88 | 83,174 | 22 |

Worst 90,317 / 23 against the 120,000 / 45 gate, repeat-identical in every
sweep. The dense wall columns (1–3 m through the wall span, A4's price) are
inside the budget with a quarter to spare.

## Rides (fixed-step, provenance `accelerated`: every metre travelled, every frame rendered)

| ride | distance | marks | sisters seen | throat frames | pool seen | release view |
|---|---:|---|---:|---:|---|---:|
| heading 0°, egrade +1.8 | 2,652 m | all seven | 4 of 6 | 188 | yes | 790 m |
| heading 137°, egrade −1.6 | 2,651 m | all seven | 4 of 6 | 188 | yes | 790 m |
| heading 262°, egrade +0.9 | 2,651 m | all seven | 4 of 6 | 188 | yes | 790 m |
| double mount | 4,877 m | — | 8 across both copies | — | — | — |

Three placements, one island: identical plan and realization hashes, zero
local-bounds outliers, and the seen-statistics repeat exactly because the
rides are deterministic. Double-mount seam: **1.2 mm** at the join, 8.4 mm
worst boundary, against the 5 cm gate.

## Ground

Surface integrity at the scene the renderer holds: **0 missing samples** of
3,591 (largest connected miss 0), after the corner-ownership fix recorded in
the ledger; 211 double-drawn samples in the designed island/host overlap
ring, worst disagreement 2.43 m at the influence fade — the keeper's
cover-twice-rather-than-not-at-all contract, working as stated. Ground
function continuity 7.81 m worst step per 16 m tile against the 8.0 gate —
at the gate's edge, on the massif shoulder, and said so rather than rounded
down. Grounding: 213/213 seated, none floating.

## The moving sequence

`verify/island-03-shots/ride-seq/`: **44 frames at ~40 m intervals** from the
approach to the opened country, captured during one continuously ridden
fixed-step pass — no warp anywhere in the run, provenance `accelerated`,
committed/throated/released all marked in-ride. `ride.gif` animates it;
`strip-1..3.png` are the contact sheets. Every frame and every canonical
still was **viewed before this report was written**. In motion the island
does what it was commissioned to do: the gate's dappled shade passes over
the road, the rocky brow rises and converges frame over frame, the sisters
hold the rims, the road is visibly steered by the buttress noses, the hold
is blind, the mouth appears as a framed light and then the walls let go in
two frames onto the widest horizon of the ride.

## Self-audit against the commission

| rule | verdict |
|---|---|
| Eight source families, exactly | **Held.** Counts above; asserted in-page; tier- and placement-invariant. No ninth family; none missing. |
| Effectively flat | **Held.** +0.15 m net, 1.23 % max, 0.00 % at both boundaries; own assertion stricter than the shared band. |
| Length 1.5–2.5 km | **Held.** 2,036 m, in family with 01 (~2.0 km) and 02 (~1.9 km). |
| Road dominant and readable | **Held, measured per movement** (≥ 1.32 everywhere) and confirmed in every capture including the darkest; the slot construction *raises* steering contrast at the tightest point. |
| Nothing pops | **Held.** Zero integrity misses (no sky holes); residency streams at 540 m ahead — beyond that, fog; inside the narrows the walls bound every sightline; the 44-frame sequence shows no mid-frame appearance. |
| One authority for the segment end | **Held.** Exit pose derived once from the last built frame; the host walker, influence fade and proof all reference it; the mount seam closes at 1.2 mm because of it. |
| Objects keep their own colours; no atmospheric wash | **Held.** Linear fog only (330–2,050 m); far-mass sky-lerp capped at 0.12; trees excluded from the slot multiply; rock colours are palette mixes; the walls sit nearer than the fog through the whole narrows. |
| A1 (multiply cannot desaturate) | **Held both ways.** Dryness mixes toward `C_DRY`; the slot shade is *deliberately* a multiply because darkening without desaturating is precisely the brief; throat verge saturation 0.52 delivered vs 0.37 open. |
| Density per band, never aggregate | **Held.** Contrast per movement; densityProbe split narrows/open; aperture per station; wall runs per side. |
| A3b (hemispherical = object; widen, don't shrink) | **Held sideways.** Wall run/height 30.5 and 31.7 against the ≥ 8 gate; when the massif shoulder failed the tile gate it was *widened*, not lowered. |
| Modulation at the ~200 m octave | **Held.** Wall breathing at 210 m, ribs at 52/17 m, rim notch at 31 m, the turf's 0.026 m⁻¹ broad field kept from island 02's accepted register. |
| Judge in motion | **Done.** The sequence was ridden, assembled and watched before this report; the compression is a temporal claim and it was judged temporally. |
| A verdict names what the next pass would break | **Done** — see the score below and the ledger's ACCEPTED-WITH-NOTE rows. |

## Verification

Full retained suite: **25/25 passed** (`verify/island-03-results.json`).
Determinism, three tiers, three placements, contract (boundary + narrows +
road-leads + families/vocabulary), ground (integrity, continuity, local
bounds), residency identity, pause proof (the daws kept working the wall
while the rider stood in the throat), grounding, six budget sweeps, three
full rides, the double mount, seventeen canonical stills plus the seam trio,
and the moving sequence.

## Score

**87 / 100.**

The specific gap: **the walls' close-range material ceiling.** At riding
distance the faces read as bedded, coursed stone; within arm's reach and at
the steepest grazing angles they are still visibly a heightfield with painted
beds — the vertex-noise beds stretch into soft streaks for a few degrees of
incidence (ledgered as accepted-with-note), and the walls carry exactly one
material idea for nearly a kilometre. A keeper-grade narrows wants one more
behaviour in the stone — a true overhang impression at a nose, a weep stain
under a bench, one fallen slab the verge has grown around — and that is what
the next pass would break if it were done carelessly: every candidate adds
an object to the one island whose composition is the absence of them. Behind
that: the light pool is quieter than its plan intends (+8 % at centre, one
clamp constant, ledgered), and the massif shoulder passes the tile gate at
7.81 of 8.0 — honest, but at the edge.

What this pass would defend: the slot instrument and its numbers, the
release's sixty metres, the corner-ownership rule, the frozen palette, and
the decision that nothing — not one grove, not one landmark — stands inside
the narrows.
