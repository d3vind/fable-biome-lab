// ============================================================
// SUMMERGLASS HOLLOW
// A seeded bicycle passage through one remembered summer afternoon.
// Two stages: the PLAN freezes the world's identity from the seed;
// the REALIZATION spends geometry on it at the chosen quality.
// The hills are the argument: they hide, reveal, compress and release.
// ============================================================

const capturedErrors=[];
window.addEventListener('error',(e)=>{ capturedErrors.push(String(e.message||e)); });
window.addEventListener('unhandledrejection',(e)=>{ capturedErrors.push('rejection: '+String((e.reason&&e.reason.message)||e.reason)); });

// ---------- seed + quality ----------
const qs=new URLSearchParams(location.search);
const SEED_TEXT=(qs.get('seed')&&qs.get('seed').length)?qs.get('seed'):'SUMMERGLASS-8421';
// the tier is not read until the plan is frozen; QUALITY_READS records when it
// first was, and the plan stage records the count it saw
let QUALITY_READS=0, QUALITY_READS_AT_PLAN=-1;
const QUALITY=(()=>{ const q=(qs.get('quality')||'standard').toLowerCase();
  return (q==='low'||q==='high')?q:'standard'; })();
const readQuality=()=>{ QUALITY_READS++; return QUALITY; };

function xmur3(str){ let h=1779033703^str.length;
  for(let i=0;i<str.length;i++){ h=Math.imul(h^str.charCodeAt(i),3432918353); h=(h<<13)|(h>>>19); }
  return ()=>{ h=Math.imul(h^(h>>>16),2246822507); h=Math.imul(h^(h>>>13),3266489909); return (h^=h>>>16)>>>0; };
}
const SEED_HASH=xmur3(SEED_TEXT)();
function mb32(a){ return ()=>{ a|=0; a=(a+0x6D2B79F5)|0;
  let t=Math.imul(a^(a>>>15),1|a); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; }; }
function streamFrom(f){
  return {
    f, r:(a,b)=>a+(b-a)*f(), i:(a,b)=>Math.floor(a+(b-a+1)*f()),
    chance:(p)=>f()<p, pick:(arr)=>arr[Math.floor(f()*arr.length)],
    gauss:()=>{ let s=0; for(let k=0;k<4;k++) s+=f(); return (s-2)*0.72; },
  };
}
// named, independent streams — a change in one can never perturb another
function makeStream(name){ return streamFrom(mb32(xmur3(SEED_TEXT+'::'+name)())); }
// positional sub-stream: identity depends on (seed, name, ids) only, never on
// realization order — so an object is the same object every time it re-enters residency
function subStream(name,...ids){ return streamFrom(mb32(xmur3(SEED_TEXT+'::'+name+'#'+ids.join(','))())); }

const ROUTE=makeStream('plan/route'), ELEV=makeStream('plan/elevation'), FORKS=makeStream('plan/fork'),
      LANDF=makeStream('plan/landform'), WATER=makeStream('plan/water'), HERO=makeStream('plan/hero'),
      GROVE=makeStream('plan/groves'), ECO=makeStream('plan/ecology'), LAND=makeStream('plan/landmarks'),
      LIFE=makeStream('plan/life'), SND=makeStream('plan/sound'), WX=makeStream('plan/weather'),
      CLOUD=makeStream('plan/clouds');

// ---------- hashes ----------
function fnv(){ let h=0x811C9DC5; return {
  feed(...vals){ for(const v of vals){ const s=(typeof v==='number')?(Math.abs(v)<1e-7?'0.0000':v.toFixed(4)):String(v);
    for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,0x01000193); } } },
  hex(){ return (h>>>0).toString(16).padStart(8,'0'); } }; }
const H={ route:fnv(), elev:fnv(), terrain:fnv(), eco:fnv(), life:fnv(), weather:fnv(), plan:fnv(), real:fnv() };

// ---------- palette: eight colours, one summer ----------
const PAL={
  sky:0x5EC2E8,            // clear summer sky blue
  cloud:0xFFFBEF,          // warm cloud white
  sunGrass:0xC3E56A,       // pale sunlit grass
  meadow:0x74B851,         // medium summer green
  leafShade:0x3C7A55,      // cool blue-green canopy shadow
  woodDeep:0x1B4239,       // deep woodland teal
  bark:0x6B4A34,           // warm umber bark and soil
  road:0xE9DCB4,           // pale warm road stone
  blossom:0xEBAFB9,        // small blossom / seedhead accent
};
// One eye height for the whole world: the riding camera, the sight lines the
// plan uses to decide what is visible from the road, and the validator that
// checks the camera never ends up inside the terrain.
const EYE_H=1.86, PITCH_BIAS=0.052;
const col=(h)=>new THREE.Color(h);
const mixc=(a,b,t)=>col(a).lerp(col(b),t);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=(a,b,v)=>{ const t=clamp((v-a)/(b-a||1e-6),0,1); return t*t*(3-2*t); };
const TAU=Math.PI*2;
const lumOf=(c)=>0.2126*c.r+0.7152*c.g+0.0722*c.b;

// ---------- frozen value noise ----------
function noiseTable(stream){ const T=new Float32Array(1024); for(let i=0;i<1024;i++) T[i]=stream.f(); return T; }
function makeNoise2(T){
  const hash=(x,y)=>{ let n=(x*374761393+y*668265263)|0; n=(n^(n>>>13))|0; n=Math.imul(n,1274126177); return T[((n^(n>>>16))>>>0)&1023]; };
  return (x,y)=>{
    const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi;
    const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
    return lerp(lerp(hash(xi,yi),hash(xi+1,yi),u),lerp(hash(xi,yi+1),hash(xi+1,yi+1),u),v);
  };
}
const nLand=makeNoise2(noiseTable(LANDF)), nEco=makeNoise2(noiseTable(ECO));
function fbmL(x,y){ return nLand(x,y)*0.53+nLand(x*2.07+7.7,y*2.07+3.1)*0.29+nLand(x*4.31+17.9,y*4.31+11.3)*0.18; }
function fbmE(x,y){ return nEco(x,y)*0.62+nEco(x*2.51+5.1,y*2.51+9.7)*0.38; }
