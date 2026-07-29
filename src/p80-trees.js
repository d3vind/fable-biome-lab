// ============================================================
// TREE GRAMMAR
// One soft broadleaf family, six structural archetypes. A crown is a ring
// of overlapping oblate lobes with a deliberate gap, a warm cap above and a
// cooler, heavier mass beneath — never a sphere on a stick.
// ============================================================
// Normals are authored, not inferred. Bark, ground props and cloud puffs keep
// hard per-face normals — the faceted language of the world. Foliage lobes
// supply their own smooth normals, so an eighty-triangle puff shades like a
// soft ball instead of a cut gemstone. That single distinction is most of the
// difference between a fluffy canopy and a heap of crystals.
function Buf(){ return {p:[],c:[],s:[],n:[],sway:0}; }
const _fa=new THREE.Vector3(), _fb=new THREE.Vector3(), _fn=new THREE.Vector3();
function pushTri(B,a,b,c,cc,na,nb,nc){
  B.p.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2]);
  for(let k=0;k<3;k++){ B.c.push(cc.r,cc.g,cc.b); B.s.push(B.sway); }
  if(na){ B.n.push(na[0],na[1],na[2], nb[0],nb[1],nb[2], nc[0],nc[1],nc[2]); }
  else {
    _fa.set(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
    _fb.set(c[0]-a[0],c[1]-a[1],c[2]-a[2]);
    _fn.crossVectors(_fa,_fb);
    if(_fn.lengthSq()>1e-12) _fn.normalize(); else _fn.set(0,1,0);
    for(let k=0;k<3;k++) B.n.push(_fn.x,_fn.y,_fn.z);
  }
}
// three distinct vertex colours, for surfaces whose shading is a gradient
// rather than a facet — the sky, mainly
function pushTri3(B,a,b,c,ca,cb,cc,na,nb,nc){
  B.p.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2]);
  B.c.push(ca.r,ca.g,ca.b, cb.r,cb.g,cb.b, cc.r,cc.g,cc.b);
  for(let k=0;k<3;k++) B.s.push(B.sway);
  B.n.push(na[0],na[1],na[2], nb[0],nb[1],nb[2], nc[0],nc[1],nc[2]);
}
function pushQuad(B,a,b,c,d,cc){ pushTri(B,a,b,c,cc); pushTri(B,a,c,d,cc); }
function bufGeo(B){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(B.p,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(B.c,3));
  g.setAttribute('aSway',new THREE.Float32BufferAttribute(B.s,1));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(B.n,3));
  return g;
}
const sunXZ=new THREE.Vector2(sunDir.x,sunDir.z).normalize();
const _u=new THREE.Vector3(), _v=new THREE.Vector3(), _dir=new THREE.Vector3(), _ref=new THREE.Vector3();
const _rings=[];
function tube(B,pts,r0,r1,sides,cSun,cShade){
  // Every ring used to be framed from its own segment direction. Two segments
  // meeting at a point therefore built their shared ring twice, from two
  // different frames, and the two copies did not line up: a bent trunk carried a
  // hard horizontal step in both silhouette and bark colour at every joint. The
  // frame is now established once and PARALLEL-TRANSPORTED up the curve, so each
  // point has exactly one ring and the bark runs unbroken from root to crown.
  _ref.set(1,0,0);
  {
    const d0=new THREE.Vector3().subVectors(pts[pts.length-1],pts[0]);
    if(Math.abs(d0.x)>Math.abs(d0.z)) _ref.set(0,0,1);
  }
  const n=pts.length;
  _rings.length=0;
  let ux=0,uy=0,uz=0,vx=0,vy=0,vz=0;
  for(let i=0;i<n;i++){
    // tangent at this point: the average of the segments that meet here
    _dir.set(0,0,0);
    if(i>0) _dir.add(_v.subVectors(pts[i],pts[i-1]).normalize());
    if(i<n-1) _dir.add(_v.subVectors(pts[i+1],pts[i]).normalize());
    if(_dir.lengthSq()<1e-10) _dir.set(0,1,0);
    _dir.normalize();
    if(i===0){
      _u.copy(_ref).cross(_dir);
      if(_u.lengthSq()<1e-4){ _u.set(0,1,0).cross(_dir); }
      if(_u.lengthSq()<1e-4){ _u.set(1,0,0); }
      _u.normalize();
    } else {
      // project the previous frame onto the new normal plane — no twist added
      _u.set(ux,uy,uz);
      _u.addScaledVector(_dir,-_u.dot(_dir));
      if(_u.lengthSq()<1e-8){ _u.copy(_ref).cross(_dir); }
      _u.normalize();
    }
    _v.crossVectors(_dir,_u).normalize();
    ux=_u.x; uy=_u.y; uz=_u.z; vx=_v.x; vy=_v.y; vz=_v.z;
    _rings.push(ux,uy,uz,vx,vy,vz);
  }
  for(let i=0;i<n-1;i++){
    const t0=i/(n-1), t1=(i+1)/(n-1);
    const ra=lerp(r0,r1,t0), rb=lerp(r0,r1,t1);
    const A=pts[i], Bp=pts[i+1];
    const f0=i*6, f1=(i+1)*6;
    for(let j=0;j<sides;j++){
      const a0=j/sides*TAU, a1=(j+1)/sides*TAU;
      const c0=Math.cos(a0), s0=Math.sin(a0), c1=Math.cos(a1), s1=Math.sin(a1);
      const p0x=_rings[f0]*c0+_rings[f0+3]*s0, p0y=_rings[f0+1]*c0+_rings[f0+4]*s0, p0z=_rings[f0+2]*c0+_rings[f0+5]*s0;
      const p1x=_rings[f0]*c1+_rings[f0+3]*s1, p1y=_rings[f0+1]*c1+_rings[f0+4]*s1, p1z=_rings[f0+2]*c1+_rings[f0+5]*s1;
      const q0x=_rings[f1]*c0+_rings[f1+3]*s0, q0y=_rings[f1+1]*c0+_rings[f1+4]*s0, q0z=_rings[f1+2]*c0+_rings[f1+5]*s0;
      const q1x=_rings[f1]*c1+_rings[f1+3]*s1, q1y=_rings[f1+1]*c1+_rings[f1+4]*s1, q1z=_rings[f1+2]*c1+_rings[f1+5]*s1;
      const face=clamp(0.5+0.62*(p0x*sunXZ.x+p0z*sunXZ.y),0,1);
      const cc=cShade.clone().lerp(cSun,face);
      pushQuad(B,[A.x+p0x*ra,A.y+p0y*ra,A.z+p0z*ra],[A.x+p1x*ra,A.y+p1y*ra,A.z+p1z*ra],
                 [Bp.x+q1x*rb,Bp.y+q1y*rb,Bp.z+q1z*rb],[Bp.x+q0x*rb,Bp.y+q0y*rb,Bp.z+q0z*rb],cc);
    }
  }
}
const ICO=[new THREE.IcosahedronGeometry(1,0),new THREE.IcosahedronGeometry(1,1),new THREE.IcosahedronGeometry(1,2)];
const ICOD=ICO.map(g=>{ const p=g.getAttribute('position');
  const idx=g.getIndex()?Array.from(g.getIndex().array):Array.from({length:p.count},(_,i)=>i);
  return {p,idx,n:p.count}; });
// a lobe: oblate, softly scalloped, tucked underneath, lit from above
function lobe(B,cx,cy,cz,rx,ry,rz,st,cTop,cBot,rough,detail,swayAmt){
  const D=ICOD[clamp(detail,0,2)];
  const prev=B.sway; B.sway=swayAmt!==undefined?swayAmt:clamp(0.35+(rx+rz)*0.05,0.25,1.0);
  // Displacement stays small. A lobe is a soft puff, not a cut gemstone: the
  // fluffiness of a crown comes from many lobes overlapping, never from
  // deforming one lobe until its facets read as shards. A low-frequency smooth
  // term does most of the work; the per-vertex noise only breaks the regularity
  // of the icosphere so two lobes never look stamped from the same die.
  const p1=st.r(0,TAU), p2=st.r(0,TAU);
  // An icosphere from three.js is NON-INDEXED: every triangle carries its own
  // three vertices, so one corner of the hull appears in the array five or six
  // times. Drawing the jitter from the stream per array slot therefore gave the
  // SAME corner a different radius in each triangle that met there, and the hull
  // came apart — a fine net of sky-coloured cracks across every crown in the
  // world, widest on the nearest trees where it matters most. The jitter is now a
  // function of the vertex's direction, so every copy of a corner lands on the
  // same point and the lobe is closed. `p3` keeps lobes distinct from each other.
  const p3=st.r(0,1000);
  const jitAt=(x,y,z)=>{ const s=Math.sin(x*12.9898+y*78.233+z*37.719+p3)*43758.5453; return s-Math.floor(s); };
  const N=D.n, jx=new Float32Array(N);
  for(let i=0;i<N;i++){
    const x=D.p.getX(i), y=D.p.getY(i), z=D.p.getZ(i);
    const th=Math.atan2(z,x);
    const smoothTerm=Math.sin(th*2+y*2.2+p1)*0.52+Math.sin(th*3+p2)*0.30;
    jx[i]=1+rough*((jitAt(x,y,z)-0.5)*2*0.34+smoothTerm*0.78);
  }
  // The smooth normal of the underlying ellipsoid, not of the jittered hull.
  // The jitter is meant to be felt in the silhouette, not read as shading
  // breaks across the surface.
  const nrm=[];
  const vert=(i)=>{
    const x=D.p.getX(i), y=D.p.getY(i), z=D.p.getZ(i), j=jx[i];
    const yy=y<0?y*0.86:y;                       // slightly tucked underneath, not a flat plate
    let nx=x/rx, ny=yy/ry, nz=z/rz;
    const nl=Math.hypot(nx,ny,nz)||1;
    nrm[i]=[nx/nl,ny/nl,nz/nl];
    return [cx+x*rx*j, cy+yy*ry*j, cz+z*rz*j, y];
  };
  for(let i=0;i<D.idx.length;i+=3){
    const ia=D.idx[i], ib=D.idx[i+1], ic=D.idx[i+2];
    const a=vert(ia), b=vert(ib), c=vert(ic);
    const ym=(a[3]+b[3]+c[3])/3;
    const cc=cBot.clone().lerp(cTop,clamp(0.44+0.58*ym,0,1));
    pushTri(B,[a[0],a[1],a[2]],[b[0],b[1],b[2]],[c[0],c[1],c[2]],cc,nrm[ia],nrm[ib],nrm[ic]);
  }
  B.sway=prev;
}
const BARK_SUN=mixc(PAL.bark,PAL.road,0.30), BARK_SHADE=mixc(PAL.bark,PAL.woodDeep,0.42);
// Birch bark is pale, but it was pale enough to be the brightest thing in the
// frame — brighter than the road, brighter than the sky's reflection on the
// grass. A trunk that outshines its own canopy stops reading as part of the
// tree and starts reading as a post standing in front of one. It keeps its
// paleness against the bark around it and gives up its paleness against the
// field.
const BIRCH_SUN=mixc(PAL.road,0xFFF6E0,0.30).lerp(col(PAL.bark),0.30), BIRCH_SHADE=mixc(PAL.road,PAL.bark,0.34).lerp(col(PAL.leafShade),0.30);
const LEAF_SUN=mixc(PAL.sunGrass,PAL.meadow,0.16), LEAF_MID=col(PAL.meadow),
      LEAF_SHADE=col(PAL.leafShade), LEAF_DEEP=mixc(PAL.leafShade,PAL.woodDeep,0.62);

// `lift` is where the crown sits on the trunk, as a fraction of tree height. At
// 0.47-0.56 the foliage began around two fifths of the way up and the tree read
// as a crown ON a stake rather than a crown OF a trunk: the bare bole was still
// nearly two fifths of the whole silhouette after the girth was corrected. A
// broadleaf in the open carries its lowest branches at about a third of its
// height, so every family drops by eight hundredths and trunk and crown now
// share a good deal more of their length.
const ARCH={
  oak:       {h:[11,15.5],r:[0.40,0.56],w:1.52,lift:0.39,lobes:[5,7],limbs:[3,4],lean:[0,0.05],bark:0},
  // Crown diameter is H*w*0.62. Beech at w 0.98 and birch at w 0.82 gave crowns
  // 0.61 and 0.51 of their own height — a birch stood 1.97 times as tall as its
  // crown was wide, on the thinnest trunk of the six, with the foliage starting
  // at 8.5 m. That is a pole carrying a bush, and it is what read as a telephone
  // pole. Both are still the slender families; they are no longer poles. The
  // crowns also start lower, so trunk and foliage share more of their length.
  beech:     {h:[15,20],  r:[0.34,0.48],w:1.16,lift:0.46,lobes:[4,6],limbs:[2,3],lean:[0,0.04],bark:0},
  birch:     {h:[9,13],   r:[0.21,0.30],w:1.12,lift:0.47,lobes:[3,5],limbs:[2,3],lean:[0,0.07],bark:1},
  leaning:   {h:[10,14],  r:[0.32,0.46],w:1.22,lift:0.45,lobes:[4,6],limbs:[2,4],lean:[0.13,0.21],bark:0},
  windshaped:{h:[9,13.5], r:[0.30,0.44],w:1.18,lift:0.45,lobes:[3,6],limbs:[2,4],lean:[0.09,0.15],bark:0},
  orchard:   {h:[5.5,8],  r:[0.22,0.34],w:1.34,lift:0.36,lobes:[3,5],limbs:[3,4],lean:[0,0.08],bark:0},
};
const FAM_BUILT={}; for(const f of FAMS) FAM_BUILT[f]=0;
// tier 2 close and articulated, 1 reduced, 0 a silhouette mass
function buildTree(B,t,tier,minCrownY,round){
  const A=ARCH[t.fam], st=subStream('tree',Math.round(t.x*10),Math.round(t.z*10));
  FAM_BUILT[t.fam]++;
  const S=t.scl;
  const H=st.r(A.h[0],A.h[1])*S, R=st.r(A.r[0],A.r[1])*S;
  const leanAmt=st.r(A.lean[0],A.lean[1])*(t.lean>=0?1:-1)*(t.fam==='windshaped'||t.fam==='leaning'?1:0.6);
  const leanDir=(t.fam==='windshaped')?(sunAz+Math.PI*0.62+st.r(-0.3,0.3)):t.rot;
  // cooler and heavier under the canopy, brighter out in the light
  const shade=clamp(t.enc,0,1);
  const cSunL=LEAF_SUN.clone().lerp(LEAF_MID,shade*0.46);
  const cMidL=LEAF_MID.clone().lerp(LEAF_SHADE,shade*0.52);
  // The underside of a summer crown is shaded, not black. Held too dark it stops
  // reading as foliage seen from below and becomes a flat disc slung under the
  // tree — and a row of those discs fuses into a ceiling.
  const cShL=LEAF_SHADE.clone().lerp(LEAF_DEEP,shade*0.26).lerp(LEAF_MID,0.32);
  const bSun=A.bark?BIRCH_SUN:BARK_SUN, bSh=A.bark?BIRCH_SHADE:BARK_SHADE;
  // The crown's height is decided before the trunk is drawn, because a tree
  // standing over the lane has its canopy lifted clear of it — and a trunk built
  // to its own natural height would then stop three metres short of its own
  // foliage. The trunk grows to meet the crown it is actually carrying.
  // t.d is LATERAL distance from the route, not distance from the camera, so this
  // ramp was a permanent penalty on exactly the trees that frame the lane: a verge
  // tree lost a quarter of its crown radius — more than half its crown volume —
  // and kept it for the whole ride. Nothing can be planted closer than about
  // seven metres, so the old 0.50 floor was unreachable. It now only trims the
  // last metre or so of reach, which is all it was ever needed for.
  const crownR=H*A.w*0.31*(t.d<12?clamp(0.82+t.d*0.015,0.82,1):1);
  // Representation level changes how a crown is BUILT, never where it sits. The
  // tier factor here dropped a demoted tree's whole crown by a quarter of its
  // lift, so a tree changed shape when a per-band cap happened to demote it.
  let crownY=t.y+H*A.lift+H*0.11;
  let trunkTop=t.y+H*A.lift*1.02;
  // Lifting a canopy clear of the lane is right for a tree whose crown actually
  // reaches the lane. It was being applied to every tree within fifteen metres,
  // to an absolute nine-metre clearance, by LENGTHENING THE TRUNK — so a six-metre
  // verge birch was stretched into nine metres of bare pole under a four-metre
  // crown. That is the telephone pole, and it was standing wherever the rider
  // looked. Now only a crown that genuinely overhangs is lifted, and never by
  // more than a third of the tree's own height: past that the tree is left alone
  // and simply stands beside the road as a shorter tree.
  if(minCrownY!==undefined){
    const reach=crownR*1.62;                       // true outer extent of the lobe ring
    if(t.d-reach<EXCL&&crownY-crownR*0.70<minCrownY){
      const dy=Math.min(minCrownY+crownR*0.70-crownY,H*0.34);
      crownY+=dy; trunkTop+=dy;
    }
  }
  // the trunk pushes well into the crown, so branches, trunk and foliage share
  // space instead of meeting at a seam
  trunkTop=Math.max(trunkTop,crownY-crownR*0.62);
  // ---- trunk: tapered, gently bent, with a real base ----
  const nSeg=tier===2?6:(tier===1?4:2);
  const tp=[];
  for(let i=0;i<=nSeg;i++){
    const f=i/nSeg;
    const bend=Math.sin(f*Math.PI*0.72)*leanAmt*H;
    tp.push(new THREE.Vector3(t.x+Math.sin(leanDir)*bend+(i?st.r(-0.14,0.14)*S:0),
                              lerp(t.y,trunkTop,f),
                              t.z+Math.cos(leanDir)*bend+(i?st.r(-0.14,0.14)*S:0)));
  }
  // trunk weight scales with the crown it carries: a wide canopy on a pole
  // reads as two objects that happen to be touching
  // Crown mass alone gave the tallest, slimmest boles the LEAST girth, because
  // crownR/(H*0.34) is height-invariant. A tall trunk needs girth for its own
  // sake, or it reads as a mast.
  // Girth was tuned upward to stop slim trunks reading as masts, and it went too
  // far the other way: a seventeen-metre beech carried a bole nearly two metres
  // across, tapering by a third over its visible length. That is a concrete
  // column with foliage resting on it, and a row of them is what still read as
  // poles — not because they were thin, but because the trunk was the largest
  // object in the frame and the crown looked small beside it. The bole is now
  // about H/14 across at the root and narrows to a quarter of that, so the trunk
  // visibly runs OUT of wood as it enters the crown.
  const carry=(1+0.28*clamp(crownR/(H*0.34),0,1.6))*(1+0.16*clamp((H-12)/14,0,1));
  tube(B,tp,R*carry*(tier===2?0.98:1.06),R*carry*(tier===2?0.30:0.38),tier===2?7:(tier===1?5:4),bSun,bSh);
  // Remember the trunk this tree actually got, so anything that has to sit ON it
  // is placed against the drawn trunk rather than against a guess. Only a built
  // tree carries this, which is exactly the set a squirrel may be seen in.
  // Remember the trunk this tree actually got — both ends of its taper, not one
  // nominal radius — so anything that has to sit ON it can be placed against the
  // drawn bark at whatever height it picks rather than floating off a guess.
  t.trunkTopY=trunkTop; t.crownBaseY=crownY-crownR*0.62;
  t.trunkR0=R*carry*(tier===2?0.98:1.06); t.trunkR1=R*carry*(tier===2?0.30:0.38);
  if(tier===2){
    const nr=st.i(3,5);
    for(let i=0;i<nr;i++){
      const a=st.r(0,TAU), rl=R*st.r(2.0,3.4);
      tube(B,[new THREE.Vector3(t.x,t.y+R*st.r(1.5,2.4),t.z),
              new THREE.Vector3(t.x+Math.sin(a)*rl*0.55,t.y+R*0.5,t.z+Math.cos(a)*rl*0.55),
              new THREE.Vector3(t.x+Math.sin(a)*rl,t.y-0.16,t.z+Math.cos(a)*rl)],
        R*0.52,R*0.13,4,bSun,bSh);
    }
  }
  // ---- crown: a ring of overlapping oblate lobes with a gap in it ----
  // Representation level changes how a crown is built, never how big it is, and
  // a crown right at the verge is scaled down as well as lifted.
  const top=tp[tp.length-1];
  const nL=tier===0?4:(tier===1?Math.max(4,st.i(A.lobes[0],A.lobes[1])):st.i(A.lobes[0],A.lobes[1])+4);
  // fewer lobes have to be fatter to cover the same outline
  const fill=tier===2?1:(tier===1?1.18:1.46);
  const gapA=st.r(0,TAU), gapW=st.r(0.55,1.05);
  const skewA=(t.fam==='windshaped')?leanDir:st.r(0,TAU);
  const skew=st.r(0.16,0.42);
  // At standard quality tier 1 and tier 0 both fell to twenty-face lobes, so a
  // tree demoted by the per-band cap — which can be forty metres away, not four
  // hundred — turned into a faceted boulder. Representation now steps down with
  // DISTANCE as well as tier: anything still inside the mid range keeps a round
  // crown whatever the cap did to its lobe count.
  // Representation steps down with distance as well as tier, and the number of
  // round mid crowns is capped per band rather than by distance: in dense
  // woodland a distance rule promotes everything at once and costs a hundred
  // thousand triangles. The nearest few keep their shape; the rest are masses.
  const detail=tier===2?QCFG.lobe
              :(round?QCFG.lobe:Math.max(0,QCFG.lobe-1));
  const limbs=[];
  const nLimb=tier===0?0:st.i(A.limbs[0],A.limbs[1]);
  for(let i=0;i<nLimb;i++){
    const a=skewA+i/Math.max(1,nLimb)*TAU+st.r(-0.4,0.4);
    const reach=crownR*st.r(0.45,0.85);
    const b0=tp[Math.max(1,tp.length-2)].clone();
    const b1=new THREE.Vector3(top.x+Math.sin(a)*reach,crownY-crownR*st.r(0.1,0.42),top.z+Math.cos(a)*reach);
    if(tier===2) tube(B,[b0,b1],R*0.42,R*0.13,4,bSun,bSh);
    limbs.push(b1);
  }
  // The cool mass the crown sits on. It has to stay tucked inside the outline —
  // pushed wide it stops reading as the shaded underside of foliage and starts
  // reading as a dark shelf, and a row of such shelves fuses into a wall.
  lobe(B,top.x+Math.sin(skewA)*crownR*skew*0.6,crownY-crownR*0.30,top.z+Math.cos(skewA)*crownR*skew*0.6,
    crownR*st.r(0.60,0.76),crownR*st.r(0.34,0.44),crownR*st.r(0.60,0.76),st,cShL,LEAF_DEEP,0.17,
    // This is the widest single mass in the crown. Drawing it one subdivision
    // coarser than its neighbours is what turned a near tree into a slab of flat
    // plates: the biggest lobe had the fewest faces. A near tree pays for it.
    tier===2?detail:Math.max(0,detail-1),0.30);
  // The main mass. Lobe radius is close to the radius it is placed at, so
  // neighbours interpenetrate and the silhouette is a run of soft scallops
  // rather than a scatter of separate beads. Most of them hang off a limb end,
  // which is what makes the outline lopsided instead of a ring.
  for(let i=0;i<nL;i++){
    const a=st.r(0,TAU);
    let da=Math.abs(((a-gapA+Math.PI*3)%TAU)-Math.PI);
    if(da<gapW&&st.chance(0.72)) continue;                  // the gap that lets sky through
    const rr=crownR*st.r(0.16,0.58);
    let cx=top.x+Math.sin(a)*rr+Math.sin(skewA)*crownR*skew;
    let cz=top.z+Math.cos(a)*rr+Math.cos(skewA)*crownR*skew;
    let up=st.r(-0.34,0.52);
    if(limbs.length&&st.chance(0.62)){
      const e=limbs[st.i(0,limbs.length-1)];
      cx=lerp(cx,e.x+st.r(-0.22,0.22)*crownR,0.72);
      cz=lerp(cz,e.z+st.r(-0.22,0.22)*crownR,0.72);
      up=(e.y-crownY)/crownR+st.r(0.10,0.46);
    }
    const lr=crownR*st.r(0.30,0.45)*fill;
    const high=up>0.04;
    lobe(B,cx,crownY+crownR*up,cz,lr*st.r(0.94,1.20),lr*st.r(0.72,0.94),lr*st.r(0.94,1.20),st,
      high?cSunL:cMidL, high?cMidL:cShL, 0.19, detail);
  }
  // small outer puffs riding the shoulders of the big lobes: the soft broken
  // edge the original had. They sit inside the main radius so they read as part
  // of the same mass, not as satellites orbiting it.
  if(tier>=1){
    const nEdge=tier===2?st.i(4,6):st.i(2,3);
    for(let i=0;i<nEdge;i++){
      const a=st.r(0,TAU);
      let da=Math.abs(((a-gapA+Math.PI*3)%TAU)-Math.PI);
      if(da<gapW*0.8&&st.chance(0.75)) continue;
      const rr=crownR*st.r(0.46,0.78);
      const lr=crownR*st.r(0.20,0.32);
      lobe(B,top.x+Math.sin(a)*rr+Math.sin(skewA)*crownR*skew,
        crownY+crownR*st.r(-0.22,0.42),top.z+Math.cos(a)*rr+Math.cos(skewA)*crownR*skew,
        lr*st.r(0.9,1.22),lr*st.r(0.8,1.05),lr*st.r(0.9,1.22),st,
        cSunL,cMidL,0.20,Math.max(0,detail-1));
    }
  }
  // the warm cap that catches the sun
  lobe(B,top.x+Math.sin(skewA)*crownR*skew*1.15,crownY+crownR*st.r(0.36,0.52),top.z+Math.cos(skewA)*crownR*skew*1.15,
    crownR*st.r(0.40,0.54),crownR*st.r(0.36,0.48),crownR*st.r(0.40,0.54),st,
    LEAF_SUN.clone().lerp(col(PAL.sunGrass),0.34-shade*0.18),cSunL,0.18,detail);
  return {H,crownY,crownR};
}
function treeMaterial(emis){
  const m=new THREE.MeshLambertMaterial({vertexColors:true,
    emissive:new THREE.Color(emis===undefined?0x131a10:emis),emissiveIntensity:1});
  m.onBeforeCompile=(sh)=>{
    Object.assign(sh.uniforms,WL);
    sh.vertexShader=sh.vertexShader
      .replace('#include <common>','#include <common>\nattribute float aSway; varying vec3 vWPos;'+WL_VERT_DECL)
      .replace('#include <begin_vertex>',`#include <begin_vertex>
      {
        float ph=dot(position.xz,vec2(0.037,0.031));
        float sw=sin(uWTime*0.72+ph)*0.62+sin(uWTime*1.51+ph*2.1)*0.24;
        transformed.x+=sw*aSway*0.62; transformed.z+=cos(uWTime*0.63+ph)*aSway*0.34;
      }`)
      .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\n{ vec4 wp2=modelMatrix*vec4(transformed,1.0);\n#ifdef USE_INSTANCING\n wp2=modelMatrix*instanceMatrix*vec4(transformed,1.0);\n#endif\n vWPos=wp2.xyz;'+WL_VERT_SET+' }');
    sh.fragmentShader=sh.fragmentShader
      .replace('#include <common>','#include <common>\nvarying vec3 vWPos;\n'+WL_GLSL)
      .replace('#include <color_fragment>','#include <color_fragment>\n{ diffuseColor.rgb*=mix(1.0,0.84,uWet); }')
      .replace('vec3 outgoingLight = ','float wl=vCloud;\nreflectedLight.directDiffuse*=wl;\nreflectedLight.indirectDiffuse=reflectedLight.indirectDiffuse*mix(0.86,1.0,wl)+diffuseColor.rgb*0.46*wl;\nvec3 outgoingLight = ');
  };
  return m;
}
const treeMatNear=treeMaterial(0x161d11), treeMatMid=treeMaterial(0x121809), treeMatFar=treeMaterial(0x0e1408);
const treeMatHero=treeMaterial(0x1b2a1a);

// ---------- far canopy masses: silhouette and value, not leaves ----------
{
  const groups=[[],[],[],[]];
  const c0=spineAt(L_TOTAL*0.5);
  for(const m of FAR_MASSES){
    const a=Math.atan2(m.x-c0.x,m.z-c0.z);
    groups[clamp(Math.floor((a+Math.PI)/TAU*4),0,3)].push(m);
  }
  for(const grp of groups){
    if(!grp.length) continue;
    const B=Buf(); B.sway=0.10;
    for(const m of grp){
      const st=subStream('farmassbuild',m.seed);
      const n=Math.max(3,Math.round(m.len/st.r(18,30)));
      const dirx=Math.sin(m.rot), dirz=Math.cos(m.rot);
      for(let i=0;i<=n;i++){
        const f=i/n-0.5;
        const px=m.x+dirx*m.len*f+st.r(-7,7), pz=m.z+dirz*m.len*f+st.r(-7,7);
        const py=groundY(px,pz);
        const h=m.h*st.r(0.72,1.28);
        const rw=st.r(0.55,0.95)*m.depth;
        const cool=mixc(PAL.leafShade,PAL.sky,0.24+st.r(0,0.16));
        const lit=mixc(PAL.meadow,PAL.leafShade,0.34+st.r(0,0.2)).lerp(col(PAL.sky),0.10);
        lobe(B,px,py+h*0.58,pz,rw,h*0.48,rw*st.r(0.7,1.1),st,lit,cool.lerp(col(PAL.woodDeep),0.26),0.14,0,0.12);
      }
    }
    const mesh=new THREE.Mesh(bufGeo(B),treeMatFar);
    mesh.matrixAutoUpdate=false;
    scene.add(mesh);
  }
  H.real.feed('farmass',FAR_MASSES.length);
}

// ============================================================
// THE BELLROOT — the identity of the hollow, and it must survive
// being walked up to.
// ============================================================
const heroInfo={ pos:HERO_POS.clone(), crownTop:0, limbClearance:99, pods:[], podsWorld:[] };
{
  const G=HERO;
  const B=Buf();
  const tx=HERO_POS.x, tz=HERO_POS.z, ty=HERO_POS.y;
  const H0=G.r(37,45);
  const R0=G.r(3.0,3.7);
  heroInfo.crownTop=ty+H0*1.12;
  const bSun=mixc(PAL.bark,PAL.road,0.34), bSh=mixc(PAL.bark,PAL.woodDeep,0.46);
  // fluted trunk: a column of merged tapered staves, so it reads as bark not a pipe
  const twist=G.r(0,TAU);
  const spineP=[];
  for(let i=0;i<=9;i++){
    const f=i/9;
    const sw=Math.sin(f*Math.PI*1.1+G.r(0,0.3))*G.r(1.3,2.2)*(1-f*0.45);
    const aa=twist+f*G.r(0.8,1.5);
    spineP.push(new THREE.Vector3(tx+Math.sin(aa)*sw,ty+f*H0*0.56,tz+Math.cos(aa)*sw));
  }
  tube(B,spineP,R0,R0*0.42,11,bSun,bSh);
  for(let i=0;i<7;i++){
    const a=i/7*TAU+G.r(-0.1,0.1);
    const off=R0*0.86;
    const st=[];
    for(let k=0;k<spineP.length;k++){
      const f=k/(spineP.length-1);
      const rr=off*(1-f*0.72);
      st.push(new THREE.Vector3(spineP[k].x+Math.sin(a+f*0.9)*rr,spineP[k].y,spineP[k].z+Math.cos(a+f*0.9)*rr));
    }
    tube(B,st,R0*0.30,R0*0.07,5,bSun,bSh);
  }
  // buttress roots with real feet, and never a foot in the lane
  const nBut=G.i(8,10);
  for(let i=0;i<nBut;i++){
    const a=i/nBut*TAU+G.r(-0.15,0.15);
    const reach=G.r(5.5,9.5);
    const fx=tx+Math.sin(a)*reach, fz=tz+Math.cos(a)*reach;
    if(routeInfo(fx,fz).d<EXCL+0.8) continue;
    const fy=groundY(fx,fz);
    const c=new THREE.CatmullRomCurve3([
      new THREE.Vector3(tx+Math.sin(a)*R0*0.8,ty+G.r(4.5,7.5),tz+Math.cos(a)*R0*0.8),
      new THREE.Vector3(tx+Math.sin(a)*(R0+reach*0.45),ty+G.r(1.6,2.8),tz+Math.cos(a)*(R0+reach*0.45)),
      new THREE.Vector3(fx,fy+0.35,fz)],false,'centripetal',0.5);
    const pts=[]; for(let k=0;k<=6;k++) pts.push(c.getPointAt(k/6));
    tube(B,pts,G.r(0.72,1.0),0.22,6,bSun,bSh);
    if(G.chance(0.7)){
      const a2=a+G.r(0.14,0.34)*(G.chance(0.5)?1:-1);
      const f2x=tx+Math.sin(a2)*reach*0.66, f2z=tz+Math.cos(a2)*reach*0.66;
      tube(B,[new THREE.Vector3(tx+Math.sin(a2)*R0*0.7,ty+G.r(1.8,3.2),tz+Math.cos(a2)*R0*0.7),
              new THREE.Vector3(f2x,groundY(f2x,f2z)+0.25,f2z)],G.r(0.4,0.6),0.16,5,bSun,bSh);
    }
  }
  // principal limbs; two of them lean out over the lane, high and clear
  const ends=[];
  const nF=G.i(5,6);
  const crownSkew=G.r(0,TAU);
  const towardRoad=Math.atan2(heroFr.x-tx,heroFr.z-tz);
  for(let i=0;i<nF;i++){
    const overRoad=(i<2);
    const a=overRoad?towardRoad+G.r(-0.42,0.42):crownSkew+i/nF*TAU+G.r(-0.4,0.4);
    const reach=overRoad?G.r(21,28):G.r(16,25);
    const b0=spineP[overRoad?G.i(3,5):G.i(5,8)].clone();
    // the two limbs that reach across the lane come out low, so the road
    // genuinely passes beneath the tree instead of merely alongside it
    const b1=new THREE.Vector3(tx+Math.sin(a)*reach,
      overRoad?(getFrame(FRAMES.sun,toLocal('sun',HERO_G)).y+G.r(8.6,11.4)):(ty+H0*G.r(0.62,0.82)),
      tz+Math.cos(a)*reach);
    tube(B,[b0,new THREE.Vector3((b0.x+b1.x)*0.5,lerp(b0.y,b1.y,0.62),(b0.z+b1.z)*0.5),b1],R0*0.44,R0*0.15,7,bSun,bSh);
    ends.push({p:b1,overRoad});
    if(overRoad){
      const clear=b1.y-getFrame(FRAMES.sun,toLocal('sun',HERO_G)).y;
      heroInfo.limbClearance=Math.min(heroInfo.limbClearance,clear);
    }
    const nS=G.i(2,3);
    for(let k=0;k<nS;k++){
      const a2=a+G.r(-0.75,0.75), r2=reach*G.r(0.28,0.5);
      const b2=new THREE.Vector3(b1.x+Math.sin(a2)*r2,b1.y+G.r(1.5,5),b1.z+Math.cos(a2)*r2);
      tube(B,[b1,b2],R0*0.16,R0*0.06,5,bSun,bSh);
      ends.push({p:b2,overRoad});
      if(G.chance(0.8)) heroInfo.pods.push([b2.x,b2.y-G.r(1.0,2.2),b2.z]);
    }
  }
  // crown: overlapping asymmetric lobes with visible sky between the masses
  // This is the one tree the whole ride is walking towards, and it is seen from
  // sixty metres and from directly underneath. Its crown gets more, smaller
  // lobes at one more subdivision than anything else in the world: about five
  // thousand extra triangles on a single mesh, which the budget can carry, and
  // without them the identity of the hollow is four flat plates against the sky.
  const nl=G.i(27,33);
  for(let i=0;i<nl;i++){
    const e=ends[G.i(0,ends.length-1)];
    const pull=Math.cos(Math.atan2(e.p.x-tx,e.p.z-tz)-crownSkew)*0.5+0.5;
    const lr=G.r(5.0,7.6)+pull*G.r(2.4,4.6);
    lobe(B,e.p.x+G.r(-6,6),e.p.y+G.r(1.5,8.5),e.p.z+G.r(-6,6),
      lr*G.r(1.00,1.26),lr*G.r(0.74,0.96),lr*G.r(1.00,1.26),G,
      i<nl*0.55?mixc(PAL.sunGrass,PAL.meadow,0.24):LEAF_MID,
      i<nl*0.35?LEAF_MID:LEAF_SHADE, 0.16, Math.min(2,QCFG.lobe+1));
  }
  lobe(B,tx,ty+H0*0.70,tz,H0*0.19,H0*0.105,H0*0.19,G,LEAF_SHADE,LEAF_DEEP,0.18,Math.min(1,QCFG.lobe),0.20);
  const mesh=new THREE.Mesh(bufGeo(B),treeMatHero);
  mesh.castShadow=(QCFG.shadow>0); mesh.matrixAutoUpdate=false;
  scene.add(mesh);
  // the seed pods it is named for: long, pale, hanging, moving with the wind
  {
    const pb=Buf();
    for(const p of heroInfo.pods){
      const st=subStream('pod',Math.round(p[0]*10),Math.round(p[2]*10));
      const L=st.r(0.9,1.7);
      pb.sway=1.35;
      const cTop=mixc(PAL.road,0xffffff,0.30), cBot=mixc(PAL.road,PAL.sunGrass,0.34);
      const n=5;
      for(let i=0;i<n;i++){
        const a0=i/n*TAU, a1=(i+1)/n*TAU, r=0.13;
        pushTri(pb,[p[0],p[1],p[2]],
          [p[0]+Math.cos(a1)*r,p[1]-L*0.36,p[2]+Math.sin(a1)*r],
          [p[0]+Math.cos(a0)*r,p[1]-L*0.36,p[2]+Math.sin(a0)*r],cTop);
        pushTri(pb,[p[0]+Math.cos(a0)*r,p[1]-L*0.36,p[2]+Math.sin(a0)*r],
          [p[0]+Math.cos(a1)*r,p[1]-L*0.36,p[2]+Math.sin(a1)*r],
          [p[0],p[1]-L,p[2]],cBot);
      }
      pb.sway=0;
      heroInfo.podsWorld.push(p);
    }
    const pm=new THREE.Mesh(bufGeo(pb),treeMatHero);
    pm.matrixAutoUpdate=false; scene.add(pm);
  }
  H.real.feed('hero',H0,nBut,nF,nl,heroInfo.pods.length);
}
