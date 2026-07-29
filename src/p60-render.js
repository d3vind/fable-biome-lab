// ============================================================
// REALIZATION — quality tiers change representation cost, never identity
// ============================================================
const QCFG={
  low:      { row:5.0,  tile:16, ahead:620,  behind:230, under:0.34, nearD:13, midD:58,  farD:230, shadow:0,    part:0.5, lobe:0, tuftBand:11, capNear:3, capMid:12, bandTreeCap:36, cloudN:13, view:1500, tileView:1500, roundMid:3, dpr:1.0 },
  standard: { row:5.0,  tile:16, ahead:730,  behind:270, under:0.62, nearD:17, midD:70,  farD:300, shadow:1024, part:1.0, lobe:1, tuftBand:15, capNear:5, capMid:16, bandTreeCap:48, cloudN:17, view:1620, tileView:1800, roundMid:6, dpr:1.25 },
  // `lobe` is the icosphere subdivision of a foliage puff: 0=20 triangles,
  // 1=80, 2=320. Now that lobes carry smooth normals, level 2 costs four times
  // the geometry for a difference nobody can see at riding speed — so the top
  // tier spends its budget on reach, density and shadow resolution instead.
  high:     { row:5.0,  tile:16, ahead:790,  behind:255, under:0.84, nearD:22, midD:82,  farD:340, shadow:2048, part:1.3, lobe:1, tuftBand:18, capNear:6, capMid:19, bandTreeCap:58, cloudN:21, view:1900, tileView:2100, roundMid:9, dpr:1.5 },
}[readQuality()];
// `row` and `tile` are NOT cost knobs. They are the spacings at which the
// corridor and the ground field resample the landform, so a coarser value does
// not draw the same hill with fewer triangles — it draws a DIFFERENT hill, and
// everything seated on the surface it produces stands somewhere else. Low tier
// at row 7 and tile 18 moved a tree twenty metres from the road by four metres
// vertically against the standard tier, and thirty-three more by over a quarter
// of a metre. A cheaper tier may remove expression; it may not relocate the same
// tree.
//
// So the ground's own shape is now canonical: every tier samples the corridor at
// five metres and the field at sixteen, and the seating surface is identical at
// all three by construction rather than by coincidence. Tiers still differ in
// everything that is genuinely representation — how far the world reaches, how
// dense the understory is, how many lobes a crown carries, shadow-map size, and
// the device-pixel ceiling — which is where the cost actually lives.
H.real.feed(QUALITY); for(const k of Object.keys(QCFG)) H.real.feed(k,QCFG[k]);

const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.NoToneMapping;
// Each tier owns its own device-pixel ceiling. A shared ceiling meant the
// cheapest tier still paid the most expensive tier's fill cost on a dense
// display, which is exactly backwards.
const DPR_CAP=QCFG.dpr;
// A fixed device-pixel ceiling is a guess about hardware the world has no way of
// making. Standard tier at 1.25 on a retina display renders 1.56 times the CSS
// pixels and then asks for four-sample antialiasing on top of them, and whether
// that fits in a frame depends entirely on the GPU it lands on. The ceiling is
// now the STARTING point of a ladder the world walks down — and back up — from
// its own measured frame time. Nothing about what is drawn changes: the same
// world, the same plan, the same composition, resolved at whatever resolution
// this machine can actually hold sixty frames a second at.
const DPR_LADDER=[DPR_CAP,DPR_CAP*0.88,DPR_CAP*0.78,DPR_CAP*0.68,DPR_CAP*0.58]
  .map(v=>Math.max(0.62,Math.round(v*100)/100));
const DPR_GOV={rung:0, steps:[], hot:0, cool:0, lastChangeAt:-1e9, enabled:true};
function dprNow(){ return Math.min(window.devicePixelRatio||1,DPR_LADDER[DPR_GOV.rung]); }
renderer.setPixelRatio(dprNow());
renderer.setSize(window.innerWidth,window.innerHeight);
renderer.shadowMap.enabled=QCFG.shadow>0;
renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.info.autoReset=false;
document.body.appendChild(renderer.domElement);
let contextLost=false;
renderer.domElement.addEventListener('webglcontextlost',()=>{ contextLost=true; capturedErrors.push('webgl context lost'); });

const scene=new THREE.Scene();
const AIR=mixc(PAL.sky,PAL.sunGrass,0.34).lerp(col(0xffffff),0.16);   // warm pale-green horizon air
scene.background=col(PAL.sky);
scene.fog=new THREE.Fog(AIR,330,QCFG.tileView*1.12);

const camera=new THREE.PerspectiveCamera(58,window.innerWidth/window.innerHeight,0.1,7200);

// one high summer sun, warm, a little to the left of the opening view
const startHd=spineAt(0).hd;
const sunAz=startHd-ELEV.r(0.5,0.95);
const sunEl=ELEV.r(0.52,0.66);       // mid morning: low enough to throw shadows that model the land
const sunDir=new THREE.Vector3(Math.sin(sunAz)*Math.cos(sunEl),Math.sin(sunEl),Math.cos(sunAz)*Math.cos(sunEl)).normalize();
const sun=new THREE.DirectionalLight(mixc(PAL.road,0xFFF3D8,0.30),2.95);
sun.position.copy(sunDir.clone().multiplyScalar(300));
if(QCFG.shadow>0){
  sun.castShadow=true;
  sun.shadow.mapSize.set(QCFG.shadow,QCFG.shadow);
  sun.shadow.camera.near=40; sun.shadow.camera.far=560;
  sun.shadow.camera.left=-78; sun.shadow.camera.right=78;
  sun.shadow.camera.top=78; sun.shadow.camera.bottom=-78;
  // a large normal bias erases exactly the contact shadow that tells you a
  // tree is standing on this ground rather than hovering over it
  sun.shadow.bias=-0.00042; sun.shadow.normalBias=0.10;
}
scene.add(sun); scene.add(sun.target);
// sky fill is cool and woodland bounce is warm, and the fill is kept well under
// the sun so cast shadows stay legible instead of being washed flat
const hemi=new THREE.HemisphereLight(mixc(PAL.sky,0xE8F4FF,0.30),mixc(PAL.meadow,PAL.bark,0.30),0.76);
scene.add(hemi);
H.real.feed(sunAz,sunEl);

// ---------- the world light field, shared by every lit surface ----------
// The value noise below is evaluated between six and thirteen times per fragment
// on every lit surface in the world — cloud shadow, canopy dapple, and the
// meadow's own paint. Each evaluation needs four corner hashes, and the hash was
// `fract(sin(dot(p,k))*43758.5453)`: a transcendental. That is fifty-odd sines
// per ground pixel, which is the world's real per-pixel cost — geometry is
// nowhere near the budget, fill is.
//
// The four corner hashes of a cell are now baked into one RGBA texel and fetched
// in a single tap. The interpolation that follows is untouched, so this is the
// same KIND of field at the same frequencies; the table is baked with wrap-around
// so it is exactly periodic at 512 cells and has no seam. At the frequencies
// actually used that period is 465 m for the canopy dapple's finest octave and
// 138 m for the ground grain — well beyond the range at which either is a
// legible pattern rather than texture.
//
// It is NOT bit-identical to what the sines produced, and it could not have been:
// `sin` at sixty thousand radians in a 32-bit fragment shader is dominated by
// argument-reduction error, which is a property of the GPU rather than of the
// world. The low-frequency octaves — every cloud shadow, which is the only part
// of this field that composes anything — land at cell indices in the single
// digits and are unchanged. The high-frequency octaves are ground grain and
// canopy mottle, and those were previously being drawn differently on different
// hardware. They are now the same everywhere.
const NOISE_N=512;
const noiseTex=(()=>{
  const h=(x,y)=>{
    // the exact hash the shader used, evaluated once on the CPU
    const s=Math.sin(x*127.1+y*311.7)*43758.5453;
    return s-Math.floor(s);
  };
  const d=new Uint8Array(NOISE_N*NOISE_N*4);
  const q=v=>Math.min(255,Math.max(0,Math.round(v*255)));
  for(let j=0;j<NOISE_N;j++){
    const j1=(j+1)%NOISE_N;
    for(let i=0;i<NOISE_N;i++){
      const i1=(i+1)%NOISE_N, o=(j*NOISE_N+i)*4;
      d[o]=q(h(i,j)); d[o+1]=q(h(i1,j)); d[o+2]=q(h(i,j1)); d[o+3]=q(h(i1,j1));
    }
  }
  const t=new THREE.DataTexture(d,NOISE_N,NOISE_N,THREE.RGBAFormat);
  t.minFilter=t.magFilter=THREE.NearestFilter;
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.generateMipmaps=false; t.needsUpdate=true;
  return t;
})();
const WL={ uWTime:{value:0},
  uCloudMove:{value:new THREE.Vector2(CLOUD.r(-1,1),CLOUD.r(-1,1)).normalize()},
  uWet:{value:0}, uGlint:{value:new THREE.Vector4(0,0,0,0)},  // glint: xz centre, w strength
  uNoiseTex:{value:noiseTex} };
// The part both shader stages need. Injected into vertex shaders so the cloud
// shadow can be evaluated there, and into fragment shaders for everything else.
const WL_CORE=`
uniform float uWTime; uniform vec2 uCloudMove;
uniform sampler2D uNoiseTex;
// the wrap is done here rather than left to the sampler: the finest octaves put
// cell indices in the tens of thousands, and a texcoord that large loses
// sub-texel precision inside the sampler on some hardware
vec4 wlCell(vec2 i){ return texture2D(uNoiseTex,(mod(i,${NOISE_N}.0)+0.5)/${NOISE_N}.0); }
float wlHash(vec2 p){ return wlCell(floor(p)).x; }
float wlNoise(vec2 p){ vec2 i=floor(p),f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  vec4 h=wlCell(i);
  return mix(mix(h.x,h.y,u.x),mix(h.z,h.w,u.x),u.y); }
float cloudShadowAt(vec2 w){
  vec2 p=(w+uCloudMove*uWTime*0.42)*0.00185;
  float n=wlNoise(p)*0.62+wlNoise(p*2.4+7.1)*0.38;
  float s=smoothstep(0.545,0.735,n);
  return clamp(1.0-0.40*s,0.34,1.0);
}
// The scale factor above makes one noise cell 540 m across and the second octave
// 225 m. Across a single pixel that value changes by about one part in a hundred
// thousand — this is a per-vertex quantity, and it was being paid for per pixel
// on every lit surface in the world. It is now computed once per vertex and
// interpolated. The finest mesh that carries it is the corridor at five-metre
// rows; a 225 m minimum feature interpolated over a five-metre edge is exact to
// well under a colour step. This alone takes the tree material's noise count to
// zero over the fifteen to twenty per cent of the screen the canopy covers.
`;
// Every lit material sets `vCloud` in its vertex stage and reads it in its
// fragment stage, so this pair is written once rather than four times.
const WL_VERT_DECL='\nvarying float vCloud;\n'+WL_CORE;
const WL_VERT_SET=' vCloud=cloudShadowAt(wp2.xz);';
const WL_GLSL=WL_CORE+`
uniform float uWet; uniform vec4 uGlint;
varying float vCloud;
float dappleAt(vec2 w,float canopy){
  if(canopy<0.02) return 1.0;
  float n=wlNoise(w*0.135)*0.54+wlNoise(w*0.41+31.7)*0.31+wlNoise(w*1.1+11.3)*0.15;
  float sway=wlNoise(w*0.08+vec2(uWTime*0.055,uWTime*0.041));
  float cut=smoothstep(0.455+0.07*sway,0.63,n);
  return mix(1.0,mix(0.42,1.06,cut),clamp(canopy,0.0,1.0));
}`;
// The painted meadow field. The broad composition — where grass is pale and
// lively, where it stays deep, where it dries out — is decided by the plan and
// baked into vertex colour. What that cannot give is the short-range life of a
// summer field, because the ground mesh is metres per vertex. So the last two
// octaves live here, world-locked so they never swim under the camera: grazing
// and growth patches at a few metres, drier bleached ground on the exposures,
// and rare bare loam where something has worn through.
const MEADOW_GLSL=`
{
  float clump=wlNoise(vWPos.xz*0.42+vec2(4.7,1.9))*0.58+wlNoise(vWPos.xz*1.05+vec2(9.1,6.3))*0.42;
  float coarse=wlNoise(vWPos.xz*0.085+vec2(21.0,13.0));
  float lush=smoothstep(0.40,0.78,clump*0.65+coarse*0.35);
  // greener, slightly bluer where growth is thick; warmer and paler where it is thin
  diffuseColor.rgb*=mix(vec3(1.08,1.045,0.94),vec3(0.90,0.965,0.93),lush);
  float dry=smoothstep(0.60,0.86,coarse*0.7+wlNoise(vWPos.xz*0.30+vec2(31.0,2.0))*0.3);
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.20,1.10,0.80),dry*0.45);
  float bare=smoothstep(0.80,0.93,wlNoise(vWPos.xz*0.62+vec2(55.0,17.0)));
  diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.40,0.33,0.23),bare*0.34);
  // A fine grain so the surface never reads as a flat fill up close. This was two
  // octaves at 3.7 and 9.1 cycles per metre — features 27 cm and 11 cm across.
  // Past about twenty-five metres both are well under a pixel, so the finer one
  // was contributing nothing but shimmer to a plus-or-minus three per cent
  // brightness dither, on the material that covers two fifths of the screen.
  float grain=wlNoise(vWPos.xz*3.7);
  diffuseColor.rgb*=0.965+0.07*grain;
}`;
function groundedMat(mat,opts){
  const o=opts||{};
  mat.onBeforeCompile=(sh)=>{
    Object.assign(sh.uniforms,WL);
    sh.vertexShader=sh.vertexShader
      .replace('#include <common>','#include <common>\nvarying vec3 vWPos;'+(o.canopy?'\nattribute float aCanopy; varying float vCanopy;':'')+WL_VERT_DECL)
      .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\n{ vec4 wp2=modelMatrix*vec4(transformed,1.0);\n#ifdef USE_INSTANCING\n wp2=modelMatrix*instanceMatrix*vec4(transformed,1.0);\n#endif\n vWPos=wp2.xyz;'+WL_VERT_SET+(o.canopy?' vCanopy=aCanopy;':'')+' }');
    sh.fragmentShader=sh.fragmentShader
      .replace('#include <common>','#include <common>\nvarying vec3 vWPos;'+(o.canopy?'varying float vCanopy;':'const float vCanopy=0.0;')+'\n'+WL_GLSL)
      .replace('#include <color_fragment>','#include <color_fragment>\n'+(o.meadow?MEADOW_GLSL:'')+(o.wet?`
        { float wet=uWet*(0.55+0.45*wlNoise(vWPos.xz*0.35));
          diffuseColor.rgb*=mix(1.0,0.80,wet); }`:''))
      .replace('vec3 outgoingLight = ',
        'float wl=vCloud*dappleAt(vWPos.xz,vCanopy);\n'+
        'reflectedLight.directDiffuse*=wl;\nreflectedLight.indirectDiffuse*=mix(0.84,1.0,wl);\nvec3 outgoingLight = ');
  };
  return mat;
}

// ============================================================
// GROUND COLOUR — broad painted fields, value banded by slope, light,
// moisture and exposure. No default grey exists anywhere in this world.
// ============================================================
const C_SUN=col(PAL.sunGrass), C_MEAD=col(PAL.meadow), C_SHADE=col(PAL.leafShade),
      C_DEEP=col(PAL.woodDeep), C_BARK=col(PAL.bark), C_ROAD=col(PAL.road);
const C_DRY=mixc(PAL.sunGrass,PAL.road,0.42);
const C_LOAM=mixc(PAL.bark,PAL.woodDeep,0.42);
const _gc=new THREE.Color();
function groundColor(x,z,slope,enc,moist,rel){
  const t=fbmE(x/150+3.1,z/150+9.4)*0.62+fbmE(x/47+21.3,z/47+7.7)*0.38;
  const t2=fbmE(x/23+17.7,z/23+5.5);
  // sunlit tops pale and lively; folds keep a deeper summer green
  let e=clamp(0.16+t*1.05+rel*0.040-slope*1.55,0,1);
  _gc.copy(C_MEAD).lerp(C_SUN,e);
  _gc.lerp(C_DRY,clamp((slope-0.24)*1.7,0,0.46)*clamp(1-moist*1.6,0,1)*(0.45+0.55*t2));
  _gc.lerp(C_SHADE,clamp(enc*0.80,0,0.80));
  _gc.lerp(C_DEEP,clamp(moist*0.34+enc*moist*0.5,0,0.45));
  _gc.lerp(C_LOAM,clamp((enc-0.62)*1.5,0,0.34)*clamp(t2*1.3,0,1));
  return _gc;
}
