(()=>{
 const page=document.body.dataset.page||'home';
 document.querySelectorAll('.nav-link').forEach(x=>x.classList.remove('active'));
 document.querySelector('[data-nav="'+page+'"]')?.classList.add('active');
})();