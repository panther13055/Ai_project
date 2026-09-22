(()=>{
  const esc=(v='')=>String(v).replace(/[&<>'"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch]));
  const fmtDate=(v)=>{try{return new Date(v).toLocaleString([], {dateStyle:'medium',timeStyle:'short'})}catch{return '—'}};
  const statusLabel=(c)=>c.status==='recovered'?'RECOVERED':(c.status==='match_seen'||c.lastSighting)?'MATCH SEEN':'ACTIVE';
  const statusKey=(c)=>c.status==='recovered'?'recovered':(c.status==='match_seen'||c.lastSighting)?'match_seen':'active';
  let caseFilter='all', caseSearch='', caseSort='newest';

  function ensureRecoveryDesk(){
    const section=document.querySelector('#cases');
    const grid=document.querySelector('#casesGrid');
    if(!section||!grid||document.querySelector('.cases-toolbar')) return;
    const shell=document.createElement('div'); shell.className='cases-shell';
    const toolbar=document.createElement('div'); toolbar.className='cases-toolbar';
    toolbar.innerHTML=`
      <div class="case-search"><input id="caseSearch" autocomplete="off" placeholder="Search case ID, item, color or campus location…"></div>
      <div class="case-filters" id="caseFilters">
        <button class="case-filter active" data-case-filter="all">All</button>
        <button class="case-filter" data-case-filter="active">Active</button>
        <button class="case-filter" data-case-filter="match_seen">Match seen</button>
        <button class="case-filter" data-case-filter="recovered">Recovered</button>
      </div>
      <select class="case-sort" id="caseSort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>`;
    const count=document.createElement('div'); count.className='case-result-count'; count.id='caseResultCount';
    grid.parentNode.insertBefore(shell,grid); shell.append(toolbar,count,grid);

    const claims=document.createElement('div'); claims.className='claims-panel'; claims.innerHTML=`<div class="claims-title">Ownership verification queue</div><div id="claimsInbox"><div class="empty-cases">Checking for ownership claims…</div></div>`;
    shell.appendChild(claims);

    const drawer=document.createElement('div'); drawer.className='case-drawer-backdrop'; drawer.id='caseDrawerBackdrop';
    drawer.innerHTML='<aside class="case-drawer" id="caseDrawer"></aside>'; document.body.appendChild(drawer);

    const modal=document.createElement('div'); modal.className='claim-modal'; modal.id='claimModal';
    modal.innerHTML=`<div class="claim-box"><h3>Verify ownership</h3><p>Enter a detail that only the real owner is likely to know, such as a sticker, keychain, contents, scratch, or identifying mark. Do not enter passwords or sensitive personal data.</p><textarea id="claimNote" placeholder="Example: There is a red keychain on the left zip and a small white sticker inside."></textarea><div class="claim-box-actions"><button class="case-mini-btn" data-close-claim>Cancel</button><button class="case-mini-btn primary" id="submitClaimBtn">Submit claim</button></div></div>`;
    document.body.appendChild(modal);
  }

  function enhancedRenderCases(){
    const grid=document.querySelector('#casesGrid'); if(!grid) return;
    const all=storedCases().slice();
    let arr=all.filter(c=>caseFilter==='all'||statusKey(c)===caseFilter);
    const q=caseSearch.trim().toLowerCase();
    if(q) arr=arr.filter(c=>[c.id,c.category,c.color,c.location,c.details].some(v=>String(v||'').toLowerCase().includes(q)));
    arr.sort((a,b)=>caseSort==='oldest'?a.created-b.created:b.created-a.created);
    const count=document.querySelector('#caseResultCount'); if(count) count.textContent=`Showing ${arr.length} of ${all.length} cases`;
    if(!arr.length){grid.innerHTML='<div class="recovery-empty"><strong>No matching cases</strong>Try another filter/search or register a new lost item.</div>';return;}
    grid.innerHTML=arr.map(c=>{
      const last=c.lastSighting; const st=statusKey(c); const sig=last?`${last.confidence}%`:'—'; const sightings=(c.sightings||[]).length;
      return `<article class="case-card enhanced" data-status="${st}"><span class="case-accent"></span><div class="case-card-main"><div class="case-card-top"><span class="case-num">${esc(c.id)}</span><span class="case-status status-${st}">${statusLabel(c)}</span></div><h3>${esc(pretty(c.color))} ${esc(pretty(c.category))}</h3><div class="case-location">⌖ <span>${esc(c.location||'Location not set')}</span></div><p>${esc(c.details||'No distinctive details added.')}</p><div class="case-signal-row"><div class="case-signal"><span>AI sightings</span><strong>${sightings}</strong></div><div class="case-signal"><span>Last score</span><strong>${sig}</strong></div><div class="case-signal"><span>Opened</span><strong>${esc(new Date(c.created).toLocaleDateString())}</strong></div></div><div class="case-actions"><button class="case-mini-btn primary" data-view-case="${esc(c.id)}">View intelligence</button><button class="case-mini-btn" data-scan-case="${esc(c.id)}">Scan again</button><button class="case-mini-btn" data-copy-case="${esc(c.id)}">Copy ID</button>${c.status!=='recovered'&&c.cloud_id?`<button class="case-mini-btn" data-recover-id="${esc(c.cloud_id)}" data-case-code="${esc(c.id)}">Mark recovered</button>`:''}</div></div></article>`;
    }).join('');
  }

  function openCaseDrawer(id){
    const c=storedCases().find(x=>x.id===id); if(!c) return;
    const drawer=document.querySelector('#caseDrawer'); const back=document.querySelector('#caseDrawerBackdrop');
    const events=[{at:c.created,type:'registered',title:'Case registered',sub:`${pretty(c.color)} ${pretty(c.category)} · ${c.location}`}];
    (c.sightings||[]).forEach(s=>events.push({at:s.at,type:'match',title:'AI sighting recorded',sub:`${s.confidence}% candidate score · ${s.color||'color unknown'} · ${s.source||'scan'}`}));
    if(c.status==='recovered') events.push({at:Date.now(),type:'recovered',title:'Case recovered',sub:'Item marked recovered and removed from active matching.'});
    events.sort((a,b)=>a.at-b.at);
    drawer.innerHTML=`<div class="drawer-top"><div><span class="drawer-kicker">Case intelligence · ${esc(c.id)}</span><div class="drawer-title">${esc(pretty(c.color))} ${esc(pretty(c.category))}</div><div class="drawer-sub">${esc(c.details||'No distinctive details added.')}</div></div><button class="drawer-close" data-close-drawer>×</button></div><div class="intelligence-grid"><div class="intel-box"><span>Status</span><strong>${statusLabel(c)}</strong></div><div class="intel-box"><span>Campus location</span><strong>${esc(c.location||'—')}</strong></div><div class="intel-box"><span>Reference fingerprint</span><strong>${c.reference_embedding?'Available':'Not added'}</strong></div><div class="intel-box"><span>AI sightings</span><strong>${(c.sightings||[]).length}</strong></div></div><div class="timeline-title">Recovery timeline</div><div class="case-timeline">${events.map(e=>`<div class="timeline-event ${e.type}"><strong>${esc(e.title)}</strong><span>${esc(e.sub)} · ${fmtDate(e.at)}</span></div>`).join('')}</div><div class="case-actions"><button class="case-mini-btn primary" data-scan-case="${esc(c.id)}">Open scanner</button><button class="case-mini-btn" data-copy-case="${esc(c.id)}">Copy case ID</button>${c.status!=='recovered'&&c.cloud_id?`<button class="case-mini-btn" data-recover-id="${esc(c.cloud_id)}" data-case-code="${esc(c.id)}">Mark recovered</button>`:''}</div>`;
    back.classList.add('open');
  }

  async function loadClaims(){
    const inbox=document.querySelector('#claimsInbox'); if(!inbox) return;
    try{
      const out=await cloudCall({action:'list_claims'}); const claims=out.claims||[];
      if(!claims.length){inbox.innerHTML='<div class="recovery-empty"><strong>No ownership claims waiting</strong>When a finder/owner submits verification, it will appear here.</div>';return;}
      inbox.innerHTML=claims.map(c=>`<article class="claim-card"><div class="claim-card-top"><strong>${esc(c.case?.case_code||'Case')}</strong><span class="claim-pill">${esc(String(c.status).toUpperCase())}</span></div><p>${esc(c.verification_note||'No note')}</p><small>${fmtDate(c.created_at)} · ${esc(pretty(c.case?.color||''))} ${esc(pretty(c.case?.category||''))}</small>${c.status==='pending'?`<div class="claim-actions"><button class="claim-action approve" data-claim-update="approved" data-claim-id="${esc(c.id)}">Approve verification</button><button class="claim-action reject" data-claim-update="rejected" data-claim-id="${esc(c.id)}">Reject</button></div>`:''}</article>`).join('');
    }catch(err){console.warn(err); inbox.innerHTML='<div class="empty-cases">Could not load verification queue right now.</div>';}
  }

  function overrideFinderMatches(){
    renderFinderMatches=function(matches){
      const list=document.querySelector('#matchList'); if(!list)return;
      if(!matches?.length){list.innerHTML='<div class="empty-cases">No active lost-item cases matched this category.</div>';return;}
      list.innerHTML=matches.map((m,i)=>`<article class="match-card"><div class="match-card-top"><span class="match-rank">CANDIDATE #${i+1} · ${esc(m.case_code)}</span><span class="match-score">${esc(m.score)}%</span></div><h4>${esc(pretty(m.color))} ${esc(pretty(m.category))}</h4><p>${m.visual_similarity!==null&&m.visual_similarity!==undefined?'Visual similarity '+esc(m.visual_similarity)+'%':'Matched without reference-photo similarity'}</p><div class="reason-row">${(m.reasons||[]).map(r=>'<span>'+esc(r)+'</span>').join('')}</div><div class="match-location">Lost near: ${esc(m.last_seen_location)}</div><div class="case-actions"><button class="case-mini-btn primary" data-start-claim="${esc(m.case_id)}" data-claim-code="${esc(m.case_code)}">This may be mine</button></div></article>`).join('');
    };
  }

  function scanCase(id){
    const arr=storedCases(); const idx=arr.findIndex(x=>x.id===id); if(idx<0)return;
    const [c]=arr.splice(idx,1); arr.push(c); saveCases(arr); updateTarget(); renderCases(); document.querySelector('#scanner')?.scrollIntoView({behavior:'smooth'}); toast('Scanner target changed to '+id);
  }

  async function addPendingClaimsStat(){
    const grid=document.querySelector('.stats-grid'); if(!grid)return;
    let card=document.querySelector('#statClaims')?.closest('.stat-card');
    if(!card){card=document.createElement('article');card.className='stat-card premium-card pending-claims-stat';card.innerHTML='<span>Pending claims</span><strong id="statClaims">0</strong><small>Awaiting ownership review</small>';grid.appendChild(card);}
    try{const out=await cloudCall({action:'get_stats'}); document.querySelector('#statClaims').textContent=out.stats?.pending_claims??0;}catch{}
  }

  ensureRecoveryDesk();
  overrideFinderMatches();
  renderCases=enhancedRenderCases;
  renderCases();
  loadClaims();
  addPendingClaimsStat();

  document.addEventListener('input',e=>{if(e.target?.id==='caseSearch'){caseSearch=e.target.value;renderCases();}});
  document.addEventListener('change',e=>{if(e.target?.id==='caseSort'){caseSort=e.target.value;renderCases();}});
  document.addEventListener('click',async e=>{
    const filter=e.target.closest?.('[data-case-filter]'); if(filter){caseFilter=filter.dataset.caseFilter;document.querySelectorAll('[data-case-filter]').forEach(x=>x.classList.toggle('active',x===filter));renderCases();return;}
    const view=e.target.closest?.('[data-view-case]'); if(view){openCaseDrawer(view.dataset.viewCase);return;}
    const scan=e.target.closest?.('[data-scan-case]'); if(scan){document.querySelector('#caseDrawerBackdrop')?.classList.remove('open');scanCase(scan.dataset.scanCase);return;}
    const copy=e.target.closest?.('[data-copy-case]'); if(copy){await navigator.clipboard?.writeText(copy.dataset.copyCase);toast('Case ID copied');return;}
    if(e.target.closest?.('[data-close-drawer]')||e.target?.id==='caseDrawerBackdrop'){document.querySelector('#caseDrawerBackdrop')?.classList.remove('open');return;}
    const start=e.target.closest?.('[data-start-claim]'); if(start){const modal=document.querySelector('#claimModal');modal.dataset.caseId=start.dataset.startClaim;modal.dataset.caseCode=start.dataset.claimCode;document.querySelector('#claimNote').value='';modal.classList.add('open');return;}
    if(e.target.closest?.('[data-close-claim]')){document.querySelector('#claimModal')?.classList.remove('open');return;}
    if(e.target?.id==='submitClaimBtn'){
      const modal=document.querySelector('#claimModal'), note=document.querySelector('#claimNote').value.trim();
      if(note.length<3){toast('Add one identifying detail first');return;}
      e.target.disabled=true;e.target.textContent='Submitting…';
      try{await cloudCall({action:'create_claim',case_id:modal.dataset.caseId,verification_note:note});toast('Ownership claim submitted for '+modal.dataset.caseCode);modal.classList.remove('open');await loadClaims();await addPendingClaimsStat();}catch(err){toast(err.message||'Claim could not be submitted');}
      e.target.disabled=false;e.target.textContent='Submit claim';return;
    }
    const claimUpdate=e.target.closest?.('[data-claim-update]'); if(claimUpdate){claimUpdate.disabled=true;try{await cloudCall({action:'update_claim',claim_id:claimUpdate.dataset.claimId,status:claimUpdate.dataset.claimUpdate});toast('Claim '+claimUpdate.dataset.claimUpdate);await loadClaims();await syncFromCloud();renderCases();await addPendingClaimsStat();}catch(err){toast(err.message||'Could not update claim');claimUpdate.disabled=false;}return;}
  });

  const oldSync=syncFromCloud;
  syncFromCloud=async function(){const ok=await oldSync();renderCases();return ok;};
})();