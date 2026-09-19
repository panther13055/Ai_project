let model = null;
let stream = null;
let running = false;
let activeMode = 'camera';
let rafId = null;
let fpsCount = 0;
let fpsStamp = performance.now();

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const video = $('#cameraFeed');
const img = $('#uploadedImage');
const canvas = $('#detectionCanvas');
const ctx = canvas.getContext('2d');
const emptyState = $('#emptyState');
const loadingState = $('#loadingState');
const modelStatus = $('#modelStatus');

const colorRGB = {
  black:[28,31,38], white:[230,235,240], blue:[55,100,190], red:[190,55,55], green:[55,140,85], yellow:[210,180,50], brown:[115,76,50], gray:[120,125,135], orange:[220,120,45], purple:[130,70,180]
};

const storedCases = () => JSON.parse(localStorage.getItem('orbitfind_cases') || '[]');
const saveCases = (v) => localStorage.setItem('orbitfind_cases', JSON.stringify(v));

function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._x); t._x=setTimeout(()=>t.classList.remove('show'),2400); }
function caseId(){ return `OF-${String(Date.now()).slice(-4)}`; }
function currentCase(){ const arr=storedCases(); return arr[arr.length-1] || null; }
function pretty(s){ return (s||'').replace(/\b\w/g,c=>c.toUpperCase()); }

function updateTarget(){
  const c=currentCase();
  $('#caseIdPreview').textContent=caseId();
  if(c){ $('#targetName').textContent=`${pretty(c.color)} ${pretty(c.category)}`; $('#targetLocation').textContent=`Last seen · ${c.location}`; }
}

function renderCases(){
  const grid=$('#casesGrid'); const arr=storedCases().slice().reverse();
  if(!arr.length){ grid.innerHTML='<div class="empty-cases">No cases yet. Register an item above to create your first recovery case.</div>'; return; }
  grid.innerHTML=arr.slice(0,6).map(c=>`<article class="case-card"><div class="case-card-top"><span class="case-num">${c.id}</span><span class="case-status">ACTIVE</span></div><h3>${c.color} ${c.category}</h3><p>${c.details || 'No distinctive details added.'}</p><div class="case-meta"><span>${c.location}</span><span>${new Date(c.created).toLocaleDateString()}</span></div></article>`).join('');
}

$('#caseForm').addEventListener('submit',e=>{
  e.preventDefault();
  const c={id:caseId(),category:$('#itemCategory').value,color:$('#itemColor').value,details:$('#itemDetails').value.trim(),location:$('#lastSeen').value.trim(),created:Date.now()};
  const arr=storedCases(); arr.push(c); saveCases(arr); updateTarget(); renderCases(); toast('Case saved. Scanner target updated.'); location.hash='scanner';
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

$('#cameraButton').addEventListener('click',async()=>{
  if(running){ stopCamera(); return; }
  try{
    await ensureModel();
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
    video.srcObject=stream; await video.play();
    video.style.display='block'; img.style.display='none'; emptyState.style.display='none';
    running=true; $('#cameraButton').textContent='Stop camera'; $('#feedLabel').textContent='Live phone camera';
    requestAnimationFrame(detectLoop);
  }catch(err){ toast('Camera permission unavailable. Use Upload Image or Demo Mode.'); console.error(err); }
});

function stopCamera(){
  running=false; cancelAnimationFrame(rafId); if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;} video.style.display='none'; $('#cameraButton').textContent='Start phone camera'; $('#feedLabel').textContent='Waiting for input';
}

$('#imageUpload').addEventListener('change',async e=>{
  const file=e.target.files[0]; if(!file)return; stopCamera(); await ensureModel();
  img.src=URL.createObjectURL(file); img.onload=async()=>{img.style.display='block';video.style.display='none';emptyState.style.display='none';$('#feedLabel').textContent=file.name;await detectOnce(img);};
});

async function detectLoop(){
  if(!running) return;
  if(video.readyState>=2){ await detectOnce(video); fpsCount++; const now=performance.now(); if(now-fpsStamp>1000){ $('#fpsChip').textContent=`${fpsCount} FPS`; fpsCount=0; fpsStamp=now; }}
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

async function detectOnce(source){
  if(!sizeCanvas(source))return;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  let preds=[];
  if(model){ try{preds=await model.detect(source,20,.35);}catch(e){console.error(e)} }
  drawPredictions(source,preds);
}

function drawPredictions(source,preds){
  const c=currentCase(); const targetCat=c?.category||'backpack'; const targetColor=c?.color||'black';
  let best=null;
  preds.forEach(p=>{
    const [x,y,w,h]=p.bbox; const detectedColor=getDominantColor(source,p.bbox); const classHit=categoryMatches(p.class,targetCat); const colorHit=detectedColor===targetColor;
    const match=Math.min(99,Math.round((p.score*75)+(classHit?18:0)+(colorHit?7:0)));
    const isTarget=classHit; if(!best|| (isTarget?match:Math.round(p.score*100)) > best.score) best={...p,score:isTarget?match:Math.round(p.score*100),color:detectedColor,isTarget};
    ctx.strokeStyle=isTarget?'#69f0d0':'#65bfff'; ctx.lineWidth=Math.max(2,canvas.width/520); ctx.strokeRect(x,y,w,h);
    const label=`${p.class} · ${Math.round(p.score*100)}%${isTarget?` · ${detectedColor}`:''}`; ctx.font=`600 ${Math.max(12,canvas.width/70)}px DM Sans, sans-serif`; const tw=ctx.measureText(label).width+16; const lh=Math.max(24,canvas.width/38); ctx.fillStyle=isTarget?'#69f0d0':'#65bfff'; ctx.fillRect(x,Math.max(0,y-lh),tw,lh); ctx.fillStyle='#071019'; ctx.fillText(label,x+8,Math.max(16,y-7));
  });
  $('#objectCount').textContent=preds.length;
  if(best){ $('#bestMatch').textContent=pretty(best.class); $('#matchConfidence').textContent=`${best.score}%`; const rs=$('#resultState'); rs.className='result-state '+(best.isTarget?'good':'warn'); rs.querySelector('strong').textContent=best.isTarget?'Potential match found':'Objects detected'; }
  else{ $('#bestMatch').textContent='—';$('#matchConfidence').textContent='—';const rs=$('#resultState');rs.className='result-state';rs.querySelector('strong').textContent='No objects yet'; }
}

$('#demoButton').addEventListener('click',()=>{
  stopCamera(); emptyState.style.display='none'; img.style.display='none'; canvas.width=1280; canvas.height=720; canvas.style.background='linear-gradient(145deg,#111f34,#172235 58%,#0c1421)'; ctx.clearRect(0,0,canvas.width,canvas.height);
  const c=currentCase(); const target=c?.category||'backpack'; const fake=[{class:target,score:.92,bbox:[220,170,430,410]},{class:'bottle',score:.87,bbox:[900,260,110,300]}];
  // draw fake scene shapes
  ctx.fillStyle='#10141b';ctx.fillRect(250,210,340,350);ctx.fillStyle='#29727c';ctx.fillRect(930,285,70,245);
  fake.forEach((p,i)=>{const [x,y,w,h]=p.bbox;ctx.strokeStyle=i===0?'#69f0d0':'#65bfff';ctx.lineWidth=4;ctx.strokeRect(x,y,w,h);const label=`${p.class} · ${Math.round(p.score*100)}%`;ctx.font='600 24px DM Sans';const tw=ctx.measureText(label).width+22;ctx.fillStyle=i===0?'#69f0d0':'#65bfff';ctx.fillRect(x,y-38,tw,38);ctx.fillStyle='#071019';ctx.fillText(label,x+11,y-12)});
  $('#feedLabel').textContent='Demo scene · simulated detections';$('#objectCount').textContent='2';$('#bestMatch').textContent=pretty(target);$('#matchConfidence').textContent='92%';const rs=$('#resultState');rs.className='result-state good';rs.querySelector('strong').textContent='Potential match found';toast('Demo mode running');
});

const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')}),{threshold:.12}); $$('.reveal').forEach(el=>io.observe(el));
window.addEventListener('scroll',()=>{const ids=['home','register','scanner','cases'];let active='home';ids.forEach(id=>{const el=document.getElementById(id);if(el&&scrollY>=el.offsetTop-180)active=id});$$('.nav-link').forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+active));});

updateTarget(); renderCases();
if(window.innerWidth<700){ $('.upload-label').style.display='none'; }
