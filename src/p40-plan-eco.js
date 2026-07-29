// ============================================================
// PLAN — SIGHTLINES
// Corridors that stay clear so a designed view can actually happen.
// ============================================================
const SIGHT=[];
function addSight(g0,g1,side,half,tag){ SIGHT.push({g0,g1,side,half,tag}); }
function inSight(x,z,g,d,side){
  for(const S of SIGHT){
    if(g<S.g0||g>S.g1) continue;
    if(S.side&&S.side!==side) continue;
    if(d<S.half) return true;
  }
  return false;
}

// ---------- crests, measured on the built profile ----------
const CRESTS=[];
{
  const y=ELEVATION.y;
  for(let i=6;i<ELEVATION.n-6;i++){
    if(y[i]>y[i-1]&&y[i]>=y[i+1]){
      let lo=y[i]; for(let j=i;j<Math.min(ELEVATION.n,i+110);j++) lo=Math.min(lo,y[j]);
      let lo2=y[i]; for(let j=i;j>Math.max(0,i-110);j--) lo2=Math.min(lo2,y[j]);
      const prom=Math.min(y[i]-lo,y[i]-lo2);
      if(prom>2.6) CRESTS.push({g:i*EDS,y:y[i],prom});
    }
  }
}

// ============================================================
// PLAN — GROVES
// One cohesive broadleaf family, six structural archetypes, assembled into
// groups: clustered support, backdrop mass, and a few hero silhouettes.
// ============================================================
const FAMS=['oak','beech','birch','leaning','windshaped','orchard'];
const GROVES=[], GROVE_WINDOWS=[], LAYER_WINDOWS=[];
{
  const openMix=['oak','windshaped','orchard','birch','leaning'];
  const woodMix=['beech','oak','beech','birch','oak','leaning'];
  const bankMixT=['birch','beech','oak','windshaped'];
  let g=-70, gi=0, windowBudget=0;
  while(g<L_TOTAL+TAIL-50){
    const encS=enclosureAt(g,'sun'), encM=enclosureAt(g,'moss');
    const inFork=(g>S_SPLIT-60&&g<S_MERGE_G+60);
    const arms=inFork?['sun','moss']:['any'];
    for(const arm of arms){
      const enc=(arm==='moss')?encM:encS;
      const st=subStream('grove',gi,arm);
      const nGroves=enc>0.55?st.i(2,4):(enc>0.25?st.i(1,3):(st.chance(0.7)?1:0));
      for(let q=0;q<nGroves;q++){
        const roll=st.f();
        let role,off,rx,rz,dens;
        if(roll<0.34+0.24*enc){ role='frame'; off=st.r(EXCL+1.4,16); rx=st.r(7,15); rz=st.r(9,22); dens=st.r(0.6,1.0); }
        else if(roll<0.72){ role='support'; off=st.r(20,62); rx=st.r(13,30); rz=st.r(16,40); dens=st.r(0.6,1.0); }
        else if(roll<0.92){ role='wall'; off=st.r(62,168); rx=st.r(30,70); rz=st.r(34,90); dens=st.r(0.7,1.0); }
        else { role='far'; off=st.r(168,420); rx=st.r(60,130); rz=st.r(60,140); dens=st.r(0.5,0.9); }
        const side=st.chance(0.5)?1:-1;
        const mix=(enc>0.5)?woodMix:(role==='frame'?bankMixT:openMix);
        GROVES.push({ id:GROVES.length, g, arm, side, off, rx, rz, rot:st.r(0,TAU), role, dens,
                      mix, enc, hero:st.chance(role==='frame'?0.14:0.07) });
      }
    }
    gi++;
    g+=lerp(52,15,Math.max(encS,encM))*subStream('grovestep',gi).r(0.8,1.25);
  }
  // ---- deliberately composed grove windows -------------------------------
  // each one is a designed opening: mass on one side, a gap that hands the eye
  // forward down the road, and something waiting in the gap.
  const winAt=[
    {g:chapEnd('gate')*0.30, kind:'frame'},
    {g:chapEnd('gate')*0.86, kind:'aperture'},
    {g:lerp(chapEnd('gate'),chapEnd('sunbank'),0.44), kind:'clearing'},
    {g:lerp(chapEnd('sunbank'),chapEnd('fernfold'),0.26), kind:'arch'},
    {g:lerp(chapEnd('sunbank'),chapEnd('fernfold'),0.72), kind:'frame'},
    {g:S_SPLIT-GROVE.r(70,120), kind:'aperture'},
    {g:lerp(chapEnd('fork'),chapEnd('joining'),0.24), kind:'arch'},
    {g:lerp(chapEnd('fork'),chapEnd('joining'),0.55), kind:'frame'},
    {g:lerp(chapEnd('fork'),chapEnd('joining'),0.86), kind:'aperture'},
    {g:POOL.apertureG, kind:'water-aperture'},
    {g:MOSSPOOL.apertureG, kind:'water-aperture'},
    {g:lerp(chapEnd('glasswater'),chapEnd('cloudstep'),0.42), kind:'clearing'},
    {g:chapEnd('cloudstep')+GROVE.r(120,220), kind:'frame'},
    {g:L_TOTAL-GROVE.r(230,300), kind:'clearing'},
  ];
  for(const w of winAt){
    const st=subStream('window',Math.round(w.g));
    const side=(w.kind==='water-aperture')?POOL.side:(st.chance(0.5)?1:-1);
    const gap=st.r(15,26);
    GROVE_WINDOWS.push({g:w.g,kind:w.kind,side,gap});
    // mass on the far side of the gap, and a shoulder of mass in front of it
    GROVES.push({id:GROVES.length,g:w.g-st.r(16,30),arm:'any',side:-side,off:st.r(EXCL+2.2,17),
      rx:st.r(9,15),rz:st.r(13,24),rot:st.r(0,TAU),role:'frame',dens:st.r(0.85,1.0),
      mix:['oak','beech','leaning'],enc:0.7,hero:st.chance(0.5),window:w.kind});
    GROVES.push({id:GROVES.length,g:w.g+st.r(20,44),arm:'any',side,off:st.r(26,54),
      rx:st.r(16,28),rz:st.r(20,38),rot:st.r(0,TAU),role:'support',dens:st.r(0.7,0.95),
      mix:['beech','oak','birch'],enc:0.6,hero:false,window:w.kind});
    // and the gap itself is kept honest
    addSight(w.g-6,w.g+gap,side,w.kind==='water-aperture'?34:20,w.kind);
  }
  // ---- three-layer forest windows ---------------------------------------
  // near framing, an occluding midground, and a separate far mass beyond 150 m
  const layerAt=[
    lerp(chapEnd('sunbank'),chapEnd('fernfold'),0.40),
    lerp(chapEnd('sunbank'),chapEnd('fernfold'),0.80),
    lerp(chapEnd('fork'),chapEnd('joining'),0.16),
    lerp(chapEnd('fork'),chapEnd('joining'),0.46),
    lerp(chapEnd('fork'),chapEnd('joining'),0.74),
    lerp(chapEnd('joining'),chapEnd('glasswater'),0.30),
    lerp(chapEnd('glasswater'),chapEnd('cloudstep'),0.18),
  ];
  for(const lg of layerAt){
    const st=subStream('layer',Math.round(lg));
    const side=st.chance(0.5)?1:-1;
    LAYER_WINDOWS.push({g:lg,side});
    GROVES.push({id:GROVES.length,g:lg+st.r(-6,10),arm:'any',side,off:st.r(EXCL+1.8,14),
      rx:st.r(6,11),rz:st.r(8,15),rot:st.r(0,TAU),role:'frame',dens:1.0,
      mix:['oak','beech','leaning'],enc:0.85,hero:st.chance(0.4),layer:'near'});
    GROVES.push({id:GROVES.length,g:lg+st.r(24,58),arm:'any',side:-side,off:st.r(31,74),
      rx:st.r(22,40),rz:st.r(26,52),rot:st.r(0,TAU),role:'wall',dens:1.0,
      mix:['beech','oak','beech'],enc:0.9,hero:false,layer:'mid'});
    GROVES.push({id:GROVES.length,g:lg+st.r(70,150),arm:'any',side:st.chance(0.5)?1:-1,off:st.r(175,330),
      rx:st.r(70,140),rz:st.r(70,150),rot:st.r(0,TAU),role:'far',dens:1.0,
      mix:['beech','oak'],enc:0.9,hero:false,layer:'far'});
  }
  for(const gr of GROVES) H.eco.feed(gr.g,gr.off,gr.side,gr.role);
}

// ============================================================
// PLAN — LANDMARKS
// One hero, two secondary formations, and the small pieces of landscape
// architecture that explain how the land is used. Nothing invented.
// ============================================================
const HERO_G=L_TOTAL-LAND.r(300,380);
const HERO_SIDE=HERO.chance(0.5)?1:-1;
const HERO_OFF=HERO.r(24,30);
const heroFr=getFrame(FRAMES.sun,toLocal('sun',HERO_G));
const HERO_POS=new THREE.Vector3(heroFr.x+heroFr.lx*HERO_OFF*HERO_SIDE,0,heroFr.z+heroFr.lz*HERO_OFF*HERO_SIDE);
HERO_POS.y=groundY(HERO_POS.x,HERO_POS.z);
addSight(HERO_G-460,HERO_G+40,0,26,'bellroot-approach');
addSight(30,104,0,11,'opening');

// The Dappled Gate: one old asymmetrical tree holds the near foreground and a
// younger one answers it further on, neither of them standing in the road view.
const GATE_TREES=(()=>{
  const st=subStream('gate',0);
  const side=st.chance(0.5)?1:-1;
  const out=[];
  out.push({g:st.r(11,17),side,off:EXCL+st.r(2.2,3.6),fam:'oak',scl:st.r(1.22,1.48),lean:0.9});
  out.push({g:st.r(32,44),side:-side,off:EXCL+st.r(3.5,6.5),fam:'leaning',scl:st.r(0.9,1.1),lean:-0.9});
  out.push({g:st.r(52,66),side,off:EXCL+st.r(5,11),fam:'birch',scl:st.r(0.85,1.05),lean:0.4});
  return out;
})();

// The Wind Sisters: three wind-shaped trees on a skyline ridge, planned so that
// they can be read from Sunbank and again, from the other side, at Glasswater.
const SISTERS=(()=>{
  // A callback only works if the same thing can genuinely be seen twice. The
  // route bows; collect the station pairs, chapters apart, that come closest in
  // space, and stand the Sisters on a knoll between the first pair that works.
  const pairs=[];
  for(let gA=chapEnd('gate')*0.5;gA<chapEnd('fernfold')-60;gA+=30){
    const a=getFrame(FRAMES.sun,toLocal('sun',gA));
    let bestB=null;
    for(let gB=Math.max(gA+1500,chapEnd('fork'));gB<L_TOTAL-200;gB+=30){
      const b=getFrame(FRAMES.sun,toLocal('sun',gB));
      const d=Math.hypot(a.x-b.x,a.z-b.z);
      if(!bestB||d<bestB.d) bestB={gA,gB,d,a,b};
    }
    if(bestB) pairs.push(bestB);
  }
  pairs.sort((p,q)=>p.d-q.d);
  // keep a handful of well-separated candidates rather than five neighbours
  const cand=[];
  for(const p of pairs){ if(cand.every(c=>Math.abs(c.gA-p.gA)>180)) cand.push(p); if(cand.length>=6) break; }
  const sees=(fr,x,z,y)=>{
    const ex=fr.x, ez=fr.z, ey=fr.y+EYE_H;
    const D=Math.hypot(x-ex,z-ez);
    if(D>1500||D<130) return false;
    for(let t=0.05;t<0.96;t+=0.028){
      const px=lerp(ex,x,t), pz=lerp(ez,z,t);
      if(groundY(px,pz)>lerp(ey,y,t)+1.0) return false;
    }
    return true;
  };
  let best=null;
  for(let ci=0;ci<cand.length;ci++){
    const P=cand[ci], a=P.a, b=P.b, gap=P.d;
    let local=null;
    for(let t=0;t<200;t++){
      const st=subStream('sisters',ci,t);
      const spread=clamp(0.42-gap/9000,0.14,0.42);
      const mx=lerp(a.x,b.x,st.r(0.5-spread,0.5+spread)), mz=lerp(a.z,b.z,st.r(0.5-spread,0.5+spread));
      const ang=st.r(0,TAU), rad=st.r(180,Math.max(240,Math.min(470,gap*0.28)));
      const x=mx+Math.cos(ang)*rad, z=mz+Math.sin(ang)*rad;
      if(routeInfo(x,z).d<190) continue;
      let bx=x,bz=z,by=groundY(x,z);
      for(let k=0;k<12;k++){
        const aa=k/12*TAU, cx2=x+Math.cos(aa)*38, cz2=z+Math.sin(aa)*38;
        if(routeInfo(cx2,cz2).d<190) continue;
        const cy=groundY(cx2,cz2);
        if(cy>by){ bx=cx2; bz=cz2; by=cy; }
      }
      const crown=by+30;
      const vA=sees(a,bx,bz,crown), vB=sees(b,bx,bz,crown);
      const score=(vA?1000:0)+(vB?1000:0)+by
        -Math.abs(Math.hypot(bx-a.x,bz-a.z)-Math.hypot(bx-b.x,bz-b.z))*0.05;
      if(!local||score>local.score) local={x:bx,y:by,z:bz,score,gA:P.gA,gB:P.gB,vA,vB,pairD:gap,a,b};
      if(vA&&vB&&t>16) break;
    }
    if(local&&(!best||local.score>best.score)) best=local;
    if(best&&best.vA&&best.vB) break;
  }
  if(!best){ const P=cand[0]||{a:{x:0,z:0},b:{x:0,z:0},gA:0,gB:0,d:0};
    const x=P.a.x+380,z=P.a.z+200; best={x,y:groundY(x,z),z,score:0,gA:P.gA,gB:P.gB,pairD:P.d,a:P.a,b:P.b}; }
  // how high the crown must stand for both viewpoints to clear the ground
  // between: measured, not guessed
  best.needCrown=(()=>{
    let need=best.y+16;
    for(const fr of [best.a,best.b]){
      const ey=fr.y+EYE_H;
      for(let t=0.08;t<0.97;t+=0.02){
        const px=lerp(fr.x,best.x,t), pz=lerp(fr.z,best.z,t);
        const obst=groundY(px,pz)+1.2;
        if(obst>ey) need=Math.max(need,ey+(obst-ey)/t);
      }
    }
    return need;
  })();
  return best;
})();
// they stand on a knoll of their own — one deliberate rise on the skyline,
// which is also what lets two chapters recognise the same piece of country
KNOLL={ x:SISTERS.x, z:SISTERS.z, r:LAND.r(175,240),
        h:clamp(SISTERS.needCrown-SISTERS.y-11,LAND.r(30,42),96) };
SISTERS.y=groundY(SISTERS.x,SISTERS.z);
// The Orchard Row: wind-shaped trees stepping along the Sunpath ridge
const ORCHARD_ROW={ g:(S_SPLIT+S_MERGE_G)*0.5+LAND.r(-40,30), arm:'sun',
                    side:FORK_SIDE, off:LAND.r(21,30), n:LAND.i(6,8), spacing:LAND.r(12,17) };
// restrained landscape architecture, and nothing else
const BRIDGE_G=(()=>{
  const s0=toLocal('sun',BECK_XG);
  let bd=1e9,bg=s0;
  for(let s=s0-50;s<s0+50;s+=2){
    const fr=getFrame(FRAMES.sun,clamp(s,0,FRAMES.sun.len-1));
    const si=streamInfo(fr.x,fr.z);
    if(si.d<bd){ bd=si.d; bg=s; } }
  return {sLocal:bg,dist:bd,arm:'sun'};
})();
const WALL_G=lerp(S_SPLIT,S_MERGE_G,LAND.r(0.55,0.72));
H.eco.feed(HERO_G,HERO_SIDE,SISTERS.x,SISTERS.z,ORCHARD_ROW.g,BRIDGE_G.sLocal,BECK_XG);

// ============================================================
// PLAN — THE TREES THEMSELVES
// Position and identity are world identity; only their representation
// is allowed to change with quality.
// ============================================================
const TREES=[];
const treeCell=40, treeGrid=new Map();
function treeAdd(t){
  TREES.push(t);
  const k=rKey(Math.floor(t.x/treeCell),Math.floor(t.z/treeCell));
  let c=treeGrid.get(k); if(!c){c=[];treeGrid.set(k,c);} c.push(t);
}
function treeNear(x,z,r){
  const gx=Math.floor(x/treeCell), gz=Math.floor(z/treeCell), R=Math.ceil(r/treeCell);
  for(let ax=gx-R;ax<=gx+R;ax++) for(let az=gz-R;az<=gz+R;az++){
    const c=treeGrid.get(rKey(ax,az)); if(!c) continue;
    for(const t of c) if((t.x-x)*(t.x-x)+(t.z-z)*(t.z-z)<r*r) return true; }
  return false;
}
function famScale(fam,st){
  return { oak:st.r(1.0,1.35), beech:st.r(1.0,1.3), birch:st.r(0.78,1.05),
           leaning:st.r(0.86,1.15), windshaped:st.r(0.8,1.08), orchard:st.r(0.52,0.76) }[fam];
}
{
  for(const gr of GROVES){
    const arm=(gr.arm==='moss')?'moss':'sun';
    if(gr.arm==='moss'&&!(gr.g>S_SPLIT-80&&gr.g<S_MERGE_G+80)) continue;
    const fr=getFrame(FRAMES[arm],clamp(toLocal(arm,gr.g),0,FRAMES[arm].len-1));
    const cx=fr.x+fr.lx*gr.off*gr.side, cz=fr.z+fr.lz*gr.off*gr.side;
    const area=Math.PI*gr.rx*gr.rz;
    const target=Math.round(clamp(area/ (gr.role==='frame'?95:(gr.role==='support'?150:(gr.role==='wall'?230:520))) *gr.dens,1,46));
    const st=subStream('trees',gr.id);
    let placed=0;
    for(let att=0;att<target*9&&placed<target;att++){
      const a=st.r(0,TAU), rr=Math.sqrt(st.f());
      const ex=Math.cos(a)*gr.rx*rr, ez=Math.sin(a)*gr.rz*rr;
      const ca=Math.cos(gr.rot), sa=Math.sin(gr.rot);
      const x=cx+ex*ca-ez*sa, z=cz+ex*sa+ez*ca;
      const ri=routeInfo(x,z);
      const fam=st.pick(gr.mix);
      const scl=famScale(fam,st)*(gr.hero&&placed===0?st.r(1.28,1.55):1);
      const rad=1.5*scl;
      if(ri.d<EXCL+rad+0.6) continue;
      if(ri.dA[1]<EXCL+rad+0.6&&gr.g>S_SPLIT-90&&gr.g<S_MERGE_G+90) continue;
      if(streamInfo(x,z).d<4.0) continue;
      let inPond=false;
      for(const P of PONDS) if(Math.hypot((x-P.cx)/(P.rx*1.25),(z-P.cz)/(P.rz*1.25))<1) inPond=true;
      if(inPond) continue;
      // nothing stands in the shelf: the whole point of it is an open sight line
      // from the lane down onto the water
      if(inShelf(x,z,1.5)) continue;
      if(Math.hypot(x-HERO_POS.x,z-HERO_POS.z)<64) continue;
      if(inSight(x,z,ri.s,ri.d,gr.side)) continue;
      if(treeNear(x,z,2.0*scl+st.r(0.4,2.4))) continue;
      const y=groundY(x,z);
      treeAdd({ x,y,z,fam,scl,rot:st.r(0,TAU),lean:st.r(-1,1),
        role:(placed===0&&gr.hero)?'hero':gr.role, grove:gr.id,
        d:ri.d, g:toGlobal(ri.arm===1?'moss':'sun',ri.s), roadY:ri.y,
        enc:gr.enc, window:gr.window||null, layer:gr.layer||null });
      placed++;
    }
  }
  // the nose of the wedge between the two lanes: what makes the fork read
  for(let i=0;i<9;i++){
    const st=subStream('wedge',i);
    const g=lerp(S_SPLIT+70,S_MERGE_G-90,st.f());
    const fr=getFrame(FRAMES.sun,clamp(toLocal('sun',g),0,FRAMES.sun.len-1));
    const fm=getFrame(FRAMES.moss,clamp(toLocal('moss',g),0,FRAMES.moss.len-1));
    const mx=lerp(fr.x,fm.x,st.r(0.35,0.65)), mz=lerp(fr.z,fm.z,st.r(0.35,0.65));
    const x=mx+st.r(-7,7), z=mz+st.r(-7,7);
    const ri=routeInfo(x,z);
    if(Math.min(ri.dA[0],ri.dA[1])<EXCL+3) continue;
    if(treeNear(x,z,7)) continue;
    const fam=st.pick(['oak','birch','windshaped','leaning']);
    treeAdd({x,y:groundY(x,z),z,fam,scl:famScale(fam,st)*st.r(0.85,1.15),rot:st.r(0,TAU),
      lean:st.r(-1,1),role:'support',grove:-4,d:Math.min(ri.dA[0],ri.dA[1]),g,roadY:ri.y,
      enc:0.35,window:null,layer:null,formation:'fork-wedge'});
  }
  // The Dappled Gate's own trees, placed before anything else can crowd them
  for(let i=0;i<GATE_TREES.length;i++){
    const G=GATE_TREES[i], st=subStream('gatetree',i);
    const fr=getFrame(FRAMES.sun,clamp(G.g,0,FRAMES.sun.len-1));
    const x=fr.x+fr.lx*G.off*G.side, z=fr.z+fr.lz*G.off*G.side;
    const ri=routeInfo(x,z);
    if(ri.d<EXCL) continue;
    treeAdd({x,y:groundY(x,z),z,fam:G.fam,scl:G.scl,rot:st.r(0,TAU),lean:G.lean,
      role:'hero',grove:-3,d:ri.d,g:G.g,roadY:ri.y,enc:0.55,window:'gate',layer:'near',
      formation:'dappled-gate'});
  }
  // The Orchard Row — a deliberate, wind-combed line on the Sunpath ridge
  {
    const fr0=toLocal('sun',ORCHARD_ROW.g);
    for(let i=0;i<ORCHARD_ROW.n;i++){
      const st=subStream('orchardrow',i);
      const fr=getFrame(FRAMES.sun,clamp(fr0+(i-ORCHARD_ROW.n/2)*ORCHARD_ROW.spacing,0,FRAMES.sun.len-1));
      const off=ORCHARD_ROW.off+st.r(-2.5,2.5);
      const x=fr.x+fr.lx*off*ORCHARD_ROW.side, z=fr.z+fr.lz*off*ORCHARD_ROW.side;
      const ri=routeInfo(x,z);
      if(ri.d<EXCL+2) continue;
      treeAdd({x,y:groundY(x,z),z,fam:'windshaped',scl:st.r(0.9,1.12),rot:st.r(0,TAU),
        lean:0.85,role:'landmark',grove:-1,d:ri.d,g:ORCHARD_ROW.g,roadY:ri.y,enc:0.2,
        window:null,layer:null,formation:'orchard-row'});
    }
  }
  // The Wind Sisters — three of them, on the skyline, seen twice from two
  // chapters. A landmark has to be a shape you can name, so they are not three
  // scattered trees: they stand in a line laid across both sight lines so none
  // hides another, at three deliberate heights, all leaning the same way. Tall,
  // taller, short — a silhouette you recognise an hour later from the far side
  // of the hollow.
  {
    const va=Math.atan2(SISTERS.a.x-SISTERS.x,SISTERS.a.z-SISTERS.z);
    const vb=Math.atan2(SISTERS.b.x-SISTERS.x,SISTERS.b.z-SISTERS.z);
    const vm=Math.atan2(Math.sin(va)+Math.sin(vb),Math.cos(va)+Math.cos(vb));
    const across=vm+Math.PI*0.5;
    const SCL=[2.55,3.35,1.95], OFF=[-36,2,31];
    for(let i=0;i<3;i++){
      const st=subStream('sister',i);
      const x=SISTERS.x+Math.sin(across)*OFF[i]+st.r(-3.5,3.5);
      const z=SISTERS.z+Math.cos(across)*OFF[i]+st.r(-3.5,3.5);
      const ri=routeInfo(x,z);
      treeAdd({x,y:groundY(x,z),z,fam:'windshaped',scl:SCL[i],rot:st.r(0,TAU),
        lean:1,role:'landmark',grove:-2,d:ri.d,g:SISTERS.gA,roadY:ri.y,enc:0.06,
        window:null,layer:null,formation:'wind-sisters'});
    }
  }
  TREES.sort((a,b)=>a.g-b.g||a.x-b.x);
  for(let i=0;i<TREES.length;i+=17) H.eco.feed(TREES[i].x,TREES[i].z,TREES[i].fam);
  H.eco.feed(TREES.length);
}
// far canopy masses: efficient scalloped silhouettes on the distant shoulders
const FAR_MASSES=[];
{
  const c0=spineAt(L_TOTAL*0.5);
  for(let i=0;i<64;i++){
    const st=subStream('farmass',i);
    const g=st.r(-200,L_TOTAL+TAIL+200);
    const p=spineAt(clamp(g,0,L_TOTAL+TAIL));
    const a=st.r(0,TAU), rr=st.r(430,1250);
    const x=p.x+Math.cos(a)*rr, z=p.z+Math.sin(a)*rr;
    if(routeInfo(x,z).d<400) continue;
    const y=groundY(x,z);
    if(y<refAt(x,z)-6) continue;                       // masses stand on the rises
    FAR_MASSES.push({x,y,z,len:st.r(110,300),rot:st.r(0,TAU),h:st.r(13,22),depth:st.r(26,60),seed:i});
  }
  H.eco.feed(FAR_MASSES.length);
}
