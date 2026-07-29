// ============================================================
// WARM-UP, IDENTITY PROBE, MAIN LOOP
// ============================================================
warmResidency(0);
// prove that a band leaving and re-entering residency comes back as itself
const IDENTITY_PROBE=(()=>{
  const bi=Math.min(3,NBAND-1);
  const sig=(i)=>{
    const b=bands[i]; if(!b.live) return 'none';
    return b.live.meshes.map(m=>m.geometry.getAttribute('position').count).join('/')+
      '|'+JSON.stringify(b.live.local);
  };
  if(!bands[bi].live) realizeBand(bi);
  const a=sig(bi);
  disposeBand(bi); realizeBand(bi);
  const b=sig(bi);
  const same=(a===b&&a!=='none');
  return {stable:same,signature:a};
})();
{
  const h=fnv();
  h.feed(QUALITY,QCFG.row,QCFG.tile,QCFG.under,QCFG.nearD,QCFG.midD,QCFG.farD,QCFG.lobe,
    QCFG.tuftBand,QCFG.cloudN,QCFG.part,QCFG.shadow,corridorMeshes.length,terrainMeshes.length,
    totalParticles,IDENTITY_PROBE.signature);
  realizationHash=(H.real.hex()+h.hex()).slice(0,16);
}

let wTime=0, lastNow=performance.now(), camInit=false, pitchSm=null, eyePrevY=null;
let gPrevFrame=null;   // where the rider was on the previous rendered frame
let fixedStep=0;
const camFwd=new THREE.Vector3(0,0,1);
const windDrift=WL.uCloudMove.value;
const worldC=spineAt(L_TOTAL*0.5);
const _eye=new THREE.Vector3(), _fwd=new THREE.Vector3();
const _fpa=new THREE.Vector3(), _fpb=new THREE.Vector3();
// Two objects per frame is two objects per frame: at sixty frames a second for the
// twelve minutes of a ride that is eighty-six thousand allocations whose only
// purpose is to be collected again. Both are reused.
const _lat=new THREE.Vector3(), _camE=new THREE.Euler();
const CLOUD_SPAN=5200;

function updateWeather(dt){
  if(!WEATHER.has) return;
  const W=weatherState;
  if(W.phase==='clear'&&rider.g>WEATHER.startG&&rider.started){ W.phase='shower'; W.t=0; }
  if(W.phase==='shower'){
    W.t+=dt;
    const inR=smooth(0,10,W.t), outR=1-smooth(WEATHER.dur-13,WEATHER.dur,W.t);
    W.amount=WEATHER.strength*Math.min(inR,outR);
    if(W.t>=WEATHER.dur){ W.phase='done'; W.amount=0; }
  }
  WL.uWet.value=W.amount;
  rainMat.uniforms.uAmt.value=W.amount;
  rainMat.userData.pts.visible=W.amount>0.002;
  sun.intensity=2.75*(1-0.16*W.amount);       // the sun never leaves
  hemi.intensity=0.9*(1+0.12*W.amount);
}

function tick(){
  if(contextLost) return;
  const now=performance.now();
  const dtRaw=(now-lastNow)/1000; lastNow=now;
  const dt=fixedStep>0?fixedStep:Math.min(dtRaw,0.05);
  wTime+=dt;
  frameId++; warmFrames++;
  if(warmFrames>20){ frameTimes.push(dtRaw*1000); if(frameTimes.length>600) frameTimes.shift();
    noteFrame(dtRaw*1000,chapterOf(rider.g)); }
  governResolution(dtRaw*1000,now);
  WL.uWTime.value=wTime;

  if(!rider.started){ rider.holdT+=dt; if(rider.holdT>=1.1) rider.started=true; }
  if(keys['KeyW']||keys['ArrowUp']) rider.vT=clamp(rider.vT+4.0*dt,4,18);
  else if(keys['KeyS']||keys['ArrowDown']) rider.vT=clamp(rider.vT-7*dt,4,18);
  else rider.vT+=(CRUISE-rider.vT)*(1-Math.exp(-dt*0.18));
  const steer=((keys['KeyA']||keys['ArrowLeft'])?1:0)-((keys['KeyD']||keys['ArrowRight'])?1:0);
  if(steer) rider.latT=clamp(rider.latT+steer*2.9*dt,-2.6,2.6);
  else rider.latT*=Math.exp(-dt*0.75);

  let F=FRAMES[rider.branch];
  const fr0=getFrame(F,rider.sM);
  const frA=getFrame(F,Math.min(rider.sM+7,F.len-1));
  const slope=(frA.y-fr0.y)/7;
  if(rider.started&&!rider.paused&&!rider.ended){
    rider.simT+=dt;
    const vEff=rider.vT*(1-clamp(slope*1.45,-0.11,0.15));
    rider.v+=(vEff-rider.v)*(1-Math.exp(-dt*1.6));
    rider.sM+=rider.v*dt;
    rider.g=toGlobal(rider.branch,rider.sM);
    // ---- the Mosswater Choice: the line you are riding decides ----
    if(!rider.committed&&rider.g>S_SPLIT-240) RUN.proximity.fork=true;
    if(!rider.committed&&rider.g>=S_SPLIT+FORK_COMMIT_LEAD){
      // `forceBranch` is only ever set by the test surface; riding never sets it,
      // so the line the rider is actually on still decides for a player.
      let pick=rider.forceBranch||DEF_BRANCH;
      if(!rider.forceBranch){
        if(rider.latT>0.35) pick=(FORK_SIDE>0)?'sun':'moss';
        else if(rider.latT<-0.35) pick=(FORK_SIDE>0)?'moss':'sun';
      }
      if(pick!==rider.branch){ rider.branch=pick; rider.sM=toLocal(pick,rider.g); F=FRAMES[pick]; }
      rider.committed=true; RUN.marks.forkCommitted=true; RUN.branchRidden=rider.branch;
      if(RUN.seen.forkFirstSeenAtM!==null){
        RUN.seen.forkLeadBeforeCommitM=Math.round(rider.g-RUN.seen.forkFirstSeenAtM);
        // the span over which the choice was actually readable, and what that is
        // worth in seconds at cruise — which is the number that matters
        const span=(RUN.seen.forkLegibleLastAtM||rider.g)-RUN.seen.forkFirstSeenAtM;
        RUN.seen.forkLegibleSpanM=Math.round(span);
        RUN.seen.forkLegibleSeconds=Math.round(span/CRUISE*10)/10;
      }
    }
    if(rider.committed&&!RUN.marks.branchMid&&rider.g>(S_SPLIT+S_MERGE_G)*0.5) RUN.marks.branchMid=true;
    if(rider.g>S_MERGE_G+10) RUN.marks.rejoined=true;
    if(Math.abs(rider.g-POOL.apertureG)<60||Math.abs(rider.g-MOSSPOOL.g)<60) RUN.proximity.water=true;
    if(Math.abs(rider.g-HERO_G)<160) RUN.proximity.bellroot=true;
    if(Math.abs(rider.g-HERO_G)<26) RUN.marks.bellrootPassed=true;
    { const dy=eyePrevY===null?0:(fr0.y-eyePrevY);
      if(dy>0) RUN.ascentRiddenM+=dy; else RUN.descentRiddenM-=dy;
      eyePrevY=fr0.y; RUN.distanceRiddenM=rider.g; }
    // How far the rider actually moved between two rendered frames, which is the
    // only thing that decides whether a ride skipped terrain. Bounding the fixed
    // TIMESTEP does not bound this: the same step at eighteen metres a second
    // covers twice the ground it does at nine, so a step declared safe at cruise
    // becomes a skip the moment the ride speeds up. The bound is the corridor's
    // own row spacing — past that a frame steps over a row of the road it is
    // supposed to be riding along, and the run is no longer a ride of this world.
    { const adv=Math.abs(rider.g-gPrevFrame);
      if(gPrevFrame!==null&&adv>RUN.maxStepM) RUN.maxStepM=Math.round(adv*1000)/1000;
      if(gPrevFrame!==null&&adv>QCFG.row){ RUN.stepOverruns++; markProvenance('debug'); }
      gPrevFrame=rider.g; }
    { let prev=0;
      for(const c of CH){ if(rider.g>=prev) checkpoints[c.key]=true; prev=c.end*L_TOTAL; } }
    const STOP=toLocal(rider.branch,S_STOP);
    if(rider.sM>STOP-9){
      rider.vT=Math.max(4,rider.vT-6*dt);
      rider.v=Math.min(rider.v,Math.max(0.30,(STOP-rider.sM)*0.32));
      if(rider.sM>STOP-0.6&&rider.v<0.4){ rider.v=0; if(!rider.ended){ rider.ended=true; RUN.marks.rested=true; } }
    }
    rider.sM=clamp(rider.sM,0,STOP);
    rider.g=toGlobal(rider.branch,rider.sM);
  }
  rider.lat+=(rider.latT-rider.lat)*(1-Math.exp(-dt*4.6));

  // ---- residency, then the scheduled life of the place ----
  updateResidency(rider.g,warmFrames<8?4:1);
  for(const e of LIFE_EVENTS){
    if(e.fired) continue;
    if(e.arm!=='any'&&!(rider.committed&&e.arm===rider.branch)) {
      if(rider.g>e.g+40) e.fired=true;      // the other arm's events are simply not yours
      continue;
    }
    if(rider.g>=e.g-2&&rider.g<e.g+50){
      e.fired=true;
      spawnLife(e,getFrame(FRAMES[rider.branch],rider.sM),rider.g);
      RUN.lifeFired++;
    } else if(rider.g>=e.g+50) e.fired=true;
  }
  updateLife(dt);
  updateWeather(dt);

  // ambient goes on without the rider: clouds keep travelling while paused
  if(rider.paused){
    RUN.pauseExercised=true;
    if(!pauseProbe) pauseProbe={t:wTime,x:cloudForms[0].mesh.position.x,z:cloudForms[0].mesh.position.z,w:wTime};
    else if(wTime-pauseProbe.t>0.7){
      const c=cloudForms[0].mesh.position;
      if(Math.hypot(c.x-pauseProbe.x,c.z-pauseProbe.z)>0.02) RUN.ambientProvenWhilePaused=true;
    }
  } else pauseProbe=null;
  // one wind, three speeds: the near band travels visibly, the far band barely
  // moves, and the whole sky stays coherent instead of wandering apart
  for(const cf of cloudForms){
    const sp=0.46-cf.band*0.13;
    let ox=cf.home.x+windDrift.x*wTime*sp-worldC.x, oz=cf.home.z+windDrift.y*wTime*sp-worldC.z;
    ox=((ox%CLOUD_SPAN)+CLOUD_SPAN*1.5)%CLOUD_SPAN-CLOUD_SPAN/2;
    oz=((oz%CLOUD_SPAN)+CLOUD_SPAN*1.5)%CLOUD_SPAN-CLOUD_SPAN/2;
    cf.mesh.position.set(worldC.x+ox,cf.home.y,worldC.z+oz);
    cf.mesh.updateMatrix();
  }

  // ---- camera: bicycle height, composed steering, legible horizon ----
  const eyeF=getFrame(F,rider.sM);
  _fwd.set(eyeF.tx,0,eyeF.tz);
  camFwd.lerp(_fwd,camInit?1-Math.exp(-dt*3.4):1).normalize();
  camInit=true;
  _lat.set(eyeF.lx,0,eyeF.lz);
  _eye.set(eyeF.x,eyeF.y,eyeF.z).addScaledVector(_lat,rider.lat);
  _eye.y+=EYE_H;
  if(!dragging){ yawOff*=Math.exp(-dt*1.6); pitchOff*=Math.exp(-dt*1.6); }
  const yaw=Math.atan2(-camFwd.x,-camFwd.z)+yawOff;
  const la=getFrame(F,Math.min(rider.sM+30,F.len-1));
  const pitchTarget=Math.atan2(la.y-eyeF.y,30)*0.42;
  pitchSm=(pitchSm===null)?pitchTarget:pitchSm+(pitchTarget-pitchSm)*(1-Math.exp(-dt*1.5));
  // A small standing bias upward. The lane stays instantly readable, but the
  // frame gives its lower third back to the land instead of to the stone.
  const pitch=clamp(pitchSm+pitchOff+PITCH_BIAS,-0.55,0.5);
  const roll=clamp(-rider.lat*0.030-steer*0.010,-0.052,0.052)*clamp(rider.v/11,0,1);
  camRollDeg=Math.abs(roll)*180/Math.PI;
  RUN.maxRollDeg=Math.max(RUN.maxRollDeg,camRollDeg);
  camera.position.copy(_eye);
  _camE.set(pitch,yaw,roll,'YXZ');
  camera.quaternion.setFromEuler(_camE);

  if(QCFG.shadow>0){
    sun.position.set(_eye.x+sunDir.x*240,_eye.y+sunDir.y*240,_eye.z+sunDir.z*240);
    sun.target.position.set(_eye.x+camFwd.x*22,eyeF.y,_eye.z+camFwd.z*22);
    sun.target.updateMatrixWorld();
  }
  for(const p of partSystems){
    p.m.uniforms.uCam.value.copy(_eye);
    p.m.uniforms.uGround.value=eyeF.y;
    // the planned pockets decide whether there is anything in the air here at
    // all; a scheduled mote event can still lift it briefly on top of that
    const air=airAmountAt(rider.g);
    p.m.uniforms.uBoost.value=(p.kind===2)?(air*0.85+moteBoost*1.5):air;
  }
  rainMat.uniforms.uCam.value.copy(_eye);
  rainMat.uniforms.uGround.value=eyeF.y;

  // bounded draw: nothing far enough away to be a smudge is submitted
  {
    const vr=QCFG.view*QCFG.view, tv=QCFG.tileView*QCFG.tileView;
    for(const m of corridorMeshes){
      const c=m.geometry.boundingSphere;
      m.visible=c?(_eye.distanceToSquared(c.center)<vr+c.radius*c.radius):true;
    }
    for(const m of terrainMeshes){
      const c=m.geometry.boundingSphere;
      m.visible=c?(_eye.distanceToSquared(c.center)<tv+c.radius*c.radius):true;
    }
  }

  audioUpdate(dt,wTime,rider);

  // ---- what the rider can actually see from where the camera now is ----
  camera.updateMatrixWorld();
  if((frameId&3)===0){
    refreshFrustum(camera);
    const eye=_eye;
    // "Both arms visible" is not enough — two roads a pixel apart are one road.
    // The test is that each arm's own stone is visible AND that they are far
    // enough apart on screen to be told apart, held for long enough to act on.
    if(!rider.committed&&rider.g>S_SPLIT-320&&rider.g<S_SPLIT+FORK_COMMIT_LEAD){
      const a=getFrame(FRAMES.sun,clamp(toLocal('sun',S_SPLIT+170),0,FRAMES.sun.len-1));
      const bm=getFrame(FRAMES.moss,clamp(toLocal('moss',S_SPLIT+170),0,FRAMES.moss.len-1));
      const sa=seenByRider(eye,a.x,a.y+1.0,a.z,3,1.0);
      const sb=seenByRider(eye,bm.x,bm.y+1.0,bm.z,3,1.0);
      if(sa&&sb){
        _fpa.set(a.x,a.y+1.0,a.z).project(camera);
        _fpb.set(bm.x,bm.y+1.0,bm.z).project(camera);
        // separation in normalised device space; 0.10 is about four degrees of
        // view at this field of view, comfortably two distinct roads
        const sep=Math.hypot(_fpa.x-_fpb.x,_fpa.y-_fpb.y);
        RUN.seen.forkScreenSepMax=Math.max(RUN.seen.forkScreenSepMax,Math.round(sep*1000)/1000);
        if(sep>=0.10){
          RUN.seen.forkBothArmsBeforeCommit=true;
          if(RUN.seen.forkFirstSeenAtM===null) RUN.seen.forkFirstSeenAtM=Math.round(rider.g);
          RUN.seen.forkLegibleLastAtM=Math.round(rider.g);
        }
      }
    }
    for(const P of PONDS){
      if(Math.abs(rider.g-P.g)>340) continue;
      let hit=false;
      for(let a=0;a<TAU&&!hit;a+=TAU/7){
        const wx=P.cx+Math.cos(a)*P.rx*0.7, wz=P.cz+Math.sin(a)*P.rz*0.7;
        if(seenByRider(eye,wx,P.y+0.05,wz,2.5,0.35)) hit=true;
      }
      if(hit){ RUN.seen.water=true; RUN.seen.waterFramesSeen++;
        if(RUN.seen.waterFirstSeenAtM===null) RUN.seen.waterFirstSeenAtM=Math.round(rider.g); }
    }
    if(Math.abs(rider.g-HERO_G)<520&&seenByRider(eye,HERO_POS.x,HERO_POS.y+18,HERO_POS.z,14,1.2)){
      RUN.seen.bellroot=true;
      if(RUN.seen.bellrootFirstSeenAtM===null) RUN.seen.bellrootFirstSeenAtM=Math.round(rider.g);
    }
    if(seenByRider(eye,SISTERS.x,SISTERS.y+16,SISTERS.z,20,1.0)){
      RUN.seen.sisters=true;
      if(RUN.seen.sistersFirstSeenAtM===null) RUN.seen.sistersFirstSeenAtM=Math.round(rider.g);
      RUN.seen.sistersLastSeenAtM=Math.round(rider.g);
      RUN.seen.sistersSeenSpanM=RUN.seen.sistersLastSeenAtM-RUN.seen.sistersFirstSeenAtM;
    }
  }

  renderer.render(scene,camera);
  lastInfo={calls:renderer.info.render.calls,tris:renderer.info.render.triangles};
  if(warmFrames>30){
    RUN.peakDrawCalls=Math.max(RUN.peakDrawCalls,lastInfo.calls);
    RUN.peakTriangles=Math.max(RUN.peakTriangles,lastInfo.tris);
  }
  renderer.info.reset();
}
renderer.setAnimationLoop(tick);
Object.defineProperty(window,'__SUMMERGLASS_PROOF__',{get:buildProof});
window.__SUMMERGLASS_PLAN__=Object.assign({},PLAN_SUMMARY,{planHash:PLAN_HASH,quality:QUALITY});

// ---------- a small test surface (an aid to verification, not evidence of motion) ----------
window.__SUMMERGLASS_TEST__={
  // a fixed timestep still rides every metre and renders every frame; it only
  // decouples the simulation from a slow rasteriser
  fixedStep(dt){ fixedStep=dt||0; if(fixedStep>0) markProvenance('accelerated'); return fixedStep; },
  setSpeed(v){ rider.vT=clamp(v,4,18); },
  steer(v){ rider.latT=clamp(v,-2.6,2.6); },
  // A test control that means what it says. Steering is a held input whose
  // lateral target decays back to the lane centre, so a harness that nudges the
  // handlebars once a second — or that stops to take a screenshot beside the
  // split — finds the nudge has faded by the frame the choice is locked, and the
  // rider commits to whichever arm it happened to be nearest. The lean is still
  // applied so the camera behaves like a rider leaning into the turn; the choice
  // itself is held until the fork resolves it, and the restart clears it.
  chooseBranch(which){
    if(rider.committed) return false;
    rider.forceBranch=(which==='moss')?'moss':'sun';
    rider.latT=(which==='sun')?(FORK_SIDE>0?1.6:-1.6):(FORK_SIDE>0?-1.6:1.6);
    return true;
  },
  pause(v){ rider.paused=(v===undefined)?!rider.paused:!!v; return rider.paused; },
  restart(){ restartRide(); },
  // an accelerated traversal used only to reach a chapter quickly; the ride
  // itself is always driven continuously
  warp(g){
    markProvenance('warped');
    const target=clamp(g,0,S_STOP-12);
    if(target>S_SPLIT+58) rider.committed=true;
    rider.sM=toLocal(rider.branch,target); rider.g=target;
    rider.started=true; rider.ended=false; rider.v=CRUISE;
    // A teleport is not a frame in which the rider travelled a kilometre. The
    // step guard measures riding, so the jump itself is not offered to it —
    // the warp is already recorded as a warp, which is the stronger statement.
    gPrevFrame=null; eyePrevY=null;
    for(const e of LIFE_EVENTS) if(e.g<target-40) e.fired=true;
    warmResidency(target);
    return rider.g;
  },
  state(){ return {g:rider.g,sM:rider.sM,branch:rider.branch,committed:rider.committed,
    v:rider.v,paused:rider.paused,ended:rider.ended,chapter:chapterOf(rider.g)}; },
  identityProbe:IDENTITY_PROBE,
  lifePlan(){ return LIFE_EVENTS.map(e=>({g:Math.round(e.g),kind:e.kind,arm:e.arm})); },
  // what the triangle budget is actually being spent on, counted from the
  // meshes the frustum accepted this frame rather than estimated
  budgetBreakdown(){
    camera.updateMatrixWorld(); refreshFrustum(camera);
    const by={}; let total=0, drawn=0;
    scene.traverse(o=>{
      if(!o.isMesh&&!o.isPoints||!o.geometry) return;
      const g=o.geometry, idx=g.getIndex();
      const tris=Math.floor((idx?idx.count:(g.getAttribute('position')||{count:0}).count)/3);
      if(!tris) return;
      total+=tris;
      const vis=o.frustumCulled?_frustum.intersectsObject(o):true;
      if(!vis) return;
      drawn+=tris;
      const k=(o.material&&o.material.name)||
        (o.material===corridorMat?'corridor':
         o.material===underMat?'understory':
         o.material===treeMatNear?'trees-near':
         o.material===treeMatMid?'trees-mid':
         o.material===treeMatFar?'trees-far':
         o.material===treeMatHero?'bellroot':
         o.material===waterMat?'water':'other');
      by[k]=(by[k]||0)+tris;
    });
    return {drawn,total,by:Object.fromEntries(Object.entries(by).sort((a,b)=>b[1]-a[1]))};
  },
  // where the water actually lands on screen, and whether anything is standing
  // between the rider and it
  waterProbe(){
    camera.updateMatrixWorld(); refreshFrustum(camera);
    const eye=camera.position;
    return PONDS.map(P=>{
      const v=new THREE.Vector3(P.cx,P.y,P.cz).project(camera);
      const mesh=WATER_MESHES.find(m=>m.userData.pond===P.name);
      let blocked=null;
      { // walk the sight line and find the first ground above it
        const dx=P.cx-eye.x, dy=P.y-eye.y, dz=P.cz-eye.z, L=Math.hypot(dx,dy,dz);
        for(let t=0.06;t<0.995;t+=0.02){
          const px=eye.x+dx*t, py=eye.y+dy*t, pz=eye.z+dz*t;
          if(groundY(px,pz)>py+0.05){ blocked=+(t*L).toFixed(1); break; }
        }
      }
      return { name:P.name, ndc:[+v.x.toFixed(3),+v.y.toFixed(3),+v.z.toFixed(3)],
        onScreen:Math.abs(v.x)<1&&Math.abs(v.y)<1&&v.z<1,
        distM:+Math.hypot(P.cx-eye.x,P.cz-eye.z).toFixed(1),
        dropM:+(eye.y-P.y).toFixed(2), blockedAtM:blocked,
        meshVisible:mesh?mesh.visible:null,
        meshInFrustum:mesh?_frustum.intersectsObject(mesh):null };
    });
  },
  // the ground profile out across a pool shelf, so a claim that water is
  // visible from the lane can be checked against heights rather than hoped for
  // Is there drawn ground everywhere between the two lanes? This does not ask
  // the readers — it fires a ray straight down at the actual scene and sees what
  // it hits. A point where nothing is hit is a hole you can see the sky through,
  // and two hits more than a few centimetres apart is a doubled surface.
  forkIntegrity(){
    const rc=new THREE.Raycaster();
    rc.far=4000;
    const targets=corridorMeshes.concat(terrainMeshes);
    const dir=new THREE.Vector3(0,-1,0), org=new THREE.Vector3();
    let holes=0, samples=0, doubled=0, zf=0, worstHole=null, worstGap=0;
    const gapBand=[0,0,0];        // under 8 cm, 8–40 cm, over 40 cm
    let worstPair=null;
    const F=FRAMES.sun;
    const DG=5, DL=2.5;                       // sample pitch, metres
    const miss=new Map(), key=(a,b)=>a*100000+b;
    let gi=0;
    for(let g=S_SPLIT-140;g<S_MERGE_G+140;g+=DG,gi++){
      const fr=getFrame(F,clamp(toLocal('sun',g),0,F.len-1));
      let li=0;
      for(let lat=-(APRON+34);lat<=APRON+34;lat+=DL,li++){
        const x=fr.x+fr.lx*lat, z=fr.z+fr.lz*lat;
        if(routeInfo(x,z).d>APRON+30) continue;
        samples++;
        org.set(x,fr.y+900,z);
        rc.set(org,dir);
        const hits=rc.intersectObjects(targets,false);
        if(!hits.length){
          holes++; miss.set(key(gi,li),{g:Math.round(g),lat:Math.round(lat)});
          if(!worstHole) worstHole={g:Math.round(g),lat:Math.round(lat)};
          continue;
        }
        if(hits.length>1){
          const d=Math.abs(hits[0].point.y-hits[1].point.y);
          if(d<0.02) zf++; else if(d<1.2) doubled++;
          // Two surfaces a few centimetres apart are a depth-test question. Two
          // surfaces half a metre apart are a shelf hanging in the air, and only
          // that second kind is a defect you can see, so count them apart.
          if(d>=0.02){
            if(d<0.08) gapBand[0]++; else if(d<0.40) gapBand[1]++; else gapBand[2]++;
            if(d>worstGap){ worstGap=d;
              worstPair={g:Math.round(g),lat:Math.round(lat),gapM:Math.round(d*100)/100,
                         top:hits[0].object.name||'?',under:hits[1].object.name||'?',
                         topY:Math.round(hits[0].point.y*100)/100,
                         underY:Math.round(hits[1].point.y*100)/100,
                         planY:Math.round(groundY(x,z)*100)/100,
                         d0:Math.round(routeInfo(x,z).dA[0]*10)/10,
                         d1:Math.round(routeInfo(x,z).dA[1]*10)/10}; }
          }
        }
      }
    }
    // A miss rate is not a picture. What decides whether the ground reads as
    // torn is the size of the largest *connected* opening: a lone ray slipping
    // between two triangles is invisible, a five-by-five block is a window onto
    // the sky. Flood-fill the miss grid and report the biggest one in metres.
    let biggest=null, singles=0;
    const seen=new Set();
    for(const k of miss.keys()){
      if(seen.has(k)) continue;
      const stack=[k], cells=[];
      seen.add(k);
      while(stack.length){
        const c=stack.pop(); cells.push(c);
        const cg=Math.floor(c/100000), cl=c%100000;
        for(const [dg,dl] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const n=key(cg+dg,cl+dl);
          if(miss.has(n)&&!seen.has(n)){ seen.add(n); stack.push(n); }
        }
      }
      if(cells.length===1){ singles++; }
      if(!biggest||cells.length>biggest.cells){
        let g0=Infinity,g1=-Infinity,l0=Infinity,l1=-Infinity;
        for(const c of cells){
          const m=miss.get(c);
          g0=Math.min(g0,m.g); g1=Math.max(g1,m.g);
          l0=Math.min(l0,m.lat); l1=Math.max(l1,m.lat);
        }
        biggest={cells:cells.length,alongM:g1-g0+DG,acrossM:l1-l0+DL,atG:g0,atLat:l0};
      }
    }
    return {samples,holes,holePct:Math.round(holes/Math.max(1,samples)*10000)/100,
      doubledGroundWithin1_2m:doubled, coplanarPairs:zf,
      worstOverlapM:Math.round(worstGap*1000)/1000, worstHole,
      isolatedMisses:singles, largestOpening:biggest,
      overlapUnder8cm:gapBand[0], overlap8to40cm:gapBand[1], overlapOver40cm:gapBand[2],
      worstOverlapAt:worstPair};
  },
  // How much of the frame the stone actually occupies, integrated from the
  // projected road edges rather than guessed from a screenshot. Reported for the
  // whole frame and for the lower half, which is where dominance is felt.
  roadFrameShare(){
    camera.updateMatrixWorld();
    const F=FRAMES[rider.branch];
    const W=renderer.domElement.width, Hh=renderer.domElement.height;
    const pt=new THREE.Vector3();
    const proj=(x,y,z)=>{ pt.set(x,y,z).project(camera);
      return [(pt.x*0.5+0.5)*W,(0.5-pt.y*0.5)*Hh,pt.z]; };
    const rows=new Float64Array(Hh);
    let prev=null;
    for(let d=0.4;d<260;d*=1.035){
      const s=Math.min(rider.sM+d,F.len-1);
      const fr=getFrame(F,s);
      const y=fr.y+CROWN;
      const a=proj(fr.x-fr.lx*RH,y,fr.z-fr.lz*RH);
      const b=proj(fr.x+fr.lx*RH,y,fr.z+fr.lz*RH);
      if(a[2]>1||b[2]>1){ prev=null; continue; }
      const cur={y:(a[1]+b[1])*0.5,w:Math.abs(b[0]-a[0])};
      if(prev){
        const y0=Math.min(prev.y,cur.y), y1=Math.max(prev.y,cur.y);
        for(let yy=Math.max(0,Math.ceil(y0));yy<Math.min(Hh,y1);yy++){
          const t=(yy-y0)/Math.max(1e-6,y1-y0);
          rows[yy]=Math.max(rows[yy],lerp(prev.y<cur.y?prev.w:cur.w,prev.y<cur.y?cur.w:prev.w,t));
        }
      }
      prev=cur;
    }
    let full=0, lower=0;
    for(let yy=0;yy<Hh;yy++){
      const w=Math.min(rows[yy],W);
      full+=w; if(yy>=Hh*0.5) lower+=w;
    }
    return { framePct:Math.round(full/(W*Hh)*1000)/10,
      lowerHalfPct:Math.round(lower/(W*Hh*0.5)*1000)/10,
      fovDeg:camera.fov, eyeM:EYE_H, pitchBias:PITCH_BIAS, viewport:[W,Hh] };
  },
  // Every planted trunk measured against the surface actually drawn beneath it.
  // Positive `above` means daylight under the root collar, which is the defect;
  // negative means bedded in, which is what we want.
  groundingProbe(){
    let worst=null, floating=0, maxAbove=-1e9, sampled=0;
    // A trunk above the drawn surface hovers; a trunk far below it is buried to
    // its collar, which reads as a pole pushed into a lawn. Both are failures of
    // contact and neither is visible in a count of the other, so measure both.
    let deepest=0, buried=0, deepestAt=null;
    const check=(x,z,y,what)=>{
      const r=realizedGroundY(x,z); if(r===null) return;
      sampled++;
      const above=y-r;
      if(above>maxAbove){ maxAbove=above; worst={what,x:Math.round(x),z:Math.round(z),
        aboveM:Math.round(above*1000)/1000}; }
      if(above>0.05) floating++;
      const under=-above;
      if(under>0.9) buried++;
      if(under>deepest){ deepest=under; deepestAt={what,x:Math.round(x),z:Math.round(z),
        underM:Math.round(under*1000)/1000}; }
    };
    for(const t of TREES){ if(t.unseatable) continue; check(t.x,t.z,t.y,'tree:'+t.fam); }
    check(HERO_POS.x,HERO_POS.z,HERO_POS.y,'bellroot');
    return {sampled,floating,maxAboveM:Math.round(maxAbove*1000)/1000,worst,
      buriedOver0_9m:buried, deepestBelowDrawnM:Math.round(deepest*1000)/1000,
      deepestAt,
      seated:{lowered:GROUND_STAT.lowered,raised:GROUND_STAT.raised,
        unseatable:GROUND_STAT.culled, deepSeatedOver1_5m:GROUND_STAT.deepSeated,
        maxDropAnyM:Math.round(GROUND_STAT.maxDropM*1000)/1000,
        maxDropKeptM:Math.round(GROUND_STAT.maxKeptDropM*1000)/1000,
        plannedTotal:GROUND_STAT.trees}};
  },
  // The probe above asks `realizedGroundY`, which is a RECONSTRUCTION of the
  // drawn surface — the same arithmetic the emitter used, run again. If that
  // reconstruction is wrong anywhere, the probe and the renderer are looking at
  // two different worlds and the probe will report contact that is not there.
  // This one fires real rays at the meshes in the scene, which is the only
  // surface a rider can actually stand on, and reports how far the two answers
  // differ. It can only see trees whose band is currently resident, so it takes
  // a station and returns what it covered; the caller walks the route.
  groundingCast(){
    const rc=new THREE.Raycaster(); rc.far=400;
    const targets=corridorMeshes.concat(terrainMeshes);
    const dir=new THREE.Vector3(0,-1,0), org=new THREE.Vector3();
    const out={station:Math.round(rider.g),cast:0,noHit:0,floating:0,buried:0,
      worstAbove:null,worstBelow:null,maxAboveM:-1e9,deepestBelowM:0,
      analyticDisagreeMax:0,analyticDisagreeAt:null,analyticNull:0,ids:[]};
    for(let bi=0;bi<bands.length;bi++){
      if(!bands[bi].live) continue;
      for(const t of (bandTrees[bi]||[])){
        if(t.unseatable) continue;
        org.set(t.x,t.y+180,t.z); rc.set(org,dir);
        const hits=rc.intersectObjects(targets,false);
        out.cast++;
        if(!hits.length){ out.noHit++; continue; }
        const drawn=hits[0].point.y, above=t.y-drawn;
        out.ids.push(Math.round(t.x*4)*100000+Math.round(t.z*4));
        if(above>out.maxAboveM){ out.maxAboveM=Math.round(above*1000)/1000;
          out.worstAbove={what:'tree:'+t.fam,x:Math.round(t.x),z:Math.round(t.z),
            aboveM:Math.round(above*1000)/1000,hit:hits[0].object.name||'?'}; }
        if(above>0.05) out.floating++;
        const under=-above;
        if(under>0.9) out.buried++;
        if(under>out.deepestBelowM){ out.deepestBelowM=Math.round(under*1000)/1000;
          out.worstBelow={what:'tree:'+t.fam,x:Math.round(t.x),z:Math.round(t.z),
            underM:Math.round(under*1000)/1000,hit:hits[0].object.name||'?'}; }
        // and the question the old probe could never ask of itself
        const an=realizedGroundY(t.x,t.z);
        if(an===null){ out.analyticNull++; }
        else {
          const dd=Math.abs(an-drawn);
          if(dd>out.analyticDisagreeMax){ out.analyticDisagreeMax=Math.round(dd*1000)/1000;
            out.analyticDisagreeAt={x:Math.round(t.x),z:Math.round(t.z),
              analyticY:Math.round(an*100)/100,drawnY:Math.round(drawn*100)/100}; }
        }
      }
    }
    if(out.maxAboveM<-1e8) out.maxAboveM=null;
    return out;
  },
  // Identity of the realized world, tree by tree, so "the tiers plan the same
  // world" can be checked against the trees themselves rather than against a
  // count of them. Position, family, scale and lean are PLAN and must be
  // identical at every tier. Seated height is REALIZATION and legitimately moves
  // with tessellation, so it is digested separately and never conflated.
  identityDigest(){
    const hi=fnv(), hy=fnv();
    let n=0, minY=1e9, maxY=-1e9;
    for(const t of TREES){
      hi.feed(Math.round(t.x*100),Math.round(t.z*100),t.fam,
        Math.round(t.scl*1000),Math.round(t.lean*1000),t.unseatable?1:0);
      hy.feed(Math.round(t.y*100));
      n++; if(t.y<minY) minY=t.y; if(t.y>maxY) maxY=t.y;
    }
    return {trees:n,identity:hi.hex(),elevation:hy.hex(),
      minSeatedY:Math.round(minY*100)/100,maxSeatedY:Math.round(maxY*100)/100};
  },
  // Every seated height, so two tiers can be compared element by element rather
  // than by a digest that only says "different".
  seatedHeights(){ const a=new Array(TREES.length);
    // height AND lateral distance from the route, because where a tree stands
    // decides whether a difference in how high it stands is visible at all
    for(let i=0;i<TREES.length;i++) a[i]=[Math.round(TREES[i].y*100)/100,Math.round(TREES[i].d*10)/10];
    return a; },
  // Which arm a warped inspection is looking at. Riding decides the branch for a
  // player; a warp never reaches the fork, so without this a two-arm sweep
  // silently scans the default arm twice. Warped by construction, and it says so.
  setBranch(which){
    markProvenance('warped');
    const arm=(which==='moss')?'moss':'sun';
    rider.branch=arm; rider.forceBranch=arm; rider.committed=true;
    rider.sM=toLocal(arm,rider.g);
    gPrevFrame=null; eyePrevY=null;
    warmResidency(rider.g);
    return rider.branch;
  },
  // anything that reaches past the controls into world state is debug-grade
  markDebug(){ markProvenance('debug'); return RUN.provenance; },
  shelfProfile(i){
    const S=SHELVES[i||0]; if(!S) return null;
    const prof=[];
    for(let u=0;u<=Math.abs(S.off)+S.P.rx+12;u+=2){
      const x=S.fr.x+S.fr.lx*u*S.side, z=S.fr.z+S.fr.lz*u*S.side;
      prof.push([u,+groundY(x,z).toFixed(2)]);
    }
    return { name:S.P.name, off:+S.off.toFixed(1), uNear:+S.uNear.toFixed(1),
      halfV:+S.halfV.toFixed(1), frY:+S.fr.y.toFixed(2), waterY:+S.P.y.toFixed(2),
      bed:+S.P.bed.toFixed(2), rx:+S.P.rx.toFixed(1), rz:+S.P.rz.toFixed(1),
      poolG:Math.round(S.P.g), apron:APRON, prof };
  },
  // measurement helpers used by the verification harness
  diag(){
    const worstG=[],worstF=[],worstA=[],cross=[],kinks=[];
    for(const arm of ['sun','moss']){
      const F=FRAMES[arm];
      for(let i=1;i<F.N;i++){
        const k=Math.acos(clamp(F.tx[i]*F.tx[i-1]+F.tz[i]*F.tz[i-1],-1,1));
        if(k>0.05) kinks.push({arm,s:Math.round(i*F.RS),k:Math.round(k*1000)/1000});
      }
    }
    for(const arm of ['sun','moss']){
      const F=FRAMES[arm];
      const lo=arm==='moss'?Math.max(0,S_COMMIT.moss-40):0;
      const hi=arm==='moss'?Math.min(F.len,S_MERGE.moss+40):F.len;
      for(let i=Math.floor(lo/F.RS)+1;i<Math.floor(hi/F.RS);i++){
        const gp=Math.abs(F.y[i]-F.y[i-1])/F.RS*100;
        if(gp>6.0) worstG.push({arm,s:Math.round(i*F.RS),g:Math.round(toGlobal(arm,i*F.RS)),pct:Math.round(gp*100)/100});
      }
      for(let s2=lo;s2<hi;s2+=5){
        const fr=getFrame(F,s2);
        for(const sd of [-1,1]){
          const eu=sd*(RH+0.03);
          const gy=groundY(fr.x+fr.lx*eu,fr.z+fr.lz*eu);
          const edgeY=fr.y+CROWN*(1-(Math.abs(eu)/RH)*(Math.abs(eu)/RH));
          if(gy>edgeY+0.02) worstA.push({arm,s:Math.round(s2),d:Math.round((gy-edgeY)*100)/100});
          const ox=fr.x+fr.lx*sd*(RH+1.3), oz=fr.z+fr.lz*sd*(RH+1.3);
          const fl=(Math.abs(toGlobal(arm,s2)-BECK_XG)>34)?(edgeY-groundY(ox,oz)):0;
          if(fl>1.2){ const ri=routeInfo(ox,oz);
            worstF.push({arm,s:Math.round(s2),d:Math.round(fl*100)/100,rArm:ri.arm,
              dA:[Math.round(ri.dA[0]*10)/10,Math.round(ri.dA[1]*10)/10],
              dy:Math.round((fr.y-ri.y)*100)/100}); }
        }
      }
    }
    let inRun=false;
    for(const pt of STREAM){
      const ri=routeInfo(pt.x,pt.z);
      const near=ri.d<RH+1.5;
      if(near&&!inRun) cross.push({x:Math.round(pt.x),z:Math.round(pt.z),arm:ri.arm,
        sSun:Math.round(nearestS(FRAMES.sun,pt.x,pt.z)),sMoss:Math.round(nearestS(FRAMES.moss,pt.x,pt.z)),
        bridge:Math.round(BRIDGE_G.sLocal)});
      inRun=near;
    }
    const prof=[];
    for(let g=0;g<L_TOTAL;g+=60) prof.push(Math.round(spineY(g)*10)/10);
    return { worstGrade:worstG.slice(0,14), worstFloat:worstF.slice(0,8), worstAbove:worstA.slice(0,8),
      beckCross:cross, beckX:Math.round(BECK_XG), profile:prof,
      kinks:kinks.slice(0,10), kinkCount:kinks.length,
      commit:[Math.round(S_COMMIT.sun),Math.round(S_COMMIT.moss)],
      merge:[Math.round(S_MERGE.sun),Math.round(S_MERGE.moss)],
      frameLens:[Math.round(FRAMES.sun.len),Math.round(FRAMES.moss.len)], rollerAmps:ROLLER_STAT.amps.slice(0,30),
      rollerScale:Math.round(ELEVATION.rollerScale*1000)/1000,
      forkWindow:[Math.round(S_SPLIT),Math.round(S_MERGE_G)],
      chapterElev:CH.map(c=>({n:c.name.slice(0,10),y:Math.round(spineY(c.end*L_TOTAL)*10)/10})),
      elevRange:[Math.round(Math.min.apply(null,Array.from(ELEVATION.y))*10)/10,
                 Math.round(Math.max.apply(null,Array.from(ELEVATION.y))*10)/10],
      cols:COLS.map(c=>Math.round(c*100)/100),
      profileAt1000:COLS.map(c=>{const y=realizedCorridorY('sun',1000,c);return y===null?null:Math.round((y-realizedCorridorY('sun',1000,0))*1000)/1000;}),
      elevMaxGradePlanPct:Math.round(ELEVATION.maxG*10000)/100,
      planAscM:Math.round(ELEVATION.asc*10)/10, planDescM:Math.round(ELEVATION.desc*10)/10,
      planLen:Math.round(ELEVATION.n*EDS), frameLen:Math.round(FRAMES.sun.len),
      ascTarget:Math.round(ASC_TARGET*10)/10 };
  },
};

window.addEventListener('resize',()=>{
  camera.aspect=window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth,window.innerHeight);
});
