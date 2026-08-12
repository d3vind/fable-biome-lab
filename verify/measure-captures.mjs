// Capture matched delivered frames plus semantic masks for measure-frames.mjs.
// The HTML sources are served byte-for-byte with a read-only capture hook
// injected into the response. Normal-frame pixels are always captured before
// mask rendering; masks identify surfaces but never contribute colour values.
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {access, mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import {dirname, extname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(HERE,'..');
const OUT=resolve(process.env.MEASURE_OUT||join(HERE,'ride-review-02-r3','measurement'));
const PORT=Number(process.env.PORT||8143);
const SIZE={width:1440,height:900};
const FRAME_MS=50;
const CHROME_PATH=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const THREE_LOCAL=process.env.THREE_LOCAL||join(ROOT,'node_modules','three');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript'};

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const normRad=a=>Math.atan2(Math.sin(a),Math.cos(a));

async function findPlaywright(){
  const require=createRequire(import.meta.url);
  try{return require('playwright');}catch{}
  const base='/Users/devin/.npm/_npx';
  for(const entry of (await readdir(base)).sort().reverse()){
    const candidate=join(base,entry,'node_modules/playwright');
    try{await access(join(candidate,'package.json'),fsConstants.R_OK);return require(candidate);}catch{}
  }
  throw new Error('Playwright not found');
}

function hookFor(rel){
  const keeper=rel==='index.html';
  const groundSelector=keeper
    ? "o.name==='field'"
    : 'o.material===tileMat';
  const crownMats=keeper
    ? '[treeMatNear,treeMatMid,treeMatFar,treeMatHero]'
    : '[treeMatNear,treeMatMid,treeMatFar]';
  const meta=keeper
    ? `const p=window.__SUMMERGLASS_PROOF__; const g=window.__SUMMERGLASS_TEST__.state().g;
       const f=getFrame(FRAMES.sun,clamp(toLocal('sun',g),0,FRAMES.sun.len-1));
       return {sunAzRad:sunAz,sunElRad:sunEl,localHeadingRad:Math.atan2(f.tx,f.tz),
         routeLengthM:p.route.lengthM,chapters:p.chapters,renderer:p.render.renderer,
         vendor:p.render.vendor,softwareRenderer:p.render.softwareRenderer};`
    : `const p=window.__SUMMERGLASS_PROOF__; const s=window.__SUMMERGLASS_TEST__.state();
       const local=clamp(s.islandS||0,0,LFRAME.len-1), f=getFrame(LFRAME,local);
       return {sunAzRad:sunAz,sunElRad:sunEl,localHeadingRad:Math.atan2(f.tx,f.tz),
         entryAtG:s.entryAtG,routeLengthM:LFRAME.len,renderer:p.render.renderer,
         vendor:p.render.vendor,softwareRenderer:p.render.softwareRenderer};`;
  return `
// capture-only measurement hook; source and normal-render values are unchanged
{
  const maskWhite=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,fog:false});
  let saved=null;
  const crowns=${crownMats};
  const selected=(o,kind)=>{
    if(!o.isMesh&&!o.isPoints&&!o.isLine) return false;
    if(kind==='turf') return ${groundSelector};
    if(kind==='road') return o.material===corridorMat;
    if(kind==='scrub') return o.material===underMat;
    if(kind==='crowns') return crowns.includes(o.material);
    return false;
  };
  Object.defineProperty(window,'__MEASURE_CAPTURE__',{value:{
    meta(){${meta}},
    look(yaw){ yawOff=Number(yaw)||0; dragging=true; return yawOff; },
    mask(kind){
      if(saved) throw new Error('mask already active');
      const objects=[];
      scene.traverse(o=>{ if(!o.isMesh&&!o.isPoints&&!o.isLine) return;
        objects.push([o,o.visible,o.material]);
        o.visible=selected(o,kind); if(o.visible) o.material=maskWhite;
      });
      saved={objects,background:scene.background,fog:scene.fog};
      scene.background=new THREE.Color(0x000000); scene.fog=null;
      renderer.render(scene,camera); return kind;
    },
    restore(){
      if(!saved) return false;
      for(const [o,v,m] of saved.objects){o.visible=v;o.material=m;}
      scene.background=saved.background;scene.fog=saved.fog;saved=null;
      renderer.render(scene,camera); return true;
    }
  },enumerable:false});
}
`;
}

function inject(source,rel){
  const at=source.lastIndexOf('</script>');
  if(at<0) throw new Error(`${rel} has no module terminator`);
  return source.slice(0,at)+hookFor(rel)+source.slice(at);
}

function isolateVariant(source,rel,variant){
  if(!variant)return source;
  if(variant==='unshadowed'){
    const next=source.replace(/return clamp\(1\.0-0\.(?:40|54)\*s,0\.(?:34|24),1\.0\);/,'return 1.0;');
    if(next===source)throw new Error(`${rel}: cloud-shadow isolation pattern missing`);
    return next;
  }
  if(variant==='no-bleach'&&rel==='island-02.html'){
    const next=source.replace('diffuseColor.rgb=mix(diffuseColor.rgb,uDryCol,dry*0.34);','dry=0.0; diffuseColor.rgb=mix(diffuseColor.rgb,uDryCol,0.0);');
    if(next===source)throw new Error(`${rel}: sun-bleach isolation pattern missing`);
    return next;
  }
  throw new Error(`${rel}: unsupported measurement variant ${variant}`);
}

async function serve(){
  const server=createServer(async(req,res)=>{
    const requestUrl=new URL(req.url,`http://127.0.0.1:${PORT}`);
    const pathname=decodeURIComponent(requestUrl.pathname);
    const rel=pathname==='/'?'index.html':pathname.replace(/^\/+/, '');
    const path=resolve(ROOT,rel);
    if(!path.startsWith(ROOT+'/')){res.writeHead(403);res.end('forbidden');return;}
    try{
      let body=await readFile(path);
      if(['index.html','island-01.html','island-02.html'].includes(rel)){
        const source=isolateVariant(body.toString('utf8'),rel,requestUrl.searchParams.get('measureVariant'));
        body=Buffer.from(inject(source,rel));
      }
      res.writeHead(200,{'content-type':MIME[extname(path)]||'application/octet-stream'});res.end(body);
    }catch(error){res.writeHead(404);res.end(error.message);}
  });
  await new Promise(done=>server.listen(PORT,'127.0.0.1',done));
  return server;
}

async function addClock(context){
  await context.addInitScript(()=>{
    let nowMs=0,nextId=1;const pending=new Map();
    Object.defineProperty(window,'requestAnimationFrame',{value:cb=>{const id=nextId++;pending.set(id,cb);return id;},configurable:true});
    Object.defineProperty(window,'cancelAnimationFrame',{value:id=>pending.delete(id),configurable:true});
    Object.defineProperty(window,'__MEASURE_STEP__',{value:ms=>{nowMs+=ms;const jobs=[...pending.values()];pending.clear();for(const cb of jobs)cb(nowMs);return jobs.length;}});
  });
}

async function open(browser,file,query){
  const context=await browser.newContext({viewport:SIZE,deviceScaleFactor:1});
  await addClock(context);
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(`pageerror: ${e.message}`));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(`console: ${m.text()}`);});
  await page.route('**/three@0.185.1/**',async route=>{
    const rel=route.request().url().split('three@0.185.1/')[1]?.split('?')[0];
    if(!rel)return route.continue();
    try{await route.fulfill({status:200,contentType:'text/javascript',body:await readFile(join(THREE_LOCAL,rel))});}catch{return route.continue();}
  });
  await page.goto(`http://127.0.0.1:${PORT}/${file}?${query}`,{waitUntil:'load',timeout:240000});
  await page.waitForFunction(()=>window.__SUMMERGLASS_PROOF__&&window.__MEASURE_CAPTURE__,null,{timeout:240000});
  await page.evaluate(dt=>window.__SUMMERGLASS_TEST__.fixedStep(dt),FRAME_MS/1000);
  for(let i=0;i<24;i++)await page.evaluate(ms=>window.__MEASURE_STEP__(ms),FRAME_MS);
  return {page,context,errors};
}

async function position(opened,g,yaw=0){
  await opened.page.evaluate(({g,yaw})=>{window.__SUMMERGLASS_TEST__.warp(g);window.__SUMMERGLASS_TEST__.pause(true);window.__MEASURE_CAPTURE__.look(yaw);},{g,yaw});
  for(let i=0;i<8;i++)await opened.page.evaluate(ms=>window.__MEASURE_STEP__(ms),FRAME_MS);
  return opened.page.evaluate(()=>window.__MEASURE_CAPTURE__.meta());
}

async function capture(opened,label){
  const dir=join(OUT,label);await mkdir(dir,{recursive:true});
  await opened.page.screenshot({path:join(dir,'delivered.png'),type:'png'});
  for(const kind of ['turf','road','scrub','crowns']){
    await opened.page.evaluate(k=>window.__MEASURE_CAPTURE__.mask(k),kind);
    await opened.page.screenshot({path:join(dir,`${kind}-mask.png`),type:'png'});
    await opened.page.evaluate(()=>window.__MEASURE_CAPTURE__.restore());
  }
}

async function captureVariant(browser,{file,query,g,yaw,label,variant}){
  const opened=await open(browser,file,`${query}&measureVariant=${variant}`);
  await position(opened,g,yaw);
  const path=join(OUT,label,`${variant}.png`);
  await opened.page.screenshot({path,type:'png'});
  if(opened.errors.length)throw new Error(`${label}/${variant}: ${opened.errors.join('; ')}`);
  await opened.context.close();
}

const server=await serve();let browser;
try{
  await mkdir(OUT,{recursive:true});
  const {chromium}=await findPlaywright();
  browser=await chromium.launch({executablePath:CHROME_PATH,headless:true,args:['--use-gl=angle','--use-angle=metal','--enable-gpu','--no-sandbox','--disable-dev-shm-usage']});

  const keeper=await open(browser,'index.html','seed=SUMMERGLASS-8421&quality=standard');
  const initialKeeper=await keeper.page.evaluate(()=>window.__SUMMERGLASS_PROOF__);
  const sunbank=initialKeeper.chapters.find(c=>c.name==='Sunbank');
  const previous=initialKeeper.chapters[initialKeeper.chapters.indexOf(sunbank)-1]?.endM||0;
  const keeperG=Math.round((previous+sunbank.endM)*0.5);
  const keeperMeta=await position(keeper,keeperG,0);
  const targetRelSun=normRad(keeperMeta.sunAzRad-keeperMeta.localHeadingRad);
  await capture(keeper,'keeper-midcountry');
  await captureVariant(browser,{file:'index.html',query:'seed=SUMMERGLASS-8421&quality=standard',g:keeperG,yaw:0,label:'keeper-midcountry',variant:'unshadowed'});

  const configs=[
    {label:'island-01-open',file:'island-01.html',query:'iseed=ISLE-8421&quality=standard&heading=0',stationM:900,yaw:0},
    {label:'island-02-tip',file:'island-02.html',query:'iseed=PARTING-3311&quality=standard&heading=0',stationM:900,yaw:0},
  ];
  const records=[];
  for(const cfg of configs){
    const probe=await open(browser,cfg.file,cfg.query);
    const state=await probe.page.evaluate(()=>window.__SUMMERGLASS_TEST__.state());
    const probeMeta=await position(probe,state.entryAtG+cfg.stationM,cfg.yaw);
    const heading=normRad(probeMeta.sunAzRad-probeMeta.localHeadingRad-targetRelSun)*180/Math.PI;
    await probe.context.close();
    const matched=await open(browser,cfg.file,cfg.query.replace(/heading=[^&]*/i,`heading=${heading}`));
    const matchedState=await matched.page.evaluate(()=>window.__SUMMERGLASS_TEST__.state());
    const meta=await position(matched,matchedState.entryAtG+cfg.stationM,cfg.yaw);
    await capture(matched,cfg.label);
    const matchedQuery=cfg.query.replace(/heading=[^&]*/i,`heading=${heading}`);
    await captureVariant(browser,{file:cfg.file,query:matchedQuery,g:matchedState.entryAtG+cfg.stationM,yaw:cfg.yaw,label:cfg.label,variant:'unshadowed'});
    if(cfg.label==='island-02-tip')await captureVariant(browser,{file:cfg.file,query:matchedQuery,g:matchedState.entryAtG+cfg.stationM,yaw:cfg.yaw,label:cfg.label,variant:'no-bleach'});
    records.push({...cfg,headingDeg:heading,meta,errors:matched.errors});
    await matched.context.close();
  }
  const middle=await open(browser,'island-02.html','iseed=PARTING-3311&quality=standard&heading=0');
  const middleState=await middle.page.evaluate(()=>window.__SUMMERGLASS_TEST__.state());
  const middleMeta=await position(middle,middleState.entryAtG+1200,0.45);
  await mkdir(join(OUT,'island-02-middle-r3'),{recursive:true});
  await middle.page.screenshot({path:join(OUT,'island-02-middle-r3','delivered.png'),type:'png'});
  if(middle.errors.length)throw new Error(`island-02-middle-r3: ${middle.errors.join('; ')}`);
  await middle.context.close();
  const metadata={
    baseCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),
    candidate:{
      source:'working-tree island-02.html',
      committedAtCapture:false,
      sourceSha256:sha256(await readFile(join(ROOT,'island-02.html'))),
    },
    viewport:SIZE,frameIntervalMs:FRAME_MS,quality:'standard',targetSunRelativeToTravelRad:targetRelSun,
    keeper:{label:'keeper-midcountry',seed:'SUMMERGLASS-8421',stationM:keeperG,meta:keeperMeta,errors:keeper.errors},
    middleComparison:{label:'island-02-middle-r3',seed:'PARTING-3311',stationM:1200,yawRad:0.45,headingDeg:0,meta:middleMeta,errors:middle.errors},
    references:records,
    sourceHashes:Object.fromEntries(await Promise.all(['index.html','island-01.html','island-02.html'].map(async f=>[f,sha256(await readFile(join(ROOT,f)))]))),
  };
  await writeFile(join(OUT,'capture-metadata.json'),JSON.stringify(metadata,null,2));
  if(keeper.errors.length||records.some(r=>r.errors.length))throw new Error('capture page errors');
  console.log(JSON.stringify(metadata,null,2));
  await keeper.context.close();
}finally{if(browser)await browser.close();server.close();}
