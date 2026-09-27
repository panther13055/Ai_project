(()=>{
  const $=s=>document.querySelector(s);
  const state={
    tracking:false,
    timer:null,
    current:null,
    updatedAt:null
  };

  function geoErrorMessage(err){
    if(!err) return 'Location unavailable';
    if(err.code===1) return 'Location permission was not allowed';
    if(err.code===2) return 'Current location is unavailable';
    if(err.code===3) return 'Location request timed out';
    return 'Could not read current location';
  }

  function getPosition(options={enableHighAccuracy:true,timeout:10000,maximumAge:10000}){
    return new Promise((resolve,reject)=>{
      if(!('geolocation' in navigator)) return reject(new Error('Geolocation is not supported on this device'));
      navigator.geolocation.getCurrentPosition(resolve,reject,options);
    });
  }

  function validCoord(v,min,max){
    const n=Number(v);
    return Number.isFinite(n)&&n>=min&&n<=max;
  }

  function haversineMeters(a,b){
    if(!a||!b) return null;
    if(!validCoord(a.lat,-90,90)||!validCoord(a.lng,-180,180)||!validCoord(b.lat,-90,90)||!validCoord(b.lng,-180,180)) return null;
    const R=6371000;
    const rad=x=>x*Math.PI/180;
    const dLat=rad(b.lat-a.lat);
    const dLng=rad(b.lng-a.lng);
    const p=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;
    return 2*R*Math.asin(Math.sqrt(p));
  }

  function formatDistance(m){
    if(m===null||!Number.isFinite(m)) return 'Distance unavailable';
    if(m<50) return 'Under 50 m away';
    if(m<1000) return Math.round(m/10)*10+' m away';
    return (m/1000).toFixed(m<10000?1:0)+' km away';
  }

  function relativeTime(){
    if(!state.updatedAt) return '';
    const seconds=Math.max(0,Math.round((Date.now()-state.updatedAt)/1000));
    return seconds<5?'just now':seconds+' sec ago';
  }

  function updateTrackerUI(message){
    const el=$('#liveDistanceState');
    if(!el) return;
    if(message){el.textContent=message;return;}
    if(!state.tracking){el.textContent='Distance tracking is off · location permission is only requested when you enable it.';return;}
    const acc=state.current?.accuracy?Math.round(state.current.accuracy):null;
    el.innerHTML='<span class="distance-live-dot"></span><strong>Live distance on</strong> · updated '+relativeTime()+(acc?' · GPS ±'+acc+' m':'')+' · refreshes every 20 sec';
  }

  function updateAlertDistances(){
    const alerts=window.orbitMatchAlerts||[];
    alerts.forEach(a=>{
      const el=document.querySelector('[data-alert-distance="'+CSS.escape(String(a.id))+'"]');
      if(!el) return;
      if(!state.current){el.textContent='';return;}
      if(a.found_lat===null||a.found_lat===undefined||a.found_lng===null||a.found_lng===undefined){
        el.textContent=' · GPS not attached to this report';
        el.classList.add('muted');
        return;
      }
      const meters=haversineMeters(
        {lat:state.current.lat,lng:state.current.lng},
        {lat:Number(a.found_lat),lng:Number(a.found_lng)}
      );
      el.textContent=' · '+formatDistance(meters);
      el.classList.remove('muted');
    });
    updateTrackerUI();
  }

  async function refreshUserPosition({silent=false}={}){
    try{
      const p=await getPosition();
      state.current={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy};
      state.updatedAt=Date.now();
      updateAlertDistances();
      if(!silent&&typeof toast==='function') toast('Live distance updated');
      return true;
    }catch(err){
      console.warn('OrbitFind location:',err);
      updateTrackerUI(geoErrorMessage(err)+(state.tracking?' · retrying automatically':''));
      if(!silent&&typeof toast==='function') toast(geoErrorMessage(err));
      return false;
    }
  }

  async function startTracking(){
    if(state.tracking){
      state.tracking=false;
      clearInterval(state.timer);
      state.timer=null;
      const btn=$('#enableLiveDistance');
      if(btn){btn.textContent='Live distance';btn.classList.remove('active');}
      updateTrackerUI();
      document.querySelectorAll('.alert-distance').forEach(x=>x.textContent='');
      return;
    }
    const btn=$('#enableLiveDistance');
    if(btn){btn.disabled=true;btn.textContent='Locating…';}
    const ok=await refreshUserPosition({silent:true});
    if(btn) btn.disabled=false;
    if(!ok){
      if(btn) btn.textContent='Live distance';
      return;
    }
    state.tracking=true;
    if(btn){btn.textContent='Stop distance';btn.classList.add('active');}
    clearInterval(state.timer);
    state.timer=setInterval(()=>refreshUserPosition({silent:true}),20000);
    updateTrackerUI();
    updateAlertDistances();
    if(typeof toast==='function') toast('Live distance tracking enabled');
  }

  async function captureFoundPosition(){
    const btn=$('#captureFoundLocation');
    const out=$('#foundLocationState');
    if(btn){btn.disabled=true;btn.textContent='Locating…';}
    if(out){out.textContent='Requesting precise device location…';out.className='location-state locating';}
    try{
      const p=await getPosition({enableHighAccuracy:true,timeout:12000,maximumAge:5000});
      window.orbitFoundCoords={
        lat:Number(p.coords.latitude.toFixed(6)),
        lng:Number(p.coords.longitude.toFixed(6)),
        accuracy:Math.round(p.coords.accuracy||0),
        captured_at:new Date().toISOString()
      };
      if(out){
        out.textContent='Position attached · accuracy about ±'+window.orbitFoundCoords.accuracy+' m';
        out.className='location-state attached';
      }
      if(btn) btn.textContent='Refresh position';
      $('#foundLocationCard')?.classList.add('attached');
      if(typeof toast==='function') toast('Found-item position attached');
    }catch(err){
      window.orbitFoundCoords=null;
      if(out){out.textContent=geoErrorMessage(err)+' · you can still submit using the campus location';out.className='location-state error';}
      if(btn) btn.textContent='Try again';
      if(typeof toast==='function') toast(geoErrorMessage(err));
    }finally{
      if(btn) btn.disabled=false;
    }
  }

  document.addEventListener('click',e=>{
    if(e.target.closest?.('#captureFoundLocation')){captureFoundPosition();return;}
    if(e.target.closest?.('#enableLiveDistance')){startTracking();return;}
  });

  window.addEventListener('orbit-alerts-updated',updateAlertDistances);
  window.addEventListener('online',()=>{if(state.tracking)refreshUserPosition({silent:true});});
  window.addEventListener('offline',()=>{if(state.tracking)updateTrackerUI('Live distance paused while offline · last position stays only on this device');});
  setInterval(()=>{if(state.tracking)updateTrackerUI();},5000);

  window.orbitDistance={
    get current(){return state.current;},
    formatDistance,
    haversineMeters,
    refresh:()=>refreshUserPosition()
  };
})();