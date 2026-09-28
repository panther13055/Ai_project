const API='https://uglojzicxdopcdtwfzjo.supabase.co/functions/v1/orbitfind-api';
const TOKEN='orbitfind_device_token';
const ADMIN_PIN=sessionStorage.getItem('orbitfind_admin_pin')||'';
const $=s=>document.querySelector(s);

function token(){let t=localStorage.getItem(TOKEN);if(!t){const a=new Uint8Array(32);crypto.getRandomValues(a);t=[...a].map(x=>x.toString(16).padStart(2,'0')).join('');localStorage.setItem(TOKEN,t)}return t}
async function call(action,extra={}){const r=await fetch(API,{method:'POST',headers:{'content-type':'application/json','x-orbit-token':token()},body:JSON.stringify({action,...extra})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Request failed');return d}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function fmt(t){return new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
function stage(c){if(c.status==='recovered')return'Recovered';if(c.status==='match_seen')return'Human Verification';return'AI Searching'}
function signalBars(c){const n=Math.min(5,2+(c.reference_embedding?1:0)+(c.sightings?.length?2:0));return'<span class="signal">'+Array.from({length:5},(_,i)=>'<i class="'+(i<n?'on':'')+'"></i>').join('')+'</span>'}
function toast(m){const t=$('#toast');if(!t)return;t.textContent=m;t.classList.add('show');clearTimeout(t._x);t._x=setTimeout(()=>t.classList.remove('show'),1600)}

let CASES=[];
let FOUND_REPORTS=[];
function renderFoundReports(rows=FOUND_REPORTS){
 const body=$('#foundRows');if(!body)return;
 const count=$('#foundReportCount');if(count)count.textContent=rows.length+' report'+(rows.length===1?'':'s');
 if(!rows.length){body.innerHTML='<tr><td colspan="5">No found reports yet.</td></tr>';return;}
 body.innerHTML=rows.map(r=>'<tr><td><b>'+esc((r.color||'')+' '+(r.category||''))+'</b></td><td>'+esc(r.found_location||'—')+'</td><td>'+(r.similarity!==null&&r.similarity!==undefined?esc(r.similarity)+'%':'—')+'</td><td>'+esc(new Date(r.created_at).toLocaleString())+'</td><td><button class="row-delete" data-admin-delete-report="'+esc(r.id)+'">Delete</button></td></tr>').join('');
}
function renderHandovers(rows){
 const box=$('#handoverQueue'); if(!box)return;
 if(!rows?.length){box.innerHTML='<div class="guard-flow"><span>No secure handover requests waiting</span></div>';return;}
 box.innerHTML=rows.map(r=>'<article class="desk-request"><div><strong>'+esc(r.case?.case_code||'Case')+' · '+esc(r.case?.color||'')+' '+esc(r.case?.category||'')+'</strong><small>Found near '+esc(r.found_location||'PCE campus')+' · '+esc(r.score??'—')+'% candidate</small></div><span class="desk-status '+esc(r.status)+'">'+esc(String(r.status).toUpperCase())+'</span>'+(r.status==='pending'?'<div class="desk-actions"><button data-desk-review="approved" data-request-id="'+esc(r.id)+'">Approve</button><button data-desk-review="rejected" data-request-id="'+esc(r.id)+'">Reject</button></div>':r.status==='approved'?'<div class="desk-code"><b>'+esc(r.handover_code||'------')+'</b><button data-desk-review="completed" data-request-id="'+esc(r.id)+'">Complete handover</button></div>':'')+'</article>').join('');
}
function renderRows(list=CASES){
 const body=$('#caseRows'); if(!body)return;
 if(!list.length){body.innerHTML='<tr><td colspan="7">No case activity yet.</td></tr>';return}
 body.innerHTML=list.map(c=>'<tr><td><b>'+esc(c.case_code)+'</b></td><td>'+esc(c.color+' '+c.category)+'</td><td><span class="stage">'+stage(c)+'</span></td><td>'+(c.sightings?.length?esc(c.sightings[c.sightings.length-1].confidence)+'%':'—')+'</td><td>'+esc(c.last_seen_location)+'</td><td>'+signalBars(c)+'</td><td><button class="row-delete" data-admin-delete-case="'+esc(c.id)+'" data-case-code="'+esc(c.case_code)+'">Delete</button></td></tr>').join('');
}
function logsFrom(cases,reports){
 const logs=[];
 cases.forEach(c=>{
  logs.push({t:c.created_at,type:'info',txt:'Case '+c.case_code+' registered: '+c.color+' '+c.category+'.'});
  (c.sightings||[]).forEach(s=>logs.push({t:s.created_at,type:'success',txt:'Vision detection recorded '+s.detected_class+' candidate at '+s.confidence+'% score.'}));
  if(c.status==='recovered')logs.push({t:c.updated_at||c.created_at,type:'success',txt:'Case '+c.case_code+' marked recovered after human verification.'});
 });
 reports.forEach(r=>logs.push({t:r.created_at,type:'warn',txt:'Finder report received near '+r.found_location+' with '+(r.similarity??'—')+'% top candidate score.'}));
 return logs.sort((a,b)=>new Date(b.t)-new Date(a.t)).slice(0,18);
}
function renderLogs(logs){
 const box=$('#activityFeed'); if(!box)return;
 if(!logs.length){box.innerHTML='<div class="log"><time>--:--</time><span class="tag info">INFO</span><p>Waiting for live recovery activity.</p></div>';return}
 box.innerHTML=logs.map(x=>'<div class="log"><time>'+fmt(x.t)+'</time><span class="tag '+x.type+'">'+x.type.toUpperCase()+'</span><p>'+esc(x.txt)+'</p></div>').join('');
}

const runtimeStart=Date.now();
const AGENTS={
 vision:{online:true,label:'READY',up:0,down:0,last:Date.now()},
 similarity:{online:true,label:'READY',up:0,down:0,last:Date.now()},
 context:{online:true,label:'ONLINE',up:0,down:0,last:Date.now()},
 explanation:{online:true,label:'ONLINE',up:0,down:0,last:Date.now()},
 notification:{online:true,label:'ONLINE',up:0,down:0,last:Date.now()},
 security:{online:true,label:'ONLINE',up:0,down:0,last:Date.now()},
 fallback:{online:true,label:'ONLINE',up:0,down:0,last:Date.now()}
};
function tickAgents(){
 const now=Date.now();
 Object.values(AGENTS).forEach(a=>{
  const delta=Math.max(0,now-a.last);
  if(a.online)a.up+=delta;else a.down+=delta;
  a.last=now;
 });
}
function duration(ms){
 const sec=Math.floor(ms/1000),h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;
 return [h,m,s].map(v=>String(v).padStart(2,'0')).join(':');
}
function setAgentStatus(name,online,label){
 const a=AGENTS[name]; if(!a)return;
 tickAgents();a.online=!!online;a.label=label||(online?'ONLINE':'DOWN');
 renderAgentRuntime();
}
function setCloudAgents(ok){
 ['context','explanation','notification','security'].forEach(name=>setAgentStatus(name,ok,ok?'ONLINE':'DOWN'));
 setAgentStatus('fallback',true,ok?'SYNCED':'FALLBACK');
}
function renderAgentRuntime(){
 const totalAgents=Object.keys(AGENTS).length;
 let onlineCount=0;
 Object.entries(AGENTS).forEach(([name,a])=>{
  if(a.online)onlineCount++;
  const card=document.querySelector('[data-runtime-agent="'+name+'"]');
  if(card){
   card.classList.toggle('down',!a.online);
   card.classList.toggle('fallback-mode',a.label==='FALLBACK');
   const em=card.querySelector('em');if(em){em.textContent=a.label;em.className=a.online?'ok':'down-state'}
   const up=card.querySelector('[data-up]'),down=card.querySelector('[data-down]'),pct=card.querySelector('[data-pct]');
   if(up)up.textContent=duration(a.up);if(down)down.textContent=duration(a.down);
   const total=a.up+a.down;if(pct)pct.textContent=(total?((a.up/total)*100):100).toFixed(total>60000?1:0)+'%';
  }
  const node=document.querySelector('[data-agent-node="'+name+'"]');
  if(node){
   node.classList.toggle('node-down',!a.online);
   node.classList.toggle('node-fallback',a.label==='FALLBACK');
   const em=node.querySelector('em');if(em)em.textContent=a.label;
  }
 });
 const count=$('#sidebarAgentCount');if(count)count.textContent=onlineCount+'/'+totalAgents;
 const mode=$('#sidebarMode');if(mode)mode.textContent=onlineCount===totalAgents?'Live':'Fallback';
 const health=$('#agentHealth');if(health){health.textContent=onlineCount===totalAgents?'ALL ONLINE':onlineCount+'/'+totalAgents+' ONLINE';health.className=onlineCount===totalAgents?'ok':'warn'}
 const pill=document.querySelector('.health-pill');if(pill){pill.textContent=onlineCount===totalAgents?'● All agents operational':'● '+onlineCount+'/'+totalAgents+' agents available';pill.classList.toggle('degraded',onlineCount!==totalAgents)}
}
setInterval(()=>{tickAgents();renderAgentRuntime()},1000);

async function load(){
 const started=performance.now();
 try{
  const [stats,cases,reports,handovers]=await Promise.all([
   call('get_stats'),
   call('admin_list_all_cases',{admin_pin:ADMIN_PIN}),
   call('admin_list_all_found_reports',{admin_pin:ADMIN_PIN}),
   call('admin_list_handover_requests',{admin_pin:ADMIN_PIN})
  ]);
  const latency=Math.round(performance.now()-started);
  const s=stats.stats||{};
  $('#kActive').textContent=s.active??0;$('#kMatched').textContent=s.matched??0;$('#kRecovered').textContent=s.recovered??0;$('#kFound').textContent=s.found_reports??0;
  CASES=cases.cases||[];FOUND_REPORTS=reports.reports||[];renderRows();renderFoundReports();renderLogs(logsFrom(CASES,FOUND_REPORTS));renderHandovers(handovers.requests||[]);
  $('#dbHealth').textContent='HEALTHY';$('#dbHealth').className='ok';
  const check=$('#monitorLastCheck');if(check)check.textContent='Last check '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const latencyEl=$('#monitorLatency');if(latencyEl)latencyEl.textContent=latency+' ms';
  setCloudAgents(true);
  toast('Security Desk synchronized');
 }catch(e){
  console.error(e);
  const latency=Math.round(performance.now()-started);
  $('#dbHealth').textContent='DEGRADED';$('#dbHealth').className='warn';
  const check=$('#monitorLastCheck');if(check)check.textContent='Check failed '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const latencyEl=$('#monitorLatency');if(latencyEl)latencyEl.textContent=latency+' ms';
  setCloudAgents(false);
  renderLogs([{t:new Date(),type:'warn',txt:'Cloud sync unavailable. Local fallback remains available for saved student cases.'}]);
 }
}

$('#refreshBtn')?.addEventListener('click',load);
$('#caseSearch')?.addEventListener('input',e=>{const q=e.target.value.toLowerCase();renderRows(CASES.filter(c=>[c.case_code,c.category,c.color,c.last_seen_location,c.details].join(' ').toLowerCase().includes(q)))});
document.querySelectorAll('.sidebar nav a').forEach(a=>a.addEventListener('click',()=>{document.querySelectorAll('.sidebar nav a').forEach(x=>x.classList.remove('active'));a.classList.add('active')}));

document.addEventListener('click',async e=>{
 const caseDelete=e.target.closest?.('[data-admin-delete-case]');
 if(caseDelete){
  const code=caseDelete.dataset.caseCode||'this case';
  if(!confirm('Delete '+code+' permanently? Related sightings, claims, alerts and handover requests will also be removed.'))return;
  caseDelete.disabled=true;
  try{await call('admin_delete_case',{admin_pin:ADMIN_PIN,case_id:caseDelete.dataset.adminDeleteCase});toast(code+' deleted');await load();}catch(err){toast(err.message||'Could not delete case');caseDelete.disabled=false;}
  return;
 }
 const reportDelete=e.target.closest?.('[data-admin-delete-report]');
 if(reportDelete){
  if(!confirm('Delete this found-item report permanently?'))return;
  reportDelete.disabled=true;
  try{await call('admin_delete_found_report',{admin_pin:ADMIN_PIN,report_id:reportDelete.dataset.adminDeleteReport});toast('Found report deleted');await load();}catch(err){toast(err.message||'Could not delete report');reportDelete.disabled=false;}
  return;
 }
 if(e.target.closest?.('#clearDemoData')){
  const phrase=prompt('Type CLEAR to remove ALL OrbitFind demo data from the cloud database.');
  if(phrase!=='CLEAR'){toast('Clear cancelled');return;}
  const btn=$('#clearDemoData');btn.disabled=true;btn.textContent='Clearing…';
  try{await call('admin_clear_demo_data',{admin_pin:ADMIN_PIN,confirm:'CLEAR_DEMO_DATA'});localStorage.removeItem('orbitfind_cases');localStorage.removeItem('orbitfind_handover_requests');toast('All demo data cleared');await load();}catch(err){toast(err.message||'Could not clear demo data');}
  btn.disabled=false;btn.textContent='Clear all demo data';
  return;
 }
 const b=e.target.closest?.('[data-desk-review]'); if(!b)return;
 b.disabled=true;
 try{
  await call('admin_review_handover',{admin_pin:ADMIN_PIN,request_id:b.dataset.requestId,decision:b.dataset.deskReview});
  toast(b.dataset.deskReview==='approved'?'Handover approved · code created':b.dataset.deskReview==='completed'?'Handover completed':'Handover request rejected');
  await load();
 }catch(err){toast(err.message||'Could not update handover');b.disabled=false;}
});

window.addEventListener('offline',()=>{setCloudAgents(false);const check=$('#monitorLastCheck');if(check)check.textContent='Device offline · using fallback'});
window.addEventListener('online',()=>load());

renderAgentRuntime();
load();
setInterval(load,15000);
