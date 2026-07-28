# Reedwake — assembly sources

`/index.html` at the repository root is the deliverable: one self-contained file, no build
step required to run it, no network, no external assets. These are the sources it is
assembled from.

    node .build/build.mjs      # src/*.js + shell.html + vendored three -> /index.html

`three.module.min.js` is the unmodified npm `three@0.160.1` ESM build (MIT). The build
rewrites its single trailing `export{...}` statement into a `globalThis.THREE` assignment
so it can be inlined into a plain `<script type="module">` with no import map.

`extract.mjs` is exactly inverse to `build.mjs`: it recovers these sources from a built
`index.html`. Run extract then build and the result is byte-identical to the input. It is
what reconstructed the sources after the original working tree was lost with its
container, and it is kept because that can happen again.

`t/` holds the verification harness (Playwright against a local static server). It drives
the world through `window.__ctl` and reads `window.__proof`, both of which the build
exposes for exactly this purpose.

## Source order

Files are concatenated in filename order into one module scope, so the numeric prefixes
are the dependency order, not decoration.

| | |
|---|---|
| `00_core` | seeded RNG, noise, canonical JSON + checksum, allocation-free segment distance |
| `10_plan` | the seeded WorldPlan: route, elevation, composition beats, hydrology, landmarks, weather |
| `20_fields` | one deterministic description of the ground; the baked field windows |
| `30_wind` | the single wind authority, CPU side (its GLSL twin is in `35_shaderlib`) |
| `35_shaderlib` | palette, shared GLSL: sky, light, shadow, air, wind |
| `40_sky` `45_terrain` `50_water` | the ground and what sits on it |
| `55_vegetation` `60_trees` | instanced, streamed, placed as a pure function of the cell |
| `65_landmarks` `70_life` `75_audio` | built things, ambient life, procedural sound |
| `80_post` `85_rider` `90_app` | the single post pass, the bicycle, the frame loop |
