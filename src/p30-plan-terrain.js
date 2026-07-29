// ============================================================
// PLAN — ENCLOSURE AND RELEASE
// The schedule that decides where the land closes over the road and where
// it lets go. Everything downstream reads from it: trees, ground, sound,
// sky aperture, the colour of the air.
// ============================================================
const ENC=[];
{
  const E=(s0,s1,peak,arm)=>ENC.push({s0,s1,peak,arm:arm||'any'});
  const G=chapEnd('gate'), SB=chapEnd('sunbank'), FF=chapEnd('fernfold'), FK=chapEnd('fork'),
        JW=chapEnd('joining'), GW=chapEnd('glasswater'), CS=chapEnd('cloudstep');
  E(-60,G*0.92,ECO.r(0.58,0.70));                                 // the dappled gate
  E(G*0.55+ECO.r(30,90),SB-ECO.r(40,110),ECO.r(0.24,0.34));       // one grove in the open
  E(SB-ECO.r(10,60),FF+ECO.r(10,50),ECO.r(0.82,0.92));            // Fernfold closes in
  E(S_SPLIT-20,S_MERGE_G+20,ECO.r(0.70,0.82),'moss');         // Mosswater goes under the trees
  E(S_SPLIT-20,S_MERGE_G+20,ECO.r(0.10,0.18),'sun');          // Sunpath rides the open ridge
  E(FK-10,JW-ECO.r(180,260),ECO.r(0.78,0.9));                     // Joining Woods
  E(FK+ECO.r(380,520),FK+ECO.r(620,760),ECO.r(0.93,0.99));        // the quiet passage
  E(JW-ECO.r(60,120),GW-ECO.r(230,330),ECO.r(0.3,0.42));          // Glasswater fringe
  E(GW+ECO.r(60,140),CS-ECO.r(200,300),ECO.r(0.2,0.3));           // thinning on the climb
  E(CS+ECO.r(80,170),L_TOTAL-ECO.r(330,430),ECO.r(0.36,0.46));    // the Bellroot shelf
  for(const e of ENC) H.eco.feed(e.s0,e.s1,e.peak,e.arm);
}
function enclosureAt(g,arm){
  let w=0;
  for(const e of ENC){
    if(e.arm!=='any'&&e.arm!==arm) continue;
    const mid=(e.s0+e.s1)*0.5, half=(e.s1-e.s0)*0.5;
    const t=1-clamp(Math.abs(g-mid)/Math.max(1,half),0,1);
    w=Math.max(w,e.peak*(t*t*(3-2*t)));
  }
  return clamp(w,0,1);
}
// the transitions actually present in the schedule, measured not asserted
const ENC_TRANSITIONS=(()=>{
  let n=0, was=enclosureAt(0,'sun')>0.5;
  for(let g=0;g<L_TOTAL;g+=10){
    const hi=Math.max(enclosureAt(g,'sun'),enclosureAt(g,'moss'))>0.5;
    if(was&&!hi) n++;
    was=hi;
  }
  return n;
})();

// ============================================================
// PLAN — TERRAIN
// The route exists first. The land is then written around the realised
// route and both arms with believable cut, fill, shoulder and drainage.
// ============================================================
const rCell=24, rGrid=new Map();
const rKey=(a,b)=>a*46341+b;
function rAdd(F,armIdx,i0,i1){
  for(let i=i0;i<=i1;i++){
    const k=rKey(Math.floor(F.x[i]/rCell),Math.floor(F.z[i]/rCell));
    let c=rGrid.get(k); if(!c){ c=[]; rGrid.set(k,c); }
    const ia=Math.max(0,i-1), ib=Math.min(F.N,i+1);
    const slope=(F.y[ib]-F.y[ia])/((ib-ia)*F.RS||1);
    c.push(F.x[i],F.y[i],F.z[i],i*F.RS,armIdx,F.tx[i],F.tz[i],slope);
  }
}
rAdd(FRAMES.sun,0,0,FRAMES.sun.N);
rAdd(FRAMES.moss,1,Math.max(0,Math.floor((S_COMMIT.moss-40)/FRAMES.moss.RS)),
     Math.min(FRAMES.moss.N,Math.ceil((S_MERGE.moss+40)/FRAMES.moss.RS)));

// coarse distance field so far-field queries never pay for a wide scan
const CF={cell:40};
{
  let minX=1e9,maxX=-1e9,minZ=1e9,maxZ=-1e9;
  for(const F of [FRAMES.sun,FRAMES.moss]) for(let i=0;i<=F.N;i+=4){
    minX=Math.min(minX,F.x[i]); maxX=Math.max(maxX,F.x[i]);
    minZ=Math.min(minZ,F.z[i]); maxZ=Math.max(maxZ,F.z[i]); }
  CF.x0=minX-1100; CF.z0=minZ-1100;
  CF.nx=Math.ceil((maxX-minX+2200)/CF.cell)+1;
  CF.nz=Math.ceil((maxZ-minZ+2200)/CF.cell)+1;
  CF.bboxW=maxX-minX; CF.bboxH=maxZ-minZ; CF.cx=(minX+maxX)*0.5; CF.cz=(minZ+maxZ)*0.5;
  const n=CF.nx*CF.nz;
  CF.d=new Float32Array(n).fill(1e6); CF.y=new Float32Array(n); CF.s=new Float32Array(n);
  const seed=(F,i0,i1)=>{ for(let i=i0;i<=i1;i+=2){
    const gx=Math.round((F.x[i]-CF.x0)/CF.cell), gz=Math.round((F.z[i]-CF.z0)/CF.cell);
    if(gx<0||gz<0||gx>=CF.nx||gz>=CF.nz) continue;
    const k=gz*CF.nx+gx;
    const dx=CF.x0+gx*CF.cell-F.x[i], dz=CF.z0+gz*CF.cell-F.z[i], d=Math.hypot(dx,dz);
    if(d<CF.d[k]){ CF.d[k]=d; CF.y[k]=F.y[i]; CF.s[k]=i*F.RS; } } };
  seed(FRAMES.sun,0,FRAMES.sun.N);
  seed(FRAMES.moss,Math.max(0,Math.floor((S_COMMIT.moss-40)/FRAMES.moss.RS)),
       Math.min(FRAMES.moss.N,Math.ceil((S_MERGE.moss+40)/FRAMES.moss.RS)));
  // two-pass chamfer, carrying the nearest route height and station with it
  const step=(k,j,add)=>{ const nd=CF.d[j]+add; if(nd<CF.d[k]){ CF.d[k]=nd; CF.y[k]=CF.y[j]; CF.s[k]=CF.s[j]; } };
  const dO=CF.cell, dD=CF.cell*Math.SQRT2;
  for(let z=0;z<CF.nz;z++) for(let x=0;x<CF.nx;x++){ const k=z*CF.nx+x;
    if(x>0) step(k,k-1,dO); if(z>0) step(k,k-CF.nx,dO);
    if(x>0&&z>0) step(k,k-CF.nx-1,dD); if(x<CF.nx-1&&z>0) step(k,k-CF.nx+1,dD); }
  for(let z=CF.nz-1;z>=0;z--) for(let x=CF.nx-1;x>=0;x--){ const k=z*CF.nx+x;
    if(x<CF.nx-1) step(k,k+1,dO); if(z<CF.nz-1) step(k,k+CF.nx,dO);
    if(x<CF.nx-1&&z<CF.nz-1) step(k,k+CF.nx+1,dD); if(x>0&&z<CF.nz-1) step(k,k+CF.nx-1,dD); }
}
function cfSample(x,z,arr){
  const fx=clamp((x-CF.x0)/CF.cell,0,CF.nx-1.001), fz=clamp((z-CF.z0)/CF.cell,0,CF.nz-1.001);
  const ix=Math.floor(fx), iz=Math.floor(fz), tx=fx-ix, tz=fz-iz;
  const a=arr[iz*CF.nx+ix], b=arr[iz*CF.nx+ix+1], c=arr[(iz+1)*CF.nx+ix], d=arr[(iz+1)*CF.nx+ix+1];
  return lerp(lerp(a,b,tx),lerp(c,d,tx),tz);
}
// `laneGapM` is how far apart the two lanes actually are here, measured
// between the nearest point on each. Zero outside the fork, where they are
// the same road. It is what tells a point between the lanes apart from a
// point out on the perpendicular bisector, which is equidistant too.
const _ri={d:0,y:0,s:0,arm:0,dA:[0,0],yA:[0,0],laneGapM:0};
// Inside the fork BOTH lanes' distances have to be trustworthy, not only the
// nearer one's: the ground between the arms is derived from both. The scan
// radius is sized from the coarse field, which knows only the nearest lane, so
// a point close to one arm would stop searching before reaching the other and
// report it as infinitely far. Two grids disagreeing about that drew the same
// ground two different ways. Inside the fork's own bounding box the radius is
// floored instead.
const FORK_MAX_GAP=(()=>{
  let m=0;
  for(let g=S_SPLIT;g<S_MERGE_SPINE;g+=6){
    const a=getFrame(FRAMES.sun,clamp(toLocal('sun',g),0,FRAMES.sun.len-1));
    const b=getFrame(FRAMES.moss,clamp(toLocal('moss',g),0,FRAMES.moss.len-1));
    m=Math.max(m,Math.hypot(a.x-b.x,a.z-b.z));
  }
  return m*1.15;
})();
// The floor is only worth paying for where a point could actually lie between
// the arms. The shared bank fades out once the two distances sum to more than
// 1.22 of the gap, so once the NEARER lane is already 0.61 of a gap away the
// mix is zero whatever the far lane's distance turns out to be — and outside
// the mix, a lane reported as merely "farther than the scan" gives the same
// ownership answer as a lane reported exactly. Inside that ring the scan must
// still reach 1.61 gaps to be sure of finding the far lane.
const FORK_NEAR=FORK_MAX_GAP*0.61;
const FORK_R=Math.ceil((FORK_NEAR+FORK_MAX_GAP)/rCell);
const FORK_BOX=(()=>{
  let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
  for(const [F,a,b] of [[FRAMES.sun,S_SPLIT-90,S_MERGE_SPINE+90],
                        [FRAMES.moss,S_COMMIT.moss-90,S_MERGE.moss+90]]){
    for(let s=Math.max(0,a);s<Math.min(F.len,b);s+=8){
      const p=getFrame(F,s);
      x0=Math.min(x0,p.x); x1=Math.max(x1,p.x); z0=Math.min(z0,p.z); z1=Math.max(z1,p.z);
    }
  }
  const M=FORK_NEAR+8;
  return {x0:x0-M,x1:x1+M,z0:z0-M,z1:z1+M};
})();
// "the other lane was not found by this scan" and "the two lanes are the same
// road" are opposite facts, and both used to be reported as a gap of zero. Past
// the scan-radius floor the far lane is simply out of reach of the search, and a
// zero there told the corridor the lanes had CONVERGED — so a lane ceded its own
// outer apron to a lane a hundred and thirty metres away, and nothing drew the
// ground it gave up. An unknown gap is now enormous rather than nil, which reads
// as "these are far apart" everywhere it is consumed.
const LANE_GAP_UNKNOWN=1e9;
function routeInfo(x,z){
  const approx=cfSample(x,z,CF.d);
  if(approx>190){ _ri.d=approx; _ri.y=cfSample(x,z,CF.y); _ri.s=cfSample(x,z,CF.s); _ri.arm=0;
    _ri.dA[0]=approx; _ri.dA[1]=approx+80; _ri.yA[0]=_ri.y; _ri.yA[1]=_ri.y; _ri.laneGapM=LANE_GAP_UNKNOWN; return _ri; }
  const gx=Math.floor(x/rCell), gz=Math.floor(z/rCell);
  let R=1; if(approx>18) R=2; if(approx>44) R=3; if(approx>68) R=4; if(approx>110) R=6;
  if(approx<FORK_NEAR&&x>FORK_BOX.x0&&x<FORK_BOX.x1&&z>FORK_BOX.z0&&z<FORK_BOX.z1) R=Math.max(R,FORK_R);
  let bd=1e18,by=0,bs=0,ba=0;
  const dA0=[1e18,1e18], yA0=[0,0], pA0=[0,0,0,0];
  for(let ax=gx-R;ax<=gx+R;ax++) for(let az=gz-R;az<=gz+R;az++){
    const c=rGrid.get(rKey(ax,az)); if(!c) continue;
    for(let i=0;i<c.length;i+=8){
      const dx=x-c[i], dz=z-c[i+2];
      const a=c[i+4];
      // distance to the road's own segment through this sample, so the
      // reference height is exact rather than quantised to the sample spacing
      const t=clamp(dx*c[i+5]+dz*c[i+6],-1,1);
      const ex=dx-c[i+5]*t, ez=dz-c[i+6]*t;
      const d=ex*ex+ez*ez;
      const yy=c[i+1]+c[i+7]*t;
      if(d<bd){ bd=d; by=yy; bs=c[i+3]+t; ba=a; }
      if(d<dA0[a]){ dA0[a]=d; yA0[a]=yy; pA0[a*2]=c[i]+c[i+5]*t; pA0[a*2+1]=c[i+2]+c[i+6]*t; }
    }
  }
  if(bd>1e17){ _ri.d=approx; _ri.y=cfSample(x,z,CF.y); _ri.s=cfSample(x,z,CF.s); _ri.arm=0;
    _ri.dA[0]=approx; _ri.dA[1]=approx+80; _ri.yA[0]=_ri.y; _ri.yA[1]=_ri.y; _ri.laneGapM=LANE_GAP_UNKNOWN; return _ri; }
  _ri.d=Math.sqrt(bd); _ri.y=by; _ri.s=bs; _ri.arm=ba;
  _ri.dA[0]=Math.sqrt(dA0[0]); _ri.dA[1]=Math.sqrt(dA0[1]);
  _ri.yA[0]=yA0[0]; _ri.yA[1]=yA0[1];
  _ri.laneGapM=(dA0[0]>1e17||dA0[1]>1e17)?LANE_GAP_UNKNOWN:Math.hypot(pA0[0]-pA0[2],pA0[1]-pA0[3]);
  return _ri;
}

// ---------- the independent landform, and how much of it the road must cut ----------
function bankMix(s){
  const g=clamp(s,0,L_TOTAL);
  return clamp(0.34+0.62*enclosureAt(g,'sun'),0.28,0.96);
}
function indepLand(x,z){
  return (fbmL(x/430+3.3,z/430+9.1)-0.5)*54
       + (fbmL(x/168+21.7,z/168+5.3)-0.5)*24;
}
// its own smoothed value along the route, so cut and fill stay believable
const INDEP_REF=(()=>{
  const n=Math.ceil((L_TOTAL+TAIL)/20)+1, a=new Float32Array(n);
  for(let i=0;i<n;i++){ const p=spineAt(i*20); a[i]=indepLand(p.x,p.z); }
  blurArray(a,26);
  return a;
})();
const indepRefAt=(s)=>{ const i=clamp(s/20,0,INDEP_REF.length-1), i0=Math.floor(i);
  return lerp(INDEP_REF[i0],INDEP_REF[Math.min(i0+1,INDEP_REF.length-1)],i-i0); };

// ---------- the reference surface: a smooth field that follows the route ----------
const REF={cell:44};
{
  REF.x0=CF.x0; REF.z0=CF.z0;
  REF.nx=Math.ceil(CF.nx*CF.cell/REF.cell)+2; REF.nz=Math.ceil(CF.nz*CF.cell/REF.cell)+2;
  const n=REF.nx*REF.nz;
  REF.h=new Float32Array(n);
  for(let iz=0;iz<REF.nz;iz++) for(let ix=0;ix<REF.nx;ix++){
    const x=REF.x0+ix*REF.cell, z=REF.z0+iz*REF.cell;
    const ry=cfSample(x,z,CF.y), rs=cfSample(x,z,CF.s);
    REF.h[iz*REF.nx+ix]=ry+(indepLand(x,z)-indepRefAt(rs))*bankMix(rs);
  }
  const t=new Float32Array(n);
  for(let p=0;p<3;p++){
    for(let iz=0;iz<REF.nz;iz++) for(let ix=0;ix<REF.nx;ix++){
      let s=0,w=0;
      for(let dz=-1;dz<=1;dz++) for(let dx=-1;dx<=1;dx++){
        const jx=clamp(ix+dx,0,REF.nx-1), jz=clamp(iz+dz,0,REF.nz-1);
        const ww=(dx===0&&dz===0)?4:((dx&&dz)?1:2);
        s+=REF.h[jz*REF.nx+jx]*ww; w+=ww;
      }
      t[iz*REF.nx+ix]=s/w;
    }
    REF.h.set(t);
  }
}
function refAt(x,z){
  const fx=clamp((x-REF.x0)/REF.cell,0,REF.nx-1.001), fz=clamp((z-REF.z0)/REF.cell,0,REF.nz-1.001);
  const ix=Math.floor(fx), iz=Math.floor(fz), tx=fx-ix, tz=fz-iz;
  const h=REF.h, nx=REF.nx;
  return lerp(lerp(h[iz*nx+ix],h[iz*nx+ix+1],tx),lerp(h[(iz+1)*nx+ix],h[(iz+1)*nx+ix+1],tx),tz);
}
let KNOLL=null;    // one deliberate rise, set once the Sisters have chosen their ground
// hills grow away from the corridor: banks, wooded shoulders, bowls, skyline ridges
function reliefAt(x,z,d){
  const g=smooth(16,125,d);
  let r=(fbmL(x/520+11.7,z/520+2.9)-0.5)*186;      // the shape of the country
  r+=(fbmL(x/188+31.1,z/188+17.4)-0.5)*62;         // banks, shoulders, bowls
  r+=(fbmL(x/62+7.7,z/62+41.3)-0.5)*14;            // the ground's own roughness
  r*=g;
  if(KNOLL){ const dx=x-KNOLL.x, dz=z-KNOLL.z;
    r+=KNOLL.h*Math.exp(-(dx*dx+dz*dz)/(KNOLL.r*KNOLL.r))*smooth(120,340,d); }
  return r;
}

// ---------- water: the beck, the ford, the Glasswater pool ----------
const STREAM=[];
// The beck keeps one side of the road for the whole hollow — no crossing where
// the lanes are close together — and crosses once, under a low bridge, well
// after the rejoin.
const BECK_X=lerp(0,1,WATER.r(0.34,0.62));
let BECK_XG=0;
{
  const SIDE=-FORK_SIDE;
  const g0=chapEnd('sunbank')+WATER.r(20,90), g1=chapEnd('joining')-WATER.r(60,140);
  BECK_XG=lerp(S_MERGE_G+150,g1-160,BECK_X);
  let off=WATER.r(18,26), ph=WATER.r(0,TAU);
  const armAt=(g)=>(g>S_SPLIT-20&&g<S_MERGE_G+20?'moss':'sun');
  for(let g=g0;g<=g1;g+=9){
    const arm=armAt(g);
    const fr=getFrame(FRAMES[arm],clamp(toLocal(arm,g),0,FRAMES[arm].len-1));
    off+=WATER.r(-1.3,1.3); off=clamp(off,15,34);
    const breathe=Math.sin(g*0.0095+ph)*4.0;
    const flip=1-2*smooth(BECK_XG-15,BECK_XG+15,g);
    const o=(off+breathe)*SIDE*flip;
    const p=new THREE.Vector3(fr.x+fr.lx*o,0,fr.z+fr.lz*o);
    p.g=g;
    STREAM.push(p);
  }
  // never inside the corridor except at the one place it was asked to cross
  for(const p of STREAM){
    if(Math.abs(p.g-BECK_XG)<28) continue;
    for(let guard=0;guard<16;guard++){
      const ri=routeInfo(p.x,p.z);
      const dm=Math.min(ri.dA[0],ri.dA[1]);
      if(dm>=13) break;
      const arm=(ri.dA[1]<ri.dA[0])?'moss':'sun';
      const F=FRAMES[arm];
      const fr=getFrame(F,clamp(nearestS(F,p.x,p.z),0,F.len-1));
      const side=Math.sign((p.x-fr.x)*fr.lx+(p.z-fr.z)*fr.lz)||1;
      const push=Math.min(6,(13.8-dm));
      p.x+=fr.lx*side*push; p.z+=fr.lz*side*push;
    }
  }
  for(let q=0;q<8;q++) for(let i=1;i<STREAM.length-1;i++){
    STREAM[i].x=(STREAM[i-1].x+STREAM[i].x*2+STREAM[i+1].x)*0.25;
    STREAM[i].z=(STREAM[i-1].z+STREAM[i].z*2+STREAM[i+1].z)*0.25; }
  // smoothing can pull a point back toward the stone: hold the line afterwards
  for(const p of STREAM){
    if(Math.abs(p.g-BECK_XG)<28) continue;
    for(let guard=0;guard<10;guard++){
      const ri=routeInfo(p.x,p.z);
      const dm=Math.min(ri.dA[0],ri.dA[1]);
      if(dm>=12.5) break;
      const arm=(ri.dA[1]<ri.dA[0])?'moss':'sun';
      const F=FRAMES[arm];
      const fr=getFrame(F,clamp(nearestS(F,p.x,p.z),0,F.len-1));
      const side=Math.sign((p.x-fr.x)*fr.lx+(p.z-fr.z)*fr.lz)||1;
      p.x+=fr.lx*side*(13.2-dm); p.z+=fr.lz*side*(13.2-dm);
    }
  }
  // the water sits in the land it runs through, and at the crossing it sits
  // well under the road so the bridge has something to span
  for(const p of STREAM){
    const ri=routeInfo(p.x,p.z);
    const land=refAt(p.x,p.z)+reliefAt(p.x,p.z,ri.d);
    p.y=land-0.85;
    if(Math.abs(p.g-BECK_XG)<40) p.y=Math.min(p.y,ri.y-2.15);
  }
  for(let q=0;q<7;q++) for(let i=1;i<STREAM.length-1;i++)
    STREAM[i].y=(STREAM[i-1].y+STREAM[i].y*2+STREAM[i+1].y)*0.25;
  const desc=STREAM[0].y>=STREAM[STREAM.length-1].y;
  if(desc){ for(let i=1;i<STREAM.length;i++) STREAM[i].y=Math.min(STREAM[i].y,STREAM[i-1].y-0.012); }
  else { for(let i=STREAM.length-2;i>=0;i--) STREAM[i].y=Math.min(STREAM[i].y,STREAM[i+1].y-0.012); }
}
const sCell=26, sGrid=new Map();
for(const p of STREAM){ const k=rKey(Math.floor(p.x/sCell),Math.floor(p.z/sCell));
  let c=sGrid.get(k); if(!c){c=[];sGrid.set(k,c);} c.push(p); }
function streamInfo(x,z){
  const gx=Math.floor(x/sCell), gz=Math.floor(z/sCell);
  let bd=1e18,by=0;
  for(let ax=gx-1;ax<=gx+1;ax++) for(let az=gz-1;az<=gz+1;az++){
    const c=sGrid.get(rKey(ax,az)); if(!c) continue;
    for(const p of c){ const dx=p.x-x,dz=p.z-z,d=dx*dx+dz*dz; if(d<bd){bd=d;by=p.y;} } }
  return {d:bd>1e17?999:Math.sqrt(bd),y:by};
}
// the Glasswater pool: set back behind the fringe, shown through one gap
// A pool is a composed thing, not an accident of where the noise happened to
// dip. Two rules make it one: it must stand entirely clear of the lane's own
// ground, and its surface must sit a knowable few metres below the lane, so the
// rider looks *down* onto water instead of at a bank. Everything else — the
// basin under it, the shelf across to it, the bank behind it — is derived.
// A reveal that opens beside the rider is not a reveal — you ride past it and
// never turn your head. So the station is chosen, not sampled: among the
// candidates in the chapter, take the one where the water sits about twenty
// degrees off the heading a hundred metres back, which puts it in frame and
// moving across it as you come on.
function composePool(arm,gLo,gHi,off,leadHi,halfFov,rx,rz){
  // Score a candidate by how long the water actually stays inside the rider's
  // own view cone on the way in, not by one flattering instant. A pool that is
  // dead ahead for a single frame and abeam for the rest is not a moment.
  let best=null, fallback=null;
  for(let k=0;k<=28;k++){
    const g=lerp(gLo,gHi,k/28);
    const fr=getFrame(FRAMES[arm],clamp(toLocal(arm,g),0,FRAMES[arm].len-1));
    for(const side of [-1,1]){
      const cx=fr.x+fr.lx*off*side, cz=fr.z+fr.lz*off*side;
      // measured against the direction the camera actually faces — a chord to a
      // look-ahead point — not the instantaneous tangent, which on a bend can be
      // fifteen degrees off where the rider is really looking
      let hits=0, first=null, last=null, weight=0, angMid=0;
      for(let L=leadHi;L>=34;L-=8){
        const fa=getFrame(FRAMES[arm],clamp(toLocal(arm,g-L),0,FRAMES[arm].len-1));
        const fb=getFrame(FRAMES[arm],clamp(toLocal(arm,g-L+22),0,FRAMES[arm].len-1));
        let hx=fb.x-fa.x, hz=fb.z-fa.z; const hl=Math.hypot(hx,hz)||1; hx/=hl; hz/=hl;
        const dx=cx-fa.x, dz=cz-fa.z, len=Math.hypot(dx,dz)||1;
        const ang=Math.acos(clamp((dx*hx+dz*hz)/len,-1,1));
        if(L>leadHi*0.68&&L<leadHi*0.82) angMid=ang*180/Math.PI;
        if(ang<halfFov){ hits++; weight+=1-ang/halfFov; if(first===null) first=L; last=L; }
      }
      const cand={score:-weight,g,side,cx,cz,fr,hits,
        windowM:(first!==null)?(first-last):0, angDeg:angMid};
      if(!fallback||cand.score<fallback.score-1e-9) fallback=cand;
      // near the fork the other arm is close enough that a pool sized off one
      // lane can land squarely on the other. Every candidate has to clear both.
      let clear=true;
      for(let a=0;a<12&&clear;a++){
        const t=a/12*TAU;
        const px=cx+Math.cos(t)*rx*1.06, pz=cz+Math.sin(t)*rz*1.06;
        if(routeInfo(px,pz).d<EXCL+7) clear=false;
      }
      if(clear&&(!best||cand.score<best.score-1e-9)) best=cand;
    }
  }
  return best||fallback;
}
const POOL=(()=>{
  const rx=WATER.r(23,29), rz=WATER.r(15,20);
  const rot=WATER.r(0,TAU), drop=WATER.r(2.9,4.3), ap=WATER.r(14,30);
  const off=rx*1.04+EXCL+WATER.r(7,13);
  const c=composePool('sun',chapEnd('joining')+40,chapEnd('glasswater')-40,off,160,0.58,rx,rz);
  return { g:c.g, side:c.side, cx:c.cx, cz:c.cz, rx, rz, rot,
           apertureG:c.g-ap, revealAngleDeg:+c.angDeg.toFixed(1), revealLeadM:160,
           revealWindowM:c.windowM,
           y:c.fr.y-drop, bed:0, name:'glasswater' };
})();
// the dark pool the Mosswater arm runs past: cooler, smaller, under the trees
const MOSSPOOL=(()=>{
  const rx=WATER.r(11,16), rz=WATER.r(7.5,11);
  const rot=WATER.r(0,TAU), drop=WATER.r(2.1,3.2), ap=WATER.r(10,22);
  const off=rx*1.06+EXCL+WATER.r(5,10);
  const c=composePool('moss',S_SPLIT+90,S_MERGE_G-70,off,120,0.58,rx,rz);
  return { g:c.g, side:c.side, cx:c.cx, cz:c.cz, rx, rz, rot,
           apertureG:c.g-ap, revealAngleDeg:+c.angDeg.toFixed(1), revealLeadM:120,
           revealWindowM:c.windowM,
           y:c.fr.y-drop, bed:0, name:'mosswater' };
})();
const PONDS=[POOL,MOSSPOOL];
for(const P of PONDS) P.bed=P.y-2.0;
// A pool set in a basin is invisible from a road at eye height: the near rim
// occludes the whole surface, which is how a chapter called Glasswater Shelf
// ended up with no visible water in it. So each pool is given a shelf — a wedge
// of ground between the lane and the near bank that falls away monotonically,
// clamped below the rider's sight line. The far bank is deliberately left high,
// because the water needs a dark bank behind it to read against.
const SHELVES=PONDS.map(P=>{
  const arm=(P.name==='mosswater')?'moss':'sun';
  const fr=getFrame(FRAMES[arm],clamp(toLocal(arm,P.g),0,FRAMES[arm].len-1));
  const off=(P.cx-fr.x)*fr.lx+(P.cz-fr.z)*fr.lz;    // signed lateral offset of the pool
  return { P, arm, fr, off, side:Math.sign(off)||1,
           uNear:Math.abs(off)-P.rx*0.94,           // where the near bank begins
           halfV:P.rx*1.55+26,                      // how far along the lane it opens
           backV:(P.rx*1.55+26)*2.4 };              // and much further back up the approach
});
function shelfY(x,z,y,rd){
  for(const S of SHELVES){
    const dx=x-S.fr.x, dz=z-S.fr.z;
    const v=dx*S.fr.tx+dz*S.fr.tz;                  // along the lane
    const ext=(v<0)?S.backV:S.halfV;                // the approach side reaches further
    if(Math.abs(v)>ext) continue;
    const u=(dx*S.fr.lx+dz*S.fr.lz)*S.side;         // toward the pool
    // The shelf begins outside the verge, never inside it: within the corridor's
    // own row spacing it changes faster than the drawn mesh can follow, and
    // anything standing on the analytic ground would float above its triangles.
    if(u<RH+7.5||u>S.uNear+1.5) continue;
    const t=clamp((u-(RH+7.5))/Math.max(4,S.uNear+1.5-(RH+7.5)),0,1);
    // eased so the ground rolls off the verge rather than shearing away from it
    const ramp=lerp(S.fr.y-0.55,S.P.y+0.30,t*t*(3-2*t));
    const fade=(1-smooth(ext*0.42,ext,Math.abs(v)))*smooth(RH+7.5,RH+13,u);
    y=lerp(y,Math.min(y,ramp),fade);
  }
  return y;
}
function inShelf(x,z,margin){
  for(const S of SHELVES){
    const dx=x-S.fr.x, dz=z-S.fr.z;
    const vv=dx*S.fr.tx+dz*S.fr.tz;
    if(Math.abs(vv)>((vv<0)?S.backV:S.halfV)*0.92) continue;
    const u=(dx*S.fr.lx+dz*S.fr.lz)*S.side;
    if(u>RH+4.0&&u<S.uNear+(margin||0)) return true;
  }
  return false;
}
H.terrain.feed(STREAM.length,POOL.g,POOL.cx,POOL.cz,POOL.rx,POOL.rz,MOSSPOOL.g,MOSSPOOL.cx,MOSSPOOL.cz);

// ---------- the ground: one function, used by everything that touches it ----------
const CROWN=0.11;
function corridorProfile(a,cut){
  // a: lateral distance from the road centreline; cut>0 where the land stands above the road
  if(a<=RH) return CROWN*(1-(a/RH)*(a/RH));
  let h=-0.30*smooth(RH,RH+0.95,a);                 // the shoulder carries the stone's edge, then rolls off
  h-=0.24*smooth(RH+0.7,RH+1.9,a);                  // then the contact band steps down
  h-=0.34*smooth(RH+1.7,RH+4.6,a);                  // and the verge falls away
  h-=0.44*Math.exp(-Math.pow((a-(RH+4.0))/2.4,2))*clamp(cut,0,1)*smooth(RH,RH+1.4,a);  // a drain along the cut side
  return h;
}
function surfaceY(x,z){
  const ri=routeInfo(x,z);
  const base=refAt(x,z)+reliefAt(x,z,ri.d);
  // each lane keeps its own bed; whichever is nearer owns the ground outright,
  // and only near the medial line between them do the two beds ever mix
  const w0=1-smooth(8.5,clamp(20+Math.abs(base-ri.yA[0])*3.4,26,132),ri.dA[0]);
  const w1=1-smooth(8.5,clamp(20+Math.abs(base-ri.yA[1])*3.4,26,132),ri.dA[1]);
  let y=base;
  if(w0>1e-4||w1>1e-4){
    const d0=Math.max(ri.dA[0],0.6), d1=Math.max(ri.dA[1],0.6);
    const e0=ri.yA[0]+corridorProfile(ri.dA[0],base-ri.yA[0]);
    const e1=ri.yA[1]+corridorProfile(ri.dA[1],base-ri.yA[1]);
    // The two beds used to swap over an inverse-tenth-power weighting, which
    // put the whole height difference between the lanes — up to nineteen metres
    // at the fork — into a band a few metres wide. That is a cliff, not a bank,
    // and no corridor grid can draw a cliff consistently from two directions:
    // the two aprons landed on opposite sides of it and disagreed by five
    // metres, which is the shelf that appeared to hang in the air between the
    // arms. Blending on the normalised medial coordinate instead spreads the
    // change across the span between the lanes, so the wedge is a graded bank
    // and both grids draw the same one. Each lane still owns the ground beside
    // it outright — that is the `own` term below, not this weighting.
    const t=clamp(d0/(d0+d1),0,1);
    let eng=lerp(e0,e1,smooth(0.16,0.84,t));
    // inside the shoulder the nearest lane owns the ground outright: nothing
    // from the other lane is allowed to lift the ground beside this one
    const own=1-smooth(RH+3.0,RH+9.5,ri.d);
    eng=lerp(eng,ri.y+corridorProfile(ri.d,base-ri.y),own);
    y=lerp(base,eng,Math.max(w0,w1));
  }
  // the beck cuts its own channel; the road's shoulder is never part of it
  const si=streamInfo(x,z);
  if(si.d<12){
    const t=(1-smooth(1.2,10,si.d))*smooth(RH+1.0,RH+2.8,ri.d);
    y=lerp(y,Math.min(y,si.y-0.5),t);
  }
  for(const P of PONDS){
    const pdx=x-P.cx, pdz=z-P.cz;
    if(Math.abs(pdx)>P.rx*3.0||Math.abs(pdz)>P.rx*3.0) continue;
    const pc=Math.cos(-P.rot), ps=Math.sin(-P.rot);
    const px=pdx*pc-pdz*ps, pz=pdx*ps+pdz*pc;
    const pr=Math.hypot(px/P.rx,pz/P.rz);
    if(pr<2.05){
      // the bed is set, not merely cut down to: a pool lying across a slope has
      // to have a floor, or the far half of it drains straight out of frame
      const t=(1-smooth(1.10,2.05,pr))*smooth(RH+9,RH+24,ri.d);
      y=lerp(y,P.bed,t);
    }
    // a rim the water can be held by: outside the basin the ground rises above
    // the surface, so a pool never reads as a puddle poured down a hillside
    if(pr>=1.0&&pr<2.7){
      const rim=P.y+0.35+2.1*smooth(1.05,2.4,pr);
      // held well clear of the corridor: inside the road's own row spacing the
      // rim varies faster than the drawn mesh can follow, and props standing on
      // the analytic ground would float above the triangles beneath them
      y=lerp(y,Math.max(y,rim),smooth(RH+9,RH+26,ri.d)*(1-smooth(2.3,2.7,pr)));
    }
  }
  y=shelfY(x,z,y,ri.d);
  // a hard guarantee: within the shoulder of either lane the ground is never
  // permitted above that lane's own edge, whatever else has been added here
  for(let a=0;a<2;a++){
    if(ri.dA[a]<RH+2.5&&ri.dA[a]<=ri.d+0.01)
      y=Math.min(y,ri.yA[a]+corridorProfile(Math.max(ri.dA[a],RH+0.001),0)+0.015);
  }
  // and the matching guarantee in the other direction: whatever a pool basin,
  // a shelf or a ditch wants to do out in the field, the metre of ground either
  // side of the stone still carries it. A road that is not held up is not a road.
  for(let a=0;a<2;a++){
    if(ri.dA[a]<RH+1.7&&ri.dA[a]<=ri.d+0.01)
      y=Math.max(y,ri.yA[a]+corridorProfile(Math.max(ri.dA[a],RH+0.001),0)-0.012);
  }
  return y;
}
function groundY(x,z){ return surfaceY(x,z); }
const POOL_Y=POOL.y;
H.terrain.feed(POOL_Y,ROLLER_STAT.count,ELEVATION.asc,ELEVATION.desc);
for(let s=0;s<L_TOTAL;s+=160){ const p=spineAt(s); H.terrain.feed(groundY(p.x+70,p.z),groundY(p.x-70,p.z+40)); }
