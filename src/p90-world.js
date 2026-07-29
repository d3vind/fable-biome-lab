// ============================================================
// SKY AND CLOUDS
// ============================================================
{
  const m=new THREE.ShaderMaterial({
    uniforms:{ uSunN:{value:sunDir.clone().normalize()}, uWet:WL.uWet },
    side:THREE.BackSide, depthWrite:false, fog:false,
    vertexShader:`varying vec3 vW; void main(){ vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz;
      gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader:`uniform vec3 uSunN; uniform float uWet; varying vec3 vW;
    void main(){
      vec3 d=normalize(vW-cameraPosition);
      float e=max(d.y,-0.05);
      vec3 zen=vec3(0.196,0.560,0.855);
      vec3 mid=vec3(0.369,0.761,0.910);
      vec3 hor=vec3(0.859,0.906,0.815);          // warm pale-green horizon air
      vec3 c=mix(hor,mid,smoothstep(0.0,0.15,e));
      c=mix(c,zen,smoothstep(0.13,0.58,e));
      // The dome covers a third of the frame, so what it costs per pixel matters.
      // Both sun terms are functions of the ANGLE to the sun, and the angle was
      // being recovered with an inverse cosine on every sky pixel purely to be
      // squared again. Near the sun — the only place either term is non-zero —
      // the squared angle is two times one minus the cosine, so the dot product
      // serves directly and the acos goes.
      float cs=dot(d,uSunN);
      float sd2=2.0*(1.0-cs);
      c+=vec3(1.0,0.95,0.80)*exp(-sd2*34.0)*0.40;
      c+=vec3(1.0,0.98,0.90)*smoothstep(0.0023,0.00012,sd2)*0.80;
      c=mix(c,mix(c,vec3(0.80,0.85,0.86),0.34),uWet);   // the shower cools the sky a little
      gl_FragColor=vec4(c,1.0);
    }`,
  });
  const dome=new THREE.Mesh(new THREE.SphereGeometry(5800,32,16),m);
  dome.frustumCulled=false;
  dome.onBeforeRender=(r,s,cam)=>{ dome.position.copy(cam.position); dome.updateMatrixWorld(); };
  scene.add(dome);
}
const cloudForms=[];
{
  // ============================================================
  // THE SKY — accumulated puffs, softly shaded
  // The Vale's clouds were soft for a reason worth copying: they are built from
  // many small rounded puffs, and a small puff at half a kilometre subtends too
  // little of the view for its facets to register. A coarse surface stretched
  // over the whole formation cannot do that — its triangles are ten metres
  // across and its ridges read as a mountain range hung in the air.
  // So: puffs again, but shaded from the smooth normal of each puff rather than
  // per facet, which is what turns a heap of beads into an accumulated mass.
  // Formations, their positions and their lobes stay exactly as planned; only
  // how finely each puff is tessellated depends on quality.
  // ============================================================
  const cloudMat=new THREE.MeshBasicMaterial({vertexColors:true,fog:false});
  const LIT  =col(0xFFFFFA);
  const CREAM=mixc(PAL.cloud,0xFFF4E2,0.34);
  const COOL =mixc(PAL.cloud,PAL.sky,0.26).lerp(col(0xffffff),0.20);
  const BASE =mixc(PAL.sky,0xffffff,0.46).lerp(col(PAL.woodDeep),0.13);
  const DET=QUALITY==='low'?0:(QUALITY==='high'?2:1);
  const sunXZc=new THREE.Vector2(sunDir.x,sunDir.z).normalize();
  const _cn=[];
  function puff(B,cx,cy,cz,rx,ry,rz,st,tone,rough){
    const D=ICOD[clamp(DET,0,2)];
    const N=D.n, jx=new Float32Array(N);
    const p1=st.r(0,TAU), p2=st.r(0,TAU);
    // The icosphere is non-indexed, so one corner of the hull occupies five or
    // six array slots. A jitter drawn from the stream per slot pulls those copies
    // apart and opens the puff along its own edges; at cloud scale each crack is
    // metres of sky through the middle of a cloud. Keyed to direction instead,
    // every copy of a corner lands on the same point.
    const p3=st.r(0,1000);
    const jitAt=(x,y,z)=>{ const s=Math.sin(x*12.9898+y*78.233+z*37.719+p3)*43758.5453; return s-Math.floor(s); };
    for(let i=0;i<N;i++){
      const x=D.p.getX(i), y=D.p.getY(i), z=D.p.getZ(i);
      const th=Math.atan2(z,x);
      jx[i]=1+rough*(Math.sin(th*2+y*1.9+p1)*0.62+Math.sin(th*3+p2)*0.30+(jitAt(x,y,z)-0.5)*0.5);
    }
    const V=[], C=[];
    for(let i=0;i<N;i++){
      const x=D.p.getX(i), y=D.p.getY(i), z=D.p.getZ(i), j=jx[i];
      const yy=y<0?y*0.38:y;                       // the flat shadowed base
      let nx=x/rx, ny=yy/ry, nz=z/rz;
      const nl=Math.hypot(nx,ny,nz)||1; nx/=nl; ny/=nl; nz/=nl;
      V.push([cx+x*rx*j, cy+yy*ry*j, cz+z*rz*j]);
      _cn[i]=[nx,ny,nz];
      // upward planes take the light, shoulders cool, the underside settles
      const up=clamp(ny*0.5+0.5,0,1);
      const face=clamp(0.5+0.5*(nx*sunXZc.x+nz*sunXZc.y),0,1);
      let c=COOL.clone().lerp(CREAM,clamp((up-0.42)/0.40,0,1));
      c.lerp(LIT,clamp((up-0.60)/0.40,0,1)*(0.68+0.26*face));
      c.lerp(BASE,clamp((0.44-up)/0.42,0,1)*0.78);
      C.push(c.multiplyScalar(tone));
    }
    for(let i=0;i<D.idx.length;i+=3){
      const ia=D.idx[i], ib=D.idx[i+1], ic=D.idx[i+2];
      pushTri3(B,V[ia],V[ib],V[ic],C[ia],C[ib],C[ic],_cn[ia],_cn[ib],_cn[ic]);
    }
  }
  let puffCount=0;
  for(const C of CLOUD_PLAN){
    const st=subStream('cloudform',C.seed);
    const B=Buf(); B.sway=0;
    const vScale=0.86+C.lift/150;
    for(let li=0;li<C.lobes.length;li++){
      const l=C.lobes[li];
      const isRaft=(li===0);
      // each planned lobe becomes a small cluster of overlapping puffs, so the
      // silhouette is scalloped rather than a row of spheres
      const n=isRaft?st.i(4,6):st.i(2,4);
      for(let k=0;k<n;k++){
        const rr=l.r*(isRaft?st.r(0.42,0.60):st.r(0.44,0.68));
        const ox=st.r(-1,1)*l.r*(isRaft?0.72:0.46);
        const oz=st.r(-1,1)*l.r*(isRaft?0.42:0.34);
        const oy=(l.dy*l.r+(isRaft?st.r(0,0.10):st.r(0,0.34)*l.r))*vScale;
        puff(B,l.x+ox,oy+rr*vScale*st.r(0.18,0.42),l.z+oz,
             rr, rr*vScale*st.r(0.62,0.86), rr*st.r(0.86,1.10),
             st, C.val, 0.17);
        puffCount++;
      }
    }
    const mesh=new THREE.Mesh(bufGeo(B),cloudMat);
    mesh.rotation.y=C.rot;
    mesh.position.set(C.x,C.baseY,C.z);
    mesh.updateMatrix(); mesh.matrixAutoUpdate=false;
    scene.add(mesh);
    cloudForms.push({mesh,home:new THREE.Vector3(C.x,C.baseY,C.z),band:C.band,rot:C.rot});
  }
  H.real.feed('sky',cloudForms.length,puffCount,DET);
}

// ============================================================
// WATER — the beck, the ford, and the Glasswater pool
// Stylised procedural shading: depth bands, flow streaks, and drifting
// canopy fragments that move with the same wind as the trees. Not a mirror.
// ============================================================
// ============================================================
// WATER — an original lightweight treatment. Two scrolling wave layers,
// analytic normals from their derivatives, a shallow-to-deep ramp, a faked
// sky tint at grazing angles, restrained sun glints, and darker canopy
// fragments where trees hang over. No reflection camera, no extra pass,
// no ray marching: this is a pond, not an ocean.
// ============================================================
const waterMat=new THREE.ShaderMaterial({
  uniforms:{ uWTime:WL.uWTime, uWet:WL.uWet, uFogC:{value:new THREE.Color(AIR)},
             uFogN:{value:330}, uFogF:{value:QCFG.tileView*1.12},
             uSun:{value:sunDir.clone()}, uSkyLo:{value:new THREE.Color(0xAFCBDA)},
             uSkyHi:{value:mixc(PAL.sky,0xffffff,0.06)},
             uOct:{value:QUALITY==='low'?1:2} },
  vertexShader:`attribute float aT; attribute float aEdge; attribute float aCan;
    varying float vT; varying float vE; varying float vC; varying vec3 vW;
    void main(){ vT=aT; vE=aEdge; vC=aCan; vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz;
      gl_Position=projectionMatrix*viewMatrix*wp; }`,
  fragmentShader:`uniform float uWTime; uniform float uWet; uniform vec3 uFogC;
    uniform float uFogN; uniform float uFogF; uniform vec3 uSun;
    uniform vec3 uSkyLo; uniform vec3 uSkyHi; uniform int uOct;
    varying float vT; varying float vE; varying float vC; varying vec3 vW;
    float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float n2(vec2 p){ vec2 i=floor(p),f=fract(p); vec2 u=f*f*(3.0-2.0*f);
      return mix(mix(h2(i),h2(i+vec2(1,0)),u.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),u.x),u.y); }
    // one wave layer and its slope, from finite differences of the same field
    vec3 wave(vec2 p,float amp){
      float e=0.35;
      float c=n2(p), dx=n2(p+vec2(e,0.0))-c, dz=n2(p+vec2(0.0,e))-c;
      return vec3(c*amp, dx*amp/e, dz*amp/e);
    }
    void main(){
      vec2 w1=vW.xz*0.42+vec2(uWTime*0.16,uWTime*0.10);
      vec2 w2=vW.xz*1.05+vec2(-uWTime*0.11,uWTime*0.19);
      vec3 a=wave(w1,1.0);
      vec3 b=(uOct>1)?wave(w2,0.45):vec3(0.0);
      vec3 nrm=normalize(vec3(-(a.y+b.y)*0.24,1.0,-(a.z+b.z)*0.24));

      float depth=clamp(1.0-abs(vE),0.0,1.0);
      vec3 shallow=vec3(0.40,0.66,0.60);
      vec3 mid=vec3(0.115,0.365,0.415);
      vec3 deep=vec3(0.030,0.135,0.170);
      vec3 body=mix(shallow,mix(mid,deep,depth),0.16+0.80*depth);

      vec3 vd=normalize(vW-cameraPosition);
      // a faked sky: the palette's own gradient, tilted by the wave normal
      float up=clamp(reflect(vd,nrm).y,0.0,1.0);
      vec3 skyc=mix(uSkyLo,uSkyHi,up);
      float fres=pow(1.0-clamp(dot(-vd,nrm),0.0,1.0),4.0);
      // the sky is borrowed, never allowed to take the water over: a pond that
      // is mostly sky is a mirror, and this one is meant to have depth in it
      vec3 c=mix(body,skyc,clamp(0.07+fres*0.58,0.0,0.52));

      // canopy hanging over the water, drifting with the same wind as the trees
      float cf=n2(vec2(vW.x*0.11+uWTime*0.042, vW.z*0.11-uWTime*0.030));
      float cf2=n2(vec2(vW.x*0.29-uWTime*0.019, vW.z*0.29+uWTime*0.026));
      float frag=smoothstep(0.55,0.80,cf*0.66+cf2*0.34)*vC;
      c=mix(c,vec3(0.085,0.215,0.185),frag*0.70);

      // restrained specular: a few bright points, not a glitter field
      vec3 hv=normalize(normalize(uSun)-vd);
      float spec=pow(max(dot(nrm,hv),0.0),110.0);
      c+=vec3(1.0,0.96,0.86)*spec*0.55;
      float glint=smoothstep(0.72,0.95,(a.x+b.x))*pow(max(dot(nrm,hv),0.0),18.0);
      c+=vec3(1.0,0.97,0.88)*glint*0.22;

      // the shoreline dissolves into its own bank instead of ending on a line
      float shore=smoothstep(0.80,0.99,abs(vE));
      c=mix(c,mix(c,vec3(0.36,0.42,0.30),0.55),shore);
      c+=vec3(0.10,0.11,0.11)*uWet*0.35;

      float fd=length(vW-cameraPosition);
      c=mix(c,uFogC,smoothstep(uFogN,uFogF,fd));
      gl_FragColor=vec4(c,mix(1.0,0.90,shore));
    }`,
  // A pond fan built centre-outwards winds face-down, so the surface was being
  // backface-culled from the one place it matters: the road above it. Water is
  // a sheet, not a solid — it is drawn from whichever side you are standing on.
  transparent:true, depthWrite:true, side:THREE.DoubleSide,
});
const waterCounts={features:0};
const WATER_MESHES=[];
function waterFan(cx,cz,rx,rz,rot,y,can,name){
  const P=[],T=[],E=[],C=[],IDX=[];
  const n=26, rings=[0.0,0.55,0.86,1.0];
  const st=subStream('pondrim',Math.round(cx),Math.round(cz));
  const wob=[]; for(let i=0;i<=n;i++) wob.push(1+st.r(-0.10,0.10));
  P.push(cx,y,cz); T.push(0); E.push(0); C.push(can);
  for(let r=1;r<rings.length;r++){
    for(let i=0;i<=n;i++){
      const a=i/n*TAU, k=rings[r]*wob[i%n];
      const dx=Math.cos(a)*rx*k, dz=Math.sin(a)*rz*k;
      P.push(cx+dx*Math.cos(rot)-dz*Math.sin(rot),y,cz+dx*Math.sin(rot)+dz*Math.cos(rot));
      T.push(i*0.7+r*3.1); E.push(rings[r]); C.push(can);
    }
  }
  const row=(r)=>1+(r-1)*(n+1);
  for(let i=0;i<n;i++) IDX.push(0,row(1)+i,row(1)+i+1);
  for(let r=1;r<rings.length-1;r++) for(let i=0;i<n;i++){
    const a0=row(r)+i, a1=a0+1, b0=row(r+1)+i, b1=b0+1;
    IDX.push(a0,b0,a1, a1,b0,b1);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));
  g.setAttribute('aT',new THREE.Float32BufferAttribute(T,1));
  g.setAttribute('aEdge',new THREE.Float32BufferAttribute(E,1));
  g.setAttribute('aCan',new THREE.Float32BufferAttribute(C,1));
  g.setIndex(IDX);
  const m=new THREE.Mesh(g,waterMat); m.matrixAutoUpdate=false;
  m.userData.pond=name;
  scene.add(m); waterCounts.features++; WATER_MESHES.push(m);
  return m;
}
{
  const P=[],T=[],E=[],C=[],IDX=[];
  for(let i=0;i<STREAM.length;i++){
    const p=STREAM[i], q=STREAM[Math.min(i+1,STREAM.length-1)];
    let tx=q.x-p.x, tz=q.z-p.z; const L=Math.hypot(tx,tz)||1; tx/=L; tz/=L;
    const w=1.0+0.9*fbmL(p.x/40,p.z/40);
    const can=clamp(enclosureAt(toGlobal('moss',nearestS(FRAMES.moss,p.x,p.z)),'moss'),0,1);
    P.push(p.x-tz*w,p.y+0.06,p.z+tx*w, p.x+tz*w,p.y+0.06,p.z-tx*w);
    T.push(i*0.5,i*0.5); E.push(-1,1); C.push(can,can);
  }
  for(let i=0;i<STREAM.length-1;i++){ const a=i*2; IDX.push(a,a+2,a+1, a+1,a+2,a+3); }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));
  g.setAttribute('aT',new THREE.Float32BufferAttribute(T,1));
  g.setAttribute('aEdge',new THREE.Float32BufferAttribute(E,1));
  g.setAttribute('aCan',new THREE.Float32BufferAttribute(C,1));
  g.setIndex(IDX);
  const m=new THREE.Mesh(g,waterMat); m.matrixAutoUpdate=false;
  scene.add(m); waterCounts.features++;
}
// both pools: the bright shelf, and the dark one under the Mosswater trees
waterFan(POOL.cx,POOL.cz,POOL.rx,POOL.rz,POOL.rot,POOL.y,0.55,'glasswater');
waterFan(MOSSPOOL.cx,MOSSPOOL.cz,MOSSPOOL.rx,MOSSPOOL.rz,MOSSPOOL.rot,MOSSPOOL.y,0.95,'mosswater');

// ============================================================
// LANDSCAPE ARCHITECTURE — three restrained pieces, all of them
// explaining how this land is crossed and used. Nothing decorative.
// ============================================================
{
  const B=Buf(); B.sway=0;
  const STONE=mixc(PAL.road,PAL.bark,0.22), STONE_SH=mixc(PAL.road,PAL.woodDeep,0.42),
        STONE_MOSS=mixc(PAL.road,PAL.leafShade,0.50);
  function block(cx,cy,cz,w,h,d,yaw,mossy){
    const ca=Math.cos(yaw),sa=Math.sin(yaw);
    const cor=(dx,dz)=>[cx+dx*ca-dz*sa,cz+dx*sa+dz*ca];
    const c0=cor(-w/2,-d/2),c1=cor(w/2,-d/2),c2=cor(w/2,d/2),c3=cor(-w/2,d/2);
    const b=(p)=>[p[0],cy,p[1]], t=(p)=>[p[0],cy+h,p[1]];
    const cTop=mossy?STONE_MOSS:STONE, cSide=mossy?mixc(PAL.leafShade,PAL.woodDeep,0.38):STONE_SH;
    // Every face of this box was wound the wrong way round. `pushTri` takes the
    // normal from cross(b-a,c-a), and with the corners walked bottom-then-top
    // that cross product points INTO the block on all five faces — the stone was
    // inside-out. Front-face culling then discarded the near wall and left the
    // rider looking at the inside of the far one, lit by a normal aimed away from
    // the sun. Three hundred and fifty-four of the five hundred and ninety
    // triangles at the bridge had N-dot-L below zero, and the parapet rendered at
    // a luminance of 28 against 87 for the grass beside it and 121 for the road.
    // That is the black angular cut along the shoulder at the beck crossing.
    // Walking each face top-then-bottom turns both the winding and the normal
    // outward, and the blocks read as stone with a lit top and shaded sides.
    pushQuad(B,t(c0),t(c1),b(c1),b(c0),cSide);
    pushQuad(B,t(c1),t(c2),b(c2),b(c1),STONE);
    pushQuad(B,t(c2),t(c3),b(c3),b(c2),cSide);
    pushQuad(B,t(c3),t(c0),b(c0),b(c3),STONE);
    pushQuad(B,t(c0),t(c1),t(c2),t(c3),cTop);
  }
  function wallRun(F,s0,s1,lat,mossy,st){
    for(let s=s0;s<s1;s+=st.r(0.85,1.3)){
      const fr=getFrame(F,clamp(s,0,F.len-1));
      const x=fr.x+fr.lx*lat, z=fr.z+fr.lz*lat;
      const y=Math.max(groundY(x,z),fr.y-0.55)-0.18;
      const rows=st.i(2,3);
      for(let r=0;r<rows;r++)
        block(x+st.r(-0.05,0.05),y+r*0.30,z+st.r(-0.05,0.05),st.r(0.7,1.05),0.29,st.r(0.35,0.5),
          Math.atan2(fr.tx,fr.tz)+st.r(-0.05,0.05),mossy&&st.chance(0.55));
    }
  }
  // 1) the low bridge where the rejoined road crosses the beck
  if(BRIDGE_G.dist<26){
    const st=subStream('bridge',0);
    for(const side of [-1,1]){
      wallRun(FRAMES.sun,BRIDGE_G.sLocal-6,BRIDGE_G.sLocal+6,side*(RH+0.5),true,st);
      for(const ds of [-8,8]){
        const fr=getFrame(FRAMES.sun,BRIDGE_G.sLocal+ds);
        const x=fr.x+fr.lx*side*(RH+0.9), z=fr.z+fr.lz*side*(RH+0.9);
        block(x,Math.max(groundY(x,z),fr.y-0.8)-0.4,z,1.3,0.72,1.0,Math.atan2(fr.tx,fr.tz),true);
      }
    }
  }
  // 2) a few worn stones at the Mosswater pool's edge, where feet have been
  {
    const st=subStream('mosspool',0);
    for(let i=0;i<5;i++){
      const a=st.r(0,TAU);
      const x=MOSSPOOL.cx+Math.cos(a)*MOSSPOOL.rx*1.12, z=MOSSPOOL.cz+Math.sin(a)*MOSSPOOL.rz*1.12;
      if(routeInfo(x,z).d<EXCL) continue;
      block(x,groundY(x,z)-0.1,z,st.r(0.55,0.95),0.24,st.r(0.45,0.8),st.r(0,TAU),true);
    }
  }
  // 3) one dry-stone field boundary along the Sunpath ridge
  {
    const st=subStream('fieldwall',0);
    const s=toLocal('sun',WALL_G);
    wallRun(FRAMES.sun,s-24,s+24,FORK_SIDE*(RH+st.r(2.2,3.4)),false,st);
  }
  const m=new THREE.Mesh(bufGeo(B),groundedMat(new THREE.MeshLambertMaterial({vertexColors:true}),{wet:true}));
  m.castShadow=(QCFG.shadow>0); m.receiveShadow=(QCFG.shadow>0); m.matrixAutoUpdate=false;
  scene.add(m);
}

// ============================================================
// AMBIENT LIFE — pooled, bounded, scheduled by route distance
// ============================================================
function lifeMesh(geo,n,mat){
  const im=new THREE.InstancedMesh(geo,mat,n);
  im.frustumCulled=false;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const M=new THREE.Matrix4();
  M.makeScale(0,0,0);
  for(let i=0;i<n;i++) im.setMatrixAt(i,M);
  im.instanceMatrix.needsUpdate=true;
  scene.add(im);
  return im;
}
const lifeMatDark=new THREE.MeshBasicMaterial({color:mixc(PAL.woodDeep,PAL.bark,0.24),fog:true});
const lifeMatWing=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,fog:true});
const lifeMatFur=new THREE.MeshLambertMaterial({vertexColors:true,fog:true});
const birdGeo=(()=>{ const B=Buf(); B.sway=0; const c=mixc(PAL.woodDeep,PAL.bark,0.22);
  pushTri(B,[0,0,0.42],[-1.15,0.16,0],[0,0,-0.42],c);
  pushTri(B,[0,0,0.42],[0,0,-0.42],[1.15,0.16,0],c); return bufGeo(B); })();
const flitGeo=(()=>{ const B=Buf(); B.sway=0; const c=col(0xffffff);
  pushTri(B,[0,0,-0.075],[0.14,0.02,0.02],[0,0,0.075],c);
  pushTri(B,[0,0,-0.075],[0,0,0.075],[-0.14,0.02,0.02],c); return bufGeo(B); })();
const animalGeo=(()=>{
  const B=Buf(); B.sway=0;
  const body=mixc(PAL.bark,PAL.road,0.30), belly=mixc(PAL.road,PAL.bark,0.30);
  addBlobTo(B,0,0.34,0,0.30,0.26,0.52,body,belly);
  addBlobTo(B,0,0.56,0.40,0.16,0.16,0.17,body,belly);
  addBlobTo(B,0.0,0.72,0.44,0.05,0.13,0.04,body,belly);
  return bufGeo(B);
})();
// A squirrel is only about a quarter of a metre of body, which is a handful of
// pixels at any honest distance. What makes one legible is not the body but the
// tail: a big curled plume held up behind the back, wider than the animal. So the
// tail gets the geometry budget and the body is barely more than a suggestion.
const squirrelGeo=(()=>{
  const B=Buf(); B.sway=0;
  const fur=mixc(PAL.bark,0xC96A32,0.42), light=mixc(PAL.bark,PAL.road,0.44);
  addBlobTo(B,0,0.15,0,0.085,0.10,0.15,fur,light);        // body, hunched
  addBlobTo(B,0,0.27,0.10,0.062,0.062,0.058,fur,light);   // head
  addBlobTo(B,0.035,0.33,0.115,0.020,0.032,0.012,fur,fur);// ears
  addBlobTo(B,-0.035,0.33,0.115,0.020,0.032,0.012,fur,fur);
  // the plume: three masses sweeping up and back over the spine
  addBlobTo(B,0,0.17,-0.13,0.070,0.090,0.075,light,fur);
  addBlobTo(B,0,0.29,-0.17,0.080,0.105,0.070,light,fur);
  addBlobTo(B,0,0.41,-0.14,0.065,0.085,0.055,light,fur);
  return bufGeo(B);
})();
function addBlobTo(B,x,y,z,rx,ry,rz,cTop,cBot){
  const D=ICOD[0];
  for(let i=0;i<D.idx.length;i+=3){
    const v=[D.idx[i],D.idx[i+1],D.idx[i+2]].map(k=>[x+D.p.getX(k)*rx,y+D.p.getY(k)*ry,z+D.p.getZ(k)*rz,D.p.getY(k)]);
    const ym=(v[0][3]+v[1][3]+v[2][3])/3;
    pushTri(B,[v[0][0],v[0][1],v[0][2]],[v[1][0],v[1][1],v[1][2]],[v[2][0],v[2][1],v[2][2]],
      cBot.clone().lerp(cTop,clamp(0.5+0.5*ym,0,1)));
  }
}
const POOLS={
  bird:{im:lifeMesh(birdGeo,34,lifeMatDark),n:34,slots:[]},
  flit:{im:lifeMesh(flitGeo,40,lifeMatWing),n:40,slots:[]},
  animal:{im:lifeMesh(animalGeo,5,lifeMatFur),n:5,slots:[]},
  critter:{im:lifeMesh(squirrelGeo,3,lifeMatFur),n:3,slots:[]},
};
{
  // per-instance tint for the butterflies
  const N=POOLS.flit.n, tint=new Float32Array(N*3);
  const tones=[col(PAL.blossom),mixc(PAL.road,0xffffff,0.5),mixc(PAL.blossom,0xFFDE79,0.45),mixc(PAL.sky,0xffffff,0.55)];
  for(let i=0;i<N;i++){ const t=tones[i%tones.length]; tint[i*3]=t.r; tint[i*3+1]=t.g; tint[i*3+2]=t.b; }
  POOLS.flit.im.instanceColor=new THREE.InstancedBufferAttribute(tint,3);
  for(const k of Object.keys(POOLS)) for(let i=0;i<POOLS[k].n;i++) POOLS[k].slots.push({busy:false});
}
const liveLife=[];
let lifeFired=0;
const _lm=new THREE.Matrix4(), _lq=new THREE.Quaternion(), _le=new THREE.Euler(), _lv=new THREE.Vector3(), _ls=new THREE.Vector3();
function takeSlot(kind,n){
  const P=POOLS[kind], out=[];
  for(let i=0;i<P.n&&out.length<n;i++) if(!P.slots[i].busy){ P.slots[i].busy=true; out.push(i); }
  return out;
}
// A life effect either holds pool slots or it holds nothing at all (a glint is
// a uniform, a mote burst is a shader boost). Release must be safe for both,
// and safe to call twice.
function releaseLife(L){
  if(!L||L.released) return;
  L.released=true;
  const P=L.kind?POOLS[L.kind]:null;
  if(!P||!L.idx||!L.idx.length) return;
  for(const i of L.idx){
    if(P.slots[i]) P.slots[i].busy=false;
    _lm.makeScale(0,0,0); P.im.setMatrixAt(i,_lm);
  }
  P.im.instanceMatrix.needsUpdate=true;
}
function clearAllLife(){
  for(const L of liveLife.slice()) releaseLife(L);
  liveLife.length=0;
  // nothing may stay parked in a pool after a clear, whatever went wrong
  for(const k of Object.keys(POOLS)){
    const P=POOLS[k];
    for(let i=0;i<P.n;i++){ P.slots[i].busy=false; _lm.makeScale(0,0,0); P.im.setMatrixAt(i,_lm); }
    P.im.instanceMatrix.needsUpdate=true;
  }
  WL.uGlint.value.set(0,0,0,0);
  moteBoost=0;
}
function spawnLife(ev,frame,gNow){
  const st=subStream('lifespawn',ev.id);
  const fx=frame.x, fz=frame.z, fy=frame.y;
  const lx=frame.lx, lz=frame.lz, tx=frame.tx, tz=frame.tz;
  const mk=(kind,n,make)=>{
    const idx=takeSlot(kind,n); if(!idx.length) return;
    const L={kind,idx,t:0,dur:ev.dur,ev,released:false,parts:idx.map((_,i)=>make(i,st))};
    liveLife.push(L);
  };
  if(ev.kind==='swallows'){
    mk('bird',st.i(3,5),(i,s)=>{
      const ahead=s.r(34,70), side=ev.side;
      const h=s.r(5,11);
      return {x:fx+tx*ahead+lx*side*s.r(26,48), y:fy+h, z:fz+tz*ahead+lz*side*s.r(26,48),
        vx:-lx*side*s.r(11,17)+tx*s.r(-2,4), vy:s.r(-0.5,0.9), vz:-lz*side*s.r(11,17)+tz*s.r(-2,4),
        sc:s.r(0.45,0.7), ph:s.r(0,TAU), bob:s.r(1.5,3.2)};
    });
  } else if(ev.kind==='flock'){
    mk('bird',st.i(11,16),(i,s)=>{
      const a=s.r(0,TAU), rr=s.r(10,52), ahead=s.r(150,330);
      const bx=fx+tx*ahead+lx*ev.side*s.r(40,150)+Math.cos(a)*rr;
      const bz=fz+tz*ahead+lz*ev.side*s.r(40,150)+Math.sin(a)*rr;
      return {x:bx,y:groundY(bx,bz)+s.r(0.4,2.5),z:bz,
        vx:s.r(-4,4)+tx*s.r(2,7), vy:s.r(2.6,4.6), vz:s.r(-4,4)+tz*s.r(2,7),
        sc:s.r(0.75,1.15), ph:s.r(0,TAU), bob:s.r(1,2.4), rise:true};
    });
  } else if(ev.kind==='butterflies'||ev.kind==='dragonflies'){
    const water=(ev.kind==='dragonflies');
    mk('flit',st.i(7,13),(i,s)=>{
      let cx,cz;
      const P=ev.atPool?PONDS.find(q=>q.name===ev.atPool):null;
      if(P){ cx=P.cx+s.r(-P.rx*0.9,P.rx*0.9); cz=P.cz+s.r(-P.rz*0.9,P.rz*0.9); }
      else if(water){ const p=STREAM[Math.floor(s.f()*STREAM.length)]; cx=p.x+s.r(-4,4); cz=p.z+s.r(-4,4); }
      else { const ahead=s.r(8,44), off=ev.side*s.r(RH+2.5,ev.radius||24);
             cx=fx+tx*ahead+lx*off; cz=fz+tz*ahead+lz*off; }
      const gy=P?P.y:groundY(cx,cz);
      return {ax:cx,az:cz,ay:gy+s.r(0.5,water?1.4:2.0),span:s.r(1.4,water?3.2:5.0),
        ph:s.r(0,TAU),sp:s.r(0.5,1.3),sc:s.r(0.85,1.5),water};
    });
  } else if(ev.kind==='rabbit'){
    // There has always been a rabbit here. It was never seen. It spawned thirty
    // to forty-five metres out at half scale and bolted directly away at up to
    // four metres a second, fading inside three — a few pixels, moving away,
    // gone before the rider closed. It now does what a rabbit actually does:
    // sits close to the verge and freezes, lets itself be seen, and only then
    // hops away, unhurried.
    mk('animal',1,(i,s)=>{
      const ahead=s.r(13,24), off=ev.side*s.r(RH+1.5,RH+3.8);
      const x=fx+tx*ahead+lx*off, z=fz+tz*ahead+lz*off;
      return {x,y:groundY(x,z),z,vx:lx*ev.side*s.r(1.5,2.5)+tx*s.r(0.4,1.4),vy:0,
        vz:lz*ev.side*s.r(1.5,2.5)+tz*s.r(0.4,1.4),sc:s.r(0.74,0.94),hop:s.r(4,6.5),
        ph:s.r(0,TAU),fade:s.r(5.0,7.0),wait:s.r(1.3,2.3)};
    });
  } else if(ev.kind==='squirrel'){
    // On a trunk, not on the ground. It takes the tree the renderer actually
    // built — trunkTopY is only set by buildTree — so the squirrel is never
    // clinging to a tree that was culled, demoted, or never realised.
    const cands=[];
    const bi=Math.floor(gNow/BAND);
    for(let b=bi-1;b<=bi+1;b++){
      const arr=bandTrees[b]; if(!arr) continue;
      for(const t of arr){
        if(t.unseatable||t.trunkTopY===undefined) continue;
        const dx=t.x-fx, dz=t.z-fz;
        const ahead=dx*tx+dz*tz, lat=dx*lx+dz*lz;
        if(ahead<14||ahead>52) continue;
        if(Math.abs(lat)<RH+2.2||Math.abs(lat)>17) continue;
        if(t.trunkTopY-t.y<4) continue;
        cands.push({t,ahead,lat});
      }
    }
    if(cands.length){
      cands.sort((a,b)=>a.ahead-b.ahead);
      const pick=cands[st.i(0,Math.min(2,cands.length-1))];
      const T=pick.t, side=Math.sign(pick.lat)||1;
      mk('critter',1,(i,s)=>{
        // clinging to the road-facing side of the trunk, part way up
        const up=s.r(0.42,0.68);
        const sc=s.r(1.5,2.0);
        const y0=T.y+(T.trunkTopY-T.y)*up;
        // The trunk tapers, so the bark is not where the root radius says it is.
        // Sit half a body clear of the local surface: touching it, not inside it.
        const r=lerp(T.trunkR0||0.3,T.trunkR1||0.12,up)+0.085*sc;
        return {x:T.x-lx*side*r,y:y0,z:T.z-lz*side*r,vx:0,vy:0,vz:0,
          sc,hop:0,ph:s.r(0,TAU),fade:s.r(5.5,8),
          cling:{x:T.x,z:T.z,r,side,base:y0,top:T.crownBaseY||T.trunkTopY,
                 lx,lz,climb:s.r(0.5,1.1),still:s.r(1.8,3.2)}};
      });
    }
  } else if(ev.kind==='deer'){
    mk('animal',1,(i,s)=>{
      const ahead=s.r(95,155), off=ev.side*s.r(28,62);
      const x=fx+tx*ahead+lx*off, z=fz+tz*ahead+lz*off;
      return {x,y:groundY(x,z),z,vx:lx*ev.side*s.r(0.8,1.6),vy:0,vz:lz*ev.side*s.r(0.8,1.6),
        sc:s.r(1.45,1.8),hop:0,ph:s.r(0,TAU),fade:s.r(4.5,7),wait:s.r(1.6,3.4)};
    });
  } else if(ev.kind==='glint'){
    liveLife.push({kind:null,idx:[],t:0,dur:ev.dur,ev,released:false,glint:{x:fx+tx*30,z:fz+tz*30,r:34}});
  } else if(ev.kind==='motes'){
    liveLife.push({kind:null,idx:[],t:0,dur:ev.dur,ev,released:false,motes:1});
  }
  lifeFired++;
}
let moteBoost=0;
function updateLife(dt){
  WL.uGlint.value.set(0,0,0,0);
  moteBoost=Math.max(0,moteBoost-dt*0.8);
  for(let i=liveLife.length-1;i>=0;i--){
    const L=liveLife[i];
    L.t+=dt;
    const fade=clamp(Math.min(L.t/1.2,(L.dur-L.t)/1.6),0,1);
    if(L.glint){
      const s=Math.sin(clamp(L.t/L.dur,0,1)*Math.PI);
      WL.uGlint.value.set(L.glint.x,L.glint.z,L.glint.r,s*0.85);
    }
    if(L.motes) moteBoost=Math.max(moteBoost,fade);
    if(L.kind){
      const im=POOLS[L.kind].im;
      for(let k=0;k<L.idx.length;k++){
        const p=L.parts[k], slot=L.idx[k];
        let sc=p.sc*fade;
        if(L.kind==='bird'){
          p.x+=p.vx*dt; p.z+=p.vz*dt;
          if(p.rise){ p.y+=p.vy*dt; p.vy=Math.max(0.6,p.vy-dt*0.35); }
          else p.y+=Math.sin(wTime*1.6+p.ph)*p.bob*dt;
          _le.set(0,Math.atan2(p.vx,p.vz),Math.sin(wTime*7+p.ph)*0.32);
          _lq.setFromEuler(_le); _lv.set(p.x,p.y,p.z); _ls.set(sc,sc,sc);
        } else if(L.kind==='flit'){
          const t=wTime*p.sp+p.ph;
          const x=p.ax+Math.sin(t)*p.span, z=p.az+Math.cos(t*0.77)*p.span;
          const y=p.ay+Math.sin(t*(p.water?2.6:1.7))*(p.water?0.22:0.55);
          _le.set(Math.sin(wTime*(p.water?26:13)+p.ph)*(p.water?0.25:0.95),Math.atan2(Math.cos(t),-Math.sin(t*0.77)),0);
          _lq.setFromEuler(_le); _lv.set(x,y,z); _ls.set(sc,sc,sc);
        } else if(p.cling){
          // A squirrel on a trunk: still for a moment with a tail-flick, then it
          // goes up. It never leaves the bark, so its height is driven along the
          // trunk rather than by velocity, and it faces out from the trunk.
          const C=p.cling;
          const climbT=Math.max(0,L.t-C.still);
          const y=Math.min(C.top,C.base+climbT*C.climb);
          const flick=Math.sin(wTime*7+p.ph)*0.05*(L.t<C.still?1:0.35);
          sc=p.sc*clamp(Math.min(L.t/0.5,(p.fade-L.t)/1.2),0,1);
          _le.set(0,Math.atan2(-C.lx*C.side,-C.lz*C.side)+flick,0);
          _lq.setFromEuler(_le);
          _lv.set(C.x-C.lx*C.side*C.r,y,C.z-C.lz*C.side*C.r); _ls.set(sc,sc,sc);
        } else {
          if(p.wait!==undefined&&L.t<p.wait){ /* it is standing, watching */ }
          else { p.x+=p.vx*dt; p.z+=p.vz*dt; }
          const gy=groundY(p.x,p.z);
          // frozen means frozen: the hop only starts once it actually moves
          const moving=(p.wait===undefined||L.t>=p.wait);
          const hop=(p.hop&&moving)?Math.abs(Math.sin(wTime*p.hop+p.ph))*0.22:0;
          sc=p.sc*clamp(Math.min(L.t/0.6,(p.fade-L.t)/1.1),0,1);
          _le.set(0,Math.atan2(p.vx,p.vz),0);
          _lq.setFromEuler(_le); _lv.set(p.x,gy+hop,p.z); _ls.set(sc,sc,sc);
        }
        if(sc<=0.0005) _lm.makeScale(0,0,0); else _lm.compose(_lv,_lq,_ls);
        im.setMatrixAt(slot,_lm);
      }
      im.instanceMatrix.needsUpdate=true;
    }
    if(L.t>=L.dur){ releaseLife(L); liveLife.splice(i,1); }
  }
}

// ============================================================
// AIRBORNE — pollen, drifting leaves, high seed motes, and the shower.
// Everything advects; nothing bounces.
// ============================================================
const partSystems=[];
function particleField(n,box,tint,size,opacity,kind){
  const N=Math.max(1,Math.round(n*QCFG.part));
  const base=new Float32Array(N*3), seed=new Float32Array(N);
  const st=subStream('particles',kind);
  for(let i=0;i<N;i++){
    base[i*3]=st.r(0,box.x); base[i*3+1]=st.r(0,box.y); base[i*3+2]=st.r(0,box.z);
    seed[i]=st.r(0,1);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(base,3));
  g.setAttribute('aSeed',new THREE.BufferAttribute(seed,1));
  const m=new THREE.ShaderMaterial({
    transparent:true, depthWrite:false,
    uniforms:{ uWTime:WL.uWTime, uCam:{value:new THREE.Vector3()}, uGround:{value:0},
      uBox:{value:new THREE.Vector3(box.x,box.y,box.z)}, uTint:{value:new THREE.Color(tint)},
      uSize:{value:size}, uOp:{value:opacity}, uBoost:{value:1}, uWind:{value:WL.uCloudMove.value} },
    vertexShader:`attribute float aSeed; uniform float uWTime; uniform vec3 uCam; uniform vec3 uBox;
      uniform float uGround; uniform float uSize; uniform vec2 uWind; varying float vA;
      void main(){
        vec3 p=position;
        float t=uWTime;
        ${kind===0?`p.x+=uWind.x*t*0.55+sin(t*0.35+aSeed*31.0)*2.4; p.z+=uWind.y*t*0.55+cos(t*0.29+aSeed*17.0)*2.4;
                    p.y+=sin(t*0.42+aSeed*44.0)*0.9+t*0.06;`:''}
        ${kind===1?`p.x+=uWind.x*t*1.35+sin(t*0.62+aSeed*23.0)*3.2; p.z+=uWind.y*t*1.35+cos(t*0.51+aSeed*13.0)*3.2;
                    p.y-=mod(t*0.62+aSeed*40.0,uBox.y);`:''}
        ${kind===2?`p.x+=uWind.x*t*0.9+sin(t*0.22+aSeed*29.0)*5.0; p.z+=uWind.y*t*0.9+cos(t*0.19+aSeed*37.0)*5.0;
                    p.y+=mod(t*0.30+aSeed*33.0,uBox.y)*0.6;`:''}
        vec3 anchor=vec3(uCam.x,uGround,uCam.z);
        vec3 w=mod(p-anchor+uBox*0.5,uBox)-uBox*0.5+anchor;
        ${kind===1?`w.y=anchor.y+mod(p.y,uBox.y);`:''}
        ${kind!==1?`w.y=anchor.y+mod(p.y,uBox.y);`:''}
        float d=distance(w,uCam);
        vA=(1.0-smoothstep(48.0,110.0,d))*smoothstep(1.6,6.0,d);
        vec4 mv=viewMatrix*vec4(w,1.0);
        gl_Position=projectionMatrix*mv;
        gl_PointSize=uSize*(150.0/max(1.0,-mv.z));
      }`,
    fragmentShader:`uniform vec3 uTint; uniform float uOp; uniform float uBoost; varying float vA;
      void main(){
        vec2 q=gl_PointCoord-0.5;
        float a=smoothstep(0.5,0.10,length(q))*uOp*vA*uBoost;
        if(a<0.008) discard;
        gl_FragColor=vec4(uTint,a);
      }`,
  });
  const pts=new THREE.Points(g,m);
  pts.frustumCulled=false;
  scene.add(pts);
  partSystems.push({m,kind,n:N});
  return m;
}
// Cut to roughly a quarter of what was here, and gated to the planned pockets
// by uBoost. A long stretch of this ride now has essentially nothing in the air,
// which is what makes the pockets read as something.
particleField(150,{x:150,y:5.5,z:150},0xF8EFCE,1.30,0.26,0);    // pollen close to the ground
particleField(70,{x:150,y:14,z:150},0xA9D273,2.0,0.30,1);       // leaves letting go
particleField(95,{x:170,y:22,z:170},0xF4E7BE,1.20,0.22,2);      // seed motes on the rising air
const totalParticles=partSystems.reduce((a,b)=>a+b.n,0);

// ---------- the warm sun shower ----------
const rainMat=(()=>{
  const N=Math.round(2000*QCFG.part);
  const base=new Float32Array(N*3), seed=new Float32Array(N);
  const st=subStream('rain',0);
  for(let i=0;i<N;i++){ base[i*3]=st.r(0,90); base[i*3+1]=st.r(0,30); base[i*3+2]=st.r(0,90); seed[i]=st.r(0,1); }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(base,3));
  g.setAttribute('aSeed',new THREE.BufferAttribute(seed,1));
  const m=new THREE.ShaderMaterial({
    transparent:true, depthWrite:false,
    uniforms:{ uWTime:WL.uWTime, uCam:{value:new THREE.Vector3()}, uGround:{value:0}, uAmt:{value:0},
               uWind:{value:WL.uCloudMove.value} },
    vertexShader:`attribute float aSeed; uniform float uWTime; uniform vec3 uCam; uniform float uGround;
      uniform float uAmt; uniform vec2 uWind; varying float vA;
      void main(){
        vec3 box=vec3(90.0,30.0,90.0);
        vec3 p=position;
        p.x+=uWind.x*uWTime*2.2; p.z+=uWind.y*uWTime*2.2;
        p.y-=mod(uWTime*(9.0+aSeed*4.0)+aSeed*60.0,box.y);
        vec3 anchor=vec3(uCam.x,uGround,uCam.z);
        vec3 w=mod(p-anchor+box*0.5,box)-box*0.5+anchor;
        w.y=anchor.y+mod(p.y,box.y);
        float d=distance(w,uCam);
        vA=uAmt*(1.0-smoothstep(30.0,72.0,d))*smoothstep(0.8,3.0,d);
        vec4 mv=viewMatrix*vec4(w,1.0);
        gl_Position=projectionMatrix*mv;
        gl_PointSize=(3.0+aSeed*2.0)*(150.0/max(1.0,-mv.z));
      }`,
    fragmentShader:`varying float vA;
      void main(){
        vec2 q=gl_PointCoord-0.5;
        float a=smoothstep(0.5,0.08,abs(q.x)*4.2+abs(q.y)*0.55)*vA*0.42;
        if(a<0.006) discard;
        gl_FragColor=vec4(0.86,0.92,0.94,a);
      }`,
  });
  const pts=new THREE.Points(g,m);
  pts.frustumCulled=false; pts.visible=false;
  scene.add(pts);
  m.userData={pts,N};
  return m;
})();
const weatherState={ phase:'clear', t:0, amount:0 };

// ============================================================
// VISIBILITY — what the rider's camera can actually see, as opposed to
// what the rider happens to be near. Frustum first, then the ground between.
// ============================================================
const _frustum=new THREE.Frustum(), _pv=new THREE.Matrix4(), _pt=new THREE.Vector3();
function refreshFrustum(cam){
  _pv.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse);
  _frustum.setFromProjectionMatrix(_pv);
}
function inFrame(x,y,z,r){ _pt.set(x,y,z); return _frustum.containsPoint(_pt)||
  _frustum.intersectsSphere(new THREE.Sphere(_pt,r||1)); }
function groundClear(ex,ey,ez,tx,ty,tz,tol){
  const D=Math.hypot(tx-ex,tz-ez);
  const steps=clamp(Math.round(D/14),6,80);
  for(let i=1;i<steps;i++){
    const t=i/steps;
    const px=lerp(ex,tx,t), pz=lerp(ez,tz,t), py=lerp(ey,ty,t);
    if(groundY(px,pz)>py+(tol===undefined?0.8:tol)) return false;
  }
  return true;
}
function seenByRider(eye,x,y,z,r,tol){
  if(!inFrame(x,y,z,r)) return false;
  return groundClear(eye.x,eye.y,eye.z,x,y,z,tol);
}
