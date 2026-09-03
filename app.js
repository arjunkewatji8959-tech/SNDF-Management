const API_URL='/api';
const user=JSON.parse(sessionStorage.getItem('sndfUser')||'null');
const role=document.body.dataset.role;
if(!user||!role||user.role!==role) location.replace('login.html?role='+encodeURIComponent(role||'admin'));
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
function label(r){return {admin:'Admin',field_officer:'Field Officer',supervisor:'Supervisor',guard:'Guard'}[r]||r}
function renderTopProfile(u=user){const r=u?.role||role;$$('.app-user').forEach(x=>{const dp=u?.dp||'assets-logo.png';x.innerHTML=`<img class="app-avatar" src="${escape(dp)}" alt="Profile"><div class="app-user-text"><b>${escape(u?.name||'')}</b><small>${escape(u?.staff_id||'')} • ${label(r)}</small></div>`});['welcomeName','welcomeProfileName'].forEach(id=>{const x=$('#'+id);if(x)x.textContent=u?.name||label(r)});['welcomeId','welcomeProfileId'].forEach(id=>{const x=$('#'+id);if(x)x.textContent=u?.staff_id||''});['welcomeRole','welcomeProfileRole'].forEach(id=>{const x=$('#'+id);if(x)x.textContent=label(r)});const wd=$('#welcomeDp');if(wd)wd.src=u?.dp||'assets-logo.png';}

$$('[data-view]').forEach((b,i)=>{b.onclick=()=>{ $$('.view').forEach(v=>v.classList.add('hidden')); $('#'+b.dataset.view)?.classList.remove('hidden');$$('[data-view]').forEach(z=>z.classList.remove('active'));b.classList.add('active');$('.sidebar')?.classList.remove('open')};if(i===0)b.classList.add('active')});
$('.mobile-toggle')?.addEventListener('click',()=>$('.sidebar')?.classList.toggle('open'));
async function api(path,opt={}){const r=await fetch(API_URL+path,{headers:{'Content-Type':'application/json','x-staff-id':user.staff_id,'x-role':user.role,...(opt.headers||{})},...opt});const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{throw Error('Backend response error')};if(!r.ok)throw Error(d.error||'Request failed');return d}
function msg(t){const x=$('#status');if(x){x.textContent=t;x.style.display='block';setTimeout(()=>x.style.display='none',2500)}}
function escape(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
renderTopProfile();
let staff=[];
async function refresh(){try{const [s,a,f,ac,stats]=await Promise.all([api('/staff'),api('/attendance'),api('/fines'),api('/account/me'),api('/stats')]);staff=s;window._attendanceRows=a;const dl=$('#dailyLocationList');if(dl){const locations=[...new Set(s.map(x=>String(x.location_code||'').trim()).filter(Boolean))];dl.innerHTML=locations.map(v=>`<option value="${escape(v)}"></option>`).join('')}renderStaff(s);renderProfileRecords(s);fillCreateParent(s);renderAttendance(a);renderFines(f);renderAccount(ac);$$('[data-stat]').forEach(x=>x.textContent=stats[x.dataset.stat]??0);fillTargets(s);fillAdvanceTargets(s);renderDaily(a);loadNotices();loadHelp();if(role==='admin'){loadPayroll();loadProfileHistory();}}catch(e){console.log(e.message)}}
function renderAttendance(rows){
 const head=$('#attendanceMatrixHead'), body=$('#attendanceMatrixRows'); if(!head||!body)return;
 const selectedRole=$('#attendanceRoleFilter')?.value||'all';
 const month=$('#attendanceMonth')?.value||new Date().toISOString().slice(0,7);
 const [yy,mm]=month.split('-').map(Number); const days=new Date(yy,mm,0).getDate();
 const filtered=rows.filter(a=>(selectedRole==='all'||a.role===selectedRole)&&String(a.date||'').startsWith(month));
 const map=new Map(); filtered.forEach(a=>{if(!map.has(a.staff_id))map.set(a.staff_id,{name:a.name,staff_id:a.staff_id,days:{},p:0}); const x=map.get(a.staff_id); x.days[Number(String(a.date).slice(-2))]=a.attendance_status?.startsWith('Half Day')?'P':'P'; if(a.check_out)x.p+=a.attendance_status?.startsWith('Half Day')?0.5:1;});
 head.innerHTML='<tr><th>Name</th><th>ID</th>'+Array.from({length:days},(_,i)=>`<th>${i+1}</th>`).join('')+'<th>P Count</th></tr>';
 body.innerHTML=[...map.values()].map(x=>'<tr><td>'+escape(x.name)+'</td><td>'+escape(x.staff_id)+'</td>'+Array.from({length:days},(_,i)=>{const d=i+1;return `<td class="${x.days[d]?'present-cell':'absent-cell'}">${x.days[d]?'P':'A'}</td>`}).join('')+`<td><b>${x.p}</b></td></tr>`).join('')||'<tr><td colspan="40">No attendance found for selected month/role.</td></tr>';
}
function renderFines(rows){const b=$('#fineRows');if(!b)return;b.innerHTML=rows.map(x=>`<tr><td>${escape(x.guard_id)}</td><td>${escape(x.reason)}</td><td>₹${x.amount}</td><td>${escape(x.issued_by)}</td><td>${new Date(x.created_at).toLocaleDateString()}</td></tr>`).join('')||'<tr><td colspan="5">No fines.</td></tr>'}
function renderAccount(a){const b=$('#accountSummary');if(b&&a)b.textContent='Contact '+(a.staff?.contact_number||'—')+' • Salary ₹'+(a.staff?.salary||0)+' • Fine ₹'+(a.fine||0)+' • Advance ₹'+(a.advance||0)+' • Remaining ₹'+(a.total_remaining||0)}
function renderDaily(rows){const b=$('#dailyRows');if(!b)return;const d=$('#dailyDate')?.value||new Date().toISOString().slice(0,10);b.innerHTML=rows.filter(x=>x.date===d).map(x=>`<tr><td>${label(x.role)}</td><td>${escape(x.staff_id)}</td><td>${escape(x.name)}</td><td>${escape(x.shift||'')}</td><td>${escape(x.check_in||'')}</td><td>${escape(x.check_out||'')}</td><td>${x.hours_worked||0}</td><td>${escape(x.attendance_status||'')}</td></tr>`).join('')||'<tr><td colspan="8">No attendance for selected date.</td></tr>'}
function renderStaff(list){
 const groups={field_officer:'#fieldOfficerRows',supervisor:'#supervisorRows',guard:'#guardRows'};
 Object.entries(groups).forEach(([r,sel])=>{const b=$(sel);if(!b)return;let rows=list.filter(x=>x.role===r);if(role!=='admin')rows=rows.filter(x=>x.staff_id===user.staff_id);b.innerHTML=rows.map(x=>`<tr><td>${escape(x.name)}</td><td>${escape(x.staff_id)}</td><td>${escape(x.post||label(x.role))}</td><td>${escape(x.department||'')}</td><td>₹${Number(x.salary||0)}</td><td>${escape(x.status||'active')}</td><td>${role==='admin'?`<button class="action danger" onclick="removeStaff(${x.id})">Delete</button>`:'View Only'}</td></tr>`).join('')||'<tr><td colspan="7">No members found.</td></tr>';});
 const legacy=$('#staffRows');if(legacy)legacy.innerHTML='';
}

function fillCreateParent(list){
  const roleSel=$('form[data-type="staff"] select[name="role"]'), locSel=$('#createLocation'), parentSel=$('#createParent');
  if(!roleSel||!parentSel)return;
  const roleVal=roleSel.value, loc=locSel?.value||'';
  let parents=[];
  if(roleVal==='supervisor')parents=list.filter(s=>s.role==='field_officer');
  if(roleVal==='guard')parents=list.filter(s=>s.role==='supervisor' && (!loc||s.location_code===loc));
  parentSel.innerHTML='<option value="">Parent ID</option>'+parents.map(s=>`<option value="${escape(s.staff_id)}">${escape(s.name)} — ${escape(s.staff_id)}${s.location_code?' • '+escape(s.location_code):''}</option>`).join('');
}
function fillAdvanceTargets(list){const sel=$('#advanceTarget');if(sel)sel.innerHTML='<option value="">Select Staff</option>'+list.filter(s=>['field_officer','supervisor','guard'].includes(s.role)).map(s=>`<option value="${s.staff_id}">${escape(s.name)} — ${s.staff_id} (${label(s.role)})</option>`).join('')}
async function loadPayroll(){try{const rows=await api('/account/payroll');const buckets={field_officer:'#fieldOfficerPayrollRows',supervisor:'#supervisorPayrollRows',guard:'#guardPayrollRows'};Object.entries(buckets).forEach(([r,sel])=>{const b=$(sel);if(!b)return;const list=rows.filter(s=>s.role===r);b.innerHTML=list.map(s=>{const payable=Math.max(0,Number(s.salary||0)-Number(s.fine||0)-Number(s.advance||0));const remaining=Math.max(0,payable-Number(s.paid||0));const paid=remaining<=0&&payable>0;return `<tr><td>${escape(s.name)}</td><td>${escape(s.staff_id)}</td><td>${escape(s.contact_number||'—')}</td><td>${escape(s.post||'')}</td><td>₹${s.salary||0}</td><td>${Number(s.duty_days||0)}</td><td>₹${s.fine||0}</td><td>₹${s.advance||0}</td><td>₹${s.paid||0}</td><td>₹${remaining}</td><td>${paid?'<button class="payment-done" disabled>✓ Paid</button>':`<button class="action success" onclick="makePayment('${s.staff_id}',${remaining})">Payment ₹${remaining}</button>`}</td></tr>`}).join('')||'<tr><td colspan="11">No staff payroll found.</td></tr>';const panel=document.querySelector(`[data-payroll-role="${r}"]`);const filter=$('#accountRoleFilter')?.value||'all';if(panel)panel.classList.toggle('hidden',filter!=='all'&&filter!==r)})}catch(e){console.log(e.message)}}

async function makePayment(staffId,amount){if(!confirm(`Pay ₹${amount} to ${staffId}?`))return;try{await api('/payments',{method:'POST',body:JSON.stringify({staff_id:staffId,amount,note:'Admin salary payment'})});msg('Payment completed ✓');loadPayroll();refresh()}catch(e){alert(e.message)}}
function fillTargets(list){const sel=$('#fineTarget');if(sel)sel.innerHTML='<option value="">Select Guard / Supervisor</option>'+list.filter(s=>['guard','supervisor'].includes(s.role)).map(s=>`<option value="${s.staff_id}">${escape(s.name)} — ${s.staff_id} (${label(s.role)})</option>`).join('')}
function renderProfileRecords(list){
  const b=$('#profileRecordRows'); if(!b||role!=='admin')return;
  const rf=$('#profileRoleFilter')?.value||'all', lf=$('#profileLocationFilter')?.value||'all';
  const rows=list.filter(s=>['field_officer','supervisor','guard'].includes(s.role))
    .filter(s=>rf==='all'||s.role===rf).filter(s=>lf==='all'||String(s.location_code||'')===lf);
  b.innerHTML=rows.map(s=>`<tr>
    <td><img class="profile-thumb" src="${escape(s.dp||'assets-logo.png')}" alt="Profile"></td>
    <td>${label(s.role)}</td><td>${escape(s.name)}</td><td><b>${escape(s.staff_id)}</b></td>
    <td>${escape(s.location_code||'—')}</td><td>${escape(s.parent_id||'—')}</td>
    <td>${escape(s.post||'')}</td><td>${escape(s.contact_number||'—')}</td><td>${escape(s.status||'active')}</td>
    <td><button class="action" onclick="editProfile(${s.id})">Edit Profile</button></td>
  </tr>`).join('')||'<tr><td colspan="10">No profile records found.</td></tr>';
}
function editProfile(id){location.href='edit-profile.html?id='+encodeURIComponent(id);}
window.editProfile=editProfile;
async function loadProfileHistory(){const b=$('#profileHistoryRows');if(!b||role!=='admin')return;try{const rows=await api('/profile-edit-history');b.innerHTML=rows.map(x=>{let ch={};try{ch=JSON.parse(x.changes_json||'{}')}catch{}const text=Object.entries(ch).map(([k,v])=>`${k}: ${v?.from??''} → ${v?.to??''}`).join(' | ')||'No field change';return `<tr><td>${new Date(x.edited_at).toLocaleString()}</td><td>${escape(x.staff_id)}</td><td>${escape(x.staff_name)}</td><td>${escape(x.edited_by)}</td><td>${escape(text)}</td></tr>`}).join('')||'<tr><td colspan="5">No profile edit history yet.</td></tr>'}catch(e){console.log(e.message)}}
async function downloadProfileHistory(){try{const r=await fetch(API_URL+'/profile-edit-history/export',{headers:{'x-staff-id':user.staff_id,'x-role':user.role}});if(!r.ok)throw Error('Download failed');const blob=await r.blob();const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='profile-edit-history.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u)}catch(e){alert(e.message)}}
window.downloadProfileHistory=downloadProfileHistory;
async function loadProfile(){try{const d=await api('/profile/me');const s=d.user;['name','post','salary','dob','department','location_code','contact_number'].forEach(k=>{const x=$('#p_'+k);if(x)x.value=s[k]||''});if($('#p_dp')&&s.dp)$('#p_dp').value=s.dp;sessionStorage.setItem('sndfUser',JSON.stringify(s));renderTopProfile(s);}catch(e){}}
async function loadNotices(){const b=$('#noticeRows');if(!b)return;try{const rows=await api('/notices');const mine=rows.filter(n=>n.to_role===role||n.to_role==='all'||n.from_role===role);b.innerHTML=mine.map(n=>`<div class="notice-item"><b>${label(n.from_role)} → ${label(n.to_role)}</b><p>${escape(n.message)}</p><small>${new Date(n.created_at).toLocaleString()}</small></div>`).join('')||'<p>No notices.</p>'}catch(e){}}
async function loadHelp(){const b=$('#helpRows');if(!b)return;try{const rows=await api('/help');b.innerHTML=rows.map(n=>`<div class="notice-item"><b>${label(n.from_role)}</b><p>${escape(n.message)}</p><small>${new Date(n.created_at).toLocaleString()}</small></div>`).join('')||'<p>No help records.</p>'}catch(e){}}
function downloadAttendance(r,date='',month='',location=''){const qs=new URLSearchParams();if(r)qs.set('role',r);if(date)qs.set('date',date);if(month)qs.set('month',month);if(location)qs.set('location',location);const u=API_URL+'/attendance/export?'+qs.toString();fetch(u,{headers:{'x-staff-id':user.staff_id,'x-role':user.role}}).then(async x=>{if(!x.ok){let d={};try{d=await x.json()}catch{}throw Error(d.error||'Download failed')}return x.blob()}).then(blob=>{const z=URL.createObjectURL(blob),a=document.createElement('a');a.href=z;a.download=(r||'all')+'-'+(date||month||'all')+'-attendance.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(z)}).catch(e=>alert(e.message))}
async function checkout(id){try{const d=await api('/attendance/'+id+'/checkout',{method:'PUT'});msg(`${d.message}: ${d.hours_worked} hours`);refresh()}catch(e){alert(e.message)}}
async function removeStaff(id){if(!confirm('Delete this member?'))return;try{await api('/staff/'+id,{method:'DELETE'});refresh()}catch(e){alert(e.message)}}
window.checkout=checkout;window.removeStaff=removeStaff;window.downloadAttendance=downloadAttendance;window.makePayment=makePayment;
let stream=null,photo='',gpsCoords=null,openAttendanceId=null;
function currentShift(){
  const h=new Date().getHours();
  return h>=8&&h<20?'Day Shift':'Night Shift';
}
function fillAutoAttendance(){
  const map={autoName:user?.name,autoStaffId:user?.staff_id,autoRole:label(user?.role),autoLocationCode:user?.location_code||'—',autoParentId:user?.parent_id||'—',autoShift:currentShift()};
  Object.entries(map).forEach(([id,v])=>{const x=$('#'+id);if(x)x.textContent=v||'—'});
}
async function startLiveCamera(){
  if(!navigator.mediaDevices?.getUserMedia)return;
  try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:720},height:{ideal:720}},audio:false});const v=$('#camera');if(v)v.srcObject=stream;}
  catch(e){msg('Camera permission required. Tap Take Photo after allowing camera.');}
}
function updateGpsStatus(text){const x=$('#gpsStatus');if(x)x.textContent=text;}
function getLiveGPS(){
  if(!navigator.geolocation){updateGpsStatus('GPS not supported');return;}
  updateGpsStatus('Getting location…');
  navigator.geolocation.getCurrentPosition(p=>{
    gpsCoords={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy};
    updateGpsStatus(`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`);
  },()=>updateGpsStatus('Location permission required'),{enableHighAccuracy:true,timeout:12000,maximumAge:0});
}
$('#capturePhoto')?.addEventListener('click',async()=>{
  if(!stream)await startLiveCamera();
  const v=$('#camera');if(!v?.videoWidth)return alert('Camera permission allow karein, phir Take Photo dabayein.');
  const c=document.createElement('canvas');c.width=Math.min(v.videoWidth,720);c.height=Math.round(c.width*(v.videoHeight/v.videoWidth));c.getContext('2d').drawImage(v,0,0,c.width,c.height);
  photo=c.toDataURL('image/jpeg',.7);const img=$('#captured');if(img)img.src=photo;msg('Photo captured ✓');
});
$('#retakePhoto')?.addEventListener('click',()=>{photo='';const img=$('#captured');if(img)img.removeAttribute('src');startLiveCamera();});
$('#checkIn')?.addEventListener('click',async()=>{
  if(!photo)return alert('Check In se pehle photo lena zaroori hai.');
  if(!gpsCoords)getLiveGPS();
  try{
    const location=gpsCoords?`${gpsCoords.lat.toFixed(6)}, ${gpsCoords.lng.toFixed(6)} (±${Math.round(gpsCoords.accuracy)}m)`:'GPS unavailable';
    const d=await api('/attendance',{method:'POST',body:JSON.stringify({staff_id:user.staff_id,name:user.name,photo,location,shift:currentShift()})});
    openAttendanceId=d.id; msg('Check In saved ✓'); refresh();
  }catch(e){alert(e.message)}
});
$('#checkOut')?.addEventListener('click',async()=>{
  try{const d=await api('/attendance/current/checkout',{method:'PUT'});openAttendanceId=null;msg(`${d.message}: ${d.hours_worked} hours`);refresh();}
  catch(e){alert(e.message)}
});
fillAutoAttendance(); getLiveGPS(); startLiveCamera();
$$('form[data-type]').forEach(form=>form.addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(form));try{if(form.dataset.type==='staff')await api('/staff',{method:'POST',body:JSON.stringify(d)});if(form.dataset.type==='fine')await api('/fines',{method:'POST',body:JSON.stringify(d)});if(form.dataset.type==='advance')await api('/advances',{method:'POST',body:JSON.stringify(d)});if(form.dataset.type==='notice')await api('/notices',{method:'POST',body:JSON.stringify(d)});if(form.dataset.type==='help')await api('/help',{method:'POST',body:JSON.stringify(d)});msg('Saved successfully');form.reset();refresh()}catch(err){alert(err.message)}}));
$('#profileForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));try{await api('/profile/me',{method:'PUT',body:JSON.stringify(d)});const fresh=await api('/profile/me');sessionStorage.setItem('sndfUser',JSON.stringify(fresh.user));msg('Profile updated');loadProfile()}catch(err){alert(err.message)}});
$('#suspendForm')?.addEventListener('submit',async e=>{e.preventDefault();try{await api('/staff/'+$('#suspendStaff').value+'/suspend',{method:'PUT',body:JSON.stringify({hours:Number($('#suspendHours').value),reason:$('#suspendReason').value})});msg('ID suspended');refresh()}catch(err){alert(err.message)}});
$('#downloadDaily')?.addEventListener('click',()=>{const d=$('#dailyDate')?.value||new Date().toISOString().slice(0,10);const loc=($('#dailyLocation')?.value||'').trim();downloadAttendance('',d,'',loc)});
$('#downloadAttendanceMatrix')?.addEventListener('click',()=>{const m=$('#attendanceMonth')?.value||new Date().toISOString().slice(0,7);downloadAttendance('', '', m)});
$('#attendanceMonth')?.addEventListener('change',()=>{if(role==='admin')refresh()});$('#dailyDate')?.setAttribute('value',new Date().toISOString().slice(0,10));$('#attendanceMonth')?.setAttribute('value',new Date().toISOString().slice(0,7));$('#dailyDate')?.addEventListener('change',()=>renderDaily(window._attendanceRows||[]));$('#dailyLocation')?.addEventListener('input',()=>renderDaily(window._attendanceRows||[]));window.downloadAttendanceMonth=(r)=>{const m=$('#attendanceMonth')?.value;if(!m)return alert('Select a month first');downloadAttendance(r,'',m)};
$('form[data-type="staff"] select[name="role"]')?.addEventListener('change',()=>fillCreateParent(staff));
$('#createLocation')?.addEventListener('change',()=>fillCreateParent(staff));
$('#profileRoleFilter')?.addEventListener('change',()=>renderProfileRecords(staff));
$('#profileLocationFilter')?.addEventListener('change',()=>renderProfileRecords(staff));
$('#downloadProfileHistory')?.addEventListener('click',downloadProfileHistory);
filterMemberLists();
$('#attendanceRoleFilter')?.addEventListener('change',()=>renderAttendance(window._attendanceRows||[]));
$('#accountRoleFilter')?.addEventListener('change',()=>loadPayroll());
$('#memberRoleFilter')?.addEventListener('change',()=>filterMemberLists());
function filterMemberLists(){const role=$('#memberRoleFilter')?.value||'field_officer';document.querySelectorAll('[data-role-list]').forEach(panel=>panel.classList.toggle('hidden',panel.dataset.roleList!==role));}
$('#attendanceMonth')?.addEventListener('change',()=>renderAttendance(window._attendanceRows||[]));
$('#logout')?.addEventListener('click',()=>{sessionStorage.removeItem('sndfUser');location.href='index.html'});
loadProfile();refresh();
if($('#p_staff_id')) $('#p_staff_id').value=user.staff_id;
if(role!=='admin'){ $('#staff')?.remove(); $('#advance')?.remove(); $('#suspend')?.remove(); $('#profile-records')?.remove(); }
if(role!=='admin') $$('[onclick^="downloadAttendance"]').forEach(b=>b.remove());
if(!['admin','field_officer'].includes(role)) $('#fine')?.querySelector('.fine-form')?.remove();
if(role==='admin') $('#fine')?.querySelector('.fine-form')?.insertAdjacentHTML('afterend','<p>Admin may fine Guard or Supervisor.</p>');
// Admin controls the complete profile. Other roles only control DP + contact.
if(role==='admin') ['name','post','salary','dob','department','location_code'].forEach(k=>$('#p_'+k)?.removeAttribute('disabled'));
$('#p_dp_file')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;const rd=new FileReader();rd.onload=()=>$('#p_dp').value=rd.result;rd.readAsDataURL(f)});
