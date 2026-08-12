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

## Verifying Island 02

`verify/island-02.mjs` does the same job for `island-02.html`, with this
island's own questions on top of island 01's.

```
CHROME_PATH=/path/to/chrome THREE_LOCAL=./node_modules/three node verify/island-02.mjs
node verify/island-02.mjs --only=budget
```

| check | question |
|---|---|
| `determinism` | same seed, same plan and realization hashes across two loads. |
| `tiers` | do low, standard and high plan the same island, and spend differently? |
| `placement` | three headings, one island — the plan hash may not move, and no realized island vertex may fall outside the island's own local frame. |
| `contract` | length, boundary poses and grades, net elevation, heading change, grade cap; plus the divide's aspect ratio, the euclidean spacing between deliberate things, and the road's luminance against the ground the island emits. |
| `ground` | is there drawn ground everywhere and is any of it drawn twice; is the ground *function* continuous at the resolution the mesh actually draws; is every island vertex in the island's own frame? |
| `residency` / `pause` / `grounding` | does a band come back as itself; does the world keep going while the rider is stopped; does everything planted stand on the surface the renderer draws? |
| `budget` | the swept maximum — 103 stations × **seven bearings**, residency settled at each, run twice for identity, at standard and high and across four seeds. |
| `ride` | three headings × two entry-grade signs, ridden end to end, then the same island mounted twice back to back. |
| `shots` | nine 1440×900 frames from entry to exit. |

Two notes on what the numbers mean.

**The bearing set is stated, not chosen afterwards.** Seven yaw offsets — 0,
±22°, ±43°, ±63° — which is exactly the range a rider can hold, because the
drag-look is clamped to ±1.1 rad. This island is composed around a long lateral
view off the falling side of the divide, which lives about sixty degrees off the
travel direction; a five-bearing sweep stopping at ±43° would have excluded the
exact view the place exists for and reported a comfortable number for the wrong
island.

**Ground continuity is asked at the resolution the ground is drawn at**, and the
island's own land is gated while the host's terrain beyond its reach is reported
and not gated. Island tiles are sixteen metres, so a spike four metres wide in
the function is never emitted and measuring it measures nothing a rider can see;
and past the island's reach the ground belongs to the mount, which inherits the
keeper's coarse route field along with that field's seams.

Rides run at 1000×640 by default (`RIDE_SIZE`) because they are asking whether
the island can be ridden end to end, not how it looks; the screenshot set is
what is captured at 1440×900. As on every other branch here, frame timing is
reported but never claimed as a pass on a software rasteriser.

### Measuring causes rather than inferring them

Three scripts, retained because each answered a question that had already been
answered wrongly by looking at a symptom and reasoning backwards. None of them
needs a browser except where noted, and none of them changes anything.

```
node verify/measure-colour.mjs      # authored colour, exactly
node verify/measure-frames.mjs      # delivered pixels, from the shipped captures
node verify/measure-captures.mjs    # matched delivered frames + semantic surface masks
node verify/measure-frames.mjs --r3=verify/ride-review-02-r3/measurement
node verify/island-02-diagnose.mjs  # runtime probes + term-isolation captures
node verify/measure-isolation.mjs   # reads what island-02-diagnose.mjs wrote
```

| script | question |
|---|---|
| `measure-colour.mjs` | what colour did the palette actually author? It replicates three's sRGB→linear working space, so a constant can be read in saturation, hue and luminance instead of guessed at from a hex code. This is what showed the turf's authored saturation was 0.394 while the delivered frames measured 0.470 — the vertex path was right and something downstream was undoing it. |
| `measure-frames.mjs` | what colour actually arrived on screen? Decodes the shipped PNGs and reports vegetation-class hue/saturation/value quartiles plus channel clipping. Authored colour and delivered colour are different claims and the gap between them is where defects live. |
| `measure-captures.mjs` + `measure-frames.mjs --r3=...` | what luminance arrived on turf, road, scrub, and crowns under matched sun? The capture serves source read-only, records accelerated Metal provenance, and emits semantic masks only to identify surfaces; all luminance values come from the untouched delivered frame. It also isolates sun bleach and cloud shadow so coverage and duty are measured instead of inferred. |
| `measure-isolation.mjs` | which term owns an artefact — and is the comparison even valid? It reports the usual per-variant deltas, and it reports them for a **control region no toggled term can touch**. On this island that control moved 5.3–6.1 luminance units between captures, which is cloud-shadow drift on the world clock, and it turned a plausible-looking A/B into a known-void one. A between-frame comparison in a world with its own clock is worthless without that control; the within-frame texture statistics in the same script survive it. |

The runtime probes live on `window.__SUMMERGLASS_TEST__` and are driven by
`island-02-diagnose.mjs`: `openProbe` (how much of the island reaches the common
end of its turf transition), `densityProbe` (what is resident by distance band,
split out for the open middle, because an aggregate is dominated by the wooded
ends and hides exactly the hole you are looking for), `thinBandProbe`,
`thornProbe`, `farMassProbe`, and `setDbg`/`setTrack` for term isolation.
