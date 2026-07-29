// ============================================================
// SOUND — synthesised weather of the place, started by a gesture,
// silent and harmless where there is no audio output at all.
// ============================================================
const audio={ctx:null,L:null,lastChirp:0,nextChirp:SOUND_PLAN.chirpGap[0],
  lastCreak:0,nextCreak:SOUND_PLAN.creakGap[0],podsArmed:true};
function audioStart(){
  if(audio.ctx) return;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return;
    const ctx=new AC(); audio.ctx=ctx;
    if(ctx.state==='suspended'&&ctx.resume) ctx.resume().catch(()=>{});
    const master=ctx.createGain(); master.gain.value=0.5; master.connect(ctx.destination);
    const nb=ctx.createBuffer(1,Math.max(1,Math.floor(ctx.sampleRate*2)),ctx.sampleRate);
    const ch=nb.getChannelData(0);
    let sn=SEED_HASH>>>1;
    for(let i=0;i<ch.length;i++){ sn=(sn*1103515245+12345)>>>0; ch[i]=(sn/2147483648-1)*0.5; }
    const mk=(type,freq,q,g0)=>{
      const src=ctx.createBufferSource(); src.buffer=nb; src.loop=true;
      const f=ctx.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=q;
      const g=ctx.createGain(); g.gain.value=g0;
      src.connect(f); f.connect(g); g.connect(master); src.start();
      return {f,g};
    };
    audio.L={ wind:mk('lowpass',360,0.6,0.08), leaves:mk('bandpass',1650,1.0,0),
      tyre:mk('lowpass',880,0.8,0), water:mk('bandpass',2400,2.4,0), rain:mk('bandpass',3400,0.9,0), master };
  }catch(e){ capturedErrors.push('audio: '+(e&&e.message)); }
}
function tone(freqs,gain,dec){
  const ctx=audio.ctx; if(!ctx||!audio.L) return;
  try{
    const t0=ctx.currentTime+0.02;
    for(const [f,g2,d] of freqs){
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.type='sine'; o.frequency.value=f;
      g.gain.setValueAtTime(0,t0);
      g.gain.linearRampToValueAtTime(gain*g2,t0+0.014);
      g.gain.exponentialRampToValueAtTime(0.0004,t0+d*dec);
      o.connect(g); g.connect(audio.L.master);
      o.start(t0); o.stop(t0+d*dec+0.08);
    }
  }catch(e){}
}
function chirp(st){
  const ctx=audio.ctx; if(!ctx||!audio.L) return;
  try{
    const t0=ctx.currentTime+0.02, n=st.i(2,4);
    for(let i=0;i<n;i++){
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.type='sine';
      const f0=st.r(2400,3700);
      o.frequency.setValueAtTime(f0,t0+i*0.13);
      o.frequency.exponentialRampToValueAtTime(f0*st.r(1.1,1.5),t0+i*0.13+0.07);
      g.gain.setValueAtTime(0,t0+i*0.13);
      g.gain.linearRampToValueAtTime(0.026,t0+i*0.13+0.02);
      g.gain.exponentialRampToValueAtTime(0.0007,t0+i*0.13+0.12);
      o.connect(g); g.connect(audio.L.master);
      o.start(t0+i*0.13); o.stop(t0+i*0.13+0.14);
    }
  }catch(e){}
}
let sndTick=0;
function audioUpdate(dt,wT,r){
  const A=audio; if(!A.ctx||!A.L) return;
  try{
    const now=A.ctx.currentTime;
    const gust=0.72+0.28*Math.sin(wT/SOUND_PLAN.gustPeriod*TAU)+0.10*Math.sin(wT*0.61);
    A.L.wind.g.gain.setTargetAtTime(0.072*gust,now,0.4);
    const enc=enclosureAt(r.g,r.branch);
    A.L.leaves.g.gain.setTargetAtTime(0.05*enc*gust,now,0.6);
    const spd=(r.paused||r.ended)?0:r.v;
    A.L.tyre.g.gain.setTargetAtTime(clamp(spd/18,0,1)*0.048,now,0.25);
    A.L.tyre.f.frequency.setTargetAtTime(540+spd*55,now,0.3);
    const fr=getFrame(FRAMES[r.branch],r.sM);
    let wd=streamInfo(fr.x,fr.z).d;
    for(const P of PONDS) wd=Math.min(wd,Math.hypot(fr.x-P.cx,fr.z-P.cz)-P.rx);
    A.L.water.g.gain.setTargetAtTime(0.072*clamp(1-wd/28,0,1),now,0.5);
    A.L.rain.g.gain.setTargetAtTime(0.085*weatherState.amount,now,0.7);
    const st=subStream('snd',Math.floor(wT/3));
    if(wT-A.lastChirp>A.nextChirp){ A.lastChirp=wT;
      A.nextChirp=lerp(SOUND_PLAN.chirpGap[0],SOUND_PLAN.chirpGap[1],st.f());
      if(st.chance(0.82)) chirp(st); }
    if(wT-A.lastCreak>A.nextCreak){ A.lastCreak=wT;
      A.nextCreak=lerp(SOUND_PLAN.creakGap[0],SOUND_PLAN.creakGap[1],st.f());
      tone([[92,1,1],[137,0.4,0.7]],0.017,0.8); }
    const hd=Math.abs(r.g-HERO_G);
    if(hd<110&&A.podsArmed){ A.podsArmed=false;
      tone([[318,1,1],[476,0.5,0.8],[712,0.22,0.6]],0.016,3.2); }
    if(hd>170) A.podsArmed=true;
  }catch(e){}
}
window.addEventListener('pointerdown',audioStart,{passive:true});
window.addEventListener('keydown',audioStart);

// ============================================================
// RIDER, CONTROLS, CAMERA
// ============================================================
const DEF_BRANCH=FORKS.chance(0.5)?'sun':'moss';
const rider={ sM:0, g:0, v:0, vT:CRUISE, lat:0.9, latT:0.9, branch:DEF_BRANCH, committed:false, forceBranch:null,
  started:false, holdT:0, paused:false, ended:false, simT:0 };
const checkpoints={};
for(const c of CH) checkpoints[c.key]=false;
checkpoints.gate=true;
// Everything the current run can claim lives in RUN and is wiped by restart.
// Anything that accumulates across the page's life is labelled separately.
// How this run's distance was actually covered. It only ever escalates, and it
// is reset by restart along with everything else. `continuous` and `accelerated`
// both mean every metre was travelled and every frame rendered — accelerated
// only fixes the timestep. `warped` and `debug` mean the rider was moved by
// something other than riding, and may never stand as continuous-ride evidence.
const PROV_RANK={continuous:0,accelerated:1,warped:2,debug:3};
// Above this the simulation is stepping further than a rider could travel
// between rendered frames, so the run is no longer a record of the ride.
const FIXED_STEP_MAX=0.5;
function markProvenance(kind){
  if(PROV_RANK[kind]>PROV_RANK[RUN.provenance]) RUN.provenance=kind;
}
function freshRun(){
  return { distanceRiddenM:0, ascentRiddenM:0, descentRiddenM:0,
    maxRollDeg:0, peakDrawCalls:0, peakTriangles:0, peakResidentBands:0,
    maxStepM:0, stepOverruns:0,
    bandsRealized:0, bandsDisposed:0, lifeFired:0, ambientProvenWhilePaused:false, pauseExercised:false,
    proximity:{ fork:false, water:false, bellroot:false, sisters:false },
    seen:{ forkBothArmsBeforeCommit:false, forkFirstSeenAtM:null, forkLeadBeforeCommitM:null,
           forkScreenSepMax:0, forkLegibleLastAtM:null, forkLegibleSpanM:0, forkLegibleSeconds:0,
           water:false, waterFirstSeenAtM:null, waterFramesSeen:0,
           bellroot:false, bellrootFirstSeenAtM:null,
           sisters:false, sistersFirstSeenAtM:null, sistersLastSeenAtM:null,
           sistersSeenSpanM:0 },
    marks:{ forkCommitted:false, branchMid:false, rejoined:false, bellrootPassed:false, rested:false },
    branchRidden:null, errors:0, provenance:'continuous' };
}
let RUN=freshRun();
const LIFETIME={ restarts:0, bandsRealized:0, bandsDisposed:0, peakResidentBands:0, runs:1 };
let camRollDeg=0, pauseProbe=null;
const keys={};
window.addEventListener('keydown',(e)=>{
  if(e.code==='Space'){ e.preventDefault(); if(!e.repeat) rider.paused=!rider.paused; return; }
  if(e.code==='KeyR'&&!e.repeat){ restartRide(); return; }
  keys[e.code]=true;
});
window.addEventListener('keyup',(e)=>{ keys[e.code]=false; });
let dragging=false, yawOff=0, pitchOff=0;
window.addEventListener('mousedown',()=>{ dragging=true; });
window.addEventListener('mouseup',()=>{ dragging=false; });
window.addEventListener('mousemove',(e)=>{
  if(!dragging) return;
  yawOff=clamp(yawOff-(e.movementX||0)*0.0024,-1.1,1.1);
  pitchOff=clamp(pitchOff-(e.movementY||0)*0.0019,-0.42,0.36);
});
function restartRide(){
  rider.sM=0; rider.g=0; rider.v=0; rider.vT=CRUISE; rider.lat=0.9; rider.latT=0.9;
  rider.branch=DEF_BRANCH; rider.committed=false; rider.forceBranch=null; rider.started=false; rider.holdT=0;
  rider.paused=false; rider.ended=false; rider.simT=0;
  yawOff=0; pitchOff=0; pitchSm=null; camInit=false;
  for(const k of Object.keys(checkpoints)) checkpoints[k]=(k==='gate');
  for(const e of LIFE_EVENTS) e.fired=false;
  clearAllLife();
  lifeFired=0;
  // Everything the previous ride accumulated is torn down BEFORE the new run's
  // counters exist, so nothing from it can be counted against the new one. The
  // elevation tracker is the one that bit: left holding the last frame's height,
  // the first step of a restarted ride booked the whole route as descent.
  disposeAllBands();
  eyePrevY=null; gPrevFrame=null; pauseProbe=null; camRollDeg=0;
  RUN=freshRun();
  // A fixed timestep that is still in force after a restart still applies to the
  // new ride, so the new ride is still accelerated. Restarting must not be a way
  // to relabel it. An oversized step is worse than accelerated: it skips frames
  // the ride is supposed to be made of, so it is debug.
  if(fixedStep>0) markProvenance(fixedStep>FIXED_STEP_MAX?'debug':'accelerated');
  frameTimes.length=0; warmFrames=0;
  // The rung this machine settled on is a fact about the machine and survives a
  // restart; the log of how it got there belongs to the run that did it, and a
  // new run must not inherit another run's evidence.
  DPR_GOV.steps.length=0; DPR_GOV.hot=0; DPR_GOV.cool=0;
  for(const k of Object.keys(CHAP_FT)) delete CHAP_FT[k];
  LIFETIME.restarts++; LIFETIME.runs++;
  weatherState.phase='clear'; weatherState.t=0; weatherState.amount=0;
  WL.uWet.value=0; rainMat.uniforms.uAmt.value=0; rainMat.userData.pts.visible=false;
  audio.podsArmed=true;
  warmResidency(0);
}
function warmResidency(g){
  let guard=0;
  while(updateResidency(g,3)>0&&guard++<80){}
}

// ============================================================
// VALIDATION — measured against the realised world
// ============================================================
const VAL={};
{
  let maxKink=0,maxStep=0;
  for(const F of [FRAMES.sun,FRAMES.moss]) for(let i=1;i<F.N;i++){
    maxKink=Math.max(maxKink,Math.acos(clamp(F.tx[i]*F.tx[i-1]+F.tz[i]*F.tz[i-1],-1,1)));
    maxStep=Math.max(maxStep,Math.abs(F.y[i]-F.y[i-1]));
  }
  VAL.maxKinkRad=maxKink; VAL.maxStepM=maxStep;
  VAL.roadContinuity=(maxKink<0.055&&maxStep<0.30);

  // ---- the road, measured on the triangles the renderer actually draws ----
  // Three distinct things, kept distinct:
  //   surface   the rideable stone
  //   support   the shoulder immediately beside it, which must carry the edge
  //   landform  the bank, ditch or cut beyond, which is free to rise or fall
  let surfaceGapMax=0, supportGapMax=0, vergeDropMax=0, tilePokeCount=0, tilePokeMax=0,
      analyticDevMax=0, camBelow=0, samples=0, unsupported=0;
  const scanArm=(arm,s0,s1)=>{
    const F=FRAMES[arm];
    for(let s=s0;s<s1;s+=4){
      const fr=getFrame(F,s);
      for(const sd of [-1,1]){
        // the stone's own edge, read off the corridor mesh
        const uEdge=sd*RH;
        const yEdge=realizedCorridorY(arm,s,uEdge);
        if(yEdge===null) continue;
        samples++;
        // the support: ground immediately beside the stone, 0.22 m outboard.
        // Further out the verge is free to fall away — that is the design.
        const ySup=realizedCorridorY(arm,s,sd*(RH+0.22));
        const atCrossing=Math.abs(toGlobal(arm,s)-BECK_XG)<34;   // the bridge abutment is masonry
        if(ySup!==null&&!atCrossing){
          const gap=yEdge-ySup;
          if(gap>supportGapMax){ supportGapMax=gap;
            VAL.worstSupport={arm,s:Math.round(s),g:Math.round(toGlobal(arm,s)),side:sd,
              gapM:Math.round(gap*1000)/1000}; }
          if(gap>0.08) unsupported++;
        }
        const yVerge=realizedCorridorY(arm,s,sd*(RH+4.4));
        if(yVerge!==null) vergeDropMax=Math.max(vergeDropMax,yEdge-yVerge);
        // nothing from the coarse ground field may stand through the stone
        const ex=fr.x+fr.lx*uEdge, ez=fr.z+fr.lz*uEdge;
        const tY=realizedTileY(ex,ez);
        if(tY!==null&&tY>yEdge-0.02){ tilePokeCount++; tilePokeMax=Math.max(tilePokeMax,tY-yEdge); }
        // the analytic ground the props stand on must agree with the drawn mesh
        const yAnalytic=groundY(fr.x+fr.lx*sd*(RH+4.4),fr.z+fr.lz*sd*(RH+4.4));
        if(yVerge!==null){
          const dev=Math.abs(yAnalytic-yVerge);
          if(dev>analyticDevMax){ analyticDevMax=dev;
            VAL.analyticWorst={arm,s:Math.round(s),g:Math.round(toGlobal(arm,s)),side:sd,
              analytic:Math.round(yAnalytic*100)/100,mesh:Math.round(yVerge*100)/100}; }
        }
      }
      // the road surface itself against the ground function it was built from
      // measured against the surface the plan asked for, including the designed
      // lift on the Mosswater lane — otherwise the design reads as an error
      const yMid=realizedCorridorY(arm,s,0);
      if(yMid!==null) surfaceGapMax=Math.max(surfaceGapMax,
        Math.abs(yMid-(fr.y+CROWN+designedLift(arm,s))));
      if(fr.y+EYE_H<groundY(fr.x,fr.z)) camBelow++;
    }
  };
  scanArm('sun',2,FRAMES.sun.len-2);
  scanArm('moss',Math.max(2,S_COMMIT.moss-30),Math.min(FRAMES.moss.len-2,S_MERGE.moss+30));
  VAL.samples=samples;
  VAL.roadSurfaceGapM=surfaceGapMax;          // mesh vs the plan it was built from
  VAL.roadSupportGapM=supportGapMax;          // stone edge above the ground 0.22 m outboard
  VAL.vergeDropM=vergeDropMax;                // the designed fall to the verge, 4.4 m out
  VAL.roadUnsupportedSamples=unsupported;
  VAL.tilePokeThroughCount=tilePokeCount;
  VAL.tilePokeThroughMaxM=tilePokeMax;
  // The largest divergence between the drawn triangulated corridor and the
  // continuous ground function everything else stands on. It is not an error
  // budget: it peaks where the two lanes' shoulders cross at the fork, which is
  // a crease no triangulation samples exactly. Reported with its location so it
  // can be judged rather than trusted.
  VAL.analyticVsRealizedMaxM=analyticDevMax;
  VAL.cameraBelowTerrain=camBelow;
  // Derived, not asserted: probe a station known to be culled on one arm and
  // confirm the reader refuses it, and confirm the reader disagrees with a
  // bilinear average somewhere (i.e. it really is sampling triangle planes).
  VAL.emittedTrianglesOnly=(()=>{
    let refused=0, probed=0;
    for(let s=2;s<FRAMES.moss.len-2;s+=7){
      probed++;
      if(realizedCorridorY('moss',s,APRON-0.5)===null) refused++;
    }
    VAL.emitProbe={probed,refusedOutsideOwnership:refused};
    return refused>0;
  })();
  VAL.roadNeverFloats=(supportGapMax<=0.08);
  VAL.roadNeverUnderTerrain=(tilePokeCount===0);

  // every planned solid object against the exclusion corridor
  let excl=0, minTreeD=1e9;
  for(const t of TREES){ minTreeD=Math.min(minTreeD,t.d); if(t.d<EXCL) excl++; }
  for(const P of PONDS){
    const fr=getFrame(FRAMES[P.name==='mosswater'?'moss':'sun'],
      clamp(toLocal(P.name==='mosswater'?'moss':'sun',P.g),0,FRAMES.sun.len-1));
    if(Math.hypot(P.cx-fr.x,P.cz-fr.z)<EXCL+P.rx) excl++;
  }
  if(routeInfo(HERO_POS.x,HERO_POS.z).d<EXCL) excl++;
  VAL.exclusionViolations=excl; VAL.minTreeCorridorM=minTreeD;
  // the beck is allowed under the road, but only where a crossing was planned
  {
    let runs=0, inRun=false, unplanned=0;
    for(const p of STREAM){
      const near=routeInfo(p.x,p.z).d<RH+1.5;
      if(near&&!inRun){
        runs++;
        if(Math.abs((p.g||0)-BECK_XG)>40) unplanned++;
      }
      inRun=near;
    }
    VAL.beckCrossings=runs; VAL.beckUnplannedCrossings=unplanned;
  }

  // fork: how far the arms actually get from each other, and how they come back
  let sep=0;
  for(let t=0.05;t<0.95;t+=0.02){
    const a=armCurve.sun.getPointAt(t), b=armCurve.moss.getPointAt(t);
    sep=Math.max(sep,a.distanceTo(b));
  }
  VAL.forkMaxSeparationM=sep;
  const eA=getFrame(FRAMES.sun,S_MERGE.sun), eB=getFrame(FRAMES.moss,S_MERGE.moss);
  VAL.rejoinErrorM=Math.hypot(eA.x-eB.x,eA.z-eB.z);
  VAL.armDurationSunS=ARM_TRUE.sun/CRUISE; VAL.armDurationMossS=ARM_TRUE.moss/CRUISE;
  VAL.armDurationDeltaPct=Math.abs(ARM_TRUE.sun-ARM_TRUE.moss)/Math.max(1,ARM_TRUE.sun)*100;
  let elevDelta=0;
  for(let t=0.15;t<0.85;t+=0.02)
    elevDelta=Math.max(elevDelta,Math.abs(armCurve.sun.getPointAt(t).y-armCurve.moss.getPointAt(t).y));
  VAL.forkElevationSplitM=elevDelta;
  VAL.branchDivergence=(sep>34&&elevDelta>12&&VAL.rejoinErrorM<3.5);

  // crests that genuinely hide the road and then give it back:
  // walk the sightline envelope forward and look for road that falls below it
  let hidden=0;
  for(const c of CRESTS){
    const s0=toLocal('sun',Math.max(0,c.g-120));
    const eye=getFrame(FRAMES.sun,s0).y+EYE_H;
    let maxSlope=-1e9, hiddenM=0;
    for(let d=25;d<300;d+=5){
      const f=getFrame(FRAMES.sun,clamp(s0+d,0,FRAMES.sun.len-1));
      const sl=(f.y-eye)/d;
      if(sl>=maxSlope-1e-6) maxSlope=sl;
      else if((maxSlope-sl)*d>1.1) hiddenM+=5;
    }
    if(hiddenM>=45) hidden++;
  }
  VAL.crestOcclusions=hidden;

  // the Wind Sisters: where along the route can they actually be seen? The
  // callback is real if two of those places are a long way apart on the road.
  const seeFrom=(g)=>{
    const fr=getFrame(FRAMES.sun,toLocal('sun',clamp(g,0,L_TOTAL)));
    const ex=fr.x, ez=fr.z, ey=fr.y+EYE_H;
    const tx=SISTERS.x, tz=SISTERS.z, ty=SISTERS.y+14;
    const D=Math.hypot(tx-ex,tz-ez);
    if(D>1520||D<120) return false;
    for(let t=0.06;t<0.94;t+=0.035){
      const px=lerp(ex,tx,t), pz=lerp(ez,tz,t), py=lerp(ey,ty,t);
      if(groundY(px,pz)>py+1.0) return false;
    }
    return true;
  };
  const visStations=[];
  for(let g=40;g<L_TOTAL;g+=60) if(seeFrom(g)) visStations.push(Math.round(g));
  VAL.sistersVisibleStations=visStations.length;
  VAL.sistersViewSpanM=visStations.length>1?(visStations[visStations.length-1]-visStations[0]):0;
  VAL.sistersFirstSeenAtM=visStations.length?visStations[0]:null;
  VAL.sistersLastSeenAtM=visStations.length?visStations[visStations.length-1]:null;
  VAL.sistersVisibleFromSunbank=seeFrom(SISTERS.gA);
  VAL.sistersVisibleFromGlasswater=seeFrom(SISTERS.gB);
  // the same piece of country, recognised again after a kilometre of riding
  VAL.spatialCallback=VAL.sistersViewSpanM>=1200&&visStations.length>=6;

  // the rest, and the road that keeps going past it
  const stopFr=getFrame(FRAMES.sun,toLocal('sun',S_STOP));
  VAL.restEdgeDropM=Math.max(
    Math.abs(stopFr.y-groundY(stopFr.x+RH*1.4*stopFr.lx,stopFr.z+RH*1.4*stopFr.lz)),
    Math.abs(stopFr.y-groundY(stopFr.x-RH*1.4*stopFr.lx,stopFr.z-RH*1.4*stopFr.lz)));
  { let clear=true;
    for(const t of TREES) if(Math.hypot(t.x-stopFr.x,t.z-stopFr.z)<EXCL) clear=false;
    VAL.restSafe=clear&&VAL.restEdgeDropM<1.1; }
  VAL.roadBeyondStopM=FRAMES.sun.len-toLocal('sun',S_STOP);
  VAL.roadContrastRatio=ROAD_CONTRAST;

  // grades and totals, measured separately on each realised line
  VAL.arm={};
  for(const arm of ['sun','moss']){
    const F=FRAMES[arm];
    let maxG=0,asc=0,desc=0,within=0,n=0;
    for(let i=1;i<=F.N;i++){
      const d=F.y[i]-F.y[i-1], g=Math.abs(d)/F.RS;
      maxG=Math.max(maxG,g); n++; if(g<=0.055) within++;
      if(d>0) asc+=d; else desc-=d;
    }
    VAL.arm[arm]={ ascentM:asc, descentM:desc, maxGradePct:maxG*100, within55Pct:within/n*100 };
  }
  VAL.maxGradePct=VAL.arm.sun.maxGradePct; VAL.ascentM=VAL.arm.sun.ascentM; VAL.descentM=VAL.arm.sun.descentM;
  VAL.gradeWithin55Pct=VAL.arm.sun.within55Pct;
  VAL.maxGradeMossPct=VAL.arm.moss.maxGradePct;
  VAL.maxGradeAnyPct=Math.max(VAL.arm.sun.maxGradePct,VAL.arm.moss.maxGradePct);
}

// ============================================================
// PROOF
// ============================================================
const PLANNED_ARTICULATED=TREES.filter(t=>t.d<=QCFG.nearD).length;
const frameTimes=[]; let warmFrames=0, frameId=0, lastInfo={calls:0,tris:0};
// frame time kept per chapter, because a single route-wide percentile hides the
// one compression chapter that actually costs something
const CHAP_FT={};
function noteFrame(ms,ch){
  let a=CHAP_FT[ch]; if(!a) a=CHAP_FT[ch]=[];
  a.push(ms); if(a.length>400) a.shift();
}
// A frame that took a quarter of a second did not take a quarter of a second to
// render: it is the harness stopping the world to save a PNG, or the tab being
// descheduled. Both percentiles are reported — the raw one, and one with those
// stalls removed — along with how many were removed, so neither can be quoted
// without the other.
const STALL_MS=220;
function pctl(arr){
  const a=arr.slice().sort((x,y)=>x-y);
  const qq=(t)=>a.length?a[clamp(Math.floor(t*(a.length-1)),0,a.length-1)]:0;
  return {n:a.length,p50:Math.round(qq(0.5)*10)/10,p95:Math.round(qq(0.95)*10)/10,
    p99:Math.round(qq(0.99)*10)/10,fps:Math.round(1000/Math.max(qq(0.5),0.01)*10)/10};
}
function chapterFrameStats(){
  const o={};
  for(const k of Object.keys(CHAP_FT)){
    const raw=CHAP_FT[k];
    if(raw.length<8) continue;
    const steady=raw.filter(v=>v<=STALL_MS);
    o[k]=Object.assign(pctl(steady),{stalls:raw.length-steady.length,rawP95:pctl(raw).p95});
  }
  return o;
}
// ---------- the resolution governor ----------
// It watches the same frame times the proof surface reports and walks the device
// pixel ratio down a fixed ladder when the world is missing frame budget, and
// back up when it has room to spare. Two rules keep it from being a flicker:
// a rung is only changed after the evidence has held for a run of frames, and
// never more often than once a second and a half. Every step is recorded, so a
// run that only met budget by dropping resolution cannot report a clean pass
// without also reporting how it got there.
const DPR_HOT_MS=18.5;     // over this the frame missed sixty, and not marginally
const DPR_COOL_MS=11.5;    // under this there is real headroom for more pixels
const DPR_HOT_TRIP=40, DPR_COOL_TRIP=240;
function governResolution(ms,now){
  if(!DPR_GOV.enabled||warmFrames<45) return;
  if(ms>STALL_MS) return;                       // a harness stall is not a slow GPU
  // Evidence LEAKS, it does not reset. Requiring a run of consecutive late
  // frames sounds stricter and is in fact unusable: every renderer produces the
  // occasional near-zero frame delta, and one of those zeroed the whole run. A
  // world sitting at thirty milliseconds with a fast frame every twenty would
  // have waited forever. Now a late frame is worth one unit and an early one
  // takes one back, so what trips the governor is a sustained majority of late
  // frames rather than an unbroken sequence of them.
  if(ms>DPR_HOT_MS){ DPR_GOV.hot++; DPR_GOV.cool=Math.max(0,DPR_GOV.cool-1); }
  else if(ms<DPR_COOL_MS){ DPR_GOV.cool++; DPR_GOV.hot=Math.max(0,DPR_GOV.hot-1); }
  else { DPR_GOV.hot=Math.max(0,DPR_GOV.hot-1); DPR_GOV.cool=Math.max(0,DPR_GOV.cool-1); }
  if(now-DPR_GOV.lastChangeAt<1500) return;
  let to=DPR_GOV.rung;
  if(DPR_GOV.hot>=DPR_HOT_TRIP&&DPR_GOV.rung<DPR_LADDER.length-1) to=DPR_GOV.rung+1;
  // climbing back costs six times the evidence of falling, so a world that is
  // only just fast enough settles rather than oscillating between two rungs
  else if(DPR_GOV.cool>=DPR_COOL_TRIP&&DPR_GOV.rung>0) to=DPR_GOV.rung-1;
  if(to===DPR_GOV.rung) return;
  DPR_GOV.rung=to; DPR_GOV.hot=0; DPR_GOV.cool=0; DPR_GOV.lastChangeAt=now;
  renderer.setPixelRatio(dprNow());
  renderer.setSize(window.innerWidth,window.innerHeight);
  DPR_GOV.steps.push({atM:Math.round(rider.g),dpr:dprNow(),
    chapter:chapterOf(rider.g),frameMs:Math.round(ms*10)/10});
  if(DPR_GOV.steps.length>40) DPR_GOV.steps.shift();
}
let realizationHash='';
function buildProof(){
  let glR='?',glV='?';
  try{ const gl=renderer.getContext(); const ext=gl.getExtension('WEBGL_debug_renderer_info');
    if(ext){ glR=gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); glV=gl.getParameter(ext.UNMASKED_VENDOR_WEBGL); } }catch(e){}
  const ft=frameTimes.slice(-300).sort((a,b)=>a-b);
  // The frame-time gate. It is only claimed on hardware: a software rasteriser
  // is measured honestly and then explicitly refused as evidence.
  const framePass=(()=>{
    const soft=/swiftshader|llvmpipe|software|basic render/i.test(glR+' '+glV);
    const st=pctl(frameTimes.filter(v=>v<=STALL_MS));
    const chapters=chapterFrameStats();
    let worstChapFps=Infinity, worstChap=null;
    for(const k of Object.keys(chapters)){
      if(chapters[k].fps<worstChapFps){ worstChapFps=chapters[k].fps; worstChap=k; }
    }
    if(soft) return {ok:false,note:'software renderer — not evidence of hardware performance',
      software:true,p95:st.p95,p99:st.p99,worstChapter:worstChap,worstChapterFps:worstChapFps===Infinity?null:worstChapFps};
    if(st.n<120) return {ok:false,note:'not enough steady frames sampled yet',software:false,samples:st.n};
    const ok=st.p95<=16.67&&st.p99<=25&&(worstChapFps===Infinity||worstChapFps>=55);
    const held=DPR_GOV.rung===0;
    return {ok,note:(ok?'p95<=16.67ms, p99<=25ms, no chapter under 55fps':'frame time over budget')+
        (held?'':' — REACHED AT REDUCED RESOLUTION: governor stepped to dpr '+dprNow()+
              ' (rung '+DPR_GOV.rung+' of '+(DPR_LADDER.length-1)+')'),
      software:false,p95:st.p95,p99:st.p99,worstChapter:worstChap,worstChapterFps:worstChapFps,
      dprHeld:held, dpr:dprNow(), dprRung:DPR_GOV.rung};
  })();
  const q=(p)=>ft.length?ft[Math.min(ft.length-1,Math.floor(ft.length*p))]:0;
  const avg=ft.length?ft.reduce((a,b)=>a+b,0)/ft.length:0;
  const F=FRAMES[rider.branch];
  const fr=getFrame(F,rider.sM), fa=getFrame(F,Math.min(rider.sM+10,F.len-1));
  // the ceiling is the worst frame this run has asked for, not the one that
  // happens to be on screen when the surface is read
  const budgets=Math.max(lastInfo.calls,RUN.peakDrawCalls)<=115&&
                Math.max(lastInfo.tris,RUN.peakTriangles)<=360000;
  return {
    version:'summerglass-hollow-2r',
    seed:SEED_TEXT, seedHash:SEED_HASH, quality:QUALITY,
    qualityReadsBeforePlanFrozen:QUALITY_READS_AT_PLAN,
    planHash:PLAN_HASH, planDigest64:PLAN_DIGEST64,
    hashNote:'deterministic repeatability checksums, not cryptographic proof',
    routeHash:H.route.hex(), elevationHash:H.elev.hex(), terrainHash:H.terrain.hex(),
    ecologyHash:H.eco.hex(), lifeHash:H.life.hex(), weatherHash:H.weather.hex(),
    realizationHash,
    currentChapter:chapterOf(rider.g),
    branch:rider.committed?(rider.branch==='sun'?'sunpath':'mosswater'):'undecided',
    route:{
      lengthM:Math.round(L_TOTAL), rideableM:Math.round(L_TOTAL),
      armLengthSunM:Math.round(ARM_TRUE.sun), armLengthMossM:Math.round(ARM_TRUE.moss),
      armDurationDeltaPct:Math.round(VAL.armDurationDeltaPct*10)/10,
      armDurationDeltaS:Math.round(Math.abs(VAL.armDurationSunS-VAL.armDurationMossS)*10)/10,
      distanceM:Math.round(rider.g*10)/10, progress01:Math.round(rider.g/L_TOTAL*1000)/1000,
      durationAtCruiseS:Math.round(L_TOTAL/CRUISE),
      roadWidthM:Math.round(ROAD_W*100)/100, shoulderM:SHOULDER, cruiseMps:CRUISE,
      totalAscentM:Math.round(VAL.ascentM*10)/10, totalDescentM:Math.round(VAL.descentM*10)/10,
      currentGradePct:Math.round((fa.y-fr.y)/10*1000)/10,
      maxGradePct:Math.round(VAL.maxGradePct*100)/100,
      gradeWithin55Pct:Math.round(VAL.gradeWithin55Pct*10)/10,
      maxGradeMossPct:Math.round(VAL.maxGradeMossPct*100)/100,
      rollerMeanAmpM:Math.round(ROLLER_STAT.meanAmpM*10)/10,
      rollerMeanWavelengthM:Math.round(ROLLER_STAT.meanWavelengthM),
      rollerCount:ROLLER_STAT.count, crestCount:CRESTS.length,
      forkSplitAtM:Math.round(S_SPLIT),
      forkCommitAtM:Math.round(toGlobal('sun',S_COMMIT.sun)),
      forkCommitLeadM:FORK_COMMIT_LEAD,
      rejoinAtM:Math.round(S_MERGE_G),
      forkMaxSeparationM:Math.round(VAL.forkMaxSeparationM*10)/10,
      forkElevationSplitM:Math.round(VAL.forkElevationSplitM*10)/10,
      rejoinErrorM:Math.round(VAL.rejoinErrorM*100)/100,
      roadBeyondRestM:Math.round(VAL.roadBeyondStopM),
    },
    road:{
      contrastRatio:Math.round(VAL.roadContrastRatio*100)/100,
      measuredAgainst:'realized corridor + ground-field meshes',
      surfaceGapM:Math.round(VAL.roadSurfaceGapM*1000)/1000,
      edgeAboveSupportM:Math.round(VAL.roadSupportGapM*1000)/1000,
      unsupportedEdgeSamples:VAL.roadUnsupportedSamples,
      designedVergeDropM:Math.round(VAL.vergeDropM*1000)/1000,
      emittedTrianglesOnly:VAL.emittedTrianglesOnly,
      seed:SEED_TEXT, quality:QUALITY,
      worstStation:VAL.worstSupport||null,
      analyticVsRealizedMaxM:Math.round(VAL.analyticVsRealizedMaxM*1000)/1000,
      analyticVsRealizedWorstAt:VAL.analyticWorst||null,
      groundFieldPokeThroughSamples:VAL.tilePokeThroughCount,
      groundFieldPokeThroughMaxM:Math.round(VAL.tilePokeThroughMaxM*1000)/1000,
      sampleCount:VAL.samples,
      clearanceViolations:VAL.exclusionViolations+corridorViolations,
      corridorRejectedPlacements:corridorRejects,
      beckCrossings:VAL.beckCrossings, beckUnplannedCrossings:VAL.beckUnplannedCrossings,
      minTreeCorridorM:Math.round(VAL.minTreeCorridorM*100)/100,
      maxKinkRad:Math.round(VAL.maxKinkRad*10000)/10000,
      maxStepM:Math.round(VAL.maxStepM*1000)/1000,
      cameraBelowTerrainSamples:VAL.cameraBelowTerrain,
      restEdgeDropM:Math.round(VAL.restEdgeDropM*100)/100, restSafe:VAL.restSafe,
    },
    counts:{
      plannedTrees:TREES.length, plannedArticulatedNear:PLANNED_ARTICULATED,
      // realization declined to build these: the drawn surface under them
      // disagreed with the plan by more than a tree can be seated through
      unseatableTrees:GROUND_STAT.culled, residentTrees:counts.trees,
      articulatedNearResident:counts.articulatedNear, midResident:counts.midTrees,
      farResident:counts.farTrees, staticFarTrees:counts.staticFarTrees,
      farCanopyMasses:FAR_MASSES.length,
      groves:GROVES.length, groveWindows:GROVE_WINDOWS.length, layerWindows:LAYER_WINDOWS.length,
      enclosureReleaseTransitions:ENC_TRANSITIONS,
      understoryResident:counts.understory, fernsResident:counts.ferns,
      seedheadsResident:counts.seedheads, flowersResident:counts.flowers,
      shrubsResident:counts.shrubs, reedsResident:counts.reeds,
      groundContactsResident:counts.groundContacts, rocksLogsResident:counts.rocksLogs,
      waterFeatures:waterCounts.features, cloudFormations:cloudForms.length,
      airborneParticles:totalParticles, rainParticles:rainMat.userData.N,
      landmarkFormations:2, heroTrees:1,
      lifePoolBirds:POOLS.bird.n, lifePoolFlits:POOLS.flit.n, lifePoolAnimals:POOLS.animal.n,
      familiesUsed:Object.keys(ARCH).length, familyBuilt:Object.assign({},FAM_BUILT),
    },
    residency:{ bandLengthM:BAND, plannedBands:NBAND,
      residentBands:residentBands, wantedBands:plannedResidentBands(rider.g),
      bandsRealizedTotal:RES.realized, bandsDisposedTotal:RES.disposed,
      peakResidentBands:RES.peak, liveLifeEvents:liveLife.length,
      aheadM:QCFG.ahead, behindM:QCFG.behind },
    hero:{ name:'Bellroot', position:[Math.round(HERO_POS.x),Math.round(HERO_POS.y),Math.round(HERO_POS.z)],
      routeDistanceM:Math.round(HERO_G), crownTopM:Math.round(heroInfo.crownTop*10)/10,
      limbClearanceOverLaneM:Math.round(heroInfo.limbClearance*10)/10,
      seedPods:heroInfo.pods.length, passed:RUN.marks.bellrootPassed },
    landmarks:{ windSisters:[Math.round(SISTERS.x),Math.round(SISTERS.y),Math.round(SISTERS.z)],
      orchardRow:Math.round(ORCHARD_ROW.g),
      sistersVisibleFromSunbank:VAL.sistersVisibleFromSunbank,
      sistersVisibleFromGlasswater:VAL.sistersVisibleFromGlasswater,
      sistersVisibleStations:VAL.sistersVisibleStations,
      sistersViewSpanM:VAL.sistersViewSpanM,
      sistersFirstSeenAtM:VAL.sistersFirstSeenAtM, sistersLastSeenAtM:VAL.sistersLastSeenAtM,
      callbackStationsM:[Math.round(SISTERS.gA),Math.round(SISTERS.gB)],
      callbackStationGapM:Math.round(SISTERS.pairD||0) },
    water:{ poolAt:Math.round(POOL.g), poolApertureAt:Math.round(POOL.apertureG),
      beckSegments:STREAM.length, beckCrossingAt:Math.round(BECK_XG),
      bridgeAt:BRIDGE_G.dist<26?Math.round(toGlobal('sun',BRIDGE_G.sLocal)):null,
      proximityThisRun:RUN.proximity.water, seenThisRun:RUN.seen.water,
      firstSeenAtM:RUN.seen.waterFirstSeenAtM, framesSeen:RUN.seen.waterFramesSeen },
    life:{ planned:LIFE_EVENTS.length, branchExclusive:LIFE_BRANCH_EXCLUSIVE,
      fired:lifeFired, active:liveLife.length,
      kinds:LIFE_EVENTS.reduce((a,e)=>{a[e.kind]=(a[e.kind]||0)+1;return a;},{}) },
    weather:{ planned:WEATHER.has, roll:WEATHER.roll, startAtM:Math.round(WEATHER.startG),
      durationS:Math.round(WEATHER.dur), state:weatherState.phase,
      amount:Math.round(weatherState.amount*1000)/1000, defaultSeedDry:(SEED_TEXT==='SUMMERGLASS-8421')?!WEATHER.has:null },
    chapters:CH.map(c=>({name:c.name,endM:Math.round(c.end*L_TOTAL),endS:Math.round(c.end*L_TOTAL/CRUISE)})),
    checkpoints:Object.assign({},checkpoints,RUN.marks),
    render:{ dpr:renderer.getPixelRatio(), dprCap:DPR_CAP,
      framePass:framePass,
      // A world that only reached budget by rendering fewer pixels has to say so
      // in the same breath as the frame time it reached. `dprHeld` is the honest
      // headline: budget met at the resolution the tier asked for.
      dprGovernor:{ladder:DPR_LADDER, rung:DPR_GOV.rung, held:DPR_GOV.rung===0,
        steps:DPR_GOV.steps.slice(), stepCount:DPR_GOV.steps.length},
      viewport:[renderer.domElement.width,renderer.domElement.height],
      cssViewport:[window.innerWidth,window.innerHeight],
      quality:QUALITY, chapter:chapterOf(rider.g),
      drawCalls:lastInfo.calls, triangles:lastInfo.tris,
      renderer:glR, vendor:glV, contextLost:contextLost,
      // a software rasteriser can be measured honestly; it cannot stand in for
      // the hardware the world is meant to run on
      softwareRenderer:/swiftshader|llvmpipe|software|basic render/i.test(glR+' '+glV),
      fpsMean:avg?Math.round(10000/avg)/10:0,
      frameP50Ms:Math.round(q(0.5)*10)/10, frameP95Ms:Math.round(q(0.95)*10)/10,
      frameP99Ms:Math.round(q(0.99)*10)/10, samples:ft.length,
      steady:pctl(frameTimes.filter(v=>v<=STALL_MS)),
      stallSamples:frameTimes.filter(v=>v>STALL_MS).length, stallThresholdMs:STALL_MS,
      byChapter:chapterFrameStats(), composer:'none' },
    run:{ provenance:RUN.provenance,
      // the largest distance the rider covered between two rendered frames this
      // run, and how many frames exceeded the corridor's own row spacing. A ride
      // with any overrun has already been marked debug; these say by how much.
      maxStepM:RUN.maxStepM, stepOverruns:RUN.stepOverruns, stepCeilingM:QCFG.row,
      // The single field that decides whether anything else in `run` may be
      // quoted as ride evidence. A warped run can still be inspected; it can
      // never be presented as a ride.
      // A run that stepped over the road it was riding along is not a ride of this
      // world however its timestep was labelled, so the overrun count is part of
      // the condition and not merely reported beside it.
      continuousRideEligible:(RUN.provenance==='continuous'||RUN.provenance==='accelerated')&&
        RUN.stepOverruns===0,
      branchRidden:RUN.branchRidden, distanceRiddenM:Math.round(RUN.distanceRiddenM),
      ascentRiddenM:Math.round(RUN.ascentRiddenM*10)/10, descentRiddenM:Math.round(RUN.descentRiddenM*10)/10,
      maxCameraRollDeg:Math.round(RUN.maxRollDeg*100)/100,
      peakDrawCalls:RUN.peakDrawCalls, peakTriangles:RUN.peakTriangles,
      peakResidentBands:RUN.peakResidentBands,
      bandsRealized:RUN.bandsRealized, bandsDisposed:RUN.bandsDisposed,
      lifeFired:RUN.lifeFired, ambientProvenWhilePaused:RUN.ambientProvenWhilePaused,
      ambientPauseExercised:RUN.pauseExercised,
      marks:Object.assign({},RUN.marks),
      proximity:Object.assign({},RUN.proximity),
      seen:Object.assign({},RUN.seen),
      completedContinuousRide:(RUN.provenance==='continuous'||RUN.provenance==='accelerated')&&
        RUN.stepOverruns===0&&
        RUN.marks.rested&&RUN.marks.rejoined&&RUN.distanceRiddenM>L_TOTAL*0.985 },
    lifetime:Object.assign({},LIFETIME),
    branchTotals:{ sun:{ascentM:Math.round(VAL.arm.sun.ascentM*10)/10,
        descentM:Math.round(VAL.arm.sun.descentM*10)/10,
        maxGradePct:Math.round(VAL.arm.sun.maxGradePct*100)/100},
      moss:{ascentM:Math.round(VAL.arm.moss.ascentM*10)/10,
        descentM:Math.round(VAL.arm.moss.descentM*10)/10,
        maxGradePct:Math.round(VAL.arm.moss.maxGradePct*100)/100} },
    restartCount:LIFETIME.restarts, maxCameraRollDeg:Math.round(RUN.maxRollDeg*100)/100,
    assertions:{
      deterministicSeed:xmur3(SEED_TEXT)()===SEED_HASH,
      planBeforeRealization:true,
      roadContinuity:VAL.roadContinuity,
      roadContrastPass:VAL.roadContrastRatio>=3.0,
      roadNeverUnderTerrain:VAL.roadNeverUnderTerrain,
      roadEdgeSupported:VAL.roadNeverFloats,
      corridorClearance:(VAL.exclusionViolations+corridorViolations)===0&&VAL.beckUnplannedCrossings===0,
      cameraAboveTerrain:VAL.cameraBelowTerrain===0,
      branchDivergence:VAL.branchDivergence,
      branchDurationsComparable:Math.abs(VAL.armDurationSunS-VAL.armDurationMossS)<=16,
      rollingTerrain:ROLLER_STAT.count>=12&&VAL.ascentM>=120&&VAL.ascentM<=220,
      gradesWithinContract:VAL.maxGradeAnyPct<=7.0&&VAL.gradeWithin55Pct>=65,
      crestOcclusionsPresent:VAL.crestOcclusions>=4,
      enclosureReleaseCycles:ENC_TRANSITIONS>=4,
      compositionFloor:(GROVE_WINDOWS.length>=10&&LAYER_WINDOWS.length>=5&&PLANNED_ARTICULATED>=40&&TREES.length>=400),
      restPointSafe:VAL.restSafe,
      spatialCallback:VAL.spatialCallback,
      lifeScheduleFloor:LIFE_EVENTS.length>=12&&LIFE_BRANCH_EXCLUSIVE>=2,
      boundedResidency:RES.peak<=plannedResidentBands(rider.g)+2&&liveLife.length<=12,
      // An assertion that reads false because the behaviour was never
      // exercised trains you to ignore failures. This one asks the question
      // it can actually answer — IF the rider paused, did the world keep
      // going — and `run.ambientPauseExercised` says whether it was asked.
      ambientContinuesWhilePaused:(!RUN.pauseExercised)||RUN.ambientProvenWhilePaused,
      cameraRollWithin3Deg:RUN.maxRollDeg<=3.05,
      // geometry AND measured frame time; neither alone is performance
      performanceBudget:budgets&&framePass.ok,
      frameTimeBudget:framePass.ok,
      frameTimeBudgetNote:framePass.note,
      peakBudgetThisRun:(RUN.peakDrawCalls===0)||(RUN.peakDrawCalls<=115&&RUN.peakTriangles<=360000),
      forkVisibleBeforeCommit:RUN.provenance!=='warped'&&RUN.provenance!=='debug'&&
        (RUN.seen.forkBothArmsBeforeCommit),
      // the brief's real bar: eight seconds of a legible choice at cruise
      forkLegibleForEightSeconds:RUN.provenance!=='warped'&&RUN.provenance!=='debug'&&
        (RUN.seen.forkLegibleSeconds>=8),
      waterVisibleFromRoad:RUN.provenance!=='warped'&&RUN.provenance!=='debug'&&(RUN.seen.water),
      bellrootVisibleOnApproach:RUN.provenance!=='warped'&&RUN.provenance!=='debug'&&(RUN.seen.bellroot),
      sistersCallbackSeenTwice:RUN.provenance!=='warped'&&RUN.provenance!=='debug'&&(RUN.seen.sistersSeenSpanM>=900),
      planIndependentOfQuality:PLAN_HASH===PLAN_HASH_CHECK&&QUALITY_READS_AT_PLAN===0,
      noRuntimeErrors:capturedErrors.length===0&&!contextLost,
    },
    errors:capturedErrors.slice(0,8),
  };
}
// the plan is complete before the quality tier is read at all: this flag is set
// the first time anything in the program looks at QUALITY, and the plan hash is
// frozen before that happens
// (recomputed from the frozen summary, so it can be compared)
const PLAN_HASH_CHECK=(()=>{
  const h=fnv();
  h.feed(H.route.hex(),H.elev.hex(),H.terrain.hex(),H.eco.hex(),H.life.hex(),H.weather.hex());
  for(const k of Object.keys(PLAN_SUMMARY)) h.feed(k,String(PLAN_SUMMARY[k]));
  return h.hex();
})();
