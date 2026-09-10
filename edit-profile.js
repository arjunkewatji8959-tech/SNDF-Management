// =====================================================
// SNDF MANAGEMENT | JAVASCRIPT SECTIONS
// File-level guide: keep each feature inside its marked section.
// =====================================================
const API_URL='/api';
const user=JSON.parse(sessionStorage.getItem('sndfUser')||'null');
if(!user||!['admin','master_admin'].includes(user.role)) location.replace('login.html?role=admin');
const $=s=>document.querySelector(s);
const qs=new URLSearchParams(location.search), targetId=qs.get('id');
// =====================================================
// SECTION: FUNCTION api
// =====================================================
function api(path,opt={}
// END SECTION: FUNCTION api
){return fetch(API_URL+path,{headers:{'Content-Type':'application/json','x-staff-id':user.staff_id,'x-role':user.role,...(opt.headers||{})},...opt}).then(async r=>{const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{}if(!r.ok)throw Error(d.error||'Request failed');return d;});}
let staff=[], current=null, locations=[];
// =====================================================
// SECTION: FUNCTION load
// =====================================================
async function load(){
 if(!targetId){alert('Profile ID missing');return location.href='admin.html';}
 [staff,locations]=await Promise.all([api('/staff'),api('/locations')]);
 const locSel=$('#ep_location_code');
 if(locSel) locSel.innerHTML='<option value="">No Location</option>'+locations.filter(x=>x.active!==0).map(x=>`<option value="${esc(x.code)}">${esc(x.code)} — ${esc(x.name)} (${Number(x.duty_hours)===8?8:12} Hours)</option>`).join('');
 current=staff.find(x=>String(x.id)===String(targetId));
 if(!current){alert('Profile not found');return location.href='admin.html';}
 ['name','staff_id','role','location_code','parent_id','post','salary','dob','department','contact_number','age','height','weight','blood_group','qualification','physical_level','medical_level','skills','police_verification','driving_license','training_details','work_experience','photo_front','photo_back','photo_left','photo_right','is_reliever'].forEach(k=>{const el=$('#ep_'+k);if(el)el.value=current[k]??''});
 $('#ep_dp').value=current.dp||'';
 ['front','back','left','right'].forEach(k=>{const v=current['photo_'+k]||'assets-logo.png';const img=$('#ep_photo_'+k+'_preview');if(img)img.src=v;});
 populateParents();
}
// END SECTION: FUNCTION load

// =====================================================
// SECTION: FUNCTION populateParents
// =====================================================
function populateParents(){
 const role=$('#ep_role').value, loc=$('#ep_location_code').value, sel=$('#ep_parent_id');
 let parents=[];
 if(role==='field_officer') parents=staff.filter(s=>['admin','master_admin'].includes(s.role));
 if(role==='supervisor') parents=staff.filter(s=>s.role==='field_officer');
 if(role==='officer') parents=staff.filter(s=>s.role==='field_officer');
 if(role==='guard') parents=staff.filter(s=>s.role==='supervisor' && (!loc || s.location_code===loc));
 sel.innerHTML='<option value="">No Parent</option>'+parents.map(p=>`<option value="${esc(p.staff_id)}">${esc(p.name)} — ${esc(p.staff_id)}${p.location_code?' • '+esc(p.location_code):''}</option>`).join('');
 sel.value=current.parent_id||'';
}
// END SECTION: FUNCTION populateParents

function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
$('#ep_role').addEventListener('change',populateParents); $('#ep_location_code').addEventListener('change',populateParents);
$('#ep_dp_file').addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>$('#ep_dp').value=r.result;r.readAsDataURL(f);});
['front','back','left','right'].forEach(k=>{
  $('#ep_photo_'+k+'_file')?.addEventListener('change',e=>{
    const f=e.target.files?.[0];if(!f)return;
    const rd=new FileReader();rd.onload=()=>{$('#ep_photo_'+k).value=rd.result;const img=$('#ep_photo_'+k+'_preview');if(img)img.src=rd.result;};rd.readAsDataURL(f);
  });
});
$('#editProfileForm').addEventListener('submit',async e=>{
 e.preventDefault();
 const d=Object.fromEntries(new FormData(e.target)); d.id=targetId;
 if(d.password==='')delete d.password;
 try{await api('/staff/'+targetId+'/profile',{method:'PUT',body:JSON.stringify(d)});alert('Profile updated successfully ✓');location.href='admin.html';}
 catch(err){alert(err.message);}
});
load().catch(e=>alert(e.message));
