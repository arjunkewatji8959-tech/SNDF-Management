// =====================================================
// SNDF MANAGEMENT | JAVASCRIPT SECTIONS
// File-level guide: keep each feature inside its marked section.
// =====================================================
const API_URL='/api';
const user=JSON.parse(sessionStorage.getItem('sndfUser')||'null');
if(!user||user.role!=='admin') location.replace('login.html?role=admin');
const $=s=>document.querySelector(s);
const qs=new URLSearchParams(location.search), targetId=qs.get('id');
function api(path,opt={}){return fetch(API_URL+path,{headers:{'Content-Type':'application/json','x-staff-id':user.staff_id,'x-role':user.role,...(opt.headers||{})},...opt}).then(async r=>{const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{}if(!r.ok)throw Error(d.error||'Request failed');return d;});}
let staff=[], current=null;
async function load(){
 if(!targetId){alert('Profile ID missing');return location.href='admin.html';}
 staff=await api('/staff');
 current=staff.find(x=>String(x.id)===String(targetId));
 if(!current){alert('Profile not found');return location.href='admin.html';}
 ['name','staff_id','role','location_code','parent_id','post','salary','dob','department','contact_number'].forEach(k=>{const el=$('#ep_'+k);if(el)el.value=current[k]??''});
 $('#ep_dp').value=current.dp||'';
 populateParents();
}
function populateParents(){
 const role=$('#ep_role').value, loc=$('#ep_location_code').value, sel=$('#ep_parent_id');
 let parents=[];
 if(role==='supervisor') parents=staff.filter(s=>s.role==='field_officer');
 if(role==='guard') parents=staff.filter(s=>s.role==='supervisor' && (!loc || s.location_code===loc));
 sel.innerHTML='<option value="">No Parent</option>'+parents.map(p=>`<option value="${esc(p.staff_id)}">${esc(p.name)} — ${esc(p.staff_id)}${p.location_code?' • '+esc(p.location_code):''}</option>`).join('');
 sel.value=current.parent_id||'';
}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
$('#ep_role').addEventListener('change',populateParents); $('#ep_location_code').addEventListener('change',populateParents);
$('#ep_dp_file').addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>$('#ep_dp').value=r.result;r.readAsDataURL(f);});
$('#editProfileForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const d=Object.fromEntries(new FormData(e.target)); d.id=targetId;
 if(d.password==='')delete d.password;
 try{await api('/staff/'+targetId+'/profile',{method:'PUT',body:JSON.stringify(d)});alert('Profile updated successfully ✓');location.href='admin.html';}
 catch(err){alert(err.message);}
});
load().catch(e=>alert(e.message));
