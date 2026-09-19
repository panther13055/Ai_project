let model = null;
let similarityModel = null;
let pendingReferenceEmbedding = null;
let stream = null;
let running = false;
let activeMode = 'camera';
let rafId = null;
let fpsCount = 0;
let fpsStamp = performance.now();
let facingMode = 'environment';
let consecutiveMatches = 0;
let lastSightingAt = 0;
let detectionBusy = false;
const VERIFY_FRAMES = 3;
const SIGHTING_COOLDOWN = 8000;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const video = $('#cameraFeed');
const img = $('#uploadedImage');
const canvas = $('#detectionCanvas');
const ctx = canvas.getContext('2d');
const emptyState = $('#emptyState');
const loadingState = $('#loadingState');
const modelStatus = $('#modelStatus');
const ORBIT_API = 'https://uglojzicxdopcdtwfzjo.supabase.co/functions/v1/orbitfind-api';
const DEVICE_TOKEN_KEY = 'orbitfind_device_token';
function getDeviceToken(){
  let token=localStorage.getItem(DEVICE_TOKEN_KEY);
  if(!token){
    const bytes=new Uint8Array(32); crypto.getRandomValues(bytes);
    token=Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('');
    localStorage.setItem(DEVICE_TOKEN_KEY,token);
  }
  return token;
}
async function cloudCall(payload){
  const res=await fetch(ORBIT_API,{method:'POST',headers:{'Content-Type':'application/json','x-orbit-token':getDeviceToken()},body:JSON.stringify(payload)});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||('Cloud request failed: '+res.status));
  return data;
}

const colorRGB = {
  black:[28,31,38], white:[230,235,240], blue:[55,100,190], red:[190,55,55], green:[55,140,85], yellow:[210,180,50], brown:[115,76,50], gray:[120,125,135], orange:[220,120,45], purple:[130,70,180]
};

const storedCases = () => JSON.parse(localStorage.getItem('orbitfind_cases') || '[]');
const saveCases = (v) => localStorage.setItem('orbitfind_cases', JSON.stringify(v));

function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._x); t._x=setTimeout(()=>t.classList.remove('show'),2400); }
function caseId(){ return `OF-${String(Date.now()).slice(-4)}`; }
function currentCase(){ const arr=storedCases(); return arr[arr.length-1] || null; }
function cloudToLocal(row){ const sightings=(row.sightings||[]).slice().sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)); const last=sightings[sightings.length-1]; return {id:row.case_code,cloud_id:row.id,category:row.category,color:row.color,details:row.details||'',location:row.last_seen_location,created:new Date(row.created_at).getTime(),status:row.status,sightings:sightings.map(s=>({at:new Date(s.created_at).getTime(),confidence:s.confidence,color:s.detected_color,source:s.source})),lastSighting:last?{at:new Date(last.created_at).getTime(),confidence:last.confidence,color:last.detected_color,source:last.source}:undefined}; }
async function syncFromCloud(){ try{ const data=await cloudCall({action:'list_cases'}); const remote=(data.cases||[]).map(cloudToLocal).sort((a,b)=>a.created-b.created); if(remote.length){ saveCases(remote); renderCases(); updateTarget(); } return true; }catch(err){ console.warn('Cloud sync unavailable',err); return false; } }
function pretty(s){ return (s||'').replace(/\b\w/g,c=>c.toUpperCase()); }
async function ensureSimilarityModel(){ if(similarityModel) return similarityModel; await tf.ready(); similarityModel=await mobilenet.load({version:2,alpha:0.5}); return similarityModel; }
async function embeddingFromElement(el){ const m=await ensureSimilarityModel(); const t=m.infer(el,true); const v=Array.from(await t.data()); t.dispose(); return v; }
function cosineSimilarity(a,b){ if(!a||!b||a.length!==b.length||!a.length)return null; let d=0,aa=0,bb=0; for(let i=0;i<a.length;i++){d+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];} return aa&&bb?d/(Math.sqrt(aa)*Math.sqrt(bb)):null; }
function cropToCanvas(source,bbox){ const [x,y,w,h]=bbox; const out=document.createElement('canvas'); out.width=224; out.height=224; out.getContext('2d').drawImage(source,x,y,w,h,0,0,224,224); return out; }

function setAgent(state,message,reasons=[]){
  const stateEl=$('#agentState'), msg=$('#agentMessage'), list=$('#agentReasons');
  if(stateEl) stateEl.textContent=state;
  if(msg) msg.textContent=message;
  if(list) list.innerHTML=(reasons.length?reasons:['Waiting for target']).map(x=>'<span>'+x+'</span>').join('');
}
function updateTarget(){
  const c=currentCase();
  $('#caseIdPreview').textContent=caseId();
  if(c){
    $('#targetName').textContent=pretty(c.color)+' '+pretty(c.category);
    $('#targetLocation').textContent='Last seen · '+c.location;
    setAgent('READY','Target locked: '+pretty(c.color)+' '+pretty(c.category)+'. I will verify repeated detections before confirming a match.',['Category target loaded','Color preference loaded','3-frame verification']);
  } else {
    setAgent('STANDBY','Register a lost item, then start the camera. I will verify repeated detections before confirming a match.');
  }
}

function renderCases(){
  const grid=$('#casesGrid'); const arr=storedCases().slice().reverse();
  if(!arr.length){ grid.innerHTML='<div class="empty-cases">No cases yet. Register an item above to create your first recovery case.</div>'; return; }
  grid.innerHTML=arr.slice(0,6).map(c=>`<article class="case-card"><div class="case-card-top"><span class="case-num">${c.id}</span><span class="case-status">${c.lastSighting?'MATCH SEEN':'ACTIVE'}</span></div><h3>${c.color} ${c.category}</h3><p>${c.details || 'No distinctive details added.'}</p><div class="case-meta"><span>${c.lastSighting?'Last match '+new Date(c.lastSighting.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):c.location}</span><span>${c.lastSighting?c.lastSighting.confidence+'% confidence':new Date(c.created).toLocaleDateString()}</span></div></article>`).join('');
}

$('#caseForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const c={id:caseId(),category:$('#itemCategory').value,color:$('#itemColor').value,details:$('#itemDetails').value.trim(),location:$('#lastSeen').value.trim(),created:Date.now(),sightings:[],status:'active'};
  const arr=storedCases(); arr.push(c); saveCases(arr); updateTarget(); renderCases(); location.hash='scanner';
  setAgent('SYNCING','Saving this case securely to the cloud backend.',['Local fallback saved','Cloud sync in progress']);
  try{
    const out=await cloudCall({action:'create_case',case:{case_code:c.id,category:c.category,color:c.color,details:c.details,last_seen_location:c.location}});
    const latest=storedCases(); const idx=latest.findIndex(x=>x.id===c.id); if(idx>=0){latest[idx].cloud_id=out.case.id; latest[idx].status=out.case.status; saveCases(latest);} 
    toast('Case saved to Supabase cloud'); updateTarget(); renderCases();
    setAgent('READY','Case is saved in the cloud and ready for scanning.',['Cloud case created','Local fallback retained','Target loaded']);
  }catch(err){
    console.error(err); toast('Saved locally. Cloud sync will retry later.');
    setAgent('OFFLINE READY','Cloud sync failed, but the case is safe on this device and scanning still works.',['Local fallback active','Retry on refresh']);
  }
});

$$('.mode-tab').forEach(b=>b.addEventListener('click',()=>{
  $$('.mode-tab').forEach(x=>x.classList.remove('active')); b.classList.add('active'); activeMode=b.dataset.mode;
  if(activeMode==='camera'){ $('#cameraButton').style.display='inline-flex'; $('.upload-label').style.display='none'; }
  else{ stopCamera(); $('#cameraButton').style.display='none'; $('.upload-label').style.display='inline-flex'; }
}));

async function ensureModel(){
  if(model) return model;
  loadingState.style.display='block'; emptyState.style.display='none'; modelStatus.textContent='Loading AI…';
  try{
    await tf.ready();
    model=await cocoSsd.load({base:'lite_mobilenet_v2'});
    modelStatus.textContent='AI ready'; $('.live-dot').style.background='var(--mint)';
    toast('AI model loaded');
  }catch(err){
    console.error(err); modelStatus.textContent='Demo mode'; toast('AI model could not load. Demo mode still works.');
  }finally{ loadingState.style.display='none'; }
  return model;
}

async function startCamera(){
  if(!navigator.mediaDevices?.getUserMedia){ toast('Camera API unavailable. Use Upload Image.'); setAgent('CAMERA ERROR','Camera API is unavailable in this browser.',['Use HTTPS','Try Upload Image']); return; }
  try{
    await ensureModel();
    if(!model) throw new Error('Model unavailable');
    if(stream) stream.getTracks().forEach(t=>t.stop());
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facingMode},width:{ideal:1280},height:{ideal:720}},audio:false});
    video.srcObject=stream; await video.play();
    video.style.display='block'; img.style.display='none'; emptyState.style.display='none';
    running=true; consecutiveMatches=0; $('#verificationCount').textContent='0 / '+VERIFY_FRAMES;
    $('#cameraButton').textContent='Stop camera'; $('#switchCameraButton').disabled=false;
    $('#feedLabel').textContent=facingMode==='environment'?'Rear camera · live':'Front camera · live';
    setAgent('SCANNING','Watching the live feed for the registered target. A match needs repeated confirmation.',['Live detection active','Checking category','Checking color']);
    requestAnimationFrame(detectLoop);
  }catch(err){
    console.error(err);
    const msg=err?.name==='NotAllowedError'?'Camera permission was blocked. Allow camera access in browser settings.':'Camera could not start. Try Upload Image.';
    toast(msg); setAgent('CAMERA ERROR',msg,['Allow camera permission','Upload Image fallback']);
  }
}
$('#cameraButton').addEventListener('click',async()=>{ if(running){ stopCamera(); return; } await startCamera(); });
$('#switchCameraButton').addEventListener('click',async()=>{ facingMode=facingMode==='environment'?'user':'environment'; if(running){ running=false; cancelAnimationFrame(rafId); await startCamera(); } });

function stopCamera(){
  running=false; detectionBusy=false; consecutiveMatches=0; cancelAnimationFrame(rafId);
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
  video.style.display='none'; $('#cameraButton').textContent='Start phone camera'; $('#switchCameraButton').disabled=true; $('#feedLabel').textContent='Waiting for input';
  $('#verificationCount').textContent='0 / '+VERIFY_FRAMES;
  if(currentCase()) setAgent('READY','Camera stopped. Target remains loaded for the next scan.',['Target retained','No video stored']);
}

$('#imageUpload').addEventListener('change',async e=>{
  const file=e.target.files[0]; if(!file)return; stopCamera(); await ensureModel();
  img.src=URL.createObjectURL(file); img.onload=async()=>{img.style.display='block';video.style.display='none';emptyState.style.display='none';$('#feedLabel').textContent=file.name;setAgent('ANALYZING','Analyzing the uploaded image against the active target.',['Single-image analysis','Category matching','Color estimation']);await detectOnce(img,true);};
});

async function detectLoop(){
  if(!running) return;
  if(video.readyState>=2 && !detectionBusy){
    detectionBusy=true; await detectOnce(video); detectionBusy=false;
    fpsCount++; const now=performance.now(); if(now-fpsStamp>1000){ $('#fpsChip').textContent=fpsCount+' FPS'; fpsCount=0; fpsStamp=now; }
  }
  rafId=requestAnimationFrame(detectLoop);
}

function sizeCanvas(source){
  const w=source.videoWidth||source.naturalWidth||source.width; const h=source.videoHeight||source.naturalHeight||source.height;
  if(!w||!h)return false; canvas.width=w;canvas.height=h;return true;
}

function getDominantColor(source,bbox){
  try{
    const [x,y,w,h]=bbox; const temp=document.createElement('canvas'); temp.width=Math.max(1,Math.min(80,Math.round(w))); temp.height=Math.max(1,Math.min(80,Math.round(h))); const t=temp.getContext('2d'); t.drawImage(source,x,y,w,h,0,0,temp.width,temp.height); const d=t.getImageData(0,0,temp.width,temp.height).data; let r=0,g=0,b=0,n=0;
    for(let i=0;i<d.length;i+=20){ const rr=d[i],gg=d[i+1],bb=d[i+2],mx=Math.max(rr,gg,bb),mn=Math.min(rr,gg,bb); if(mx<245&&mn>8){r+=rr;g+=gg;b+=bb;n++;} }
    if(!n)return 'unknown'; const avg=[r/n,g/n,b/n]; let best='unknown',dist=1e9; for(const [name,c] of Object.entries(colorRGB)){ const dd=Math.hypot(avg[0]-c[0],avg[1]-c[1],avg[2]-c[2]); if(dd<dist){dist=dd;best=name;} } return best;
  }catch{return 'unknown'}
}

function categoryMatches(predClass,target){
  const synonyms={'backpack':['backpack'],'bottle':['bottle'],'umbrella':['umbrella'],'handbag':['handbag'],'suitcase':['suitcase'],'laptop':['laptop'],'cell phone':['cell phone'],'book':['book'],'sports ball':['sports ball']};
  return (synonyms[target]||[target]).includes(predClass);
}

async function detectOnce(source,singleImage=false){
  if(!sizeCanvas(source))return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  let preds=[];
  if(model){ try{preds=await model.detect(source,20,.38);}catch(e){console.error(e);setAgent('AI ERROR','Detection failed. Retry the scan.',['Model still loaded','Retry recommended']);} }
  drawPredictions(source,preds,singleImage);
}

function recordSighting(confidence,color){
  const now=Date.now(); if(now-lastSightingAt<SIGHTING_COOLDOWN) return;
  const arr=storedCases(); if(!arr.length)return; const idx=arr.length-1;
  const active=arr[idx]; const sighting={at:now,confidence,color,source:activeMode};
  arr[idx].sightings=[...(arr[idx].sightings||[]),sighting].slice(-10); arr[idx].lastSighting=sighting; arr[idx].status='match_seen';
  saveCases(arr); lastSightingAt=now; renderCases();
  if(active.cloud_id){
    cloudCall({action:'record_sighting',case_id:active.cloud_id,detected_class:active.category,detected_color:color,confidence,source:activeMode})
      .then(()=>{ toast('Verified sighting saved to cloud'); })
      .catch(err=>{ console.warn('Sighting cloud sync failed',err); toast('Sighting saved locally; cloud sync unavailable'); });
  }
}
function drawPredictions(source,preds,singleImage=false){
  const c=currentCase(); const targetCat=c?.category||'backpack'; const targetColor=c?.color||'black';
  let best=null;
  preds.forEach(p=>{
    const [x,y,w,h]=p.bbox; const detectedColor=getDominantColor(source,p.bbox); const classHit=categoryMatches(p.class,targetCat); const colorHit=detectedColor===targetColor;
    const match=Math.min(99,Math.round((p.score*75)+(classHit?18:0)+(colorHit?7:0)));
    const isTarget=classHit; if(!best|| (isTarget&&!best.isTarget) || (isTarget===best.isTarget && (isTarget?match:Math.round(p.score*100)) > best.score)) best={...p,score:isTarget?match:Math.round(p.score*100),color:detectedColor,isTarget,colorHit};
    ctx.strokeStyle=isTarget?'#69f0d0':'#65bfff'; ctx.lineWidth=Math.max(2,canvas.width/520); ctx.strokeRect(x,y,w,h);
    const label=`${p.class} · ${Math.round(p.score*100)}%${isTarget?` · ${detectedColor}`:''}`; ctx.font=`600 ${Math.max(12,canvas.width/70)}px DM Sans, sans-serif`; const tw=ctx.measureText(label).width+16; const lh=Math.max(24,canvas.width/38); ctx.fillStyle=isTarget?'#69f0d0':'#65bfff'; ctx.fillRect(x,Math.max(0,y-lh),tw,lh); ctx.fillStyle='#071019'; ctx.fillText(label,x+8,Math.max(16,y-7));
  });
  $('#objectCount').textContent=preds.length;
  const rs=$('#resultState');
  if(best?.isTarget){
    consecutiveMatches=singleImage?VERIFY_FRAMES:Math.min(VERIFY_FRAMES,consecutiveMatches+1);
    $('#verificationCount').textContent=consecutiveMatches+' / '+VERIFY_FRAMES;
    $('#bestMatch').textContent=pretty(best.class); $('#matchConfidence').textContent=best.score+'%';
    if(consecutiveMatches>=VERIFY_FRAMES){
      rs.className='result-state good'; rs.querySelector('strong').textContent='Verified potential match';
      setAgent('MATCH VERIFIED','Repeated detections confirm a likely '+pretty(targetCat)+'. Review the item before marking it recovered.',[best.colorHit?'Color matched: '+pretty(targetColor):'Color estimate: '+pretty(best.color),'Repeated visual confirmation',best.score+'% match score']);
      recordSighting(best.score,best.color); if(navigator.vibrate) navigator.vibrate([80,50,80]);
    } else {
      rs.className='result-state warn'; rs.querySelector('strong').textContent='Verifying candidate';
      setAgent('VERIFYING','Possible '+pretty(targetCat)+' detected. Waiting for '+(VERIFY_FRAMES-consecutiveMatches)+' more stable confirmation(s).',['Category match','Temporal verification running']);
    }
  } else if(best){
    consecutiveMatches=Math.max(0,consecutiveMatches-1); $('#verificationCount').textContent=consecutiveMatches+' / '+VERIFY_FRAMES;
    $('#bestMatch').textContent=pretty(best.class); $('#matchConfidence').textContent=best.score+'%'; rs.className='result-state warn'; rs.querySelector('strong').textContent='Other objects detected';
    setAgent('SCANNING','Detected '+pretty(best.class)+', but the active target is '+pretty(targetCat)+'.',['Continuing search','No false match confirmed']);
  } else {
    consecutiveMatches=0; $('#verificationCount').textContent='0 / '+VERIFY_FRAMES;
    $('#bestMatch').textContent='—'; $('#matchConfidence').textContent='—'; rs.className='result-state'; rs.querySelector('strong').textContent='No objects yet';
    if(running) setAgent('SCANNING','No target visible yet. Keep the item centered, well lit and unobstructed.',['Good lighting helps','Keep target in frame']);
  }
}

$('#demoButton').addEventListener('click',()=>{
  stopCamera(); emptyState.style.display='none'; img.style.display='none'; canvas.width=1280; canvas.height=720; canvas.style.background='linear-gradient(145deg,#111f34,#172235 58%,#0c1421)'; ctx.clearRect(0,0,canvas.width,canvas.height);
  const c=currentCase(); const target=c?.category||'backpack'; const fake=[{class:target,score:.92,bbox:[220,170,430,410]},{class:'bottle',score:.87,bbox:[900,260,110,300]}];
  // draw fake scene shapes
  ctx.fillStyle='#10141b';ctx.fillRect(250,210,340,350);ctx.fillStyle='#29727c';ctx.fillRect(930,285,70,245);
  fake.forEach((p,i)=>{const [x,y,w,h]=p.bbox;ctx.strokeStyle=i===0?'#69f0d0':'#65bfff';ctx.lineWidth=4;ctx.strokeRect(x,y,w,h);const label=`${p.class} · ${Math.round(p.score*100)}%`;ctx.font='600 24px DM Sans';const tw=ctx.measureText(label).width+22;ctx.fillStyle=i===0?'#69f0d0':'#65bfff';ctx.fillRect(x,y-38,tw,38);ctx.fillStyle='#071019';ctx.fillText(label,x+11,y-12)});
  $('#feedLabel').textContent='Demo scene · simulated detections';$('#objectCount').textContent='2';$('#bestMatch').textContent=pretty(target);$('#matchConfidence').textContent='92%';$('#verificationCount').textContent=VERIFY_FRAMES+' / '+VERIFY_FRAMES;const rs=$('#resultState');rs.className='result-state good';rs.querySelector('strong').textContent='Demo match verified';setAgent('DEMO VERIFIED','Demo mode simulated a stable match. Live mode uses the real object-detection model.',['Simulated category match','92% demo confidence','Presentation fallback']);toast('Demo mode running');
});

const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')}),{threshold:.12}); $$('.reveal').forEach(el=>io.observe(el));
window.addEventListener('scroll',()=>{const ids=['home','register','scanner','cases'];let active='home';ids.forEach(id=>{const el=document.getElementById(id);if(el&&scrollY>=el.offsetTop-180)active=id});$$('.nav-link').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+active));});

updateTarget(); renderCases();
syncFromCloud().then(ok=>{ if(ok && currentCase()) setAgent('READY','Cloud sync complete. Your latest case is loaded.',['Supabase connected','Cases synchronized','Scanner ready']); });
window.addEventListener('beforeunload',()=>{ if(stream) stream.getTracks().forEach(t=>t.stop()); });
