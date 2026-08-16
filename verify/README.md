# Verifying Summerglass Island 03

A retained packet so the claims in the commit messages can be re-run rather
than taken on trust. It serves the shipped `island-03.html` unmodified and
drives it in Chromium.

```
npm install playwright                     # or use any Chromium you already have
CHROME_PATH=/path/to/chrome THREE_LOCAL=./node_modules/three node verify/island-03.mjs
node verify/island-03.mjs --only=budget    # one group
```

`THREE_LOCAL` serves a local `three@0.185.1` package in place of the CDN
request without modifying the shipped file (for no-egress sandboxes).
`RIDE_SIZE` sets the ride-check viewport (default 1000x640): the rides ask
whether the island can be ridden, not how it looks; the screenshot set is what
is captured at 1440x900.

| check | question |
|---|---|
| `determinism` | same seed, same plan and realization hashes across two loads. |
| `tiers` | do low, standard and high plan the same island — same plan hash, same eight family counts — and spend differently? |
| `placement` | three headings, one island: the plan hash may not move, and no realized island vertex may fall outside the island's own local frame. |
| `contract/boundary` | length, boundary poses, heading — and this island's own flatness contract: net elevation ≤ 6 m, grades ≤ 3 %, boundary grades ≤ 0.8 %. |
| `contract/narrows` | is the sky a slot (≥ 40° of held horizon on both sides, sustained), do the walls read as ground (run/height ≥ 8 per side), is the deep hold blind (≤ 340 m forward), is the release quick (≤ 260 m from tight to open), do both ends hand over open country, does the funnel stay rideable (≥ 16 m clear at head height)? |
| `contract/road-leads` | road-over-ground luminance ≥ 1.25 in **every movement** (an aggregate hides a hole), slot shading applied to both surfaces at the strengths the shader applies it; seam contrast ≥ 3.40. |
| `contract/families-and-vocabulary` | exactly eight source families, all populated; vocabulary exactly {dappled-gate, wind-sisters, light-shaft, fernfold-shaft}; deliberate things ≥ 100 m apart. |
| `ground` | is there drawn ground everywhere and is any of it drawn twice (rays at the scene the renderer holds, biggest *connected* miss gated); is the ground function continuous at the resolution the tiles draw; is every island vertex in the island's own frame? |
| `residency` / `pause` / `grounding` | does a band come back as itself; do the resident daws keep working the wall while the rider stands in the throat; does everything planted stand on the surface the renderer draws? |
| `budget` | the swept maximum — stations every 24 m × seven stated bearings, residency settled at each, run twice for identity, at standard and high across four seeds. Gate: ≤ 45 island draw calls, ≤ 120 000 island triangles. |
| `ride` | three headings × two entry-grade signs, ridden end to end; marks committed/throated/released must all fire, at least two sisters must be *seen* (silhouette raycast at crown height), and the throat must be ridden, not sampled. Then the same island mounted twice back to back, with every boundary gated at the emitted vertices (≤ 5 cm). |
| `shots` | seventeen 1440×900 frames from approach to exit, including the throat looked at upward — the slot is the composition, and the set must contain the view that proves it is a slot — plus the double-mount seam from both sides. |
| `seq` | **the moving sequence**: one continuously ridden pass (fixed-step, provenance `accelerated` — every metre travelled, every frame rendered, no warp anywhere in the run) through entry, throat and release, captured every ~40 m into `island-03-shots/ride-seq/` with a manifest. Compression is a temporal effect; a still cannot prove it. |

Frame timing is reported but never claimed as a pass on a software rasteriser,
as on every other branch here.

The review packet for the delivery — measurement report, self-audit and accept
ledger — lives in `verify/island-03-review/`.
