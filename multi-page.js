(()=>{
 const page=document.body.dataset.page||'home';
 const nav=document.querySelector('.nav');
 const menu=document.getElementById('menuButton');
 const links=[...document.querySelectorAll('.nav-link')];

 links.forEach(x=>x.classList.remove('active'));
 document.querySelector('[data-nav="'+page+'"]')?.classList.add('active');

 function setMenu(open){
   if(!nav||!menu)return;
   nav.classList.toggle('menu-open',open);
   document.body.classList.toggle('nav-open',open);
   menu.classList.toggle('active',open);
   menu.setAttribute('aria-expanded',String(open));
   menu.setAttribute('aria-label',open?'Close menu':'Open menu');
   menu.textContent=open?'×':'☰';
 }

 if(menu&&nav){
   menu.setAttribute('aria-expanded','false');
   menu.setAttribute('aria-controls','primaryNav');
   nav.id=nav.id||'primaryNav';

   menu.addEventListener('click',e=>{
     e.preventDefault();
     e.stopPropagation();
     setMenu(!nav.classList.contains('menu-open'));
   });

   links.forEach(link=>link.addEventListener('click',()=>setMenu(false)));

   document.addEventListener('click',e=>{
     if(nav.classList.contains('menu-open')&&!nav.contains(e.target)&&!menu.contains(e.target)) setMenu(false);
   });

   document.addEventListener('keydown',e=>{
     if(e.key==='Escape'&&nav.classList.contains('menu-open')) setMenu(false);
   });

   window.addEventListener('resize',()=>{
     if(window.innerWidth>980) setMenu(false);
   });
 }
})();