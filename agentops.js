const API='https://uglojzicxdopcdtwfzjo.supabase.co/functions/v1/orbitfind-api';
const TOKEN='orbitfind_device_token';
const ADMIN_PIN=sessionStorage.getItem('orbitfind_admin_pin')||'';
const $=s=>document.querySelector(s);
function token(){let t=localStorage.getItem(TOKEN);if(!t){const a=new Uint8Array(32);crypto.getRandomValues(a);t=[...a].map(x=>x.toString(16).padStart(2,'0')).join('');localStorage.setItem(TOKEN,t)}return t}
async function call(action,extra={}){const r=await fetch(API,{method:'POST',headers:{'content-type':'application/json','x-orbit-token':token()},body:JSON.stringify({action,...extra})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Request failed');return d}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function fmt(t){return new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
function stage(c){if(c.status==='recovered')return'Recovered';if(c.status==='match_seen')return'Human Verification';return'AI Searching'}
function signalBars(c){const n=Math.min(5,2+(c.reference_embedding?1:0)+(c.lastSighting?2:0));return'<span class="signal">'+Array.from({length:5},(_,i)=>'<i class="'+(i<n?'on':'')+'"></i>').join('')+'</span>'}
let CASES=[];
function renderHandovers(rows){
 const box=$('#handoverQueue'); if(!box)return;
 if(!rows?.length){box.innerHTML='<div class="guard-flow"><span>No secure handover requests waiting</span></div>';return;}
 box.innerHTML=rows.map(r=>'<article class="desk-request"><div><strong>'+esc(r.case?.case_code||'Case')+' · '+esc(r.case?.color||'')+' '+esc(r.case?.category||'')+'</strong><small>Found near '+esc(r.found_location||'PCE campus')+' · '+esc(r.score??'—')+'% candidate</small></div><span class="desk-status '+esc(r.status)+'">'+esc(String(r.status).toUpperCase())+'</span>'+(r.status==='pending'?'<div class="desk-actions"><button data-desk-review="approved" data-request-id="'+esc(r.id)+'">Approve</button><button data-desk-review="rejected" data-request-id="'+esc(r.id)+'">Reject</button></div>':r.status==='approved'?'<div class="desk-code"><b>'+esc(r.handover_code||'------')+'</b><button data-desk-review="completed" data-request-id="'+esc(r.id)+'">Complete handover</button></div>':'')+'</article>').join('');
}
function renderRows(list=CASES){const body=$('#caseRows');if(!list.length){body.innerHTML='<tr><td colspan="6">No case activity yet.</td></tr>';return}body.innerHTML=list.map(c=>'<tr><td><b>'+esc(c.case_code)+'</b></td><td>'+esc(c.color+' '+c.category)+'</td><td><span class="stage">'+stage(c)+'</span></td><td>'+(c.sightings?.length?esc(c.sightings[c.sightings.length-1].confidence)+'%':'—')+'</td><td>'+esc(c.last_seen_location)+'</td><td>'+signalBars(c)+'</td></tr>').join('')}
function logsFrom(cases,reports){const logs=[];cases.forEach(c=>{logs.push({t:c.created_at,type:'info',txt:'Case '+c.case_code+' registered: '+c.color+' '+c.category+'.'});(c.sightings||[]).forEach(s=>logs.push({t:s.created_at,type:'success',txt:'Vision pipeline recorded '+s.detected_class+' candidate at '+s.confidence+'% score.'}));if(c.status==='recovered')logs.push({t:c.updated_at||c.created_at,type:'success',txt:'Case '+c.case_code+' marked recovered after human verification.'})});reports.forEach(r=>logs.push({t:r.created_at,type:'warn',txt:'Finder report received near '+r.found_location+' with '+(r.similarity??'—')+'% top candidate score.'}));return logs.sort((a,b)=>new Date(b.t)-new Date(a.t)).slice(0,18)}
function renderLogs(logs){const box=$('#activityFeed');if(!logs.length){box.innerHTML='<div class="log"><time>--:--</time><span class="tag info">INFO</span><p>Waiting for live recovery activity.</p></div>';return}box.innerHTML=logs.map(x=>'<div class="log"><time>'+fmt(x.t)+'</time><span class="tag '+x.type+'">'+x.type.toUpperCase()+'</span><p>'+esc(x.txt)+'</p></div>').join('')}
async function load(){try{const [stats,cases,reports,handovers]=await Promise.all([call('get_stats'),call('list_cases'),call('list_found_reports'),call('admin_list_handover_requests',{admin_pin:ADMIN_PIN})]);const s=stats.stats||{};$('#kActive').textContent=s.active??0;$('#kMatched').textContent=s.matched??0;$('#kRecovered').textContent=s.recovered??0;$('#kFound').textContent=s.found_reports??0;CASES=cases.cases||[];renderRows();renderLogs(logsFrom(CASES,reports.reports||[]));renderHandovers(handovers.requests||[]);$('#dbHealth').textContent='HEALTHY';toast('Security Desk synchronized')}catch(e){console.error(e);$('#dbHealth').textContent='DEGRADED';renderLogs([{t:new Date(),type:'warn',txt:'Cloud sync unavailable. Student scanning can continue with local fallback.'}])}}
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(t._x);t._x=setTimeout(()=>t.classList.remove('show'),1600)}
$('#refreshBtn').addEventListener('click',load);
$('#caseSearch').addEventListener('input',e=>{const q=e.target.value.toLowerCase();renderRows(CASES.filter(c=>[c.case_code,c.category,c.color,c.last_seen_location,c.details].join(' ').toLowerCase().includes(q)))});
document.querySelectorAll('.sidebar nav a').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.sidebar nav a').forEach(x=>x.classList.remove('active'));a.classList.add('active')}));
load();setInterval(load,30000);
document.addEventListener('click',async e=>{
 const b=e.target.closest?.('[data-desk-review]'); if(!b)return;
 b.disabled=true;
 try{
  const out=await call('admin_review_handover',{admin_pin:ADMIN_PIN,request_id:b.dataset.requestId,decision:b.dataset.deskReview});
  toast(b.dataset.deskReview==='approved'?'Handover approved · code created':b.dataset.deskReview==='completed'?'Handover completed':'Handover request rejected');
  await load();
 }catch(err){toast(err.message||'Could not update handover');b.disabled=false;}
});
