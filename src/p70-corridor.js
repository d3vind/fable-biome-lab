// ============================================================
// THE ROAD AND ITS CORRIDOR
// Road surface, contact band, shoulder and verge are ONE conformal mesh
// built from the route's own frames. Nothing can bleed over the stone,
// nothing can float, nothing can z-fight: there is no second surface here.
// ============================================================
// The stone is warm pale limestone dust, not concrete. Lifting it toward pure
// white blew out the widest surface in the frame and made the lane read as an
// airstrip; the centre now warms rather than brightens, and the edges carry
// more soil, so the road sits into the land instead of on top of it.
const C_ROAD_CORE=mixc(PAL.road,0xFFF2D2,0.16);
const C_ROAD_MID=mixc(PAL.road,PAL.bark,0.055);
const C_ROAD_EDGE=mixc(PAL.road,PAL.bark,0.26).lerp(col(PAL.leafShade),0.08);
// The edge of a country lane is not one colour. It is a dark damp seam where
// the stone meets the soil, then broken dusty shoulder, then grass that has
// been walked and ridden over, then whatever the field is doing.
const C_SEAM=(()=>{
  // the seam carries the measured luminance contract against the stone
  const target=lumOf(C_ROAD_MID)/3.4;
  const hue=mixc(PAL.bark,PAL.woodDeep,0.42);          // damp soil, warm not teal
  const k=target/Math.max(lumOf(hue),1e-4);
  return new THREE.Color(clamp(hue.r*k,0,1),clamp(hue.g*k,0,1),clamp(hue.b*k,0,1));
})();
const C_SHOULDER=mixc(PAL.road,PAL.bark,0.46).lerp(col(PAL.sunGrass),0.10);  // dusty loam
const C_WORNGRASS=mixc(PAL.meadow,PAL.bark,0.24).lerp(col(PAL.sunGrass),0.16);
const ROAD_CONTRAST=lumOf(C_ROAD_MID)/lumOf(C_SEAM);

// The distance inside which a coarse tile is split into four. It is shared by
// the emitter and by the reader below, because the two must never disagree.
const FINE_TILE=104;
const COLS=(()=>{
  const c=[];
  for(const t of [-1,-0.72,-0.40,-0.14,0.14,0.40,0.72,1]) c.push(t*RH);
  // The outer columns were ten to eighteen metres apart, which on a hillside
  // makes triangles long enough to read as a facet rather than a slope. Closer
  // spacing out here costs a few thousand triangles and buys the far bank back.
  for(const a of [0.22,0.6,1.15,1.9,2.9,4.4,8.0,12.5,18,25,33,43,54,APRON]){ c.push(RH+a); c.push(-(RH+a)); }
  c.sort((p,q)=>p-q);
  return c;
})();

// the stone keeps a warm floor: nothing in this world is allowed to make the
// road read as grey, least of all its own shade
const corridorMat=new THREE.MeshLambertMaterial({vertexColors:true,
  emissive:new THREE.Color(0x120e07),emissiveIntensity:1});
corridorMat.onBeforeCompile=(sh)=>{
  Object.assign(sh.uniforms,WL);
  sh.vertexShader=sh.vertexShader
    .replace('#include <common>','#include <common>\nvarying vec3 vWPos; attribute float aCanopy; attribute float aS; attribute float aLat; attribute float aMat;\nvarying float vCanopy; varying float vS; varying float vLat; varying float vMat;'+WL_VERT_DECL)
    .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\n{ vec4 wp2=modelMatrix*vec4(transformed,1.0); vWPos=wp2.xyz;'+WL_VERT_SET+' vCanopy=aCanopy; vS=aS; vLat=aLat; vMat=aMat; }');
  sh.fragmentShader=sh.fragmentShader
    .replace('#include <common>','#include <common>\nvarying vec3 vWPos; varying float vCanopy; varying float vS; varying float vLat; varying float vMat;\n'+WL_GLSL)
    .replace('#include <color_fragment>',`#include <color_fragment>
    if(vMat<0.5){
      // hand-laid pale aggregate: slab seams, old repairs, fine grain, a worn centre
      float slab=wlHash(vec2(floor(vS/8.7),0.0));
      float seam=smoothstep(0.42,0.0,abs(fract(vS/8.7)-0.5)*8.7-(0.30+0.30*slab));
      float repair=smoothstep(0.63,0.78,wlNoise(vWPos.xz*0.055+vec2(17.0,3.0)));
      float grain=wlNoise(vWPos.xz*2.1)*0.5+wlNoise(vWPos.xz*6.3+9.1)*0.5;
      float wear=smoothstep(0.75,0.05,abs(vLat));
      diffuseColor.rgb*=1.0-seam*0.115-repair*0.065-(grain-0.5)*0.085;
      diffuseColor.rgb*=1.0+wear*0.045;
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(0.80,0.83,0.86),uWet*0.55);
    } else {
      // break the verge bands so no boundary runs dead straight beside the road
      float g=wlNoise(vWPos.xz*0.36)*0.6+wlNoise(vWPos.xz*1.15+5.3)*0.4;
      float edge=abs(vLat);
      float brk=wlNoise(vWPos.xz*0.55+vec2(3.1,9.7))*0.6+wlNoise(vWPos.xz*1.9)*0.4;
      float scuff=smoothstep(1.02,1.55,edge+(brk-0.5)*0.42);
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.10,1.06,0.94),(1.0-scuff)*0.55);
      float loam=smoothstep(0.62,0.18,abs(edge-1.28)+(brk-0.5)*0.5);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.44,0.36,0.25),loam*0.30);
      diffuseColor.rgb*=0.92+0.16*g;
      // the verge carries the same meadow field as the open ground, faded in
      // past the worn strip, so there is no seam where the corridor mesh ends
      float blendM=smoothstep(1.5,3.4,edge);
      vec3 preM=diffuseColor.rgb;
      ${MEADOW_GLSL}
      diffuseColor.rgb=mix(preM,diffuseColor.rgb,blendM);
      diffuseColor.rgb*=mix(1.0,0.86,uWet);
    }`)
    .replace('vec3 outgoingLight = ',
      'float wl=vCloud*dappleAt(vWPos.xz,vCanopy);\n'+
      'if(vMat<0.5) wl=mix(1.0,wl,0.55);\n'+          // the road stays readable in any shade
      'reflectedLight.directDiffuse*=wl;\n'+
      // a warm floor under everything in this corridor: shade here is warm dark
      // earth and warm dark stone, never grey
      'reflectedLight.indirectDiffuse=reflectedLight.indirectDiffuse*mix(0.86,1.0,wl)+diffuseColor.rgb*(vMat<0.5?0.30:0.34)*wl;\n'+
      'vec3 outgoingLight = ');
};

function armIndex(arm){ return arm==='sun'?0:1; }
// Between the two lanes of the fork both corridors necessarily reach the same
// ground, and each triangulates it from its own lane's direction at its own
// column spacing — five and a half metres near the road, twelve out at the
// apron. Whatever the land does in there, if the two grids read it differently
// then the place they disagree is the place one of them ends, and an edge that
// ends five metres above the surface under it is a shelf hanging in the air.
// That is what was between the arms.
//
// So between the lanes the corridor does not draw the land's own answer. It
// draws a shared bank: a straight ramp from one lane's bed to the other's,
// evaluated from the place and not from the lane doing the reading. Both grids
// interpolate the same nearly-linear function, so they land on each other to
// within a few centimetres, and the wedge reads as one graded slope instead of
// two arguing ones. The ramp is faded out well before either shoulder, so each
// lane still keeps its own bed, its own cut and its own drainage.
function forkBankMix(ri){
  const gap=ri.laneGapM;
  if(gap<14||gap>170) return 0;              // one road, or not the fork at all
  const d0=ri.dA[0], d1=ri.dA[1];
  // Strictly between the lanes. Every point on the perpendicular bisector is
  // equidistant, including points far out to the side with no bank under them
  // at all; only points between the two have d0+d1 equal to the gap itself.
  const between=1-smooth(1.04,1.22,(d0+d1)/gap);
  const off=smooth(RH+4.0,RH+13.0,Math.min(d0,d1));
  return between*off;
}
function forkBankGround(x,z,ri){
  const g=groundY(x,z);
  const w=forkBankMix(ri);
  if(w<=1e-3) return g;
  const t=clamp(ri.dA[0]/Math.max(1e-3,ri.dA[0]+ri.dA[1]),0,1);
  return lerp(g,lerp(ri.yA[0],ri.yA[1],smooth(0.06,0.94,t)),w);
}
// the lift the plan asks of a lane at this station, so validation can tell a
// designed offset apart from a defect
function designedLift(arm,sLoc){
  if(arm!=='moss') return 0;
  return 0.055*smooth(S_COMMIT.moss-30,S_COMMIT.moss+34,sLoc)
              *(1-smooth(S_MERGE.moss-52,S_MERGE.moss-4,sLoc));
}
function buildCorridor(arm,sLo,sHi,rowScale){
  const F=FRAMES[arm], ai=armIndex(arm);
  // Both lanes use the same threshold, and it is applied to the most-owning
  // corner of a quad rather than to the average of four. See the emission loop:
  // that is what makes coverage provable instead of merely likely.
  const OWN_EDGE=-1.0;
  const row=QCFG.row*(rowScale||1);
  const i0=Math.max(0,sLo), i1=Math.min(F.len,sHi);
  const rows=Math.max(2,Math.round((i1-i0)/row)+1);
  const W=COLS.length;
  const P=new Float32Array(rows*W*3), C=new Float32Array(rows*W*3);
  const CA=new Float32Array(rows*W), SS=new Float32Array(rows*W), LT=new Float32Array(rows*W), MT=new Float32Array(rows*W);
  const ok=new Float32Array(rows*W);
  const IDX=[];
  // The Mosswater lane's stone is lifted a few centimetres so it wins the depth
  // test where it runs beside the Sunpath, and the lift fades in after the split
  // and out before the merge, because the rejoin must not be a doubled surface
  // with a shelf along it. The GROUND is never lifted: both corridors sample the
  // same ground function, so where they overlap at the ownership seam their
  // verges are coincident by construction rather than a few centimetres apart.
  const liftAt=(sLoc)=>designedLift(arm,sLoc);
  for(let r=0;r<rows;r++){
    const s=i0+(i1-i0)*r/(rows-1);
    const lift=liftAt(s);
    const fr=getFrame(F,s);
    const g=toGlobal(arm,s);
    const enc=enclosureAt(g,arm);
    const crossfall=Math.sin(s*0.0037+1.7)*0.035;
    for(let j=0;j<W;j++){
      const u=COLS[j], a=Math.abs(u), k=r*W+j;
      const x=fr.x+fr.lx*u, z=fr.z+fr.lz*u;
      let y, mat, cc;
      if(a<=RH+1e-4){
        y=fr.y+CROWN*(1-(a/RH)*(a/RH))+u*crossfall*0.05+lift;
        mat=0;
        const tl=Math.abs(u)/RH;
        cc=C_ROAD_CORE.clone().lerp(C_ROAD_MID,smooth(0.0,0.62,tl)).lerp(C_ROAD_EDGE,smooth(0.62,1.0,tl));
      } else {
        // the lift carries the shoulder that holds the stone up, then fades to
        // nothing well before the ownership seam, so the two lanes' verges meet
        // as one surface out in the field
        const ri=routeInfo(x,z);
        y=forkBankGround(x,z,ri)+lift*(1-smooth(RH+0.2,RH+3.2,a));
        mat=1;
        const rel=y-refAt(x,z);
        const moist=clamp(1-streamInfo(x,z).d/34,0,1);
        const slope=0;
        const base=groundColor(x,z,slope,enc,moist,rel).clone();
        // the transition widths breathe with moisture, slope and enclosure, and
        // the shader breaks their boundaries so this never reads as a ribbon
        const wet=clamp(moist*1.2,0,1);
        const seamW=lerp(0.30,0.52,wet);
        const shoW=lerp(1.05,0.55,enc)*lerp(1.0,1.45,clamp(slope*2,0,1));
        const grW=lerp(2.6,1.5,enc);
        const d0=a-RH;
        cc=base.clone();
        cc.lerp(C_WORNGRASS,1-smooth(seamW+shoW,seamW+shoW+grW,d0));
        cc.lerp(C_SHOULDER,(1-smooth(seamW,seamW+shoW,d0))*lerp(0.86,0.45,enc));
        cc.lerp(C_SEAM,1-smooth(seamW*0.55,seamW,d0));
      }
      P[k*3]=x; P[k*3+1]=y; P[k*3+2]=z;
      C[k*3]=cc.r; C[k*3+1]=cc.g; C[k*3+2]=cc.b;
      CA[k]=enc; SS[k]=g; LT[k]=u/RH; MT[k]=mat;
      // in the fork, each lane owns the ground nearer to itself
      // Per-vertex ownership margin, resolved per quad below. Positive means
      // this lane is the nearer one and should draw the ground here.
      let own=1;
      if(a>RH){
        const ri=routeInfo(x,z);
        own=ri.dA[1-ai]-ri.dA[ai];
        // A lane may only cede ground the other lane can actually reach. Past
        // the far lane's own apron there is nobody else to draw it, and the
        // coarse field holds off until the corridor's own reach — so ceding
        // there opens a hole. This is where the fork tore.
        const reach=FIELD_HOLD;
        if(ri.dA[1-ai]>reach) own=Math.max(own,ri.dA[1-ai]-reach);
        // Once the two lanes have converged there is one piece of country beside
        // them, and only one mesh may draw it. Two aprons a few metres apart
        // triangulate the same ground from different directions at different
        // spacings, and the step where the shorter one ends runs dead straight
        // beside the stone — which is what the rejoin looked like. The Sunpath
        // draws the ground through the convergence; the Mosswater arm keeps its
        // own stone and the shoulder that holds it up, and nothing further out.
        if(ri.laneGapM<16) own=(ai===0)?99:(a>RH+3.5?-99:99);
      } else if(ai===1){
        // Where the arms have converged the stone is the same stone and only
        // one of them may draw it. The line is drawn *inside* the Sunpath's
        // stone, not just outside it: cede at the edge and the half-metre where
        // the Sunpath is already drawing ground rather than road belongs to
        // nobody. The few centimetres of lift on this lane settle the overlap.
        const ri=routeInfo(x,z);
        own=(ri.dA[0]<RH-0.6)?-99:99;
      } else {
        own=99;                       // the Sunpath always draws its own stone
      }
      ok[k]=own;
    }
  }
  // Which quads actually became triangles. A vertex can sit in the position
  // buffer and be referenced by nothing; validating those is validating geometry
  // the renderer never sees.
  const emit=new Uint8Array((rows-1)*(W-1));
  for(let r=0;r<rows-1;r++) for(let j=0;j<W-1;j++){
    const a=r*W+j, b=a+1, c=a+W, d=a+W+1;
    const o1=ok[a],o2=ok[b],o3=ok[c],o4=ok[d];
    // -99 marks stone the other lane is already drawing. Drop the quad once
    // most of it is over there; dropping it as soon as one corner crosses would
    // retreat this lane a whole quad past the line and open the seam again.
    if(((o1<=-90)+(o2<=-90)+(o3<=-90)+(o4<=-90))>=3) continue;
    // Ownership is a partition with a one-quad seam, and the test is the
    // most-owning CORNER, not the average of four. Take any point in the fork:
    // whichever lane is nearer to it is at least as near to the nearest corner
    // of the quad around it, so that lane's max clears the threshold and draws
    // it. Averaging instead let two grids sampling different quad centres both
    // decline the same ground — a strip fifteen to forty-five metres long and
    // about five wide, running beside the lane. That was the tear. The only
    // quads now drawn twice are the ones straddling the midline, where both
    // lanes put the ground at the same height because the designed lift has
    // faded to nothing that far from either stone.
    if(Math.max(Math.max(o1,o2),Math.max(o3,o4))<OWN_EDGE) continue;
    emit[r*(W-1)+j]=1;
    IDX.push(a,c,b, b,c,d);
  }
  if(!IDX.length) return null;
  const gm=new THREE.BufferGeometry();
  gm.setAttribute('position',new THREE.BufferAttribute(P,3));
  gm.setAttribute('color',new THREE.BufferAttribute(C,3));
  gm.setAttribute('aCanopy',new THREE.BufferAttribute(CA,1));
  gm.setAttribute('aS',new THREE.BufferAttribute(SS,1));
  gm.setAttribute('aLat',new THREE.BufferAttribute(LT,1));
  gm.setAttribute('aMat',new THREE.BufferAttribute(MT,1));
  gm.setIndex(IDX);
  gm.computeVertexNormals();
  gm.userData.real={arm,i0,i1,rows,W,P,emit};
  return gm;
}
const corridorMeshes=[];
const CORRIDOR_REAL=[];   // the vertices actually emitted, for realized-mesh proof
{
  // Chunk length is a culling decision, not a modelling one: at 430 m the whole
  // corridor for half a kilometre had to be drawn to show ten metres of it.
  const CHUNK=300;
  for(let s=0;s<FRAMES.sun.len;s+=CHUNK){
    const e=Math.min(FRAMES.sun.len,s+CHUNK+QCFG.row*1.05);
    const gm=buildCorridor('sun',s,e,1);
    if(!gm) continue;
    gm.computeBoundingSphere();
    CORRIDOR_REAL.push(gm.userData.real);
    const m=new THREE.Mesh(gm,corridorMat); m.name='corridor:sun@'+Math.round(s); m.receiveShadow=(QCFG.shadow>0); m.matrixAutoUpdate=false;
    scene.add(m); corridorMeshes.push(m);
  }
  // and the arm's own mesh stops at the merge instead of running ninety metres
  // past it on top of the road it has just rejoined
  const m0=Math.max(0,S_COMMIT.moss-44), m1=Math.min(FRAMES.moss.len,S_MERGE.moss+4);
  for(let s=m0;s<m1;s+=CHUNK){
    const e=Math.min(m1,s+CHUNK+QCFG.row*1.05);
    const gm=buildCorridor('moss',s,e,1);
    if(!gm) continue;
    gm.computeBoundingSphere();
    CORRIDOR_REAL.push(gm.userData.real);
    const m=new THREE.Mesh(gm,corridorMat); m.name='corridor:moss@'+Math.round(s); m.receiveShadow=(QCFG.shadow>0); m.matrixAutoUpdate=false;
    scene.add(m); corridorMeshes.push(m);
  }
  H.real.feed('corridor',corridorMeshes.length,COLS.length);
}
// read the realised corridor mesh: the surface the renderer actually draws
// The height of the exact triangle the renderer drew under this sample. Not the
// bilinear value across the quad — a quad is two triangles with two different
// planes, and averaging them describes a surface that was never emitted. The
// triangulation here mirrors the index buffer above: (a,c,b) then (b,c,d).
function realizedCorridorY(arm,s,u){
  let col=0;
  for(let j=0;j<COLS.length-1;j++) if(u>=COLS[j]&&u<=COLS[j+1]){ col=j; break; }
  const ct=(u-COLS[col])/Math.max(1e-6,COLS[col+1]-COLS[col]);
  let best=null, bestMargin=-1;
  for(const R of CORRIDOR_REAL){
    if(R.arm!==arm) continue;
    const sLo=R.i0, sHi=R.i1;
    if(s<sLo-0.01||s>sHi+0.01) continue;
    const margin=Math.min(s-sLo,sHi-s);
    if(margin<=bestMargin) continue;
    const fr=(s-sLo)/Math.max(1e-6,sHi-sLo)*(R.rows-1);
    const r0=clamp(Math.floor(fr),0,R.rows-2), rt=fr-r0;
    const cIdx=Math.min(col,R.W-2);
    if(!R.emit[r0*(R.W-1)+cIdx]) continue;
    const at=(r,c)=>R.P[(r*R.W+c)*3+1];
    const ya=at(r0,cIdx), yb=at(r0,cIdx+1), yc=at(r0+1,cIdx), yd=at(r0+1,cIdx+1);
    // a=(0,0) b=(1,0) c=(0,1) d=(1,1) in (ct,rt); the diagonal runs a..d
    const y=(ct+rt<=1)
      ? ya+(yb-ya)*ct+(yc-ya)*rt              // triangle a,c,b
      : yd+(yc-yd)*(1-ct)+(yb-yd)*(1-rt);     // triangle b,c,d
    bestMargin=margin; best=y;
  }
  return best;
}
// ============================================================
// THE GROUND FIELD beyond the corridor — coarse, cheap, and never
// allowed inside the corridor's reach, so it cannot rise through the road.
// ============================================================
const terrainMeshes=[];
let TILE_REAL=null;
{
  const cell=QCFG.tile, MARGIN=Math.min(980,QCFG.tileView*0.62);
  let minX=1e9,maxX=-1e9,minZ=1e9,maxZ=-1e9;
  for(const F of [FRAMES.sun,FRAMES.moss]) for(let i=0;i<=F.N;i+=4){
    minX=Math.min(minX,F.x[i]); maxX=Math.max(maxX,F.x[i]);
    minZ=Math.min(minZ,F.z[i]); maxZ=Math.max(maxZ,F.z[i]); }
  // Sharing the cell SIZE is not enough to share the surface. The grid also has
  // an origin, and the origin was the corner of a margin that varies with the
  // tier's draw distance — 930 m at low against 980 elsewhere. Fifty metres is
  // three cells and an eighth, so the whole lattice sat two metres out of phase
  // at low and every triangle in it was cut through the landform somewhere else.
  // The origin is now snapped to a world-absolute multiple of the cell, so all
  // three tiers lay the SAME lattice over the ground and differ only in how far
  // out they extend it.
  const x0=Math.floor((minX-MARGIN)/cell)*cell, z0=Math.floor((minZ-MARGIN)/cell)*cell;
  const nx=Math.ceil((maxX+MARGIN-x0)/cell)+2, nz=Math.ceil((maxZ+MARGIN-z0)/cell)+2;
  const HG=new Float32Array(nx*nz), DG=new Float32Array(nx*nz);
  for(let iz=0;iz<nz;iz++) for(let ix=0;ix<nx;ix++){
    const x=x0+ix*cell, z=z0+iz*cell;
    const d=cfSample(x,z,CF.d);
    DG[iz*nx+ix]=d;
    HG[iz*nx+ix]=(d>320)?(refAt(x,z)+reliefAt(x,z,d)):groundY(x,z);
  }
  const CG=new Float32Array(nx*nz*3);
  for(let iz=0;iz<nz;iz++) for(let ix=0;ix<nx;ix++){
    const k=iz*nx+ix, x=x0+ix*cell, z=z0+iz*cell;
    const hx=HG[iz*nx+Math.min(nx-1,ix+1)]-HG[iz*nx+Math.max(0,ix-1)];
    const hz=HG[Math.min(nz-1,iz+1)*nx+ix]-HG[Math.max(0,iz-1)*nx+ix];
    const slope=Math.hypot(hx,hz)/(2*cell);
    const d=DG[k];
    const enc=(d<230)?enclosureAt(cfSample(x,z,CF.s),'sun')*clamp(1.25-d/200,0,1):0;
    const moist=(d<420)?clamp(1-streamInfo(x,z).d/40,0,1):0;
    const c=groundColor(x,z,slope,enc,moist,HG[k]-refAt(x,z));
    CG[k*3]=c.r; CG[k*3+1]=c.g; CG[k*3+2]=c.b;
  }
  const TG=new Float32Array(nx*nz);
  // sunk further where it underlies the corridor, so the two never tie
  for(let k=0;k<nx*nz;k++) TG[k]=HG[k]-0.40*(1-smooth(70,104,DG[k]));
  TILE_REAL={x0,z0,cell,nx,nz,TG,DG};
  const TILE=Math.max(4,Math.round(400/cell));
  const mat=groundedMat(new THREE.MeshLambertMaterial({vertexColors:true}),{meadow:true});
  for(let tz=0;tz<nz-1;tz+=TILE) for(let tx=0;tx<nx-1;tx+=TILE){
    const ex=Math.min(nx-1,tx+TILE), ez=Math.min(nz-1,tz+TILE);
    // skip whole tiles that are far outside the world we can ever see
    let near=false;
    for(let iz=tz;iz<=ez&&!near;iz+=Math.max(1,Math.floor(TILE/3)))
      for(let ix=tx;ix<=ex&&!near;ix+=Math.max(1,Math.floor(TILE/3)))
        if(DG[iz*nx+ix]<MARGIN) near=true;
    if(!near) continue;
    const P=[],C=[],IDX=[]; const remap=new Map();
    const take=(ix,iz)=>{ const key=iz*nx+ix; let v=remap.get(key);
      if(v!==undefined) return v;
      v=P.length/3;
      const d=DG[key];
      P.push(x0+ix*cell,TG[key],z0+iz*cell);
      C.push(CG[key*3],CG[key*3+1],CG[key*3+2]);
      remap.set(key,v); return v; };
    // Within the band you can actually read, each cell is split into four and
    // its new corners sampled from the ground function itself. A sixteen-metre
    // cell eighty metres away is a facet the size of a hillside; an eight-metre
    // one is a slope. Beyond that band the coarse cell is a few pixels and the
    // extra geometry would be spent on nothing.
    const FINE=FINE_TILE;
    const sub=(ix,iz)=>{
      const x=x0+ix*cell, z=z0+iz*cell;
      const pts=[], cols=[], dd=[];
      for(let b2=0;b2<=2;b2++) for(let a2=0;a2<=2;a2++){
        const px=x+a2*cell*0.5, pz=z+b2*cell*0.5;
        const gy=groundY(px,pz);
        const d2=routeInfo(px,pz).d; dd.push(d2);
        pts.push([px,gy-0.40*(1-smooth(70,104,d2)),pz]);
        const sl=Math.abs(groundY(px+3,pz)-groundY(px-3,pz))/6;
        const en=(d2<230)?enclosureAt(cfSample(px,pz,CF.s),'sun')*clamp(1.25-d2/200,0,1):0;
        const mo=(d2<420)?clamp(1-streamInfo(px,pz).d/40,0,1):0;
        cols.push(groundColor(px,pz,sl,en,mo,gy-refAt(px,pz)).clone());
      }
      const base=P.length/3;
      for(let i=0;i<9;i++){ P.push(pts[i][0],pts[i][1],pts[i][2]); C.push(cols[i].r,cols[i].g,cols[i].b); }
      // The retention test that decided this cell was worth keeping ran on the
      // COARSE grid, using a chamfer distance field that overestimates the true
      // distance by five metres at the median and nineteen at p95. A sixteen-metre
      // cell kept for its outer corner therefore reached up to twenty-two metres
      // back INSIDE the corridor's own ground, and every triangle in there was
      // drawn and then thrown away by the depth test — a quarter of the corridor's
      // footprint painted twice, invisibly.
      //
      // The exact distance at all nine sub-grid points has already been computed
      // just above and was being discarded. Applying the same max-of-corners rule
      // at the eight-metre sub-cell costs nothing and takes the field's worst
      // inward reach from nineteen metres to fifty-two. The coverage proof is
      // unchanged: d is 1-Lipschitz and grows away from the route, so the max of d
      // over a cell's corners is never less than d anywhere inside it — true at
      // any granularity, so a sub-cell containing ground beyond the hold line is
      // still kept.
      for(let b2=0;b2<2;b2++) for(let a2=0;a2<2;a2++){
        const p=b2*3+a2;
        if(Math.max(Math.max(dd[p],dd[p+1]),Math.max(dd[p+3],dd[p+4]))<FIELD_HOLD) continue;
        const q=base+p;
        IDX.push(q,q+3,q+1, q+1,q+3,q+4);
      }
    };
    for(let iz=tz;iz<ez;iz++) for(let ix=tx;ix<ex;ix++){
      const dA=DG[iz*nx+ix], dB=DG[iz*nx+ix+1], dC=DG[(iz+1)*nx+ix], dD=DG[(iz+1)*nx+ix+1];
      // Drop a quad only when the WHOLE of it is inside the corridor's ground.
      // Dropping any quad that merely touched the boundary retreated the field
      // a whole cell beyond the hold-off line while the corridor stopped at its
      // apron, leaving a ring of nothing around every lane. It was invisible on
      // the open route because a rise hid it, and it tore the fork open where
      // the two lanes' rings met.
      //
      // The hold-off line is the corridor's own reach, not an unrelated number.
      // Holding off at thirty-six while the corridor reached sixty-six left the
      // two surfaces both drawing the same thirty metres of ground, disagreeing
      // by up to five, which is the shelf that appeared to float beside the road.
      if(Math.max(Math.max(dA,dB),Math.max(dC,dD))<FIELD_HOLD) continue;
      // only worth splitting when the cell is coarse enough to read as a facet
      if(cell>12&&Math.max(Math.max(dA,dB),Math.max(dC,dD))<FINE){ sub(ix,iz); continue; }
      const a=take(ix,iz), b=take(ix+1,iz), c=take(ix,iz+1), d=take(ix+1,iz+1);
      IDX.push(a,c,b, b,c,d);
    }
    if(!IDX.length) continue;
    const gm=new THREE.BufferGeometry();
    gm.setAttribute('position',new THREE.Float32BufferAttribute(P,3));
    gm.setAttribute('color',new THREE.Float32BufferAttribute(C,3));
    gm.setIndex(IDX); gm.computeVertexNormals();
    gm.computeBoundingSphere();
    const m=new THREE.Mesh(gm,mat); m.name='field'; m.receiveShadow=(QCFG.shadow>0); m.matrixAutoUpdate=false;
    scene.add(m); terrainMeshes.push(m);
  }
  H.real.feed('tiles',terrainMeshes.length,cell);
}
// read the realised ground field the same way: nearest emitted vertex, and
// whether any tile geometry exists at this place at all
function realizedTileY(x,z){
  const T=TILE_REAL; if(!T) return null;
  // The drawn surface between vertices, not the nearest vertex. A thing standing
  // here stands on the triangle, and on a convex cell the triangle is below the
  // function the plan used — which is exactly how trees came to hover.
  const fx=(x-T.x0)/T.cell, fz=(z-T.z0)/T.cell;
  const ix=Math.floor(fx), iz=Math.floor(fz);
  if(ix<0||iz<0||ix>=T.nx-1||iz>=T.nz-1) return null;
  const k=iz*T.nx+ix;
  // Mirror the emission rule exactly. Testing one corner said "no geometry
  // here" for every tile that straddles the hold-off line — tiles that are in
  // fact drawn — and a reader that disagrees with the emitter is worse than no
  // reader at all.
  const dA=T.DG[k], dB=T.DG[k+1], dC=T.DG[k+T.nx], dD=T.DG[k+T.nx+1];
  if(Math.max(Math.max(dA,dB),Math.max(dC,dD))<FIELD_HOLD) return null;
  const tx=fx-ix, tz=fz-iz;
  const cell=T.cell;
  // Where the emitter SUBDIVIDED a cell, this used to read the parent quad and
  // justify it by claiming the subdivided surface always sits above it. That is
  // only true on convex ground. Over a hollow the subdivided surface follows the
  // ground DOWN while the parent quad stays up as a chord across it, so the
  // reader answered a metre and a half too high and every tree seated there was
  // left hovering in the air over the hole its own reading had invented. A reader
  // that disagrees with the emitter is worse than no reader at all, so this now
  // walks the same 2x2 sub-grid, from the same `groundY`, with the same sink.
  if(cell>12&&Math.max(Math.max(dA,dB),Math.max(dC,dD))<FINE_TILE){
    const x0=T.x0+ix*cell, z0=T.z0+iz*cell, hc=cell*0.5;
    const a2=tx<0.5?0:1, b2=tz<0.5?0:1;      // which sub-quad the sample is in
    const sx=x0+a2*hc, sz=z0+b2*hc;
    const sy=(px,pz)=>groundY(px,pz)-0.40*(1-smooth(70,104,routeInfo(px,pz).d));
    const sa=sy(sx,sz), sb=sy(sx+hc,sz), sc=sy(sx,sz+hc), sd=sy(sx+hc,sz+hc);
    const ux=(fx-ix-a2*0.5)*2, uz=(fz-iz-b2*0.5)*2;
    // same winding as the parent: (a,c,b) then (b,c,d)
    return (ux+uz<=1) ? sa+(sb-sa)*ux+(sc-sa)*uz
                      : sd+(sc-sd)*(1-ux)+(sb-sd)*(1-uz);
  }
  // The exact triangle, chosen by which side of the shared diagonal the sample
  // falls on — the quads are indexed (a,c,b),(b,c,d), so this is the plane the
  // renderer drew, not a bilinear blend belonging to neither triangle.
  const a=T.TG[k], b=T.TG[k+1], c=T.TG[k+T.nx], d=T.TG[k+T.nx+1];
  return (tx+tz<=1) ? a+(b-a)*tx+(c-a)*tz
                    : d+(c-d)*(1-tx)+(b-d)*(1-tz);
}
// The height of the surface actually drawn at a world point: the corridor mesh
// where the corridor owns the ground, the ground field beyond it, and the plan's
// own function only where neither exists. Everything that has to stand on the
// world reads this, not `groundY`.
function realizedGroundY(x,z){
  const ri=routeInfo(x,z);
  if(ri.d<=APRON+2){
    const arm=(ri.arm===1)?'moss':'sun';
    const fr=getFrame(FRAMES[arm],clamp(ri.s,0,FRAMES[arm].len-0.001));
    const u=(x-fr.x)*fr.lx+(z-fr.z)*fr.lz;
    const y=realizedCorridorY(arm,clamp(ri.s,0,FRAMES[arm].len-0.001),clamp(u,-APRON,APRON));
    if(y!==null) return y;
  }
  const t=realizedTileY(x,z);
  return (t===null)?groundY(x,z):t;
}

// ---------- the far country: layered blue-green silhouettes ----------
{
  const c0=spineAt(L_TOTAL*0.5);
  let maxR=0;
  for(let s=0;s<L_TOTAL+TAIL;s+=40){ const p=spineAt(s); maxR=Math.max(maxR,Math.hypot(p.x-c0.x,p.z-c0.z)); }
  const P=[],C=[],IDX=[]; let vi=0;
  for(let ring=0;ring<3;ring++){
    const R=maxR+1250+ring*1100, NA=104, base=-620;
    const near=mixc(PAL.leafShade,PAL.sky,0.34+ring*0.17);
    const far=mixc(PAL.meadow,PAL.sky,0.46+ring*0.17);
    for(let i=0;i<NA;i++){
      const a0=i/NA*TAU, a1=(i+1)/NA*TAU;
      const h0=Math.max(30,fbmL(Math.cos(a0)*3.4+ring*9.1,Math.sin(a0)*3.4)*(330+ring*210)-40);
      const h1=Math.max(30,fbmL(Math.cos(a1)*3.4+ring*9.1,Math.sin(a1)*3.4)*(330+ring*210)-40);
      const x0=c0.x+Math.cos(a0)*R, z0=c0.z+Math.sin(a0)*R;
      const x1=c0.x+Math.cos(a1)*R, z1=c0.z+Math.sin(a1)*R;
      P.push(x0,base,z0, x1,base,z1, x1,h1,z1, x0,h0,z0);
      const cc=near.clone().lerp(far,fbmL(a0*2.3,ring*3.7));
      const lo=cc.clone().lerp(col(PAL.woodDeep),0.22);
      C.push(lo.r,lo.g,lo.b, lo.r,lo.g,lo.b, cc.r,cc.g,cc.b, cc.r,cc.g,cc.b);
      IDX.push(vi,vi+1,vi+2, vi,vi+2,vi+3); vi+=4;
    }
  }
  const gm=new THREE.BufferGeometry();
  gm.setAttribute('position',new THREE.Float32BufferAttribute(P,3));
  gm.setAttribute('color',new THREE.Float32BufferAttribute(C,3));
  gm.setIndex(IDX); gm.computeVertexNormals();
  const m=new THREE.Mesh(gm,new THREE.MeshBasicMaterial({vertexColors:true,fog:true}));
  m.matrixAutoUpdate=false; m.renderOrder=-1;
  scene.add(m);
}
