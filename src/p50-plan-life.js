// ============================================================
// PLAN — AMBIENT LIFE
// Scheduled by global route distance, so an event happens where it was
// planned to happen no matter how fast the rider took the last hill.
// ============================================================
const LIFE_EVENTS=[];
{
  const add=(g,kind,arm,opt)=>LIFE_EVENTS.push(Object.assign({
    g:clamp(g,40,L_TOTAL-30), kind, arm:arm||'any', id:LIFE_EVENTS.length, fired:false },opt||{}));
  const G=chapEnd('gate'), SB=chapEnd('sunbank'), FF=chapEnd('fernfold'), FK=chapEnd('fork'),
        JW=chapEnd('joining'), GW=chapEnd('glasswater'), CS=chapEnd('cloudstep');
  const crestNear=(g)=>{ let best=null;
    for(const c of CRESTS){ if(!best||Math.abs(c.g-g)<Math.abs(best.g-g)) best=c; }
    return best?best.g:g; };

  add(G*0.55,'swallows');                                        // 1
  add(lerp(G,SB,0.22),'butterflies',null,{radius:24});           // 2
  add(crestNear(lerp(G,SB,0.58)),'flock',null,{far:true});       // 3  a field lifts at the crest
  add(lerp(G,SB,0.86),'glint');                                  // 4  seedheads catch, briefly
  add(lerp(SB,FF,0.30),'motes');                                 // 5  light through the first shade
  add(lerp(SB,FF,0.66),'rabbit');                                // 6
  add(lerp(SB,FF,0.90),'swallows');                              // 7
  add(S_SPLIT-90,'deer',null,{far:true});                        // 8  standing in the fork's mouth
  add(lerp(S_SPLIT,S_MERGE_G,0.40),'flock','sun',{far:true});// 9  Sunpath only
  add(lerp(S_SPLIT,S_MERGE_G,0.62),'butterflies','sun',{radius:26});
  add(MOSSPOOL.g-14,'dragonflies','moss',{atPool:'mosswater'});  // 11 Mosswater only
  add(lerp(S_SPLIT,S_MERGE_G,0.70),'deer','moss',{far:true});// 12 Mosswater only
  add(lerp(SB,FF,0.44),'squirrel');                              // 6b Fernfold's edge
  add(lerp(FK,JW,0.18),'motes');                                 // 13
  add(lerp(FK,JW,0.44),'rabbit');                                // 14
  add(lerp(FK,JW,0.58),'squirrel');                              // 14b Joining Woods
  add(lerp(FK,JW,0.70),'swallows');                              // 15
  add(POOL.apertureG+8,'dragonflies',null,{atPool:'glasswater'}); // 16
  add(lerp(GW,CS,0.24),'butterflies',null,{radius:30});          // 17
  add(crestNear(lerp(GW,CS,0.62)),'flock',null,{far:true});      // 18
  add(lerp(GW,CS,0.86),'glint');                                 // 19
  add(CS+120,'swallows');                                        // 20
  add(HERO_G-70,'motes');                                        // 21
  add(HERO_G+95,'rabbit');                                       // 21b past Bellroot
  add(L_TOTAL-190,'butterflies',null,{radius:34});               // 22
  for(const e of LIFE_EVENTS){
    const st=subStream('life',e.id);
    e.dur=st.r(7,15); e.side=st.chance(0.5)?1:-1; e.jit=st.r(-14,14);
    e.g=clamp(e.g+e.jit,40,L_TOTAL-30);
    H.life.feed(e.g,e.kind,e.arm,e.dur,e.side);
  }
  LIFE_EVENTS.sort((a,b)=>a.g-b.g);
}
const LIFE_BRANCH_EXCLUSIVE=LIFE_EVENTS.filter(e=>e.arm!=='any').length;

// ============================================================
// PLAN — SOUND
// ============================================================
const SOUND_PLAN={
  chirpGap:[SND.r(4.5,7),SND.r(11,16)],
  creakGap:[SND.r(42,60),SND.r(75,105)],
  podsAt:HERO_G-SND.r(70,110),
  gustPeriod:SND.r(17,26),
};
H.life.feed(SOUND_PLAN.chirpGap[0],SOUND_PLAN.creakGap[0],SOUND_PLAN.podsAt,SOUND_PLAN.gustPeriod);

// ============================================================
// PLAN — WEATHER
// Bright summer is the default and the default seed keeps it. A warm sun
// shower is seed-selected, arrives late, and clears completely.
// ============================================================
const WEATHER=(()=>{
  const roll=WX.f();
  const has=roll<0.34;
  const startG=lerp(chapEnd('joining'),chapEnd('cloudstep'),WX.r(0.1,0.55));
  const dur=WX.r(48,86);
  const strength=WX.r(0.55,0.85);
  const w={has,roll:Math.round(roll*1e4)/1e4,startG,dur,strength};
  H.weather.feed(roll,has?1:0,startG,dur,strength);
  return w;
})();

// ============================================================
// PLAN HASH — the complete world identity, before any geometry exists
// ============================================================
// PLAN — THE SKY
// The formations are part of this world's identity, not a budget line. How many
// there are, where they sit, how wide they are and which band of depth they
// belong to is decided here, once, before any tier is known. Quality may only
// change how finely each one is tessellated.
// Fewer and larger than before: a sky of a dozen broad masses reads as weather,
// a sky of twenty small ones reads as a texture.
// ============================================================
const CLOUD_PLAN=(()=>{
  const c0=spineAt(L_TOTAL*0.5);
  // three depth bands: the near few carry the drama, the far ones give scale
  const BANDS=[
    {n:CLOUD.i(3,4), rr:[520,1250],  span:[300,470], h:[250,320], lift:[70,110], val:1.00},
    {n:CLOUD.i(4,5), rr:[1250,2300], span:[220,340], h:[330,430], lift:[48,84],  val:0.90},
    {n:CLOUD.i(3,4), rr:[2300,3600], span:[170,260], h:[420,520], lift:[34,62],  val:0.78},
  ];
  const out=[];
  for(let bi=0;bi<BANDS.length;bi++){
    const B=BANDS[bi];
    for(let i=0;i<B.n;i++){
      const a=CLOUD.r(0,TAU), rr=CLOUD.r(B.rr[0],B.rr[1]);
      // the lobes that make one connected mass; they are welded at realization,
      // never drawn as separate spheres
      const nL=CLOUD.i(5,8), lobes=[];
      const spanX=CLOUD.r(B.span[0],B.span[1]);
      // A raft under everything: broad, low, centred. Without it the lobes laid
      // along the formation's length can leave a gap between them, and a cloud
      // with a hole through it is not weather.
      lobes.push({ x:CLOUD.r(-0.06,0.06)*spanX, z:CLOUD.r(-0.05,0.05)*spanX,
                   r:spanX*CLOUD.r(0.38,0.48), dy:0, y:0.18 });
      for(let k=0;k<nL;k++){
        const t=(k+0.5)/nL;
        // `dy` is what makes a cumulus stack instead of spreading: a lobe that
        // sits on the shoulder of the one below builds a tower, and a sky of
        // towers has a silhouette you can read from a moving bicycle.
        lobes.push({ x:(t-0.5)*spanX*CLOUD.r(0.78,1.0)+CLOUD.r(-22,22),
                     z:CLOUD.r(-1,1)*spanX*0.20,
                     r:spanX*CLOUD.r(0.17,0.26)*(1-0.28*Math.abs(t-0.5)*2),
                     dy:CLOUD.chance(0.42)?CLOUD.r(0.18,0.62):CLOUD.r(0,0.10),
                     y:CLOUD.r(0,1) });
      }
      out.push({ band:bi, ang:a, rr, x:c0.x+Math.sin(a)*rr, z:c0.z+Math.cos(a)*rr,
        baseY:CLOUD.r(B.h[0],B.h[1]), lift:CLOUD.r(B.lift[0],B.lift[1]),
        spanX, rot:CLOUD.r(0,TAU), val:B.val, lobes, seed:CLOUD.i(1,1e9) });
    }
  }
  return out;
})();
// ============================================================
// ============================================================
// PLAN — WHERE THE AIR IS VISIBLE
// Airborne life is an event, not a filter. Most of this ride has nothing in the
// air at all; a handful of planned pockets have a shaft of pollen, a pocket of
// motes over water, or one brief breeze carrying leaves. Bellroot keeps its own.
// ============================================================
const AIR_POCKETS=(()=>{
  const out=[];
  const add=(g,w,strength,why)=>out.push({g,w,strength,why});
  // one shaft of light through the Dappled Gate
  add(chapEnd('gate')*LIFE.r(0.42,0.62),LIFE.r(46,70),LIFE.r(0.85,1.15),'light-shaft');
  // one brief breeze on the open ground
  add(lerp(chapEnd('gate'),chapEnd('sunbank'),LIFE.r(0.35,0.7)),LIFE.r(70,110),LIFE.r(0.7,0.95),'breeze');
  // the compression chapter gets one, deep in
  add(lerp(chapEnd('sunbank'),chapEnd('fernfold'),LIFE.r(0.45,0.7)),LIFE.r(40,64),LIFE.r(0.9,1.2),'fernfold-shaft');
  // the water margins
  for(const P of PONDS) add(P.g,LIFE.r(48,74),LIFE.r(0.8,1.1),'water-'+P.name);
  // and the tree the ride is walking towards
  add(HERO_G,LIFE.r(70,96),LIFE.r(1.0,1.3),'bellroot');
  out.sort((a,b)=>a.g-b.g);
  for(const o of out) H.life.feed('air',Math.round(o.g),Math.round(o.w),o.why);
  return out;
})();
function airAmountAt(g){
  // a small residual so the world is not sterile, and a pocket where one was planned
  let v=0.10;
  for(const o of AIR_POCKETS){
    const t=1-clamp(Math.abs(g-o.g)/o.w,0,1);
    v=Math.max(v,0.10+o.strength*t*t*(3-2*t));
  }
  return v;
}
H.eco.feed('sky',CLOUD_PLAN.length);
for(const c of CLOUD_PLAN) H.eco.feed(Math.round(c.x),Math.round(c.z),Math.round(c.spanX),c.band);

const PLAN_SUMMARY={
  seed:SEED_TEXT, routeLengthM:Math.round(L_TOTAL),
  chapters:CH.map(c=>c.name),
  ascentM:Math.round(ELEVATION.asc*10)/10, descentM:Math.round(ELEVATION.desc*10)/10,
  maxGradePct:Math.round(ELEVATION.maxG*1000)/10, rollers:ROLLER_STAT.count,
  crests:CRESTS.length, groves:GROVES.length, groveWindows:GROVE_WINDOWS.length,
  layerWindows:LAYER_WINDOWS.length, plannedTrees:TREES.length, farMasses:FAR_MASSES.length,
  lifeEvents:LIFE_EVENTS.length, enclosureTransitions:ENC_TRANSITIONS,
  forkSide:FORK_SIDE, armLenSun:Math.round(ARM_TRUE.sun), armLenMoss:Math.round(ARM_TRUE.moss),
  shower:WEATHER.has,
};
{
  H.plan.feed(H.route.hex(),H.elev.hex(),H.terrain.hex(),H.eco.hex(),H.life.hex(),H.weather.hex());
  for(const k of Object.keys(PLAN_SUMMARY)) H.plan.feed(k,String(PLAN_SUMMARY[k]));
}

const PLAN_HASH=H.plan.hex();
// A canonical serialization of the frozen plan, and a 64-bit digest of it.
// This is a repeatability checksum, not a cryptographic commitment.
const PLAN_CANONICAL=(()=>{
  const num=(v)=>Math.round(v*1000)/1000;
  const o={
    v:'summerglass-hollow-2r', seed:SEED_TEXT,
    route:{ len:num(L_TOTAL), chapters:CH.map(c=>[c.key,num(c.end)]),
      curve:CURVE.map(c=>[num(c.wl),num(c.a*1e5),num(c.ph)]), openBow:num(OPEN_BOW*1e5) },
    elev:{ trend:num(TREND*1e4), knots:KNOTS.map(k=>[num(k.s),num(k.y)]),
      breath:BREATH.map(b=>[num(b.wl),num(b.a),num(b.ph)]), asc:num(ELEVATION.asc) },
    fork:{ side:FORK_SIDE, split:num(S_SPLIT), len:num(ARM_LEN),
      sunOut:num(SUN_OUT), mossOut:num(MOSS_OUT), lift:num(SUN_LIFT), drop:num(MOSS_DROP) },
    water:{ beck:num(BECK_XG), ponds:PONDS.map(P=>[P.name,num(P.g),num(P.cx),num(P.cz),num(P.rx),num(P.rz)]) },
    land:{ hero:[num(HERO_G),num(HERO_POS.x),num(HERO_POS.z)],
      sisters:[num(SISTERS.x),num(SISTERS.z)], knoll:[num(KNOLL.h),num(KNOLL.r)],
      orchard:num(ORCHARD_ROW.g) },
    eco:{ groves:GROVES.length, trees:TREES.length, far:FAR_MASSES.length,
      windows:GROVE_WINDOWS.map(w=>[num(w.g),w.kind,w.side]),
      layers:LAYER_WINDOWS.map(w=>num(w.g)) },
    life:LIFE_EVENTS.map(e=>[num(e.g),e.kind,e.arm]),
    air:AIR_POCKETS.map(o=>[num(o.g),num(o.w),o.why]),
    sky:CLOUD_PLAN.map(c=>[c.band,num(c.x),num(c.z),num(c.baseY),num(c.spanX),
      c.lobes.map(l=>[num(l.x),num(l.z),num(l.r),num(l.dy)])]),
    weather:[WEATHER.has?1:0,num(WEATHER.startG),num(WEATHER.dur)],
  };
  return JSON.stringify(o);
})();
const PLAN_DIGEST64=(()=>{
  let h1=0x811C9DC5, h2=0x9E3779B9;
  for(let i=0;i<PLAN_CANONICAL.length;i++){
    const c=PLAN_CANONICAL.charCodeAt(i);
    h1=Math.imul(h1^c,0x01000193);
    h2=Math.imul(h2^(c+i),0x85EBCA77);
    h2=(h2<<5)|(h2>>>27);
  }
  return ((h1>>>0).toString(16).padStart(8,'0'))+((h2>>>0).toString(16).padStart(8,'0'));
})();
QUALITY_READS_AT_PLAN=QUALITY_READS;   // the plan stage never asked what tier this is
