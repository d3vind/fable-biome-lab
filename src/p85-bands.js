// ============================================================
// UNDERSTORY AND GROUND CONTACT
// Grass is mostly a painted field. Instanced growth appears where it breaks a
// silhouette: verge tops, bank edges, hollows, water margins, tree feet.
// ============================================================
function underMaterial(){
  const m=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide,
    emissive:new THREE.Color(0x0d1006),emissiveIntensity:1});
  m.onBeforeCompile=(sh)=>{
    Object.assign(sh.uniforms,WL);
    sh.vertexShader=sh.vertexShader
      .replace('#include <common>','#include <common>\nattribute float aSway; attribute float aCanopy; attribute float aKind; attribute float aUp;\nvarying vec3 vWPos; varying float vCanopy; varying float vKind;'+WL_VERT_DECL)
      .replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\n objectNormal=mix(objectNormal,vec3(0.0,1.0,0.0),step(0.5,aUp));')
      .replace('#include <begin_vertex>',`#include <begin_vertex>
      {
        float ph=dot(position.xz,vec2(0.19,0.16));
        float gust=sin(uWTime*1.25+ph)*0.6+sin(uWTime*2.4+ph*1.7)*0.26+sin(uWTime*0.47+ph*0.35)*0.42;
        transformed.x+=gust*aSway*0.26; transformed.z+=cos(uWTime*0.97+ph)*gust*aSway*0.15;
      }`)
      .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\n{ vec4 wp2=modelMatrix*vec4(transformed,1.0); vWPos=wp2.xyz;'+WL_VERT_SET+' vCanopy=aCanopy; vKind=aKind; }');
    sh.fragmentShader=sh.fragmentShader
      .replace('#include <common>','#include <common>\nvarying vec3 vWPos; varying float vCanopy; varying float vKind;\n'+WL_GLSL)
      .replace('#include <color_fragment>',`#include <color_fragment>
      { diffuseColor.rgb*=mix(1.0,0.85,uWet);
        if(vKind>0.5&&vKind<1.5&&uGlint.w>0.001){
          float d=distance(vWPos.xz,uGlint.xy);
          float prox=1.0-smoothstep(uGlint.z*0.35,uGlint.z,d);
          float pick=step(0.74,wlHash(floor(vWPos.xz*3.1)));
          diffuseColor.rgb+=vec3(1.0,0.94,0.72)*prox*pick*uGlint.w;
        } }`)
      .replace('vec3 outgoingLight = ','float wl=vCloud*dappleAt(vWPos.xz,vCanopy);\nreflectedLight.directDiffuse*=wl;\nreflectedLight.indirectDiffuse=reflectedLight.indirectDiffuse*mix(0.85,1.0,wl)+diffuseColor.rgb*0.38*wl;\nvec3 outgoingLight = ');
  };
  return m;
}
const underMat=underMaterial();
function UBuf(){ return {p:[],c:[],s:[],k:[],a:[],u:[],sway:0,kind:0,can:0,up:1}; }
function uTri(B,a,b,c,cc){
  B.p.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2]);
  for(let i=0;i<3;i++){ B.c.push(cc.r,cc.g,cc.b); B.s.push(B.sway); B.k.push(B.kind); B.a.push(B.can); B.u.push(B.up); }
}
function uQuad(B,a,b,c,d,cc){ uTri(B,a,b,c,cc); uTri(B,a,c,d,cc); }
function uGeo(B){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(B.p,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(B.c,3));
  g.setAttribute('aSway',new THREE.Float32BufferAttribute(B.s,1));
  g.setAttribute('aKind',new THREE.Float32BufferAttribute(B.k,1));
  g.setAttribute('aCanopy',new THREE.Float32BufferAttribute(B.a,1));
  g.setAttribute('aUp',new THREE.Float32BufferAttribute(B.u,1));
  g.computeVertexNormals();
  return g;
}
// A blade was a TRIANGLE, and a triangle standing on the ground is a spike no
// matter what colour it is or how wide its base — it converges to a point, and a
// point against open sward is exactly the silhouette that reads as a thorn.
// Widening the base and lifting the colour did not change that, which is why
// they kept reading as spikes after both.
//
// A blade is now a quad: wide at the root, still a third of that width at the
// tip, cut off flat and leaning. It has a SHOULDER instead of an apex, so where
// blades overlap the clump has a broken horizontal top edge rather than a row of
// converging needles. One low cross-blade is laid through the middle of the
// clump so the mass reads as a tussock sitting in the grass rather than as a
// bundle of separate leaves standing in a ring.
// a blade: four corners, base rooted and still, top free to move in the wind
function blade(B,ax,ay,az,bx,by,bz,cx,cy,cz,dx2,dy,dz2,cBase,cTop,swayTop){
  const P=[[ax,ay,az,cBase,0],[bx,by,bz,cBase,0],[cx,cy,cz,cTop,swayTop],[dx2,dy,dz2,cTop,swayTop]];
  for(const [i0,i1,i2] of [[0,1,2],[0,2,3]]){
    for(const k of [i0,i1,i2]){
      const v=P[k];
      B.p.push(v[0],v[1],v[2]); B.c.push(v[3].r,v[3].g,v[3].b);
      B.s.push(v[4]); B.k.push(0); B.a.push(B.can); B.u.push(1);
    }
  }
}
// A clump of grass at the fifteen to forty metres these are actually seen from
// is a MASS with a ragged top, not a bundle of leaves. Both previous shapes tried
// to draw the leaves: pointed triangles read as thorns, and blunting them into
// quads only turned the thorns into little dark flags. What already reads
// correctly at this scale in this world is the low shrub mound, so a tussock is
// now built the same way — a small dome carrying the ground's own colour, with
// two or three short blades breaking its outline so it does not read as a pebble.
function addTuft(B,x,y,z,st,cLo,cHi,h,blades){
  B.kind=0; B.sway=0;
  addBlob(B,x,y+h*0.13,z,st,h*st.r(0.50,0.68),h*st.r(0.34,0.46),h*st.r(0.50,0.68),
    cHi,cLo,h*0.20);
  const n=Math.max(2,Math.min(3,blades-2));
  for(let i=0;i<n;i++){
    const a=st.r(0,TAU), w=h*st.r(0.20,0.32), hh=h*st.r(0.62,0.98);
    const dx=Math.cos(a)*w, dz=Math.sin(a)*w;
    const lean=h*st.r(0.18,0.42);
    const bx=Math.sin(a)*lean, bz=Math.cos(a)*lean;
    const tipW=w*st.r(0.22,0.36);
    blade(B,x-dx,y+h*0.06,z-dz, x+dx,y+h*0.06,z+dz,
            x+bx+Math.cos(a)*tipW,y+hh,z+bz+Math.sin(a)*tipW,
            x+bx-Math.cos(a)*tipW,y+hh,z+bz-Math.sin(a)*tipW, cLo,cHi,hh);
  }
}
function addFern(B,x,y,z,st,cLo,cHi,h){
  B.kind=0; B.sway=h*0.35;
  const n=st.i(3,5);
  for(let i=0;i<n;i++){
    const a=i/n*TAU+st.r(-0.3,0.3), r=h*st.r(0.7,1.1);
    const dx=Math.sin(a), dz=Math.cos(a);
    uQuad(B,[x,y+0.02,z],[x+dx*r*0.35,y+h*0.42,z+dz*r*0.35],
            [x+dx*r,y+h*0.58,z+dz*r],[x+dx*r*0.5,y+h*0.16,z+dz*r*0.5],
            cLo.clone().lerp(cHi,st.r(0.2,0.7)));
  }
  B.sway=0;
}
function addSeedhead(B,x,y,z,st,cStalk,cHead,h){
  B.kind=0; B.sway=h*0.9;
  const a=st.r(0,TAU), lean=st.r(0.04,0.14);
  const tx=x+Math.sin(a)*h*lean, tz=z+Math.cos(a)*h*lean;
  uQuad(B,[x-0.014,y,z],[x+0.014,y,z],[tx+0.010,y+h*0.78,tz],[tx-0.010,y+h*0.78,tz],cStalk);
  B.kind=1;
  for(const b of [0.35,1.92]){
    const dx=Math.sin(b)*h*0.055, dz=Math.cos(b)*h*0.055;
    uQuad(B,[tx-dx,y+h*0.74,tz-dz],[tx+dx,y+h*0.74,tz+dz],
            [tx+dx*0.6,y+h,tz+dz*0.6],[tx-dx*0.6,y+h,tz-dz*0.6],cHead);
  }
  B.kind=0; B.sway=0;
}
function addFlower(B,x,y,z,st,cStem,cPetal,h){
  B.kind=0; B.sway=h*0.7;
  uQuad(B,[x-0.012,y,z],[x+0.012,y,z],[x+0.008,y+h*0.72,z],[x-0.008,y+h*0.72,z],cStem);
  B.kind=2;
  for(const b of [0.2,1.77]){
    const dx=Math.sin(b)*h*0.15, dz=Math.cos(b)*h*0.15;
    uQuad(B,[x-dx,y+h*0.72,z-dz],[x+dx,y+h*0.72,z+dz],
            [x+dx*0.72,y+h*0.96,z+dz*0.72],[x-dx*0.72,y+h*0.96,z-dz*0.72],cPetal);
  }
  B.kind=0; B.sway=0;
}
function addBlob(B,x,y,z,st,rx,ry,rz,cTop,cBot,swayAmt){
  const D=ICOD[0];
  const pu=B.up; B.up=0;
  B.sway=swayAmt||0;
  const p1=st.r(0,TAU);
  const vert=(i)=>{ const vx=D.p.getX(i), vy=D.p.getY(i), vz=D.p.getZ(i);
    const j=1+0.22*Math.sin(Math.atan2(vz,vx)*3+p1);
    return [x+vx*rx*j,y+(vy<0?vy*0.5:vy)*ry*j,z+vz*rz*j,vy]; };
  for(let i=0;i<D.idx.length;i+=3){
    const a=vert(D.idx[i]), b=vert(D.idx[i+1]), c=vert(D.idx[i+2]);
    const ym=(a[3]+b[3]+c[3])/3;
    uTri(B,[a[0],a[1],a[2]],[b[0],b[1],b[2]],[c[0],c[1],c[2]],cBot.clone().lerp(cTop,clamp(0.45+0.6*ym,0,1)));
  }
  B.sway=0; B.up=pu;
}
function addPatch(B,x,y,z,r,cc){
  B.kind=0; B.sway=0;
  const n=7;
  for(let i=0;i<n;i++){
    const a0=i/n*TAU, a1=(i+1)/n*TAU;
    uTri(B,[x,y+0.035,z],[x+Math.cos(a1)*r,y+0.035,z+Math.sin(a1)*r],[x+Math.cos(a0)*r,y+0.035,z+Math.sin(a0)*r],cc);
  }
}
function addLog(B,x,y,z,st,len,r,rot,gy){
  const dx=Math.sin(rot), dz=Math.cos(rot);
  // borrow the tree tube builder; its normals are discarded because the
  // understory geometry derives its own
  const tb={p:B.p,c:B.c,s:B.s,n:[],sway:0};
  const before=B.p.length/3;
  // both ends rest on the ground they are actually lying on
  const y0=gy(x-dx*len,z-dz*len)+r*0.85, y1=gy(x+dx*len,z+dz*len)+r*0.8;
  tube(tb,[new THREE.Vector3(x-dx*len,y0,z-dz*len),new THREE.Vector3(x+dx*len,y1,z+dz*len)],
    r,r*0.8,5,BARK_SUN,mixc(PAL.bark,PAL.woodDeep,0.55));
  const added=B.p.length/3-before;
  for(let i=0;i<added;i++){ B.k.push(0); B.a.push(B.can); B.u.push(0); }
}

// ============================================================
// BANDS — deterministic residency along the route
// Vegetation, growth and ground contact are realised band by band and
// released behind the rider. Identity comes from position, never from
// the order in which bands happened to be built.
// ============================================================
// ============================================================
// GROUNDING — every planted thing stands on the surface that is drawn
// The plan places things using the continuous ground function. The renderer
// draws a triangulated approximation of it. Where that approximation dips below
// the function — every convex cell, every crease at the fork — a trunk placed by
// the plan hangs in the air. So once, after all terrain meshes exist and before
// anything is built, every planted position is re-seated onto the drawn surface
// and its collar is sunk a little way into it. This is a system, not a list of
// exceptions, and it runs before residency so a band cannot re-seat differently
// the second time it is realised.
// ============================================================
const GROUND_STAT={ trees:0, lowered:0, maxDropM:0, raised:0, culled:0, maxKeptDropM:0, deepSeated:0 };
const SEAT_LIMIT=1.25;      // beyond this the mesh and the plan disagree too much to plant here
// The plan's own height is a floor guard against a reader that over-reads: a
// trunk is never placed above the drawn surface. But it may not be placed
// arbitrarily far below it either. Wherever the drawn surface sits above the
// plan's function — the graded bank between the fork's arms, every fill, every
// place the road lifts the ground beside it — taking the lower of the two left
// the tree at the plan's height and the ground at the mesh's, and the difference
// was measured at up to nine metres. A tree nine metres under the ground is not
// a badly seated tree, it is an absent one, and nothing in the proof surface
// said so until `buriedOver0_9m` was asked for. So the seat is clamped to a
// depth a root collar can actually absorb.
const SEAT_SINK_MAX=0.55;
function seatOnGround(x,z,sink){
  const a=groundY(x,z), r=realizedGroundY(x,z);
  if(r===null) return a-(sink||0);
  return clamp(Math.min(a,r),r-SEAT_SINK_MAX,r)-(sink||0);
}
// Whether a point is somewhere a triangulated surface can follow the ground is
// a property of the LAND, not of the tier that happens to be drawing it. It is
// measured here against a fixed twelve-metre reference cell, so every quality
// culls exactly the same trees and the planned world stays one world.
const REF_CELL=12;
function meshFollowError(x,z){
  const h=REF_CELL*0.5;
  const c=groundY(x,z);
  const q=(groundY(x-h,z-h)+groundY(x+h,z-h)+groundY(x-h,z+h)+groundY(x+h,z+h))*0.25;
  return c-q;                    // positive: a spike the reference cell misses
}
{
  for(const t of TREES){
    const before=t.y;
    // the collar sinks with the trunk's own size, so a big oak beds in further
    // than a birch and neither shows daylight under its root flare
    const y=seatOnGround(t.x,t.z,0.16+0.10*clamp(t.scl,0.6,3.4));
    const drop=before-y;
    GROUND_STAT.trees++;
    GROUND_STAT.maxDropM=Math.max(GROUND_STAT.maxDropM,drop);
    // A tree standing where no triangulated surface can follow the ground would
    // be buried to its crown by seating. Remove it instead: an absent tree is
    // invisible, a buried one is a defect. The plan keeps it — it is part of
    // this world's identity at every quality — and realization declines to
    // build it, using a tier-independent measure so the same trees are declined
    // at low, standard and high.
    if(meshFollowError(t.x,t.z)>SEAT_LIMIT){ t.unseatable=true; GROUND_STAT.culled++; continue; }
    t.unseatable=false;
    t.y=y;
    if(drop>1e-4){ GROUND_STAT.lowered++; GROUND_STAT.maxKeptDropM=Math.max(GROUND_STAT.maxKeptDropM,drop);
      // seated more than a metre and a half down is effectively buried; that is
      // safe (you cannot see it) but it is worth counting rather than hiding
      if(drop>1.5) GROUND_STAT.deepSeated++; }
    else if(drop<-1e-4) GROUND_STAT.raised++;
  }
}
HERO_POS.y=seatOnGround(HERO_POS.x,HERO_POS.z,0.55);
H.real.feed('seat',GROUND_STAT.lowered,GROUND_STAT.culled,Math.round(GROUND_STAT.maxKeptDropM*100));

const BAND=200;
const NBAND=Math.ceil(FRAMES.sun.len/BAND)+1;
const bandTrees=Array.from({length:NBAND},()=>[]);
const staticFar=[];
for(const t of TREES){
  if(t.unseatable) continue;
  // the Sisters are a fixed point of the whole ride: they must not be released
  // with the band they happen to be scheduled in, or the callback has nothing
  // left to call back to
  if(t.d>QCFG.farD||t.formation==='wind-sisters'){ staticFar.push(t); continue; }
  const bi=clamp(Math.floor(t.g/BAND),0,NBAND-1);
  bandTrees[bi].push(t);
}
// distant individuals are static: they belong to the far reading, not to residency
{
  const groups=[[],[],[],[]];
  const c0=spineAt(L_TOTAL*0.5);
  for(const t of staticFar){
    const a=Math.atan2(t.x-c0.x,t.z-c0.z);
    groups[clamp(Math.floor((a+Math.PI)/TAU*4),0,3)].push(t);
  }
  for(const grp of groups){
    if(!grp.length) continue;
    const B=Buf();
    for(const t of grp) buildTree(B,t,t.formation==='wind-sisters'?1:0);
    const m=new THREE.Mesh(bufGeo(B),treeMatFar); m.matrixAutoUpdate=false;
    scene.add(m);
  }
  H.real.feed('staticfar',staticFar.length);
}

const counts={ trees:0, articulatedNear:0, midTrees:0, farTrees:0, staticFarTrees:staticFar.length,
  understory:0, flowers:0, seedheads:0, ferns:0, shrubs:0, reeds:0, groundContacts:0, rocksLogs:0 };
const RES={ realized:0, disposed:0, peak:0 };
const bands=Array.from({length:NBAND},(_,i)=>({i,g0:i*BAND,g1:(i+1)*BAND,live:null}));

function realizeBand(bi){
  const b=bands[bi];
  if(b.live) return;
  const nearB=Buf(), midB=Buf(), uB=UBuf();
  const local={trees:0,articulatedNear:0,midTrees:0,farTrees:0,understory:0,flowers:0,
    seedheads:0,ferns:0,shrubs:0,reeds:0,groundContacts:0,rocksLogs:0,corridorRejects:0,corridorViolations:0};
  // ---- trees: the nearest get the geometry, and the budget is bounded by
  // construction rather than by hoping the plan was sparse enough ----
  const ordered=bandTrees[bi].slice().sort((a,b)=>a.d-b.d||a.x-b.x||a.z-b.z);
  let nNear=0,nMid=0,nAll=0,nRound=0;
  for(const t of ordered){
    if(nAll>=QCFG.bandTreeCap) break;
    nAll++;
    let tier=(t.d<=QCFG.nearD)?2:((t.d<=QCFG.midD)?1:0);
    if(tier===2&&nNear>=QCFG.capNear) tier=1;
    if(tier===1&&nMid>=QCFG.capMid) tier=0;
    // A tree at the verge must hold its canopy high enough to ride under. At
    // five metres the crown hung in the rider's face and its lobes read as
    // plates across the top of the frame; at nine it reads as a ceiling.
    const overhang=(t.d<EXCL+10)?(t.roadY+9.0):undefined;
    if(tier===2){ buildTree(nearB,t,2,overhang,true); local.articulatedNear++; nNear++; }
    else if(tier===1){
      const round=(nRound<QCFG.roundMid&&t.d<=64);
      if(round) nRound++;
      buildTree(midB,t,1,overhang,round); local.midTrees++; nMid++;
    }
    else { buildTree(midB,t,0,undefined,false); local.farTrees++; }
    local.trees++;
    // every tree gets its ground: a cool contact patch and flattened growth
    const st=subStream('base',Math.round(t.x*10),Math.round(t.z*10));
    const dark=mixc(PAL.woodDeep,PAL.bark,0.30).lerp(col(PAL.leafShade),0.18);
    // on the drawn surface, not at the collar — the collar is bedded below it,
    // and a contact shadow under the ground is a gap rather than a contact
    const surf=realizedGroundY(t.x,t.z);
    addPatch(uB,t.x,(surf===null?t.y:surf),t.z,1.25*t.scl+st.r(0,0.8),dark);
    local.groundContacts++;
    // Growth at a trunk's foot exists to explain the contact, so it is only worth
    // paying for on a tree close enough for that contact to be read. Every tier-1
    // tree in the band used to get two to four, which is thousands of them, and
    // they were blended half-way to the deep woodland teal — far and away the
    // largest population of dark spikes in the world, and the one that followed
    // the rider everywhere because trees do.
    if(tier>=1&&t.d<38){
      const nr=Math.round(st.i(1,2)*QCFG.under);
      for(let i=0;i<nr;i++){
        // Kept inside the contact patch this ring exists to explain. At up to
        // 2.4 scale lengths it reached eight metres from a big oak — outside the
        // patch entirely, so it read as free-standing spikes near a tree rather
        // than as the tree's own base.
        const a=st.r(0,TAU), rr=st.r(0.6,1.35)*t.scl;
        const x=t.x+Math.cos(a)*rr, z=t.z+Math.sin(a)*rr;
        uB.can=clamp(t.enc,0,1);
        const yf=groundY(x,z);
        // Both colours here were absolute constants, so this ring rendered at the
        // same value on a pale open shelf as under closed canopy — the darkest of
        // the four tuft populations against the ground it actually stood on.
        const gcf=groundColor(x,z,0,t.enc,0,yf-refAt(x,z)).clone();
        addTuft(uB,x,yf,z,st,gcf.clone().lerp(col(PAL.meadow),0.26),gcf.clone().lerp(col(PAL.sunGrass),0.40),st.r(0.34,0.64),3);
        local.understory++;
      }
    }
  }
  // ---- growth, keyed to what the ground is actually doing here ----
  {
    const N=Math.round(QCFG.tuftBand*BAND/10*QCFG.under);
    const st=subStream('under',bi);
    const arms=(b.g0<S_MERGE_G+120&&b.g1>S_SPLIT-120)?['sun','moss']:['sun'];
    for(let i=0;i<N;i++){
      const arm=arms.length>1?(st.chance(0.5)?'sun':'moss'):'sun';
      const g=st.r(b.g0,b.g1);
      const sLoc=toLocal(arm,g);
      if(sLoc<0||sLoc>FRAMES[arm].len) continue;
      if(arm==='moss'&&(sLoc<S_COMMIT.moss-60||sLoc>S_MERGE.moss+60)) continue;
      const fr=getFrame(FRAMES[arm],sLoc);
      // bias toward the verge and the bank edge, where growth breaks a silhouette
      const roll=st.f();
      // Nothing scattered past twenty-six metres. A tuft is a handful of thin
      // triangles a third of a metre tall; past about twenty-five metres that is
      // four dark pixels, and a field of them is not a meadow, it is a row of
      // black spikes along the horizon. Growth belongs where the eye can read it
      // as growth — near the verge, and on the bank where it breaks a silhouette.
      const lat=(st.chance(0.5)?1:-1)*(roll<0.66?st.r(RH+0.55,RH+9):st.r(RH+9,26));
      const x=fr.x+fr.lx*lat+st.r(-3,3), z=fr.z+fr.lz*lat+st.r(-3,3);
      const ri=routeInfo(x,z);
      if(ri.d<EXCL){ local.corridorRejects++; continue; }
      const si=streamInfo(x,z);
      if(si.d<1.1) continue;
      let pin=99;
      for(const P of PONDS) pin=Math.min(pin,Math.hypot((x-P.cx)/P.rx,(z-P.cz)/P.rz));
      if(pin<0.92) continue;
      const y=groundY(x,z);
      const gHere=toGlobal(ri.arm===1?'moss':'sun',ri.s);
      const enc=enclosureAt(gHere,ri.arm===1?'moss':'sun')*clamp(1.3-ri.d/80,0,1);
      const moist=clamp(1-si.d/26,0,1);
      const slope=Math.abs(groundY(x+2.5,z)-groundY(x-2.5,z))/5+Math.abs(groundY(x,z+2.5)-groundY(x,z-2.5))/5;
      // Two scales, because a meadow is not an even sprinkle and it is not an
      // even carpet either. The coarse field decides whether this part of the
      // field has growth in it at all — most of it does not, and that emptiness
      // is the point. The fine field varies density inside a patch so its edges
      // are ragged rather than circular.
      // A water margin is not subject to the emptiness rule: a shoreline with
      // nothing on it reads as a hole cut in a lawn. Everywhere else the coarse
      // field decides whether this part of the meadow has growth at all, and
      // most of it does not — that emptiness is the composition.
      const bank=(pin<1.22)?1:0;
      const patch=fbmE(x/64+3.7,z/64+21.1);
      if(!bank&&patch<0.50-moist*0.16-enc*0.14) continue;
      const mask=fbmE(x/19+7,z/19+13);
      if(!bank&&mask<0.34-slope*0.5-moist*0.12-(patch-0.50)*0.8) continue;
      // Out in the open field the two masks cull most samples, and what survives
      // survives ALONE: one tuft standing by itself in ten metres of clean sward
      // does not read as grass, it reads as something dropped there. Growth that
      // far out now has to be in a genuinely strong patch, so when it appears it
      // appears as a group. Water margins are exempt — a shoreline needs its
      // fringe wherever the water happens to lie.
      if(!bank&&lat*lat>(RH+9)*(RH+9)&&patch<0.62-moist*0.10) continue;
      if(bank&&st.chance(0.45)) continue;      // sparse on the bank, never a fringe
      // nothing clutters the foot of a trunk, where it only confuses the eye
      // about whether the tree is standing on the ground
      { let underTree=false;
        for(const tt of bandTrees[bi]){
          if(tt.unseatable) continue;
          const ddx=x-tt.x, ddz=z-tt.z, rr2=(1.05*tt.scl+0.5);
          if(ddx*ddx+ddz*ddz<rr2*rr2){ underTree=true; break; }
        }
        if(underTree) continue; }
      uB.can=clamp(enc,0,1);
      const gc=groundColor(x,z,slope,enc,moist,y-refAt(x,z)).clone();
      const r2=st.f();
      if(bank&&st.chance(0.26)){
        // a few stones and a patch of wet loam where the bank meets the water
        const r=st.r(0.10,0.26);
        addBlob(uB,x,y+r*0.4,z,st,r,r*0.6,r*st.r(0.7,1.3),
          mixc(PAL.road,PAL.bark,0.42),mixc(PAL.bark,PAL.woodDeep,0.5),0);
        addPatch(uB,x,y,z,r*st.r(1.8,3.2),mixc(PAL.bark,PAL.woodDeep,0.42));
        local.rocksLogs++;
      } else if(pin<1.75&&pin>=0.92){               // reeds hold the pool's margin
        addFern(uB,x,y,z,st,mixc(PAL.leafShade,PAL.meadow,0.35),mixc(PAL.sunGrass,PAL.meadow,0.5),st.r(0.70,1.30));
        local.reeds++;
      } else if(moist>0.45&&si.d<12){
        addFern(uB,x,y,z,st,mixc(PAL.woodDeep,PAL.leafShade,0.45),mixc(PAL.leafShade,PAL.meadow,0.45),st.r(0.52,1.00));
        local.ferns++;
      } else if(enc>0.44){
        if(r2<0.62){ addFern(uB,x,y,z,st,mixc(PAL.woodDeep,PAL.leafShade,0.4),mixc(PAL.leafShade,PAL.meadow,0.35),st.r(0.46,0.92)); local.ferns++; }
        else if(r2<0.86){ addTuft(uB,x,y,z,st,gc.clone().lerp(col(PAL.leafShade),0.34),gc.clone().lerp(col(PAL.meadow),0.34),st.r(0.28,0.58),st.i(4,6)); local.understory++; }
        else { addBlob(uB,x,y+0.18,z,st,st.r(0.42,0.78),st.r(0.30,0.52),st.r(0.42,0.78),mixc(PAL.meadow,PAL.leafShade,0.30),mixc(PAL.leafShade,PAL.woodDeep,0.26),0.18); local.shrubs++; }
      } else if(enc<0.30&&slope<0.30&&r2<0.30){
        addSeedhead(uB,x,y,z,st,mixc(PAL.meadow,PAL.road,0.34),mixc(PAL.road,0xFFE79A,0.35),st.r(0.62,1.12));
        local.seedheads++;
      } else if(enc<0.34&&r2<0.24){
        addFlower(uB,x,y,z,st,mixc(PAL.meadow,PAL.sunGrass,0.5),
          st.pick([mixc(PAL.blossom,PAL.meadow,0.30),mixc(PAL.blossom,0xfff3e6,0.35),mixc(PAL.road,PAL.sunGrass,0.40),mixc(PAL.road,0xFFDE79,0.35)]),st.r(0.28,0.50));
        local.flowers++;
      } else {
        // A tussock in an open meadow is lit grass, not a shadow. Blending the
        // base a third of the way to the deep woodland teal made every tuft a
        // black wedge sitting on a bright field; the base now stays in the
        // meadow's own family and the tips catch the sun, so a clump reads as
        // grass at the distance it is actually seen from.
        // A blade is a triangle with TWO vertices at the base colour and one at
        // the tip, so its area-weighted mean is (2*base + tip)/3: a bright tip
        // cannot rescue a sunk base, which is why lifting the tips last time did
        // not stop these reading as dark spikes. leafShade is a canopy-shadow
        // colour and has no business on grass standing in full sun; the base is
        // now darkened toward the meadow's own green instead, by a third as much.
        addTuft(uB,x,y,z,st,gc.clone().lerp(col(PAL.meadow),0.22),gc.clone().lerp(col(PAL.sunGrass),0.45),st.r(0.30,0.62),st.i(4,6));
        local.understory++;
      }
    }
  }
  // ---- the verge proper: the metre and a half either side of the stone, which
  // is where a lane is actually read. Grass here has been ridden over, so it
  // lies flatter and drier at the edge and stands up again further out, with
  // seedheads leaning into the light over the shoulder. ----
  {
    const st=subStream('verge',bi);
    const N=Math.round((b.g1-b.g0)/2.1*QCFG.under);
    const arms=(b.g0<S_MERGE_G+120&&b.g1>S_SPLIT-120)?['sun','moss']:['sun'];
    for(let i=0;i<N;i++){
      const arm=arms.length>1?(st.chance(0.5)?'sun':'moss'):'sun';
      const g=st.r(b.g0,b.g1);
      const sLoc=toLocal(arm,g);
      if(sLoc<0||sLoc>FRAMES[arm].len) continue;
      if(arm==='moss'&&(sLoc<S_COMMIT.moss-40||sLoc>S_MERGE.moss+40)) continue;
      const fr=getFrame(FRAMES[arm],sLoc);
      const side=st.chance(0.5)?1:-1;
      // the near edge is worn thin; growth thickens outward
      const off=st.r(0,1)**0.62;
      const lat=side*(RH+0.34+off*4.6);
      const x=fr.x+fr.lx*lat, z=fr.z+fr.lz*lat;
      const ri=routeInfo(x,z);
      if(ri.d<EXCL){ local.corridorRejects++; continue; }
      if(streamInfo(x,z).d<1.1) continue;
      let pin=99;
      for(const P of PONDS) pin=Math.min(pin,Math.hypot((x-P.cx)/P.rx,(z-P.cz)/P.rz));
      if(pin<0.95) continue;
      const y=groundY(x,z);
      const gHere=toGlobal(arm,sLoc);
      const enc=enclosureAt(gHere,arm);
      const wear=clamp(1-off*1.6,0,1);            // 1 at the stone, 0 by the meadow
      uB.can=clamp(enc,0,1);
      const r2=st.f();
      // These two were fixed constants, so verge grass was GROUND-BLIND: it
      // rendered at the same luminance on the pale open shelves at Glasswater and
      // Bellroot as it did in a woodland hollow. Those shelves are the brightest
      // ground on the route, so that is exactly where the deficit was largest and
      // the tufts read as dark spikes. The verge now takes its colour from the
      // ground it stands in, on the same terms the corridor mesh uses for its own
      // verge — slope zero, moisture over the same divisor — so the two agree.
      const gcv=groundColor(x,z,0,enc,clamp(1-streamInfo(x,z).d/34,0,1),y-refAt(x,z)).clone();
      if(wear>0.55&&r2<0.30){
        // scuffed grit and small stones pressed into the shoulder
        const r=st.r(0.07,0.20);
        addBlob(uB,x,y+r*0.4,z,st,r,r*0.62,r*st.r(0.7,1.3),
          mixc(PAL.road,PAL.bark,0.34),mixc(PAL.bark,PAL.woodDeep,0.42),0);
        local.rocksLogs++;
      } else if(r2<0.20+wear*0.34){
        // ridden-over grass is dusty and warm, not cool and shaded
        addTuft(uB,x,y,z,st,gcv.clone().lerp(col(PAL.bark),0.14),gcv.clone().lerp(col(PAL.sunGrass),0.30),
          st.r(0.14,0.26)+ (1-wear)*st.r(0.12,0.34),st.i(4,6));
        local.understory++;
      } else if(enc<0.40&&r2>0.86){
        addSeedhead(uB,x,y,z,st,mixc(PAL.meadow,PAL.road,0.30),mixc(PAL.road,0xFFE79A,0.30),
          st.r(0.52,1.00)*(0.5+0.5*(1-wear)));
        local.seedheads++;
      } else if(enc<0.42&&r2>0.74){
        addFlower(uB,x,y,z,st,mixc(PAL.meadow,PAL.sunGrass,0.46),
          st.pick([mixc(PAL.blossom,PAL.meadow,0.28),mixc(PAL.blossom,0xfff3e6,0.34),
                   mixc(PAL.road,0xFFDE79,0.32),mixc(PAL.sunGrass,0xffffff,0.42)]),st.r(0.24,0.44));
        local.flowers++;
      } else {
        // enclosure is already carried by gcv through groundColor's shade term,
        // so darkening again by enc here would count it twice
        addTuft(uB,x,y,z,st,gcv.clone().lerp(col(PAL.meadow),0.24),
          gcv.clone().lerp(col(PAL.sunGrass),0.40),st.r(0.28,0.62)*(0.55+0.45*(1-wear)),st.i(4,6));
        local.understory++;
      }
    }
  }
  // ---- rocks and fallen wood: rare, subordinate, always explaining the ground ----
  {
    const st=subStream('props',bi);
    const N=Math.round(st.i(3,9)*(QUALITY==='low'?0.6:1));
    for(let i=0;i<N;i++){
      const g=st.r(b.g0,b.g1);
      const fr=getFrame(FRAMES.sun,clamp(toLocal('sun',g),0,FRAMES.sun.len-1));
      const lat=(st.chance(0.5)?1:-1)*st.r(RH+2.6,46);
      const x=fr.x+fr.lx*lat, z=fr.z+fr.lz*lat;
      const ri=routeInfo(x,z);
      if(ri.d<EXCL+0.8){ local.corridorRejects++; continue; }
      if(streamInfo(x,z).d<1.4) continue;
      const y=groundY(x,z);
      const slope=Math.abs(groundY(x+3,z)-groundY(x-3,z))/6;
      uB.can=clamp(enclosureAt(g,'sun'),0,1);
      if(st.chance(0.5)&&slope>0.13){
        const r=st.r(0.5,1.5);
        addBlob(uB,x,y+r*0.26,z,st,r,r*0.58,r*st.r(0.7,1.2),
          mixc(PAL.road,PAL.bark,0.30).lerp(col(PAL.sunGrass),0.10),
          mixc(PAL.bark,PAL.leafShade,0.40),0);
        addPatch(uB,x,y,z,r*1.25,mixc(PAL.bark,PAL.leafShade,0.45));
      } else {
        addLog(uB,x,y,z,st,st.r(0.8,2.1),st.r(0.13,0.24),st.r(0,TAU),groundY);
        addPatch(uB,x,y,z,st.r(0.8,1.5),mixc(PAL.woodDeep,PAL.leafShade,0.35));
      }
      local.rocksLogs++;
    }
  }
  const live={meshes:[],local};
  if(nearB.p.length){ const m=new THREE.Mesh(bufGeo(nearB),treeMatNear);
    m.castShadow=(QCFG.shadow>0); m.matrixAutoUpdate=false; scene.add(m); live.meshes.push(m); }
  // mid-distance trees cast too: without them the meadow beyond twenty metres
  // has no shadow in it at all, and the whole scene reads as flat noon light
  if(midB.p.length){ const m=new THREE.Mesh(bufGeo(midB),treeMatMid);
    m.castShadow=(QCFG.shadow>0); m.matrixAutoUpdate=false; scene.add(m); live.meshes.push(m); }
  if(uB.p.length){ const m=new THREE.Mesh(uGeo(uB),underMat);
    m.matrixAutoUpdate=false; m.receiveShadow=(QCFG.shadow>0); scene.add(m); live.meshes.push(m); }
  b.live=live;
  for(const k of Object.keys(local)) if(counts[k]!==undefined) counts[k]+=local[k];
  corridorViolations+=local.corridorViolations;
  corridorRejects+=local.corridorRejects;
  RES.realized++;
  if(typeof RUN!=='undefined'&&RUN) RUN.bandsRealized++;
  if(typeof LIFETIME!=='undefined') LIFETIME.bandsRealized++;
}
function disposeBand(bi){
  const b=bands[bi];
  if(!b.live) return;
  for(const m of b.live.meshes){ scene.remove(m); m.geometry.dispose(); }
  for(const k of Object.keys(b.live.local)) if(counts[k]!==undefined) counts[k]-=b.live.local[k];
  b.live=null;
  RES.disposed++;
  if(typeof RUN!=='undefined'&&RUN) RUN.bandsDisposed++;
  if(typeof LIFETIME!=='undefined') LIFETIME.bandsDisposed++;
}
let corridorViolations=0, corridorRejects=0;
let residentBands=0;
function updateResidency(g,budget){
  const lo=g-QCFG.behind, hi=g+QCFG.ahead;
  let made=0, live=0;
  for(let i=0;i<NBAND;i++){
    const want=(bands[i].g1>lo&&bands[i].g0<hi);
    if(want&&!bands[i].live){ if(made<budget){ realizeBand(i); made++; } }
    else if(!want&&bands[i].live) disposeBand(i);
    if(bands[i].live) live++;
  }
  residentBands=live;
  RES.peak=Math.max(RES.peak,live);
  if(typeof RUN!=='undefined'&&RUN) RUN.peakResidentBands=Math.max(RUN.peakResidentBands,live);
  if(typeof LIFETIME!=='undefined') LIFETIME.peakResidentBands=Math.max(LIFETIME.peakResidentBands,live);
  return made;
}
function plannedResidentBands(g){
  const lo=g-QCFG.behind, hi=g+QCFG.ahead;
  let n=0;
  for(let i=0;i<NBAND;i++) if(bands[i].g1>lo&&bands[i].g0<hi) n++;
  return n;
}
function disposeAllBands(){ for(let i=0;i<NBAND;i++) disposeBand(i); }
