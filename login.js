// =====================================================
// SNDF MANAGEMENT | JAVASCRIPT SECTIONS
// File-level guide: keep each feature inside its marked section.
// =====================================================
const roleSelect=document.getElementById('loginRole');
const roleParam=new URLSearchParams(location.search).get('role');
if(['admin','field_officer','supervisor','guard'].includes(roleParam)) roleSelect.value=roleParam;
document.getElementById('loginForm').addEventListener('submit',async e=>{e.preventDefault();const msg=document.getElementById('loginMsg');msg.textContent='Checking login...';try{const base='/api';const r=await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({staff_id:staff_id.value.trim(),password:password.value,role:roleSelect.value})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Login failed');sessionStorage.setItem('sndfUser',JSON.stringify(d.user));location.href=d.redirect;}catch(err){msg.textContent=err.message;msg.className='login-msg error';}});
