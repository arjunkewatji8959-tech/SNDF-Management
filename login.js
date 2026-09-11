const roleSelect=document.getElementById('loginRole');
const roleParam=new URLSearchParams(location.search).get('role');
if(roleSelect && ['master_admin','admin','field_officer','officer','supervisor','guard'].includes(roleParam)) roleSelect.value=roleParam;

document.getElementById('loginForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const msg=document.getElementById('loginMsg');
  const staffId=document.getElementById('staff_id')?.value.trim();
  const password=document.getElementById('password')?.value||'';
  msg.textContent='Checking login...';
  msg.className='login-msg';
  try{
    const response=await fetch('/api/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({staff_id:staffId,password})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Login failed');
    sessionStorage.setItem('sndfUser',JSON.stringify(data.user));
    location.replace(data.redirect);
  }catch(error){
    msg.textContent=error.message;
    msg.className='login-msg error';
  }
});
