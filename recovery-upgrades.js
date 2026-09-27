(()=>{
const esc=(v='')=>String(v).replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
const fmtScore=v=>v===null||v===undefined?'N/A':Math.round(Number(v))+'%';
const handoverTimers=new Map();
const seenKey='orbitfind_seen_match_alerts';

function scoreRow(label,value){
  const n=value===null||value===undefined?0:Math.max(0,Math.min(100,Number(value)||0));
  return '<div class="explain-row"><span>'+esc(label)+'</span><div><i style="width:'+n+'%"></i></div><b>'+fmtScore(value)+'</b></div>';
}

function installMatchRenderer(){
  if(typeof renderFinderMatches!=='function') return;
  renderFinderMatches=function(matches){
    const list=document.querySelector('#matchList'); if(!list)return;
    if(!matches?.length){list.innerHTML='<div class="empty-cases">No active lost-item cases matched this category.</div>';return;}
    list.innerHTML=matches.map((m,i)=>{
      const b=m.breakdown||{};
      return '<article class="match-card upgraded-match" data-case-card="'+esc(m.case_id)+'">'+
        '<div class="match-card-top"><span class="match-rank">CANDIDATE #'+(i+1)+' · '+esc(m.case_code)+'</span><span class="match-score">'+esc(m.score)+'%</span></div>'+
        '<h4>'+esc(pretty(m.color))+' '+esc(pretty(m.category))+'</h4>'+
        '<p>'+(m.visual_similarity!==null&&m.visual_similarity!==undefined?'Visual similarity '+esc(m.visual_similarity)+'%':'Matched without reference-photo similarity')+'</p>'+
        '<div class="reason-row">'+(m.reasons||[]).map(r=>'<span>'+esc(r)+'</span>').join('')+'</div>'+
        '<div class="match-location">Lost near: '+esc(m.last_seen_location)+'</div>'+
        '<details class="match-explain"><summary>Why this match?</summary><div class="explain-grid">'+
          scoreRow('Category',b.category??100)+
          scoreRow('Visual',b.visual)+
          scoreRow('Color',b.color)+
          scoreRow('Location',b.location)+
          scoreRow('Description',b.description)+
        '</div><small>Candidate score combines multiple signals. Final ownership still requires human verification.</small></details>'+
        '<div class="secure-handover-box"><div><strong>Private handover</strong><small>No phone number or email is shared between finder and owner.</small></div>'+
        '<button class="case-mini-btn primary" data-secure-handover="'+esc(m.case_id)+'" data-score="'+esc(m.score)+'" data-case-code="'+esc(m.case_code)+'">Request secure handover</button>'+
        '<div class="handover-status" data-handover-status="'+esc(m.case_id)+'"></div></div>'+
      '</article>';
    }).join('');
  };
}

function saveRequest(id,caseId){
  const map=JSON.parse(localStorage.getItem('orbitfind_handover_requests')||'{}');
  map[caseId]=id; localStorage.setItem('orbitfind_handover_requests',JSON.stringify(map));
}
function getRequest(caseId){
  const map=JSON.parse(localStorage.getItem('orbitfind_handover_requests')||'{}'); return map[caseId]||null;
}

async function checkHandover(requestId,caseId){
  const box=document.querySelector('[data-handover-status="'+CSS.escape(caseId)+'"]');
  try{
    const out=await cloudCall({action:'get_secure_handover_status',request_id:requestId});
    const r=out.request||{};
    if(!box)return;
    if(r.status==='approved'){
      box.innerHTML='<div class="handover-approved"><span>APPROVED</span><strong>'+esc(r.handover_code||'------')+'</strong><small>Show this 6-digit code at the PCE Security Desk during handover.</small></div>';
      clearInterval(handoverTimers.get(requestId)); handoverTimers.delete(requestId);
      toast('Secure handover approved');
    }else if(r.status==='rejected'){
      box.innerHTML='<div class="handover-rejected">Request was not approved. Verify the item details before trying again.</div>';
      clearInterval(handoverTimers.get(requestId)); handoverTimers.delete(requestId);
    }else if(r.status==='completed'){
      box.innerHTML='<div class="handover-approved"><span>COMPLETED</span><small>Item handover is complete and the case has been closed.</small></div>';
      clearInterval(handoverTimers.get(requestId)); handoverTimers.delete(requestId);
    }else{
      box.innerHTML='<div class="handover-pending">Waiting for PCE Security Desk review…</div>';
    }
  }catch(err){ if(box) box.innerHTML='<div class="handover-pending">Status will refresh when cloud connection is available.</div>'; }
}
function startHandoverPolling(requestId,caseId){
  if(handoverTimers.has(requestId))return;
  checkHandover(requestId,caseId);
  const timer=setInterval(()=>checkHandover(requestId,caseId),9000);
  handoverTimers.set(requestId,timer);
}

document.addEventListener('click',async e=>{
  const btn=e.target.closest?.('[data-secure-handover]');
  if(btn){
    const report=window.orbitLastFoundReport;
    const caseId=btn.dataset.secureHandover;
    const existing=getRequest(caseId);
    if(existing){startHandoverPolling(existing,caseId);return;}
    if(!report?.id){toast('Run a fresh found-item match first');return;}
    btn.disabled=true;btn.textContent='Sending request…';
    try{
      const out=await cloudCall({action:'request_secure_handover',found_report_id:report.id,case_id:caseId,score:Number(btn.dataset.score||0)});
      const id=out.request?.id;
      if(id){saveRequest(id,caseId);startHandoverPolling(id,caseId);}
      toast('Secure handover request sent');
      btn.textContent='Request sent';
    }catch(err){toast(err.message||'Could not send handover request');btn.disabled=false;btn.textContent='Request secure handover';}
    return;
  }
  const alertsBtn=e.target.closest?.('#matchAlertButton');
  if(alertsBtn){
    document.querySelector('#matchAlertPanel')?.classList.toggle('open');
    markVisibleAlertsSeen();
    return;
  }
  const enable=e.target.closest?.('#enableBrowserAlerts');
  if(enable){
    if(!('Notification' in window)){toast('Browser notifications are not supported here');return;}
    const p=await Notification.requestPermission();
    toast(p==='granted'?'Browser alerts enabled':'Notification permission not enabled');
    return;
  }
});

function ensureAlertUI(){
  const top=document.querySelector('.top-actions');
  if(top&&!document.querySelector('#matchAlertButton')){
    const b=document.createElement('button');b.id='matchAlertButton';b.className='match-alert-button';b.type='button';b.innerHTML='Alerts <span id="matchAlertCount">0</span>';top.insertBefore(b,top.querySelector('.admin-entry')||top.lastElementChild);
  }
  if(!document.querySelector('#matchAlertPanel')){
    const p=document.createElement('div');p.id='matchAlertPanel';p.className='match-alert-panel';
    p.innerHTML='<div class="alert-panel-head"><div><small>LIVE MATCH ALERTS</small><strong>Possible matches</strong></div><button id="enableBrowserAlerts" type="button">Enable browser alerts</button></div><div id="matchAlertList"><div class="empty-cases">No new match alerts.</div></div>';
    document.body.appendChild(p);
  }
  if(!document.querySelector('#fallbackStrip')){
    const s=document.createElement('div');s.id='fallbackStrip';s.className='fallback-strip';document.body.appendChild(s);
  }
}

function getSeen(){try{return new Set(JSON.parse(localStorage.getItem(seenKey)||'[]'))}catch{return new Set()}}
function setSeen(set){localStorage.setItem(seenKey,JSON.stringify([...set].slice(-100)))}
let lastAlerts=[];
async function pollAlerts(){
  try{
    const out=await cloudCall({action:'list_match_alerts'});
    lastAlerts=out.alerts||[];
    const seen=getSeen();
    const unread=lastAlerts.filter(a=>a.status==='unread');
    document.querySelector('#matchAlertCount').textContent=String(unread.length);
    const list=document.querySelector('#matchAlertList');
    if(list) list.innerHTML=lastAlerts.length?lastAlerts.map(a=>'<article class="live-alert '+(a.status==='unread'?'unread':'')+'"><div><strong>'+esc(a.case?.case_code||'Case')+' · '+esc(a.score)+'%</strong><span>'+esc(pretty(a.case?.color||''))+' '+esc(pretty(a.case?.category||''))+'</span></div><small>Found near '+esc(a.found_location||'campus')+'</small></article>').join(''):'<div class="empty-cases">No match alerts yet.</div>';
    unread.forEach(a=>{
      if(seen.has(a.id))return;
      seen.add(a.id);
      toast('Possible match found for '+(a.case?.case_code||'your case'));
      if('Notification' in window&&Notification.permission==='granted'){
        new Notification('OrbitFind possible match',{body:(a.case?.case_code||'Case')+' · '+a.score+'% candidate near '+(a.found_location||'PCE campus')});
      }
    });
    setSeen(seen);
    setFallbackState(true);
  }catch(err){setFallbackState(false);}
}
async function markVisibleAlertsSeen(){
  const unread=lastAlerts.filter(a=>a.status==='unread');
  await Promise.allSettled(unread.map(a=>cloudCall({action:'mark_match_alert_seen',alert_id:a.id})));
  setTimeout(pollAlerts,300);
}
function setFallbackState(cloudOk){
  const strip=document.querySelector('#fallbackStrip'); if(!strip)return;
  if(!navigator.onLine){strip.textContent='Offline fallback active · Local case data remains available until connection returns.';strip.classList.add('show');return;}
  if(!cloudOk){strip.textContent='Cloud sync temporarily unavailable · Local fallback keeps core case data available.';strip.classList.add('show');return;}
  strip.classList.remove('show');
}
window.addEventListener('offline',()=>setFallbackState(false));
window.addEventListener('online',()=>{setFallbackState(true);pollAlerts();});

ensureAlertUI();
installMatchRenderer();
pollAlerts();
setInterval(pollAlerts,10000);
})();