// ============================================================
// PLAN — CHAPTERS
// Eight chapters, laid out on the clock of a ~11 minute ride at cruise,
// then jittered structurally by seed.
// ============================================================
const CRUISE=9.5;
const L_TOTAL=ROUTE.r(6180,6560);
const TAIL=430;                                   // the road runs on past the rest
const CH=[
  {key:'gate',      name:'The Dappled Gate',     end:0.111},
  {key:'sunbank',   name:'Sunbank',              end:0.215},
  {key:'fernfold',  name:'Fernfold',             end:0.333},
  {key:'fork',      name:'The Mosswater Choice', end:0.417},
  {key:'joining',   name:'Joining Woods',        end:0.611},
  {key:'glasswater',name:'Glasswater Shelf',     end:0.722},
  {key:'cloudstep', name:'Cloudstep Rise',       end:0.861},
  {key:'bellroot',  name:'Bellroot Exhale',      end:1.0},
];
for(let i=0;i<CH.length-1;i++){
  CH[i].end=clamp(CH[i].end+ROUTE.r(-0.012,0.012),(i?CH[i-1].end:0)+0.055,0.97);
}
const CHS={}; for(const c of CH) CHS[c.key]=c.end*L_TOTAL;
function chapEndPre(k){ const i=CH.findIndex(c=>c.key===k); return i>0?CH[i-1].end*L_TOTAL:0; }
const chapEnd=(k)=>CHS[k];
const chapStart=(k)=>{ const i=CH.findIndex(c=>c.key===k); return i? CH[i-1].end*L_TOTAL : 0; };
function chapterOf(s){ const f=clamp(s,0,L_TOTAL)/L_TOTAL;
  for(const c of CH) if(f<=c.end) return c.name; return CH[CH.length-1].name; }
function chapterKeyOf(s){ const f=clamp(s,0,L_TOTAL)/L_TOTAL;
  for(const c of CH) if(f<=c.end) return c.key; return 'bellroot'; }
H.route.feed(L_TOTAL); for(const c of CH) H.route.feed(c.end);

// ============================================================
// PLAN — CENTRELINE
// Curvature is a smooth seeded sum of long sinusoids, so the road is
// tangent- and curvature-continuous by construction: no kinks, ever.
// ============================================================
const MIN_RADIUS=158;
const SDS=2;                                        // plan sample step, metres
const NS=Math.ceil((L_TOTAL+TAIL)/SDS)+1;
const CURVE=[];
{
  let amp=0;
  // one long sweeping bow, so two chapters far apart on the road can end up
  // near each other in the country, then four shorter ones for flow
  CURVE.push({wl:ROUTE.r(2100,3200),a:2.1,ph:ROUTE.r(0,TAU)}); amp+=2.1;
  for(let i=0;i<4;i++){
    const wl=ROUTE.r(255,1050), a=ROUTE.r(0.30,0.85);
    CURVE.push({wl,a,ph:ROUTE.r(0,TAU)});
    amp+=a;
  }
  const k=1/MIN_RADIUS/amp;
  for(const c of CURVE){ c.a*=k; H.route.feed(c.wl,c.a,c.ph); }
}
// the opening is composed, not sampled: the road bends away inside the first
// two hundred metres so the rider is promised somewhere rather than shown it
const OPEN_BOW=(ROUTE.chance(0.5)?1:-1)/ROUTE.r(340,430);
function curvatureAt(s){
  let k=0;
  for(const c of CURVE) k+=c.a*Math.sin(TAU*s/c.wl+c.ph);
  k+=OPEN_BOW*Math.sin(Math.PI*clamp((s-20)/230,0,1));
  return k;
}
H.route.feed(OPEN_BOW);

// ============================================================
// PLAN — ELEVATION
// Rollers, signature climbs, chapter shaping; then a grade limiter and a
// vertical easing pass so every grade arrives and leaves smoothly.
// ============================================================
const S_FORK_SPLIT_FRAC=0.417;
const EDS=2;
const GRADE_CAP=0.066;
const FORK_SIDE=FORKS.chance(0.5)?1:-1;             // +1: Sunpath climbs to the left
const S_SPLIT=chapEndPre('fork')+FORKS.r(30,90);   // the wedge
const ARM_LEN=FORKS.r(560,660);
const S_MERGE_SPINE=S_SPLIT+ARM_LEN;
const S_SHELF0=S_SPLIT, S_SHELF1=S_MERGE_SPINE;
const FORK_COMMIT_LEAD=118;   // metres past the split before the line is committed
CH[3].end=clamp(S_MERGE_SPINE/L_TOTAL,CH[2].end+0.05,CH[4].end-0.05);
for(const c of CH) CHS[c.key]=c.end*L_TOTAL;
const SUN_LIFT=FORKS.r(9,12), MOSS_DROP=FORKS.r(5.5,7.5);
const SUN_OUT=FORKS.r(34,46);
let MOSS_OUT=SUN_OUT*FORKS.r(0.66,0.80);
const MOSS_WOB=FORKS.r(7.5,10.5), SUN_WOB=FORKS.r(3,5);
const SUN_PH=FORKS.r(0,TAU), MOSS_PH=FORKS.r(0,TAU);
// The profile is not a ramp with ripples on it. It is a sequence of rises and
// falls — rollers — whose sizes are biased chapter by chapter, so a climb is
// three linked rises with partial recoveries and a hollow is a run of falls.
const BREATH=[], KNOTS=[];
const TREND=ELEV.r(0.0044,0.0074);   // the hollow climbs, gently, all the way through
const CHAP_BIAS=[];
{
  for(let i=0;i<2;i++) BREATH.push({wl:ELEV.r(1700,2900),a:ELEV.r(1.2,2.6),ph:ELEV.r(0,TAU)});
  const G=chapEnd('gate'), SB=chapEnd('sunbank'), FF=chapEnd('fernfold'), FK=chapEnd('fork'),
        JW=chapEnd('joining'), GW=chapEnd('glasswater'), CS=chapEnd('cloudstep');
  const B=(s,v)=>CHAP_BIAS.push({s,v});
  const HOLD=(s0,s1,v)=>{ B(s0,v); B(s1,v); };
  B(-260,0.05);
  HOLD(G*0.20,G*0.46,-ELEV.r(0.40,0.50));               // the opening looks down the hollow
  B(G*0.98,0.24);
  HOLD(G+110,SB-170,ELEV.r(0.46,0.58));                 // Sunbank rides up across open ground
  B(SB+30,0.02);
  HOLD(SB+140,FF-190,-ELEV.r(0.56,0.68));               // Fernfold falls into the compression
  B(FF+30,-0.06);
  HOLD(S_SHELF0-40,S_SHELF1+40,0.05);                   // the fork stands on a shelf
  HOLD(FK+200,FK+ELEV.r(560,680),ELEV.r(0.54,0.64));    // a signature climb inside the trees
  B(JW-140,-ELEV.r(0.10,0.20));
  HOLD(JW+90,GW-ELEV.r(260,340),0.08);                  // Glasswater is a shelf
  B(GW-90,0.10);
  HOLD(GW+90,lerp(GW,CS,0.38),ELEV.r(0.56,0.66));       // Cloudstep: three linked rises
  B(lerp(GW,CS,0.55),ELEV.r(0.02,0.14));                //   with partial recoveries
  HOLD(lerp(GW,CS,0.62),CS-110,ELEV.r(0.56,0.66));
  HOLD(CS+90,CS+ELEV.r(250,340),ELEV.r(0.46,0.58));     // the last shelf under Bellroot
  HOLD(L_TOTAL-ELEV.r(470,540),L_TOTAL-ELEV.r(120,180),-ELEV.r(0.54,0.66));  // the valley lets go
  B(L_TOTAL+TAIL+200,-0.20);
  CHAP_BIAS.sort((p,q)=>p.s-q.s);
  const biasAt=(s)=>{
    if(s<=CHAP_BIAS[0].s) return CHAP_BIAS[0].v;
    for(let i=1;i<CHAP_BIAS.length;i++){
      if(s<=CHAP_BIAS[i].s){
        const t=(s-CHAP_BIAS[i-1].s)/Math.max(1,CHAP_BIAS[i].s-CHAP_BIAS[i-1].s);
        return lerp(CHAP_BIAS[i-1].v,CHAP_BIAS[i].v,t*t*(3-2*t));
      }
    }
    return CHAP_BIAS[CHAP_BIAS.length-1].v;
  };
  // climbs are laid a little gentler than descents, which is both kinder on a
  // bicycle and what buys the route its ascent inside the grade contract
  const GUP=0.040, GDN=0.049;
  let s=-220, dir=ELEV.chance(0.5)?1:-1, y=0, run=0;
  KNOTS.push({s,y,dir});
  while(s<L_TOTAL+TAIL+240){
    const ds=ELEV.r(92,206);
    const mid=s+ds*0.5;
    const bias=clamp(biasAt(mid),-0.88,0.88);
    // amplitude is a fraction of what the grade contract allows. The direction
    // the chapter wants takes all of it; the other direction gets only what the
    // bias leaves, which is how a climb becomes linked rises with recoveries.
    const fav=(dir>0)===(bias>=0);
    const mag=Math.abs(bias);
    let amp=(dir>0?GUP:GDN)*ds*ELEV.r(0.84,1.0);
    if(!fav) amp*=clamp(1-1.30*mag,0.22,1);
    // the fork stands on a shelf so both arms have room to part vertically
    amp*=1-0.62*smooth(S_SHELF0-190,S_SHELF0-30,mid)*(1-smooth(S_SHELF1+30,S_SHELF1+190,mid));
    amp=Math.min(amp,0.052*ds);
    y+=dir*Math.max(0.25,amp);
    s+=ds;
    KNOTS.push({s,y,dir});
    // where the land really means it, two or three rises link up with only a
    // partial recovery between them, instead of a strict up-down alternation
    const want=Math.sign(bias);
    const keep=(Math.abs(bias)>0.46&&dir===want&&run<2&&ELEV.f()<(Math.abs(bias)-0.44)*1.8);
    if(keep) run++; else { dir=-dir; run=0; }
  }
  for(const k of KNOTS) H.elev.feed(k.s,k.y);
  H.elev.feed(TREND);
  for(const b of BREATH) H.elev.feed(b.wl,b.a,b.ph);
}
function knotY(s,scale){
  let lo=0, hi=KNOTS.length-1;
  if(s<=KNOTS[0].s) return KNOTS[0].y*scale;
  if(s>=KNOTS[hi].s) return KNOTS[hi].y*scale;
  while(hi-lo>1){ const m=(lo+hi)>>1; if(KNOTS[m].s<=s) lo=m; else hi=m; }
  const a=KNOTS[lo], b=KNOTS[hi];
  const t=(s-a.s)/Math.max(1e-6,b.s-a.s);
  return lerp(a.y,b.y,t*t*(3-2*t))*scale;
}
function blurArray(y,passes){
  const n=y.length, t=new Float32Array(n);
  for(let p=0;p<passes;p++){
    t[0]=y[0]; t[n-1]=y[n-1];
    for(let i=1;i<n-1;i++) t[i]=(y[i-1]+y[i]*2+y[i+1])*0.25;
    y.set(t);
  }
}
function buildElevation(scale){
  const n=Math.ceil((L_TOTAL+TAIL)/EDS)+1;
  const y=new Float32Array(n);
  for(let i=0;i<n;i++){
    const s=i*EDS;
    let v=knotY(s,scale)+TREND*s;
    for(const B of BREATH) v+=B.a*Math.sin(TAU*s/B.wl+B.ph);
    y[i]=v;
  }
  for(let i=1;i<n;i++){ const d=y[i]-y[i-1], m=GRADE_CAP*EDS;
    if(d> m) y[i]=y[i-1]+m; else if(d<-m) y[i]=y[i-1]-m; }
  for(let i=n-2;i>=0;i--){ const d=y[i]-y[i+1], m=GRADE_CAP*EDS;
    if(d> m) y[i]=y[i+1]+m; else if(d<-m) y[i]=y[i+1]-m; }
  blurArray(y,54);                          // vertical easing, sigma ~ 10 m
  let asc=0,desc=0,maxG=0;
  for(let i=1;i<n;i++){ const d=y[i]-y[i-1];
    if(d>0) asc+=d; else desc-=d;
    maxG=Math.max(maxG,Math.abs(d)/EDS); }
  return {y,asc,desc,maxG,n};
}
const ASC_TARGET=ELEV.r(128,148);
let ELEVATION;
{
  const a=buildElevation(1.0);
  let scale=clamp(ASC_TARGET/Math.max(a.asc,1),0.80,1.22);
  ELEVATION=buildElevation(scale);
  if(ELEVATION.asc<ASC_TARGET*0.93||ELEVATION.asc>ASC_TARGET*1.09){
    scale=clamp(scale*ASC_TARGET/Math.max(ELEVATION.asc,1),0.80,1.24);
    ELEVATION=buildElevation(scale);
  }
  ELEVATION.rollerScale=scale;
  H.elev.feed(scale,ELEVATION.asc,ELEVATION.desc,ELEVATION.maxG);
}
function spineY(s){
  const i=clamp(s/EDS,0,ELEVATION.n-1), i0=Math.floor(i), t=i-i0, i1=Math.min(i0+1,ELEVATION.n-1);
  return lerp(ELEVATION.y[i0],ELEVATION.y[i1],t);
}
// rollers, measured on the built profile rather than assumed
const ROLLER_STAT=(()=>{
  const y=ELEVATION.y, n=ELEVATION.n;
  // collect extrema, then merge any pair whose swing is below the roller floor
  let ex=[{i:0,y:y[0],k:y[1]>=y[0]?-1:1}];
  for(let i=1;i<n-1;i++){
    if(y[i]>=y[i-1]&&y[i]>y[i+1]) ex.push({i,y:y[i],k:1});
    else if(y[i]<=y[i-1]&&y[i]<y[i+1]) ex.push({i,y:y[i],k:-1});
  }
  ex.push({i:n-1,y:y[n-1],k:y[n-1]>=y[n-2]?1:-1});
  for(;;){
    let bi=-1,bv=1e9;
    for(let i=1;i<ex.length-2;i++){
      const v=Math.abs(ex[i].y-ex[i+1].y);
      if(v<bv){ bv=v; bi=i; }
    }
    if(bi<0||bv>=1.5) break;
    ex.splice(bi,2);
  }
  let count=0, sumA=0, sumW=0;
  const amps=[];
  for(let i=1;i<ex.length-1;i++){
    if(ex[i].k!==1) continue;
    const amp=Math.min(ex[i].y-ex[i-1].y,ex[i].y-ex[i+1].y);
    const wl=(ex[i+1].i-ex[i-1].i)*EDS;
    if(amp>=1.2&&wl>=120){ count++; amps.push([Math.round(amp*20)/10,Math.round(wl)]); sumA+=amp*2; sumW+=wl; }
  }
  return {count,amps,meanAmpM:count?sumA/count:0,meanWavelengthM:count?sumW/count:0};
})();

// ---------- the spine walk ----------
const spine={x:new Float32Array(NS),y:new Float32Array(NS),z:new Float32Array(NS),hd:new Float32Array(NS)};
{
  let x=0,z=0,hd=ROUTE.r(0,TAU);
  for(let i=0;i<NS;i++){
    const s=i*SDS;
    spine.x[i]=x; spine.z[i]=z; spine.y[i]=spineY(s); spine.hd[i]=hd;
    const k=curvatureAt(s+SDS*0.5);
    hd+=k*SDS;
    x+=Math.sin(hd)*SDS; z+=Math.cos(hd)*SDS;
    if((i%64)===0) H.route.feed(x,z,spine.y[i]);
  }
}
function spineAt(s){
  const i=clamp(s/SDS,0,NS-1), i0=Math.floor(i), t=i-i0, i1=Math.min(i0+1,NS-1);
  return { x:lerp(spine.x[i0],spine.x[i1],t), y:lerp(spine.y[i0],spine.y[i1],t),
           z:lerp(spine.z[i0],spine.z[i1],t), hd:lerp(spine.hd[i0],spine.hd[i1],t) };
}

// ============================================================
// PLAN — THE MOSSWATER CHOICE
// Two arms that disagree about everything: height, radius, sightline,
// ground, and what they show you at the end.
// ============================================================
H.route.feed(FORK_SIDE,S_SPLIT,ARM_LEN,SUN_LIFT,MOSS_DROP,SUN_OUT,MOSS_OUT);

function armPoints(kind){
  const pts=[]; const n=26;
  const side=(kind==='sun'?FORK_SIDE:-FORK_SIDE);
  const out=(kind==='sun'?SUN_OUT:MOSS_OUT);
  const lift=(kind==='sun'?SUN_LIFT:-MOSS_DROP);
  const wobN=(kind==='sun'?1.0:2.0);                 // Mosswater turns more often
  const wobA=(kind==='sun'?SUN_WOB:MOSS_WOB);
  const wobP=(kind==='sun'?SUN_PH:MOSS_PH);
  const s0=S_SPLIT-70, s1=S_MERGE_SPINE+70;
  for(let i=0;i<=n;i++){
    const t=i/n, s=lerp(s0,s1,t);
    const sp=spineAt(s);
    const lx=Math.cos(sp.hd), lz=-Math.sin(sp.hd);
    const u=clamp((s-S_SPLIT)/(S_MERGE_SPINE-S_SPLIT),0,1);
    // sideways first, so the lanes are genuinely apart before either changes
    // height; otherwise the split reads as a step in the ground, not a fork
    // the lanes part quickly enough to be seen as two roads from a hundred
    // metres back, then keep parting slowly, then come together gently
    // The onset used to begin seven metres past the split, which put a corner in
    // the arm sharp enough to fail the route's own continuity check on some
    // seeds. It now eases in over the first forty metres — still parted far
    // enough to be read as two roads from a hundred metres back, but no longer
    // a hinge.
    const latP=(0.44*smooth(0.030,0.200,u)+0.56*smooth(0.16,0.44,u))*(1-smooth(0.63,0.97,u));
    const bell=Math.sin(Math.PI*clamp((u-0.02)/0.96,0,1));
    const wob=Math.sin(u*TAU*wobN+wobP)*wobA*bell;
    const off=side*(out*latP)+wob;
    const vertP=smooth(0.17,0.52,u)*(1-smooth(0.57,0.82,u));
    const vert=lift*vertP;
    pts.push(new THREE.Vector3(sp.x+lx*off, sp.y+vert, sp.z+lz*off));
  }
  return pts;
}
const armCurve={ sun:new THREE.CatmullRomCurve3(armPoints('sun'),false,'centripetal',0.5), moss:null };
armCurve.moss=new THREE.CatmullRomCurve3(armPoints('moss'),false,'centripetal',0.5);
H.route.feed(MOSS_OUT,MOSS_WOB);

// ---------- frame tables: 2 m arc-length samples for each committed line ----------
function buildFrames(arm){
  const pts=[];
  for(let s=0;s<S_SPLIT-70;s+=SDS){ const p=spineAt(s); pts.push(new THREE.Vector3(p.x,p.y,p.z)); }
  const c=armCurve[arm], armL=c.getLength(), div=Math.max(8,Math.ceil(armL/SDS));
  for(let i=0;i<=div;i++) pts.push(c.getPoint(i/div));
  for(let s=S_MERGE_SPINE+70+SDS;s<=L_TOTAL+TAIL;s+=SDS){ const p=spineAt(s); pts.push(new THREE.Vector3(p.x,p.y,p.z)); }
  const RS=2;
  const X=[],Y=[],Z=[];
  let prev=pts[0], acc=0, target=0;
  X.push(prev.x); Y.push(prev.y); Z.push(prev.z);
  for(let i=1;i<pts.length;i++){
    const p=pts[i], d=Math.hypot(p.x-prev.x,p.z-prev.z);
    if(d<1e-7) continue;
    while(target+RS<=acc+d){ target+=RS; const t=(target-acc)/d;
      X.push(lerp(prev.x,p.x,t)); Y.push(lerp(prev.y,p.y,t)); Z.push(lerp(prev.z,p.z,t)); }
    acc+=d; prev=p;
  }
  const F={x:Float32Array.from(X),y:Float32Array.from(Y),z:Float32Array.from(Z),RS};
  F.N=F.x.length-1; F.len=F.N*RS;
  // ease the joins, then give the vertical the same easing the plan had
  const tmp=new Float32Array(F.N+1);
  const blur=(arr,passes)=>{ for(let p=0;p<passes;p++){
    tmp[0]=arr[0]; tmp[F.N]=arr[F.N];
    for(let i=1;i<F.N;i++) tmp[i]=(arr[i-1]+arr[i]*2+arr[i+1])*0.25;
    arr.set(tmp); } };
  // Seven passes rather than three. At two-metre spacing this is a three-metre
  // smoothing radius against a route whose curvature is measured in hundreds of
  // metres — the shape is untouched — but it takes the tightest corner in the
  // seed space under the continuity threshold instead of leaving it to chance.
  blur(F.x,7); blur(F.z,7); blur(F.y,60);
  F.tx=new Float32Array(F.N+1); F.tz=new Float32Array(F.N+1);
  F.lx=new Float32Array(F.N+1); F.lz=new Float32Array(F.N+1); F.k=new Float32Array(F.N+1);
  for(let i=0;i<=F.N;i++){
    const i0=Math.max(0,i-1), i1=Math.min(F.N,i+1);
    let tx=F.x[i1]-F.x[i0], tz=F.z[i1]-F.z[i0];
    const L=Math.hypot(tx,tz)||1; tx/=L; tz/=L;
    F.tx[i]=tx; F.tz[i]=tz; F.lx[i]=tz; F.lz[i]=-tx;
  }
  for(let i=1;i<F.N;i++){
    const cr=F.tx[i-1]*F.tz[i+1]-F.tz[i-1]*F.tx[i+1];
    F.k[i]=cr/(2*RS);
  }
  return F;
}
const FRAMES={ sun:buildFrames('sun'), moss:buildFrames('moss') };
const splitP=spineAt(S_SPLIT), mergeP=spineAt(S_MERGE_SPINE);
// the realised arms obey the same grade contract as the plan did
for(const arm of ['sun','moss']){
  const F=FRAMES[arm];
  const i0=Math.max(1,Math.floor(nearestS(F,splitP.x,splitP.z)/F.RS)-30);
  const i1=Math.min(F.N-1,Math.ceil(nearestS(F,mergeP.x,mergeP.z)/F.RS)+30);
  const m=0.062*F.RS;
  const tw=new Float32Array(F.N+1);
  for(let pass=0;pass<3;pass++){
    for(let i=i0;i<=i1;i++){ const d=F.y[i]-F.y[i-1];
      if(d>m) F.y[i]=F.y[i-1]+m; else if(d<-m) F.y[i]=F.y[i-1]-m; }
    for(let i=i1;i>=i0;i--){ const d=F.y[i]-F.y[i+1];
      if(d>m) F.y[i]=F.y[i+1]+m; else if(d<-m) F.y[i]=F.y[i+1]-m; }
    for(let q=0;q<10;q++){
      tw.set(F.y);
      for(let i=i0;i<=i1;i++) F.y[i]=(tw[i-1]+tw[i]*2+tw[i+1])*0.25;
    }
  }
}
// outside the fork the two arms are the same road, so make them literally the
// same road: any drift from independent smoothing is snapped away
{
  const S=FRAMES.sun, M=FRAMES.moss;
  const sSplitM=nearestS(M,splitP.x,splitP.z), sMergeM=nearestS(M,mergeP.x,mergeP.z);
  const sunAtXZ=(x,z)=>{ let bi=0,bd=1e18;
    for(let i=0;i<=S.N;i++){ const dx=S.x[i]-x,dz=S.z[i]-z,d=dx*dx+dz*dz; if(d<bd){bd=d;bi=i;} }
    return bi; };
  for(let i=0;i<=M.N;i++){
    const sLoc=i*M.RS;
    const inside=smooth(sSplitM-12,sSplitM+26,sLoc)*(1-smooth(sMergeM-26,sMergeM+12,sLoc));
    const w=1-inside;
    if(w<=0.001) continue;
    const j=sunAtXZ(M.x[i],M.z[i]);
    M.x[i]=lerp(M.x[i],S.x[j],w); M.y[i]=lerp(M.y[i],S.y[j],w); M.z[i]=lerp(M.z[i],S.z[j],w);
  }
  for(let i=0;i<=M.N;i++){
    const i0=Math.max(0,i-1), i1=Math.min(M.N,i+1);
    let tx=M.x[i1]-M.x[i0], tz=M.z[i1]-M.z[i0];
    const L=Math.hypot(tx,tz)||1; tx/=L; tz/=L;
    M.tx[i]=tx; M.tz[i]=tz; M.lx[i]=tz; M.lz[i]=-tx;
  }
}
function getFrame(F,s){
  s=clamp(s,0,F.len-0.001);
  const i=s/F.RS, i0=Math.floor(i), t=i-i0, i1=Math.min(i0+1,F.N);
  return { x:lerp(F.x[i0],F.x[i1],t), y:lerp(F.y[i0],F.y[i1],t), z:lerp(F.z[i0],F.z[i1],t),
    tx:lerp(F.tx[i0],F.tx[i1],t), tz:lerp(F.tz[i0],F.tz[i1],t),
    lx:lerp(F.lx[i0],F.lx[i1],t), lz:lerp(F.lz[i0],F.lz[i1],t), k:lerp(F.k[i0],F.k[i1],t) };
}
function nearestS(F,px,pz,lo,hi){
  let best=lo||0,bd=1e18;
  const i0=Math.max(0,Math.floor((lo||0)/F.RS)), i1=Math.min(F.N,Math.ceil((hi===undefined?F.len:hi)/F.RS));
  for(let i=i0;i<=i1;i++){ const dx=F.x[i]-px, dz=F.z[i]-pz, d=dx*dx+dz*dz; if(d<bd){bd=d;best=i;} }
  return best*F.RS;
}
// the arms have honest, slightly different lengths; global route distance is
// shared so every chapter and every scheduled event fires at the same place
const S_COMMIT={ sun:nearestS(FRAMES.sun,splitP.x,splitP.z), moss:nearestS(FRAMES.moss,splitP.x,splitP.z) };
const S_MERGE={ sun:nearestS(FRAMES.sun,mergeP.x,mergeP.z), moss:nearestS(FRAMES.moss,mergeP.x,mergeP.z) };
const ARM_TRUE={ sun:S_MERGE.sun-S_COMMIT.sun, moss:S_MERGE.moss-S_COMMIT.moss };
function toGlobal(arm,s){
  if(s<=S_COMMIT[arm]) return s;
  const d=S_MERGE.sun-S_MERGE[arm];
  if(s>=S_MERGE[arm]) return s+d;
  const t=(s-S_COMMIT[arm])/Math.max(1,ARM_TRUE[arm]);
  return s+d*t*t*(3-2*t);
}
function toLocal(arm,g){
  if(g<=S_COMMIT[arm]) return g;
  let lo=S_COMMIT[arm], hi=FRAMES[arm].len;
  for(let i=0;i<28;i++){ const m=(lo+hi)*0.5; if(toGlobal(arm,m)<g) lo=m; else hi=m; }
  return (lo+hi)*0.5;
}
const S_MERGE_G=S_MERGE.sun;              // the merge, in global route distance
const S_END=toGlobal('sun',FRAMES.sun.len);
const S_STOP=L_TOTAL;                                 // the rest; the road keeps going
H.route.feed(FRAMES.sun.len,FRAMES.moss.len,S_COMMIT.sun,S_COMMIT.moss,S_MERGE.sun,S_MERGE.moss);

const ROAD_W=ROUTE.r(4.62,4.94), RH=ROAD_W/2, SHOULDER=3.0, EXCL=RH+SHOULDER;
// Conformal corridor half-width. The coarse ground field beyond it is fifteen
// metres to a cell, which reads as faceted pyramids on a near hillside; pushing
// the fine mesh out to sixty-six metres moves that coarseness far enough away
// that its facets are a few pixels instead of a landform.
const APRON=66;
// Where the coarse field is allowed to begin. It must be the corridor's own
// reach: any smaller number and the two surfaces draw the same ground and
// disagree about its height, any larger and neither draws it.
const FIELD_HOLD=APRON-3;
H.route.feed(ROAD_W);
