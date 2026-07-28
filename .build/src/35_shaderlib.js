/* ==================================================================
 *  SHADER LIBRARY
 *  One palette, one sky, one air, one light. Every material in Reedwake
 *  is built from these chunks, which is why the road, the water, the reeds
 *  and the willows all agree about what time of day it is.
 * ================================================================== */

/* Controlled palette: graphite road, deep reed green, wet olive, lichen,
   straw gold, restrained copper, rain slate, pale tidal sky. */
const GLSL_PALETTE = /* glsl */`
vec3 s2l(vec3 c){ return pow(c, vec3(2.2)); }
#define C_ROAD    vec3(0.243,0.231,0.213)
#define C_ROAD2   vec3(0.336,0.316,0.284)
#define C_REED    vec3(0.243,0.318,0.176)
#define C_REED_D  vec3(0.129,0.192,0.129)
#define C_OLIVE   vec3(0.322,0.338,0.198)
#define C_LICHEN  vec3(0.573,0.616,0.459)
#define C_STRAW   vec3(0.769,0.675,0.416)
#define C_COPPER  vec3(0.635,0.408,0.239)
#define C_SLATE   vec3(0.361,0.416,0.447)
#define C_SKYPALE vec3(0.788,0.831,0.847)
#define C_MUD     vec3(0.263,0.243,0.196)
#define C_WOOD    vec3(0.318,0.271,0.208)
#define C_STONE   vec3(0.396,0.400,0.373)
`;

const GLSL_NOISE = /* glsl */`
float h21(vec2 p){ p = fract(p*vec2(123.34,345.45)); p += dot(p,p+34.345); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = h21(i), b = h21(i+vec2(1,0)), c = h21(i+vec2(0,1)), d = h21(i+vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm2(vec2 p, int oct){
  float v=0.0, a=0.5; mat2 m = mat2(0.80,-0.60,0.60,0.80);
  for(int i=0;i<6;i++){ if(i>=oct) break; v += a*vnoise(p); p = m*p*2.07; a *= 0.5; }
  return v;
}
float fbmAbs2(vec2 p, int oct){
  float v=0.0, a=0.5; mat2 m = mat2(0.80,-0.60,0.60,0.80);
  for(int i=0;i<6;i++){ if(i>=oct) break; v += a*(1.0-abs(vnoise(p)*2.0-1.0)); p = m*p*2.11; a *= 0.5; }
  return v;
}
`;

/* Two baked field windows follow the rider: a tight one at 0.6 m per texel that carries
   the made ground, and a wide one at ~4.7 m that carries the open marsh out to the haze.
   Both fade before their toroidal wrap seam can ever come into view. */
const GLSL_FIELD = /* glsl */`
uniform vec3 uCamPos;
uniform float uTideY;
uniform float uTime;
uniform sampler2D uFieldTex;   uniform vec2 uFieldCenter;  uniform float uFieldSpan;
uniform sampler2D uFieldTexN;  uniform vec2 uFieldCenterN; uniform float uFieldSpanN;

vec4 decodeField(vec4 f){ return vec4(f.r * 9.0 - 4.0, f.g, f.b, f.a); }

vec4 sampleFieldFar(vec2 p){
  vec4 f = decodeField(texture2D(uFieldTex, fract(p / uFieldSpan)));
  vec2 d = abs(p - uFieldCenter);
  float w = 1.0 - smoothstep(uFieldSpan*0.30, uFieldSpan*0.455, max(d.x, d.y));
  return vec4(mix(-0.9, f.x, w), mix(1.0, f.y, w), f.z * w, mix(1.0, f.w, w));
}
vec4 sampleFieldNear(vec2 p){
  return decodeField(texture2D(uFieldTexN, fract(p / uFieldSpanN)));
}
/* The authority for ground height. Near and far windows are blended over a fixed
   world-space band so both terrain shells compute exactly the same surface there. */
vec4 sampleGround(vec2 p){
  vec4 fFar = sampleFieldFar(p);
  float d = distance(p, uCamPos.xz);
  float w = smoothstep(70.0, 55.0, d);
  if (w <= 0.0) return fFar;
  return mix(fFar, sampleFieldNear(p), w);
}
float groundY(vec2 p){ return sampleGround(p).x; }
`;

/* ------------------------------------------------------------------ *
 *  sky, cloud deck, and the air between here and the horizon
 * ------------------------------------------------------------------ */
const GLSL_SKY = /* glsl */`
uniform vec3  uSunDir;
uniform vec3  uSunCol;
uniform float uCloudCover;
uniform vec2  uCloudDrift;
uniform vec4  uCloudBlob[8];    // xy centre on the deck, z radius, w mass
uniform float uWarmth;

// broad accumulated masses with real negative space; seeded blobs keep cloud
// identity fixed across quality tiers
float cloudField(vec2 uv, int oct){
  // two warps at different scales: without this the perspective projection lays the
  // deck down in concentric bands, which reads as a mackerel pattern, not as weather
  vec2 w1 = vec2(fbm2(uv*0.21, 3), fbm2(uv*0.21 + vec2(37.1,11.7), 3));
  vec2 w2 = vec2(fbm2(uv*0.83 + vec2(5.3,9.1), 2), fbm2(uv*0.83 + vec2(21.7,3.3), 2));
  float d = fbmAbs2(uv + (w1-0.5)*3.10 + (w2-0.5)*0.85, oct);
  for (int i=0;i<8;i++){
    vec4 b = uCloudBlob[i];
    if (b.w <= 0.0) continue;
    float q = length((uv - b.xy)/max(b.z,0.001));
    d += b.w * 0.42 * smoothstep(1.0, 0.18, q);
  }
  return d;
}
float cloudMask(vec2 uv, int oct){
  float d = cloudField(uv, oct);
  return smoothstep(uCloudCover, uCloudCover + 0.30, d);
}

// project a view ray onto the deck
vec2 deckUV(vec3 dir, float height, float scale){
  // clamped so the deck compresses into the distance instead of smearing into ripples
  float t = height / max(dir.y, 0.075);
  return (dir.xz * t) * scale + uCloudDrift;
}

vec3 skyColor(vec3 dir, float clouds){
  float up = clamp(dir.y, -0.2, 1.0);
  float sunAmt = clamp(dot(normalize(vec3(uSunDir.x,0.0,uSunDir.z)), normalize(vec3(dir.x,0.0,dir.z))), 0.0, 1.0);
  sunAmt = pow(sunAmt, 2.2);

  vec3 zenith  = s2l(vec3(0.208,0.278,0.361))*0.86;
  vec3 horCold = s2l(vec3(0.573,0.639,0.682))*0.88;
  vec3 horWarm = s2l(vec3(0.827,0.667,0.510))*0.92;
  vec3 hor = mix(horCold, horWarm, sunAmt * (0.35 + 0.65*uWarmth));
  vec3 col = mix(hor, zenith, pow(clamp(up,0.0,1.0), 0.62));

  // low sun sitting just clear of the horizon
  float sd = max(dot(dir, uSunDir), 0.0);
  col += uSunCol * pow(sd, 900.0) * 5.5;
  col += uSunCol * pow(sd, 26.0) * 0.30 * uWarmth;

  if (clouds > 0.0){
    vec2 uvL = deckUV(dir, 1.0, 1.15);
    float m  = cloudMask(uvL, 5);
    float dens = cloudField(uvL, 5);
    // sun-facing flank sampled by stepping the field toward the sun: warm tops, cool bases
    float lit = cloudField(uvL + normalize(uSunDir.xz)*0.16, 4) - dens;
    float top = smoothstep(-0.06, 0.10, lit);
    vec3 cbase = s2l(vec3(0.325,0.365,0.416))*0.90;
    vec3 ctop  = mix(s2l(vec3(0.749,0.769,0.769)), s2l(vec3(0.882,0.749,0.596)), sunAmt*uWarmth)*0.94;
    vec3 ccol  = mix(cbase, ctop, top);
    float horizonSquash = smoothstep(0.030, 0.30, dir.y);   // deck compresses into the distance
    col = mix(col, ccol, m * horizonSquash * clouds);

    // a thin high layer for scale contrast
    vec2 uvH = deckUV(dir, 1.0, 0.42) * 1.7;
    float mh = smoothstep(uCloudCover+0.12, uCloudCover+0.40, fbmAbs2(uvH, 4));
    col = mix(col, mix(cbase, ctop, 0.72), mh * horizonSquash * 0.30 * clouds);
  }
  // mist stacked over the far water
  float band = exp(-max(dir.y,0.0)*10.0);
  col = mix(col, mix(s2l(vec3(0.545,0.600,0.635)), s2l(vec3(0.706,0.639,0.573)), sunAmt*uWarmth), band*0.50);
  return col;
}

// same field, sampled from the ground along the sun ray: the shadows on the marsh
// are cast by the clouds you can actually see
float cloudShadow(vec2 worldXZ){
  vec2 uv = (worldXZ + uSunDir.xz / max(uSunDir.y,0.06) * 900.0) * 0.00092 * 1.15 + uCloudDrift;
  float m = cloudMask(uv, 4);
  return 1.0 - m * 0.62;
}
`;

const GLSL_AIR = /* glsl */`
uniform float uHaze;
uniform float uMist;

// distance + height haze; everything converges on the sky it sits in front of
vec3 applyAir(vec3 col, vec3 worldPos, vec3 viewDir){
  float d = distance(worldPos, uCamPos);
  float hFade = exp(-max(worldPos.y + 1.0, 0.0) * 0.10);
  float f = 1.0 - exp(-d * uHaze * (0.55 + 0.45*hFade));
  vec3 air = skyColor(normalize(vec3(viewDir.x, max(viewDir.y, -0.02), viewDir.z)), 0.55);
  col = mix(col, air, clamp(f, 0.0, 0.985));
  // a low sheet of mist lying on the water
  float mist = uMist * smoothstep(2.6, 0.0, worldPos.y) * (1.0 - exp(-d*0.00085));
  return mix(col, air * 1.06, clamp(mist, 0.0, 0.72));
}
`;

/* ------------------------------------------------------------------ *
 *  shadows — one tight ortho map around the rider, important casters only
 * ------------------------------------------------------------------ */
const GLSL_SHADOW = /* glsl */`
uniform sampler2D uShadowTex;
uniform mat4  uShadowMat;
uniform float uShadowTexel;
uniform float uShadowOn;

float shadowAt(vec3 worldPos, float ndl){
  if (uShadowOn < 0.5) return 1.0;
  vec4 sp = uShadowMat * vec4(worldPos, 1.0);
  vec3 c = sp.xyz / sp.w;
  if (c.x < 0.001 || c.x > 0.999 || c.y < 0.001 || c.y > 0.999 || c.z > 1.0) return 1.0;
  float bias = 0.0016 + 0.0060 * (1.0 - ndl);
  float s = 0.0;
  for (int y=-1; y<=1; y++) for (int x=-1; x<=1; x++){
    float d = texture2D(uShadowTex, c.xy + vec2(float(x),float(y))*uShadowTexel).x;
    s += (c.z - bias > d) ? 0.0 : 1.0;
  }
  s /= 9.0;
  // let it dissolve at the edge of the map instead of ending on a line
  vec2 e = abs(c.xy - 0.5) * 2.0;
  return mix(1.0, s, 1.0 - smoothstep(0.80, 0.99, max(e.x, e.y)));
}
`;

/* ------------------------------------------------------------------ *
 *  lighting — key + sky dome + ground bounce, wrapped for soft first light
 * ------------------------------------------------------------------ */
const GLSL_LIGHT = /* glsl */`
uniform vec3 uSkyAmb;
uniform vec3 uGndAmb;
uniform float uShadowStr;

vec3 shade(vec3 N, vec3 albedo, vec3 worldPos, float ao, float wrap, float transl){
  float ndl = dot(N, uSunDir);
  float key = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
  float sh  = shadowAt(worldPos, clamp(ndl,0.0,1.0));
  float cs  = cloudShadow(worldPos.xz);
  float lit = key * mix(1.0, sh, uShadowStr) * cs;

  float sky = 0.5 + 0.5 * N.y;                       // hemisphere
  vec3 amb = uSkyAmb * sky + uGndAmb * (1.0 - sky);

  // thin leaves and reed blades pass a little light from behind
  float back = clamp(-ndl, 0.0, 1.0) * transl * cs;

  return albedo * (amb * ao + uSunCol * lit * 1.15 + uSunCol * back * 0.55);
}
`;

const GLSL_DITHER = /* glsl */`
float ordered(vec2 p){
  // 8x8 ordered matrix, generated arithmetically
  ivec2 q = ivec2(mod(p, 8.0));
  int i = q.x + q.y*8;
  int b = 0;
  b += ((i>>0)&1)<<5; b += ((i>>3)&1)<<4;
  b += ((i>>1)&1)<<3; b += ((i>>4)&1)<<2;
  b += ((i>>2)&1)<<1; b += ((i>>5)&1);
  return float(b)/64.0 - 0.5;
}
`;

const GLSL_HEAD = GLSL_PALETTE + GLSL_NOISE + GLSL_FIELD;

/** Uniform block shared by every world material — updated once per frame. */
function makeSharedUniforms() {
  const blob = []; for (let i = 0; i < 8; i++) blob.push(new THREE.Vector4(0, 0, 0, 0));
  const fa = []; const fb = [];
  for (let i = 0; i < 3; i++) { fa.push(new THREE.Vector4()); fb.push(new THREE.Vector4()); }
  return {
    uTime: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uSunDir: { value: new THREE.Vector3(0, 0.2, 1) },
    uSunCol: { value: new THREE.Color(1, 0.86, 0.7) },
    uSkyAmb: { value: new THREE.Color(0.30, 0.38, 0.46) },
    uGndAmb: { value: new THREE.Color(0.14, 0.15, 0.12) },
    uWarmth: { value: 0.5 },
    uHaze: { value: 0.00075 },
    uMist: { value: 0.5 },
    uCloudCover: { value: 0.42 },
    uCloudDrift: { value: new THREE.Vector2() },
    uCloudBlob: { value: blob },
    uWindDir: { value: new THREE.Vector2(1, 0) },
    uWindBase: { value: 4 },
    uWindAng: { value: 0 },
    uFrontA: { value: fa },
    uFrontB: { value: fb },
    uFieldTex: { value: null },
    uFieldCenter: { value: new THREE.Vector2() },
    uFieldSpan: { value: 2400 },
    uFieldTexN: { value: null },
    uFieldCenterN: { value: new THREE.Vector2() },
    uFieldSpanN: { value: 160 },
    uShadowTex: { value: null },
    uShadowMat: { value: new THREE.Matrix4() },
    uShadowTexel: { value: 1 / 1024 },
    uShadowOn: { value: 1 },
    uShadowStr: { value: 1 },
    uTideY: { value: 0 },
  };
}

/** Merge shared uniforms into a material's own set without copying values. */
function withShared(shared, own) {
  const o = Object.assign({}, own);
  for (const k in shared) if (!(k in o)) o[k] = shared[k];
  return o;
}
