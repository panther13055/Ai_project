(()=>{
 const page=document.body.dataset.page||'home';
 document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));
 document.querySelector('[data-nav="'+page+'"]')?.classList.add('active');
 document.querySelector('[data-mobile-nav="'+page+'"]')?.classList.add('active');

 const menuButton=document.getElementById('menuButton');
 const menu=document.getElementById('mobileMenu');
 const closeButton=document.getElementById('mobileMenuClose');
 const backdrop=document.getElementById('mobileMenuBackdrop');
 const mobileAdmin=document.getElementById('mobileAdminEntry');
 const desktopAdmin=document.getElementById('adminEntry');

 function setOpen(open){
   if(!menu||!backdrop||!menuButton)return;
   menu.classList.toggle('open',open);
   backdrop.hidden=!open;
   backdrop.classList.toggle('show',open);
   document.body.classList.toggle('mobile-menu-open',open);
   menu.setAttribute('aria-hidden',String(!open));
   menuButton.setAttribute('aria-expanded',String(open));
   menuButton.textContent=open?'×':'☰';
 }

 menuButton?.addEventListener('click',e=>{
   e.preventDefault();
   setOpen(!menu?.classList.contains('open'));
 });
 closeButton?.addEventListener('click',()=>setOpen(false));
 backdrop?.addEventListener('click',()=>setOpen(false));
 document.querySelectorAll('[data-mobile-nav]').forEach(a=>a.addEventListener('click',()=>setOpen(false)));
 mobileAdmin?.addEventListener('click',()=>{
   setOpen(false);
   desktopAdmin?.click();
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape')setOpen(false)});
 window.addEventListener('resize',()=>{if(innerWidth>980)setOpen(false)});
})();