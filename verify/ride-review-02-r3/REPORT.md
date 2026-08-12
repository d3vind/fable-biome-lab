# Summerglass Island 02 R3 — measurement and delivery report

Base: `6d61a976abe465b7a61a6a71b81f7f8f1026f2eb`

Default Island 02 seed: `PARTING-3311`

Island 01 reference seed: `ISLE-8421`

Weekly keeper reference seed: `SUMMERGLASS-8421`, Sunbank midpoint (1006 m)

Quality: `standard`

Matched sun azimuth relative to local travel: `-1.72319 rad`

Renderer for delivered-pixel measurement: `ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)`; accelerated; software renderer false.

## Measurement before editing

All values below are linear relative luminance decoded from delivered sRGB pixels. Semantic masks identify surface membership only; their colour is never included in the measurement.

| Reference / surface | p10 | median | p90 |
|---|---:|---:|---:|
| Island 02 tip turf | 0.305 | 0.412 | 0.489 |
| Island 02 tip scrub | 0.145 | 0.396 | 0.481 |
| Island 02 tip crowns | 0.241 | 0.410 | 0.518 |
| Island 02 tip road | 0.394 | 0.592 | 0.668 |
| Island 01 open turf | 0.092 | 0.273 | 0.392 |
| Island 01 open scrub | 0.053 | 0.141 | 0.360 |
| Island 01 open crowns | 0.063 | 0.199 | 0.541 |
| Island 01 open road | 0.376 | 0.535 | 0.655 |
| Weekly keeper mid-country turf | 0.191 | 0.356 | 0.470 |
| Weekly keeper mid-country scrub | 0.062 | 0.209 | 0.410 |
| Weekly keeper mid-country crowns | 0.069 | 0.241 | 0.454 |
| Weekly keeper mid-country road | 0.362 | 0.517 | 0.591 |

The references disagree: Island 01 open turf is 23.2% darker at the median than the weekly keeper’s open mid-country. Island 02 is already brighter than both at the matched station, so base constant value cannot carry the owner’s missing feeling.

Cloud-shadow isolation at the matched Island 02 frame reports 0% duty; the weekly keeper frame reports 90.9%. Shadow depth/coverage therefore does not carry the Island 02 gap at this viewing condition. The warm indirect-diffuse floor is also not the carrier: Island 02’s delivered unshadowed field already exceeds both references.

The named carrier is **sun-bleach delivery**. It covered 62.0% of visible Island 02 turf, but its affected median was 0.411 versus 0.416 around it. It lifted darker underlying turf without becoming visibly sunlit, so broad pale/yellow-green modelling read dusty rather than bright.

## R3 mechanism

- Colour shift: mix the bleach colour closer to `sunGrass`.
- Value lift: multiply only the existing dry/bleach field by `1 + 0.10 × dry`.
- Preserve range: the broad octave remains exactly `0.026 m⁻¹`; no global ground lift is applied.
- Followers: near/mid crowns and scrub multiply by 1.06. The far tree material is unchanged so the open far-mass issue is not folded into this pass.
- Road and seam constants are unchanged. Junction machinery is untouched.

## Delivered result

| Island 02 surface | Before p10 / median / p90 | R3 p10 / median / p90 | Median change |
|---|---|---|---:|
| Turf | 0.305 / 0.412 / 0.489 | 0.315 / 0.428 / 0.505 | +3.84% |
| Scrub | 0.145 / 0.396 / 0.481 | 0.150 / 0.416 / 0.496 | +5.16% |
| Crowns | 0.241 / 0.410 / 0.518 | 0.248 / 0.429 / 0.528 | +4.78% |
| Road | 0.394 / 0.592 / 0.668 | 0.394 / 0.592 / 0.668 | 0.00% |

Both ends of the turf distribution rise, so brighter did not flatten the existing range. Delivered road/turf median at this frame remains 1.39:1. The authored full-route contract remains 1.50:1 median / 1.30:1 p95, with seam contrast 3.40:1.

After R3, the complete bleach term affects 66.9% of visible turf. Its affected median is 0.431 versus 0.415 around it, and the delivered/bleach-isolated median ratio is 1.115. Post-change Island 02 cloud-shadow duty remains 0% at the matched frame.

## Verification

- Full retained suite: 21/21 passed.
- Budget bearings: 0°, ±22°, ±43°, ±63°; 103–105 stations at 24 m.
- Standard seeds: `PARTING-3311`, `DOWNHEAD-51`, `WETHERBANK-7`, `COLDCOMB-2201`.
- High seeds: `PARTING-3311`, `DOWNHEAD-51`.
- Worst swept budget: 76,927 triangles / 25 calls (`high`, `DOWNHEAD-51`).
- Owner junction: 0.0011 m vertex gap; worst emitted boundary: 0.0045 m.
- Far-mass slabs and the grazing-light crest flank remain open by design and untouched.

## Owner comparison artifacts

- `baseline-middle-6d61a97.png` — self-contained pinned input for the owner-reviewed middle; SHA-256 `cd861c4f503088b56dcb978babe76b1eadd857044be481b5ad734ab59101e862`.
- `middle-before-after-r3.png` — exact `6d61a97` owner-reviewed middle beside R3, same seed/station/yaw/heading.
- `dreamy-compare.png` — Island 01 beside R3 Island 02 with sun azimuth matched relative to local travel.

## Capture provenance

- Base commit at capture: `6d61a976abe465b7a61a6a71b81f7f8f1026f2eb`.
- Candidate source at capture: dirty working-tree `island-02.html`, SHA-256 `f102815dda76bbc83e2f20049d479b612e9acdc75f1ad9ef4ead9fd8d1426fb7`.
- The committed source is expected to retain that exact content hash; `capture-metadata.json` records it independently of Git state.
