(()=>{
const API='https://uglojzicxdopcdtwfzjo.supabase.co/functions/v1/orbitfind-api';
const TOKEN='orbitfind_device_token';
const modal=document.getElementById('adminModal');
const entry=document.getElementById('adminEntry');
const close=document.getElementById('adminModalClose');
const form=document.getElementById('adminLoginForm');
const pin=document.getElementById('adminPin');
const status=document.getElementById('adminLoginStatus');
const button=document.getElementById('adminLoginButton');
function getToken(){let t=localStorage.getItem(TOKEN);if(!t){const a=new Uint8Array(32);crypto.getRandomValues(a);t=[...a].map(x=>x.toString(16).padStart(2,'0')).join('');localStorage.setItem(TOKEN,t)}return t}
function open(){modal?.classList.add('open');modal?.setAttribute('aria-hidden','false');setTimeout(()=>pin?.focus(),60)}
function shut(){modal?.classList.remove('open');modal?.setAttribute('aria-hidden','true');if(pin)pin.value='';if(status){status.textContent='Authorized staff only · Demo access gate';status.className=''}}
entry?.addEventListener('click',open);
close?.addEventListener('click',shut);
modal?.addEventListener('click',e=>{if(e.target===modal)shut()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal?.classList.contains('open'))shut()});
if(location.hash==='#admin')open();
form?.addEventListener('submit',async e=>{
 e.preventDefault(); const value=pin?.value.trim(); if(!value)return;
 button.disabled=true;button.textContent='Verifying…';status.textContent='Checking access with secure backend…';status.className='';
 try{
  const r=await fetch(API,{method:'POST',headers:{'content-type':'application/json','x-orbit-token':getToken()},body:JSON.stringify({action:'verify_admin_pin',pin:value})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.ok)throw new Error(d.error||'Access denied');
  sessionStorage.setItem('orbitfind_admin_ok','1');
  status.textContent='Access granted. Opening AgentOps…';status.className='good';
  setTimeout(()=>location.href='/admin-agentops.html',350);
 }catch(err){
  status.textContent='Incorrect PIN. Try again.';status.className='bad';pin?.select();
 }finally{
  button.disabled=false;button.innerHTML='Unlock AgentOps <span>→</span>';
 }
});
})();