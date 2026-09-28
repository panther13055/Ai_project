(()=>{
const esc=(v='')=>String(v).replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
const fmtScore=v=>v===null||v===undefined?'N/A':Math.round(Number(v))+'%';
const handoverTimers=new Map();
const seenKey='orbitfind_seen_match_alerts';
const baseTitle=document.title;
let activeVerificationAlert=null;

function installOwnershipRegistration(){
  const grid=document.querySelector('#caseForm .field-grid');
  if(!grid||document.querySelector('#ownershipProofBlock'))return;
  const block=document.createElement('div');
  block.id='ownershipProofBlock';
  block.className='field field-wide ownership-proof-card';
  block.innerHTML=
    '<div class="ownership-proof-head"><div><span>PRIVATE OWNERSHIP PROOF</span><strong>Something only the real owner should know</strong></div><b>Encrypted check</b></div>'+
    '<p>This answer is never shown to the finder. OrbitFind stores only a protected hash and uses it when a possible match is found.</p>'+
    '<div class="ownership-proof-grid">'+
      '<label><span>Private verification question</span><input id="ownershipQuestion" maxlength="180" autocomplete="off" placeholder="e.g. What is attached inside the front pocket?" required /></label>'+
      '<label><span>Secret answer</span><input id="ownershipAnswer" maxlength="180" autocomplete="off" placeholder="e.g. small red keychain" required /></label>'+
    '</div>'+
    '<label class="notify-opt"><input id="enableMatchNotifications" type="checkbox" checked /><span><strong>Notify this device when a possible match is found</strong><small>Browser notification when OrbitFind is open or active, plus in-app match alerts.</small></span></label>';
  const lastSeen=document.querySelector('#lastSeen')?.closest('.field');
  if(lastSeen) grid.insertBefore(block,lastSeen); else grid.appendChild(block);
}

function installOwnershipModal(){
  if(document.querySelector('#ownershipVerifyModal'))return;
  const m=document.createElement('div');
  m.id='ownershipVerifyModal';
  m.className='ownership-modal';
  m.setAttribute('aria-hidden','true');
  m.innerHTML='<div class="ownership-modal-card" role="dialog" aria-modal="true" aria-labelledby="ownershipVerifyTitle">'+
    '<button class="ownership-modal-close" type="button" data-close-ownership>×</button>'+
    '<div class="ownership-modal-icon">✓</div>'+
    '<small>OWNER VERIFICATION</small>'+
    '<h3 id="ownershipVerifyTitle">Prove this item is yours</h3>'+
    '<p id="ownershipVerifyQuestion">Answer the private question you created when registering the item.</p>'+
    '<form id="ownershipVerifyForm">'+
      '<input id="ownershipVerifyAnswer" autocomplete="off" placeholder="Enter your private answer" required />'+
      '<button class="case-mini-btn primary" type="submit">Verify ownership</button>'+
    '</form>'+
    '<div id="ownershipVerifyStatus" class="ownership-verify-status">Your answer is checked securely on the backend and is never shown to the finder.</div>'+
  '</div>';
  document.body.appendChild(m);
}

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
        '<div class="secure-handover-box"><div><strong>Private handover</strong><small>The registered owner must pass their private proof before Security Desk approval. No contact details are exposed.</small></div>'+
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
  const verifyBtn=e.target.closest?.('[data-verify-ownership]');
  if(verifyBtn){
    const alert=lastAlerts.find(a=>a.id===verifyBtn.dataset.verifyOwnership);
    if(!alert)return;
    activeVerificationAlert=alert;
    document.querySelector('#ownershipVerifyQuestion').textContent=alert.case?.ownership_question||'Answer your private ownership question.';
    document.querySelector('#ownershipVerifyAnswer').value='';
    document.querySelector('#ownershipVerifyStatus').textContent='Your answer is checked securely on the backend and is never shown to the finder.';
    const modal=document.querySelector('#ownershipVerifyModal');
    modal?.classList.add('open');modal?.setAttribute('aria-hidden','false');
    setTimeout(()=>document.querySelector('#ownershipVerifyAnswer')?.focus(),80);
    return;
  }
  if(e.target.closest?.('[data-close-ownership]')){
    const modal=document.querySelector('#ownershipVerifyModal');modal?.classList.remove('open');modal?.setAttribute('aria-hidden','true');activeVerificationAlert=null;return;
  }
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
  installOwnershipRegistration();
  installOwnershipModal();
  const top=document.querySelector('.top-actions');
  if(top&&!document.querySelector('#matchAlertButton')){
    const b=document.createElement('button');b.id='matchAlertButton';b.className='match-alert-button';b.type='button';b.innerHTML='Alerts <span id="matchAlertCount">0</span>';top.insertBefore(b,top.querySelector('.admin-entry')||top.lastElementChild);
  }
  if(!document.querySelector('#matchAlertPanel')){
    const p=document.createElement('div');p.id='matchAlertPanel';p.className='match-alert-panel';
    p.innerHTML='<div class="alert-panel-head"><div><small>LIVE MATCH ALERTS</small><strong>Possible matches</strong></div><div class="alert-head-actions"><button id="enableLiveDistance" type="button">Live distance</button><button id="enableBrowserAlerts" type="button">Browser alerts</button></div></div><div id="liveDistanceState" class="live-distance-state">Distance tracking is off · location permission is only requested when you enable it.</div><div id="matchAlertList"><div class="empty-cases">No new match alerts.</div></div>';
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
    window.orbitMatchAlerts=lastAlerts;
    window.dispatchEvent(new CustomEvent('orbit-alerts-updated'));
    const seen=getSeen();
    const unread=lastAlerts.filter(a=>a.status==='unread');
    document.querySelector('#matchAlertCount').textContent=String(unread.length);
    document.title=unread.length?'('+unread.length+') OrbitFind · Match found':baseTitle;
    const list=document.querySelector('#matchAlertList');
    if(list) list.innerHTML=lastAlerts.length?lastAlerts.map(a=>{
      const proof=a.ownership_status||'pending';
      const hasProof=!!a.case?.has_private_proof;
      let proofUI='';
      if(hasProof&&proof==='verified') proofUI='<div class="owner-proof-state verified">✓ OWNER VERIFIED</div>';
      else if(hasProof&&proof==='locked') proofUI='<div class="owner-proof-state locked">Verification locked · Security Desk manual check required</div>';
      else if(hasProof) proofUI='<button class="verify-owner-btn" type="button" data-verify-ownership="'+esc(a.id)+'">Verify ownership</button>';
      else proofUI='<div class="owner-proof-state manual">Older case · Security Desk will verify manually</div>';
      return '<article class="live-alert '+(a.status==='unread'?'unread':'')+'" data-alert-id="'+esc(a.id)+'">'+
        '<div class="live-alert-main"><div><strong>'+esc(a.case?.case_code||'Case')+' · '+esc(a.score)+'%</strong><span>'+esc(pretty(a.case?.color||''))+' '+esc(pretty(a.case?.category||''))+'</span></div><em>'+esc(proof==='verified'?'VERIFIED':'MATCH FOUND')+'</em></div>'+
        '<small>Found near '+esc(a.found_location||'campus')+' <b class="alert-distance" data-alert-distance="'+esc(a.id)+'"></b></small>'+
        proofUI+
      '</article>';
    }).join(''):'<div class="empty-cases">No match alerts yet.</div>';
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
document.addEventListener('submit',async e=>{
  if(e.target?.id!=='ownershipVerifyForm')return;
  e.preventDefault();
  if(!activeVerificationAlert)return;
  const answer=document.querySelector('#ownershipVerifyAnswer')?.value?.trim()||'';
  const status=document.querySelector('#ownershipVerifyStatus');
  const button=e.target.querySelector('button[type="submit"]');
  if(!answer){if(status)status.textContent='Enter the private answer you set during registration.';return;}
  button.disabled=true;button.textContent='Checking…';
  try{
    const out=await cloudCall({action:'verify_ownership_proof',alert_id:activeVerificationAlert.id,answer});
    if(out.verified){
      if(status){status.className='ownership-verify-status success';status.textContent='✓ Ownership verified. Security Desk can now approve the secure handover.';}
      toast('Ownership verified successfully');
      setTimeout(()=>{
        const modal=document.querySelector('#ownershipVerifyModal');modal?.classList.remove('open');modal?.setAttribute('aria-hidden','true');activeVerificationAlert=null;pollAlerts();
      },900);
    }
  }catch(err){
    if(status){status.className='ownership-verify-status error';status.textContent=err.message||'Private proof did not match. Try again carefully.';}
  }finally{button.disabled=false;button.textContent='Verify ownership';}
});

window.addEventListener('offline',()=>setFallbackState(false));
window.addEventListener('online',()=>{setFallbackState(true);pollAlerts();});

ensureAlertUI();
installMatchRenderer();
pollAlerts();
setInterval(pollAlerts,5000);
})();