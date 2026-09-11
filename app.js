// =====================================================
// SNDF MANAGEMENT | JAVASCRIPT SECTIONS
// File-level guide: keep each feature inside its marked section.
// =====================================================
const API_URL='/api';
const user=JSON.parse(sessionStorage.getItem('sndfUser')||'null');
const role=document.body.dataset.role;
if(!user||!role||!(user.role===role || (role==='admin'&&user.role==='master_admin'))) location.replace('login.html?role='+encodeURIComponent(role||'admin'));
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
// =====================================================
// SECTION: FUNCTION label
// =====================================================
function label(r){return {master_admin:'Master Admin',admin:'Admin',field_officer:'Field Officer',officer:'Officer',supervisor:'Supervisor',guard:'Guard'}[r]||r}
// END SECTION: FUNCTION label

const isAdminRole=['admin','master_admin'].includes(role);
// =====================================================
// SECTION: FUNCTION renderTopProfile
// =====================================================
function renderTopProfile(u=user){const r=u?.role||role;$$('.app-user').forEach(x=>{const dp=u?.dp||'assets-logo.png';x.innerHTML=`<img class="app-avatar" src="${escape(dp)}" alt="Profile"><div class="app-user-text"><b>${escape(u?.name||'')}</b><small>${escape(u?.staff_id||'')} • ${label(r)}</small></div>`});['welcomeName','welcomeProfileName'].forEach(id=>{const x=$('#'+id);if(x)x.textContent=u?.name||label(r)});['welcomeId','welcomeProfileId'].forEach(id=>{const x=$('#'+id);if(x)x.textContent=u?.staff_id||''});['welcomeRole','welcomeProfileRole'].forEach(id=>{const x=$('#'+id);if(x)x.textContent=label(r)});const wd=$('#welcomeDp');if(wd)wd.src=u?.dp||'assets-logo.png';}
// END SECTION: FUNCTION renderTopProfile


$$('[data-view]').forEach((b,i)=>{b.onclick=()=>{ $$('.view').forEach(v=>v.classList.add('hidden')); $('#'+b.dataset.view)?.classList.remove('hidden');$$('[data-view]').forEach(z=>z.classList.remove('active'));b.classList.add('active');$('.sidebar')?.classList.remove('open')};if(i===0)b.classList.add('active')});
$('.mobile-toggle')?.addEventListener('click',()=>$('.sidebar')?.classList.toggle('open'));
// =====================================================
// SECTION: FUNCTION api
// =====================================================
async function api(path,opt={}
// END SECTION: FUNCTION api
){const r=await fetch(API_URL+path,{headers:{'Content-Type':'application/json','x-staff-id':user.staff_id,'x-role':user.role,...(opt.headers||{})},...opt});const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{throw Error('Backend response error')};if(!r.ok)throw Error(d.error||'Request failed');return d}
// =====================================================
// SECTION: FUNCTION msg
// =====================================================
function msg(t){const x=$('#status');if(x){x.textContent=t;x.style.display='block';setTimeout(()=>x.style.display='none',2500)}}
// END SECTION: FUNCTION msg

function escape(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
renderTopProfile();
const createRoleSelect=$('form[data-type="staff"] select[name="role"]');

// =====================================================
// SECTION: STAFF CREATION UI HIERARCHY
// Master Admin -> Admin -> Field Officer -> Supervisor -> Guard
// =====================================================
if(createRoleSelect){
  // Only Master Admin and Admin can create members.
  // Master Admin can create Admin/Field Officer/Supervisor/Guard.
  // Admin can create Field Officer/Supervisor/Guard.
  const allowedByRole={
    master_admin:['admin','field_officer','officer','supervisor','guard'],
    admin:['field_officer','officer','supervisor','guard']
  };
  const allowed=allowedByRole[user?.role]||[];
  [...createRoleSelect.options].forEach(o=>{ if(!allowed.includes(o.value)) o.remove(); });
  if(allowed.length) createRoleSelect.value=allowed[0];
}

// Dedicated role pages must always send the logged-in parent ID.
const staffCreateForm=$('form[data-type="staff"]');
if(staffCreateForm && ['field_officer','supervisor'].includes(user?.role)){
  const parentInput=staffCreateForm.querySelector('input[name="parent_id"]');
  if(parentInput) parentInput.value=user.staff_id||'';
}

// END SECTION: STAFF CREATION UI HIERARCHY
let staff=[];

// =====================================================

// SECTION: FUNCTION loadPremiumDashboard

// =====================================================

async function loadPremiumDashboard(stats){
  try{
    const set=(id,v)=>{const x=$('#'+id);if(x)x.textContent=v??0};
    set('premiumTotalGuards',stats.total_guards);
    set('premiumOnDuty',stats.on_duty);
    set('premiumAbsent',stats.absent_guards);
    set('premiumRelievers',stats.relievers);
    set('premiumActiveSites',stats.active_sites);
    const payroll=Number(stats.monthly_payroll||0);
    set('premiumPayroll','₹'+payroll.toLocaleString('en-IN'));
    const present=Number(stats.present||0), absent=Number(stats.absent_guards||0), total=Math.max(1,present+absent);
    set('chartPresentText',present); set('chartAbsentText',absent);
    const pb=$('#chartPresentBar'), ab=$('#chartAbsentBar');
    if(pb)pb.style.width=Math.min(100,present/total*100)+'%';
    if(ab)ab.style.width=Math.min(100,absent/total*100)+'%';

    const siteBox=$('#premiumSiteStatus');
    if(siteBox){
      const locs=await api('/locations');
      siteBox.innerHTML=(locs||[]).slice(0,8).map(l=>`<div class="site-item"><strong>📍 ${escape(l.code||'Site')}</strong><span>${escape(l.name||'')} • Active</span></div>`).join('')||'<p class="muted-note">No active sites.</p>';
    }
    const act=$('#premiumRecentActivities');
    if(act){
      if(role==='admin'){
        const logs=await api('/audit-logs?limit=6');
        act.innerHTML=(logs||[]).slice(0,6).map(x=>`<div class="activity-item"><b>${escape(x.action||'Activity')}</b><span>${escape(x.actor_id||'')} • ${escape(new Date(x.created_at).toLocaleString())}</span></div>`).join('')||'<p class="muted-note">No recent activities.</p>';
      }else{
        act.innerHTML=`<div class="activity-item"><b>Attendance</b><span>Present today: ${present}</span></div><div class="activity-item"><b>Duty Status</b><span>On duty now: ${Number(stats.on_duty||0)}</span></div>`;
      }
    }
    const notes=$('#premiumNotifications');
    if(notes){
      try{
        const ns=await api('/notices');
        notes.innerHTML=(ns||[]).slice(0,5).map(x=>`<div class="activity-item"><b>📢 Notice</b><span>${escape(x.message||'New notification')}</span></div>`).join('')||'<p class="muted-note">No new notifications.</p>';
      }catch(e){notes.innerHTML='<p class="muted-note">No new notifications.</p>';}
    }
  }catch(e){console.log('Premium dashboard:',e.message)}
}

// END SECTION: FUNCTION loadPremiumDashboard


// =====================================================

// SECTION: FUNCTION refresh

// =====================================================

async function refresh(){
try{
  // Load each core dataset independently so one failing module (for example Location)
  // cannot prevent Admin/Member lists from rendering.
  await loadLocationConfigs();
  populateLocationSelects();
  fillAutoAttendance();

  const safe = async (path, fallback) => {
    try { return await api(path); }
    catch (e) { console.warn('SNDF API:', path, e.message); return fallback; }
  };

  const [s,a,f,ac,stats]=await Promise.all([
    safe('/staff',[]),
    safe('/attendance',[]),
    safe('/fines',[]),
    safe('/account/me',{}),
    safe('/stats',{})
  ]);
  staff=Array.isArray(s)?s:[];
if(role==='field_officer'){
  const x=$('#createSupervisorParent'); if(x)x.value=user.staff_id;
  const b=$('#mySupervisorRows');
  if(b)b.innerHTML=staff.filter(x=>x.role==='supervisor'&&x.parent_id===user.staff_id)
    .map(x=>`<tr><td>${escape(x.name)}</td><td>${escape(x.staff_id)}</td><td>${escape(x.location_code||'—')}</td><td>${escape(x.status||'active')}</td></tr>`)
    .join('')||'<tr><td colspan=4>No Supervisors found.</td></tr>';
}
// END SECTION: FIELD OFFICER SUPERVISOR LIST
window._attendanceRows=a;renderStaff(s);renderProfileRecords(s);fillCreateParent(s);fillAdminPresentTargets(s);setupAdminMarkPresent();renderAttendance(a);renderFines(f);renderAccount(ac);$$('[data-stat]').forEach(x=>x.textContent=stats[x.dataset.stat]??0);fillTargets(s);fillAdvanceTargets(s);renderDaily(a);loadNotices();loadHelp();loadPointTransfers();loadTaskTargets();loadTasks();if(!isAdminRole)loadTransferPoints();if(isAdminRole){loadPayroll();loadReports();loadRelievers();loadPointUpdates();loadDirectTransferPoints();}if(['supervisor','officer','field_officer'].includes(role))loadTeamAttendance();if(role==='field_officer')loadFieldOfficerRelievers();if(role==='officer')loadOfficerRelieverNotifications();}catch(e){console.log(e.message)}}

// END SECTION: FUNCTION refresh


// =====================================================

// SECTION: FUNCTION loadPointTransfers

// =====================================================

async function loadPointTransfers(){
  const table=$('#pointTransferRows'), mine=$('#myTransferRows');
  try{
    const rows=await api('/point-transfers');
    if(table){
      table.innerHTML=rows.map(x=>`<tr><td>${escape(label(x.staff_role))}</td><td>${escape(x.staff_name)}</td><td>${escape(x.staff_id)}</td><td>${escape(x.from_location||'—')}</td><td>${escape(x.to_location)}</td><td>${escape(x.reason||'—')}</td><td><b>${escape(x.status)}</b></td><td>${escape(new Date(x.requested_at).toLocaleString())}</td><td>${x.status==='Pending'?`<button class="action success" onclick="approvePointTransfer(${x.id})">✓ Approve</button> <button class="action danger" onclick="rejectPointTransfer(${x.id})">✕ Reject</button>`:'—'}</td></tr>`).join('')||'<tr><td colspan="9">No point transfer requests.</td></tr>';
    }
    if(mine){
      mine.innerHTML=rows.map(x=>`<div class="notice-item"><b>${escape(x.from_location||'—')} → ${escape(x.to_location)}</b><p>${escape(x.reason||'')}</p><small>Status: ${escape(x.status)} • ${new Date(x.requested_at).toLocaleString()}</small></div>`).join('')||'<p>No transfer requests.</p>';
    }
  }catch(e){console.log(e.message)}
}

// END SECTION: FUNCTION loadPointTransfers

// =====================================================
// SECTION: FUNCTION loadDirectTransferPoints
// =====================================================
async function loadDirectTransferPoints(){
  const sel=$('#directTransferPoint');
  if(!sel || !isAdminRole)return;
  try{
    const rows=await api('/locations');
    const codes=[...new Set(rows.filter(x=>x.active!==0).map(x=>String(x.code||'').trim()).filter(Boolean))];
    sel.innerHTML='<option value="">Select Point</option>'+codes.map(c=>{const x=locationConfigs[c];return `<option value="${escape(c)}">${escape(c)}${x?.name?' — '+escape(x.name):''}</option>`}).join('');
  }catch(e){sel.innerHTML='<option value="">Unable to load points</option>';}
}
// END SECTION: FUNCTION loadDirectTransferPoints

// =====================================================
// SECTION: FUNCTION loadTransferPoints
// =====================================================
async function loadTransferPoints(){
  const sel=$('#transferPoint'); if(!sel)return;
  try{
    const rows=await fetch(API_URL+'/locations',{headers:{'Content-Type':'application/json','x-staff-id':user.staff_id,'x-role':user.role}}).then(r=>{if(!r.ok)throw new Error('Unable to load locations');return r.json();});
    const codes=[...new Set(rows.filter(x=>x.active!==0).map(x=>String(x.code||'').trim()).filter(Boolean))];
        const current=String(user?.location_code||'');
    sel.innerHTML='<option value="">Select Point</option>'+codes.filter(c=>c!==current).map(c=>{const x=locationConfigs[c];return `<option value="${escape(c)}">${escape(c)}${x?.name?' — '+escape(x.name):''}</option>`}).join('');
    const cp=$('#currentPoint');if(cp)cp.textContent=current||'—';
  }catch(e){sel.innerHTML='<option value="">Unable to load points</option>';}
}
// END SECTION: FUNCTION loadTransferPoints

// =====================================================
// SECTION: FUNCTION approvePointTransfer
// =====================================================
async function approvePointTransfer(id){if(!confirm('Approve this point transfer?'))return;try{await api('/point-transfers/'+id+'/approve',{method:'PUT'});msg('Point transfer approved');refresh();loadPointTransfers();}catch(e){alert(e.message)}}
// END SECTION: FUNCTION approvePointTransfer

// =====================================================
// SECTION: FUNCTION rejectPointTransfer
// =====================================================
async function rejectPointTransfer(id){if(!confirm('Reject this point transfer?'))return;try{await api('/point-transfers/'+id+'/reject',{method:'PUT'});msg('Point transfer rejected');loadPointTransfers();}catch(e){alert(e.message)}}
// END SECTION: FUNCTION rejectPointTransfer

window.approvePointTransfer=approvePointTransfer;window.rejectPointTransfer=rejectPointTransfer;

// =====================================================

// SECTION: FUNCTION renderAttendance

// =====================================================

function renderAttendance(rows){
 const head=$('#attendanceMatrixHead'), body=$('#attendanceMatrixRows');
 const detail=$('#attendanceDetailRows');
 const selectedRole=$('#attendanceRoleFilter')?.value||'all';
 const month=$('#attendanceMonth')?.value||new Date().toISOString().slice(0,7);
 const loc=$('#attendanceLocation')?.value||'all'; const duty=$('#attendanceDutyHours')?.value||'all'; const shift=$('#attendanceShift')?.value||'all'; const idSearch=($('#attendanceIdSearch')?.value||'').trim().toLowerCase();
 const [yy,mm]=month.split('-').map(Number); const days=new Date(yy,mm,0).getDate();
 const filtered=rows.filter(a=>(selectedRole==='all'||a.role===selectedRole)&&String(a.date||'').startsWith(month)&&(loc==='all'||String(a.staff_location_code||a.location_code||'').toLowerCase()===loc.toLowerCase())&&(duty==='all'||String(a.duty_hours)===duty)&&(shift==='all'||a.shift===shift)&&(!idSearch||String(a.staff_id||'').toLowerCase().includes(idSearch)));

 // Monthly P/A matrix
 if(head&&body){
   const map=new Map();
   filtered.forEach(a=>{
     if(!map.has(a.staff_id))map.set(a.staff_id,{name:a.name,staff_id:a.staff_id,days:{},p:0,shifts:0});
     const x=map.get(a.staff_id);
     const day=Number(String(a.date).slice(-2));
     if(!x.days[day])x.days[day]=[];
     x.days[day].push({shift:a.shift||'Shift',hours:a.hours_worked||0,status:a.attendance_status||''});
     if(a.check_out){x.p+=a.attendance_status?.startsWith('Half Day')?0.5:1;x.shifts++;}
   });
   head.innerHTML='<tr><th>Name</th><th>ID</th>'+Array.from({length:days},(_,i)=>`<th>${i+1}</th>`).join('')+'<th>Duty Count</th><th>Shift Count</th></tr>';
   body.innerHTML=[...map.values()].map(x=>'<tr><td>'+escape(x.name)+'</td><td>'+escape(x.staff_id)+'</td>'+Array.from({length:days},(_,i)=>{const d=i+1,items=x.days[d]||[];if(!items.length)return '<td class="absent-cell">A</td>';const count=items.length;const labels=items.map(v=>String(v.shift).replace(' Shift','')).join(' + ');return `<td class="present-cell duplicate-attendance-cell" title="${escape(labels)}">${count>1?'P × '+count:'P'}${count>1?`<small class="shift-count-note">${escape(labels)}</small>`:''}</td>`}).join('')+`<td><b>${x.p}</b></td><td><b>${x.shifts}</b></td></tr>`).join('')||'<tr><td colspan="42">No attendance found for selected month/role.</td></tr>';
 }

 // Detailed saved attendance records, including submitted live photo.
 if(detail){
   detail.innerHTML=filtered.map(a=>{
     const photo=a.photo||'';
     const photoCell=photo
       ? `<img class="attendance-photo-thumb" src="${escape(photo)}" alt="Live attendance photo" title="Open live attendance photo" onclick="openAttendancePhoto('${escape(photo)}')">`
       : '<span class="photo-missing">No photo</span>';
     return `<tr>
       <td>${photoCell}</td>
       <td><b>${escape(a.name)}</b></td>
       <td>${escape(a.staff_id)}</td>
       <td>${escape(label(a.role))}</td>
       <td>${escape(a.staff_location_code||a.location_code||'—')}</td>
       <td>${escape(a.location||'—')}</td>
       <td>${escape(a.shift||'—')}</td>
       <td>${escape((Number(a.duty_hours)===8?8:12)+' Hours')}</td>
       <td>${escape(a.check_in||'—')}</td>
       <td>${escape(a.check_out||'—')}</td>
       <td>${escape(a.hours_worked||0)}</td>
       <td>${escape(a.attendance_status||'—')}</td>
     </tr>`;
   }).join('')||'<tr><td colspan="11">No attendance details found for selected month/role.</td></tr>';
 }
}

// END SECTION: FUNCTION renderAttendance

// =====================================================
// SECTION: FUNCTION openAttendancePhoto
// =====================================================
function openAttendancePhoto(src){
 const w=window.open('','_blank','width=700,height=800');
 if(w)w.document.write(`<title>SNDF Live Attendance Photo</title><body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center"><img src="${src}" style="max-width:100%;max-height:100vh;object-fit:contain"></body>`);
}
// END SECTION: FUNCTION openAttendancePhoto

window.openAttendancePhoto=openAttendancePhoto;
// =====================================================
// SECTION: FUNCTION renderFines
// =====================================================
function renderFines(rows){const b=$('#fineRows');if(!b)return;b.innerHTML=rows.map(x=>`<tr><td>${x.image?`<img class=\"fine-photo-thumb\" src=\"${escape(x.image)}\" alt=\"Fine evidence\" onclick=\"openAttendancePhoto('${escape(x.image)}')\">`:'—'}</td><td><b>${escape(x.guard_id)}</b></td><td>${escape(x.reason)}</td><td>₹${x.amount}</td><td>${escape(x.issued_by)}</td><td>${new Date(x.created_at).toLocaleDateString()}</td></tr>`).join('')||'<tr><td colspan=\"6\">No fines.</td></tr>'}
// END SECTION: FUNCTION renderFines

// =====================================================
// SECTION: FUNCTION renderAccount
// =====================================================
function renderAccount(a){const b=$('#accountSummary');if(b&&a)b.textContent='Contact '+(a.staff?.contact_number||'—')+' • Salary ₹'+(a.staff?.salary||0)+' • Fine ₹'+(a.fine||0)+' • Advance ₹'+(a.advance||0)+' • Remaining ₹'+(a.total_remaining||0)}
// END SECTION: FUNCTION renderAccount

// =====================================================
// SECTION: FUNCTION renderDaily
// =====================================================
function renderDaily(rows){
 const b=$('#dailyRows');if(!b)return;
 const d=$('#dailyDate')?.value||new Date().toISOString().slice(0,10);
 const loc=($('#dailyLocation')?.value||'').trim().toLowerCase();
 const duty=$('#dailyDutyHours')?.value||'all'; const shift=$('#dailyShift')?.value||'all'; const idSearch=($('#dailyIdSearch')?.value||'').trim().toLowerCase();
 const list=rows.filter(x=>x.date===d).filter(x=>(!idSearch||String(x.staff_id||'').toLowerCase().includes(idSearch))).filter(x=>(!loc||String(x.staff_location_code||x.location_code||'').toLowerCase()===loc||String(x.location||'').toLowerCase().includes(loc))&&(duty==='all'||String(x.duty_hours)===duty)&&(shift==='all'||x.shift===shift));
 b.innerHTML=list.map(x=>{
  const photo=x.photo||'';
  const photoCell=photo ? `<img class="attendance-photo-thumb" src="${escape(photo)}" alt="Live attendance photo" title="Open live attendance photo" onclick="openAttendancePhoto('${escape(photo)}')">` : '<span class="photo-missing">No photo</span>';
  return `<tr><td>${photoCell}</td><td>${label(x.role)}</td><td>${escape(x.staff_id)}</td><td>${escape(x.name)}</td><td>${escape(x.staff_location_code||x.location_code||'—')}</td><td>${escape(x.shift||'')}</td><td>${escape((Number(x.duty_hours)===8?8:12)+' Hours')}</td><td>${escape(x.check_in||'')}</td><td>${escape(x.check_out||'')}</td><td>${x.hours_worked||0}</td><td>${escape(x.attendance_status||'')}</td></tr>`;
 }).join('')||'<tr><td colspan="11">No attendance for selected date/location.</td></tr>';
}
// END SECTION: FUNCTION renderDaily

// =====================================================
// SECTION: FUNCTION renderStaff
// =====================================================
function renderStaff(list){
 const groups={field_officer:'#fieldOfficerRows',officer:'#officerRows',supervisor:'#supervisorRows',guard:'#guardRows'};
 Object.entries(groups).forEach(([r,sel])=>{const b=$(sel);if(!b)return;let rows=list.filter(x=>x.role===r);if(!isAdminRole)rows=rows.filter(x=>x.staff_id===user.staff_id);b.innerHTML=rows.map(x=>`<tr><td>${escape(x.name)}</td><td>${escape(x.staff_id)}</td><td>${escape(x.post||label(x.role))}</td><td>${escape(x.department||'')}</td><td>₹${Number(x.salary||0)}</td><td>${escape(x.status||'active')}</td><td>${isAdminRole?`<button class="action danger" onclick="removeStaff(${x.id})">Delete</button>`:'View Only'}</td></tr>`).join('')||'<tr><td colspan="7">No members found.</td></tr>';});
 const adminBox=$('#adminRows');if(adminBox){const admins=list.filter(x=>x.role==='admin');adminBox.innerHTML=admins.map(x=>`<tr><td>${escape(x.name)}</td><td>${escape(x.staff_id)}</td><td>${escape(x.post||'Admin')}</td><td>${escape(x.status||'active')}</td><td><button class="action danger" onclick="removeStaff(${x.id})">Delete</button></td></tr>`).join('')||'<tr><td colspan="5">No Admin accounts found.</td></tr>';$('#adminMemberPanel')?.classList.toggle('hidden',user?.role!=='master_admin');}
 const legacy=$('#staffRows');if(legacy)legacy.innerHTML='';
}
// END SECTION: FUNCTION renderStaff


// =====================================================

// SECTION: FUNCTION fillCreateParent

// =====================================================

function fillCreateParent(list){
  const form=$('form[data-type="staff"]');
  const roleSel=form?.querySelector('select[name="role"]');
  const locSel=$('#createLocation'), parentSel=$('#createParent');
  if(!form||!roleSel||!parentSel)return;
  const roleVal=roleSel.value, loc=locSel?.value||'';
  let parents=[];
  // Supervisor: only a Field Officer who owns the selected location can be parent.
  if(roleVal==='supervisor') parents=list.filter(s=>s.role==='field_officer' && (!loc || (s.assigned_locations||[]).includes(loc)));
  // Guard: only a Supervisor at the selected location can be parent.
  if(roleVal==='guard') parents=list.filter(s=>s.role==='supervisor' && (!loc||String(s.location_code||'')===String(loc)));
  parentSel.innerHTML='<option value="">'+(roleVal==='supervisor'?'Select Field Officer Parent ID':roleVal==='guard'?'Select Supervisor Parent ID':'Parent ID (Optional)')+'</option>'+parents.map(s=>`<option value="${escape(s.staff_id)}">${escape(s.name)} — ${escape(s.staff_id)}${(s.assigned_locations||[]).length?' • '+escape(s.assigned_locations.join(', ')):s.location_code?' • '+escape(s.location_code):''}</option>`).join('');
}


// END SECTION: FUNCTION fillCreateParent

// =====================================================
// SECTION: FUNCTION fillAdvanceTargets
// =====================================================
function fillAdvanceTargets(list){const sel=$('#advanceTarget');if(sel)sel.innerHTML='<option value="">Select Staff</option>'+list.filter(s=>['field_officer','officer','supervisor','guard'].includes(s.role)).map(s=>`<option value="${s.staff_id}">${escape(s.name)} — ${s.staff_id} (${label(s.role)})</option>`).join('')}
// END SECTION: FUNCTION fillAdvanceTargets

// =====================================================
// SECTION: FUNCTION loadPayroll
// =====================================================
async function loadPayroll(){try{const rows=await api('/account/payroll');const buckets={field_officer:'#fieldOfficerPayrollRows',supervisor:'#supervisorPayrollRows',guard:'#guardPayrollRows'};Object.entries(buckets).forEach(([r,sel])=>{const b=$(sel);if(!b)return;const list=rows.filter(s=>s.role===r);b.innerHTML=list.map(s=>{const payable=Math.max(0,Number(s.salary||0)-Number(s.fine||0)-Number(s.advance||0));const remaining=Math.max(0,payable-Number(s.paid||0));const paid=remaining<=0&&payable>0;return `<tr><td>${escape(s.name)}</td><td>${escape(s.staff_id)}</td><td>${escape(s.contact_number||'—')}</td><td>${escape(s.post||'')}</td><td>₹${s.salary||0}</td><td>${Number(s.duty_days||0)}</td><td>₹${s.fine||0}</td><td>₹${s.advance||0}</td><td>₹${s.paid||0}</td><td>₹${remaining}</td><td>${paid?'<button class="payment-done" disabled>✓ Paid</button>':`<button class="action success" onclick="makePayment('${s.staff_id}',${remaining})">Payment ₹${remaining}</button>`}</td></tr>`}).join('')||'<tr><td colspan="11">No staff payroll found.</td></tr>';const panel=document.querySelector(`[data-payroll-role="${r}"]`);const filter=$('#accountRoleFilter')?.value||'all';if(panel)panel.classList.toggle('hidden',filter!=='all'&&filter!==r)})}catch(e){console.log(e.message)}}
// END SECTION: FUNCTION loadPayroll


// =====================================================

// SECTION: FUNCTION makePayment

// =====================================================

async function makePayment(staffId,amount){if(!confirm(`Pay ₹${amount} to ${staffId}?`))return;try{await api('/payments',{method:'POST',body:JSON.stringify({staff_id:staffId,amount,note:'Admin salary payment'})});msg('Payment completed ✓');loadPayroll();refresh()}catch(e){alert(e.message)}}

// END SECTION: FUNCTION makePayment

// =====================================================
// SECTION: FUNCTION fillTargets
// =====================================================
// =====================================================
// SECTION: ADMIN MARK PRESENT UI
// =====================================================
function fillAdminPresentTargets(list){
  const dl=$('#adminPresentStaffList');
  if(dl)dl.innerHTML=list.filter(s=>['admin','field_officer','officer','supervisor','guard'].includes(s.role)).map(s=>`<option value="${escape(s.staff_id)}">${escape(s.name)} — ${label(s.role)}</option>`).join('');
}
function fillAdminPresentLocations(){
  const dl=$('#adminPresentLocationList');
  if(dl)dl.innerHTML=[...new Set((locationConfigs?Object.keys(locationConfigs):[]).filter(Boolean))].map(c=>`<option value="${escape(c)}"></option>`).join('');
}
function setupAdminMarkPresent(){
  const form=$('#adminMarkPresentForm');
  if(!form||!isAdminRole)return;
  if(form.dataset.bound==='1') return;
  form.dataset.bound='1';
  const date=$('#adminPresentDate');
  if(date&&!date.value)date.value=new Date().toISOString().slice(0,10);
  fillAdminPresentLocations();
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const d=Object.fromEntries(new FormData(form));
    try{
      const out=await api('/attendance/admin-mark-present',{method:'POST',body:JSON.stringify(d)});
      msg(out.message||'Present marked successfully ✓');
      form.reset(); if(date)date.value=d.date||new Date().toISOString().slice(0,10);
      refresh();
    }catch(err){alert(err.message)}
  });
}
// END SECTION: ADMIN MARK PRESENT UI

function fillTargets(list){
 const input=$('#fineTarget'), listBox=$('#fineTargetList');
 if(!input||!listBox)return;
 const targets=list.filter(s=>['guard','supervisor'].includes(s.role));
 listBox.innerHTML=targets.map(s=>`<option value="${escape(s.staff_id)}" label="${escape(s.name)} — ${label(s.role)}"></option>`).join('');
}
// END SECTION: FUNCTION fillTargets

// =====================================================
// SECTION: FUNCTION renderProfileRecords
// =====================================================
function renderProfileRecords(list){
  const b=$('#profileRecordRows'); if(!b||!isAdminRole)return;
  const rf=$('#profileRoleFilter')?.value||'all', lf=$('#profileLocationFilter')?.value||'all';
  const rows=list.filter(s=>['master_admin','admin','field_officer','officer','supervisor','guard'].includes(s.role))
    .filter(s=>rf==='all'||s.role===rf).filter(s=>lf==='all'||String(s.location_code||'')===lf);
  b.innerHTML=rows.map(s=>`<tr>
    <td><img class="profile-thumb" src="${escape(s.dp||s.photo_front||'assets-logo.png')}" alt="Profile"></td>
    <td>${label(s.role)}</td><td>${escape(s.name)}</td><td><b>${escape(s.staff_id)}</b></td>
    <td>${escape((s.assigned_locations||[]).join(', ')||s.location_code||'—')}</td><td>${escape(s.parent_id||'—')}</td>
    <td>${escape(s.post||'')}</td><td>${escape(s.contact_number||'—')}</td>
    <td><small>Age: ${escape(s.age||'—')} • H: ${escape(s.height||'—')} • W: ${escape(s.weight||'—')}<br>
      Blood: ${escape(s.blood_group||'—')} • Qual: ${escape(s.qualification||'—')}<br>
      Physical: ${escape(s.physical_level||'—')} • Medical: ${escape(s.medical_level||'—')}<br>
      Police: ${escape(s.police_verification||'—')} • License: ${escape(s.driving_license||'—')}<br>
      Training: ${escape(s.training_details||'—')}<br>Experience: ${escape(s.work_experience||'—')}<br>
      Photos: ${[s.photo_front,s.photo_back,s.photo_left,s.photo_right].filter(Boolean).length}/4</small></td>
    <td>${escape(s.status||'active')}</td>
    <td><button class="action primary-action" onclick="viewProfile(${s.id})">View</button> ${s.role==='master_admin'?'<button class="action" disabled>Protected</button>':'<button class="action success" onclick="editProfile('+s.id+')">Edit</button>'}</td>
  </tr>`).join('')||'<tr><td colspan="11">No profile records found.</td></tr>';
}
// END SECTION: FUNCTION renderProfileRecords

// =====================================================
// SECTION: FUNCTION viewProfile
// =====================================================
function viewProfile(id){location.href='profile-view.html?id='+encodeURIComponent(id);}
// END SECTION: FUNCTION viewProfile

window.viewProfile=viewProfile;
// =====================================================
// SECTION: FUNCTION editProfile
// =====================================================
function editProfile(id){location.href='edit-profile.html?id='+encodeURIComponent(id);}
// END SECTION: FUNCTION editProfile

window.editProfile=editProfile;
// =====================================================
// SECTION: FUNCTION loadProfile
// =====================================================
async function loadProfile(){
  try{
    const d=await api('/profile/me'); const s=d.user;
    ['name','post','salary','dob','department','location_code','contact_number','age','height','weight','blood_group','qualification','physical_level','medical_level','skills','police_verification','driving_license','training_details','work_experience','photo_front','photo_back','photo_left','photo_right','dp'].forEach(k=>{
      const x=$('#p_'+k); if(x)x.value=s[k]??'';
    });
    ['front','back','left','right'].forEach(k=>{const v=s['photo_'+k]||'assets-logo.png',img=$('#p_photo_'+k+'_preview');if(img)img.src=v;});
    sessionStorage.setItem('sndfUser',JSON.stringify(s)); renderTopProfile(s);
  }catch(e){}
}
// END SECTION: FUNCTION loadProfile

// =====================================================
// SECTION: FUNCTION loadNotices
// =====================================================
async function loadNotices(){const b=$('#noticeRows');if(!b)return;try{const rows=await api('/notices');const mine=rows.filter(n=>n.to_role===role||n.to_role==='all'||n.from_role===role);b.innerHTML=mine.map(n=>`<div class="notice-item"><b>${label(n.from_role)} → ${label(n.to_role)}</b><p>${escape(n.message)}</p><small>${new Date(n.created_at).toLocaleString()}</small></div>`).join('')||'<p>No notices.</p>'}catch(e){}}
// END SECTION: FUNCTION loadNotices

// =====================================================
// SECTION: FUNCTION loadHelp
// =====================================================
async function loadHelp(){const b=$('#helpRows');if(!b)return;try{const rows=await api('/help');b.innerHTML=rows.map(n=>`<div class="notice-item"><b>${label(n.from_role)}</b><p>${escape(n.message)}</p><small>${new Date(n.created_at).toLocaleString()}</small></div>`).join('')||'<p>No help records.</p>'}catch(e){}}
// END SECTION: FUNCTION loadHelp

// =====================================================
// SECTION: FUNCTION downloadAttendance
// =====================================================
function downloadAttendance(r,date='',month='',location='',dutyHours='',shift='all'){const qs=new URLSearchParams();if(r&&r!=='all')qs.set('role',r);if(date)qs.set('date',date);if(month)qs.set('month',month);if(location&&location!=='all')qs.set('location',location);if(dutyHours&&dutyHours!=='all')qs.set('duty_hours',dutyHours);if(shift&&shift!=='all')qs.set('shift',shift);const u=API_URL+'/attendance/export?'+qs.toString();fetch(u,{headers:{'x-staff-id':user.staff_id,'x-role':user.role}}).then(async x=>{if(!x.ok){let d={};try{d=await x.json()}catch{}throw Error(d.error||'Download failed')}return x.blob()}).then(blob=>{const z=URL.createObjectURL(blob),a=document.createElement('a');a.href=z;a.download=(r||'all')+'-'+(date||month||'all')+'-attendance.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(z)}).catch(e=>alert(e.message))}
// END SECTION: FUNCTION downloadAttendance

// =====================================================
// SECTION: FUNCTION checkout
// =====================================================
async function checkout(id){try{const d=await api('/attendance/'+id+'/checkout',{method:'PUT'});msg(`${d.message}: ${d.hours_worked} hours`);refresh()}catch(e){alert(e.message)}}
// END SECTION: FUNCTION checkout

// =====================================================
// SECTION: FUNCTION removeStaff
// =====================================================
async function removeStaff(id){if(!confirm('Delete this member?'))return;try{await api('/staff/'+id,{method:'DELETE'});refresh()}catch(e){alert(e.message)}}
// END SECTION: FUNCTION removeStaff

window.checkout=checkout;window.removeStaff=removeStaff;window.downloadAttendance=downloadAttendance;window.makePayment=makePayment;
let stream=null,photo='',gpsCoords=null,openAttendanceId=null;
let locationConfigs={};
// =====================================================
// SECTION: FUNCTION loadLocationConfigs
// =====================================================
async function loadLocationConfigs(){try{const rows=await api('/locations'); locationConfigs=Object.fromEntries((rows||[]).map(x=>[String(x.code),x]));}catch(e){locationConfigs={};}}
// END SECTION: FUNCTION loadLocationConfigs

// =====================================================
// SECTION: FUNCTION currentDutyHours
// =====================================================
function currentDutyHours(){const code=String(user?.location_code||''); return Number(locationConfigs[code]?.duty_hours)===8?8:12;}
// END SECTION: FUNCTION currentDutyHours

// =====================================================
// SECTION: FUNCTION populateLocationSelects
// =====================================================
function populateLocationSelects(){
  const rows=Object.values(locationConfigs||{}).filter(x=>x && x.active!==0).sort((a,b)=>String(a.code).localeCompare(String(b.code)));
  const options=rows.map(x=>`<option value="${escape(x.code)}">${escape(x.code)} — ${escape(x.name)} (${Number(x.duty_hours)===8?8:12} Hours)</option>`).join('');
  const create=$('#createLocation'); if(create){const cur=create.value;create.innerHTML='<option value="">Select Location</option>'+options; if(rows.some(x=>x.code===cur))create.value=cur;}
  const rel=$('#relieverLocation'); if(rel){const cur=rel.value;rel.innerHTML='<option value="">Select Location</option>'+options; if(rows.some(x=>x.code===cur))rel.value=cur;}
  const point=$('#pointUpdateLocationFilter'); if(point){const cur=point.value;point.innerHTML='<option value="all">All Locations</option>'+options; if(rows.some(x=>x.code===cur))point.value=cur;}
  const profile=$('#profileLocationFilter'); if(profile){const cur=profile.value;profile.innerHTML='<option value="all">All Locations</option>'+options; if(rows.some(x=>x.code===cur))profile.value=cur;}
  const att=$('#attendanceLocation'); if(att){const cur=att.value;att.innerHTML='<option value="all">All Locations</option>'+options; if(rows.some(x=>x.code===cur))att.value=cur;}
  const daily=$('#dailyLocationList'); if(daily)daily.innerHTML=rows.map(x=>`<option value="${escape(x.code)}">${escape(x.name)}</option>`).join('');
}
// END SECTION: FUNCTION populateLocationSelects


// =====================================================

// SECTION: FUNCTION currentShift

// =====================================================

function currentShift(){
  const h=new Date().getHours(), duty=currentDutyHours();
  if(duty===8){
    if(h>=6&&h<14)return 'Morning Shift';
    if(h>=14&&h<22)return 'Evening Shift';
    return 'Night Shift 8H';
  }
  return h>=8&&h<20?'Day Shift':'Night Shift';
}

// END SECTION: FUNCTION currentShift

// =====================================================
// SECTION: FUNCTION fillAutoAttendance
// =====================================================
function fillAutoAttendance(){
  const map={autoName:user?.name,autoStaffId:user?.staff_id,autoRole:label(user?.role),autoLocationCode:user?.location_code||'—',autoParentId:user?.parent_id||'—',autoShift:currentShift()+' • '+currentDutyHours()+' Hours Duty',autoDutyHours:currentDutyHours()+' Hours'};
  Object.entries(map).forEach(([id,v])=>{const x=$('#'+id);if(x)x.textContent=v||'—'});
}
// END SECTION: FUNCTION fillAutoAttendance

// =====================================================
// SECTION: FUNCTION startLiveCamera
// =====================================================
async function startLiveCamera(){
  if(!navigator.mediaDevices?.getUserMedia)return;
  try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:720},height:{ideal:720}},audio:false});const v=$('#camera');if(v)v.srcObject=stream;}
  catch(e){msg('Camera permission required. Tap Take Photo after allowing camera.');}
}
// END SECTION: FUNCTION startLiveCamera

// =====================================================
// SECTION: FUNCTION updateGpsStatus
// =====================================================
function updateGpsStatus(text){const x=$('#gpsStatus');if(x)x.textContent=text;}
// END SECTION: FUNCTION updateGpsStatus

// =====================================================
// SECTION: FUNCTION getLiveGPS
// =====================================================
function getLiveGPS(){
  if(!navigator.geolocation){updateGpsStatus('GPS not supported');return;}
  updateGpsStatus('Getting location…');
  navigator.geolocation.getCurrentPosition(p=>{
    gpsCoords={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy};
    updateGpsStatus(`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`);
  },()=>updateGpsStatus('Location permission required'),{enableHighAccuracy:true,timeout:12000,maximumAge:0});
}
// END SECTION: FUNCTION getLiveGPS

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

// =====================================================

// SECTION: FUNCTION loadReports

// =====================================================

async function loadReports(){
  if(role!=='admin'||!$('#reports'))return;
  const month=$('#reportMonth')?.value||new Date().toISOString().slice(0,7);
  try{
    const [s,logs]=await Promise.all([api('/reports/summary?month='+encodeURIComponent(month)),api('/audit-logs?limit=200')]);
    const map={reportAttendance:s.attendance?.total||0,reportDutyDays:Number(s.attendance?.duty_days||0).toFixed(1),reportHours:Number(s.attendance?.hours||0).toFixed(1),reportFines:'₹'+Number(s.fines||0),reportPayments:'₹'+Number(s.payments||0)};
    Object.entries(map).forEach(([id,v])=>{const x=$('#'+id);if(x)x.textContent=v});
    const b=$('#auditRows'); if(b)b.innerHTML=logs.map(x=>`<tr><td>${escape(new Date(x.created_at).toLocaleString())}</td><td>${escape(x.actor_id)}</td><td>${escape(label(x.actor_role))}</td><td><b>${escape(x.action)}</b></td><td>${escape(x.target_id||'—')}</td><td>${escape(x.details||'')}</td></tr>`).join('')||'<tr><td colspan="6">No audit records.</td></tr>';
  }catch(e){console.log(e.message)}
}

// END SECTION: FUNCTION loadReports

// =====================================================
// SECTION: FUNCTION downloadUrl
// =====================================================
function downloadUrl(path,filename){
  fetch(API_URL+path,{headers:{'x-staff-id':user.staff_id,'x-role':user.role}}).then(async r=>{if(!r.ok){let d={};try{d=await r.json()}catch{}throw Error(d.error||'Download failed')}return r.blob()}).then(blob=>{const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u)}).catch(e=>alert(e.message));
}
// END SECTION: FUNCTION downloadUrl


fillAutoAttendance(); getLiveGPS(); startLiveCamera();
$('#fineReason')?.addEventListener('change',e=>{const opt=e.target.selectedOptions[0];const amount=opt?.dataset?.amount||'';const x=$('#fineAmount');if(x && amount)x.value=amount;const custom=$('#fineCustomReason');if(custom && e.target.value)custom.value='';});
$$('form[data-type]').forEach(form=>form.addEventListener('submit',async e=>{
  e.preventDefault();
  const d=Object.fromEntries(new FormData(form));
  try{
    if(form.dataset.type==='fine'){
      const selectedReason=d.reason_select||'';
      const customReason=(d.reason_custom||'').trim();
      d.reason=customReason||selectedReason;
      d.amount=Number(d.amount||0);
      if(!d.reason)throw Error('Select a Fine Reason or enter a custom reason');
      if(!Number.isFinite(d.amount)||d.amount<=0)throw Error('Enter a valid Fine Amount');
      if(!d.image)throw Error('Fine submit karne se pehle live camera image lena zaroori hai.');
      delete d.reason_select; delete d.reason_custom;
    }
    if(form.dataset.type==='staff'){
      // Only Admin and Master Admin can create members. Parent rules are role-specific.
      if(!['admin','master_admin'].includes(user?.role)) throw Error('Only Admin or Master Admin can create members');
      if(['supervisor','guard'].includes(d.role) && !String(d.location_code||'').trim())
        throw Error(`Location Code is required for ${d.role}`);
      if(['supervisor','guard'].includes(d.role) && !String(d.parent_id||'').trim())
        throw Error(`Parent ID is required for ${d.role}`);
      const created = await api('/staff',{method:'POST',body:JSON.stringify(d)});
      window.__lastCreatedStaff = { staff_id: d.staff_id, role: d.role, name: d.name, database_id: created.id };
    }
    if(form.dataset.type==='fine')await api('/fines',{method:'POST',body:JSON.stringify(d)});
    if(form.dataset.type==='advance')await api('/advances',{method:'POST',body:JSON.stringify(d)});
    if(form.dataset.type==='notice')await api('/notices',{method:'POST',body:JSON.stringify(d)});
    if(form.dataset.type==='help')await api('/help',{method:'POST',body:JSON.stringify(d)});
    const createdInfo=window.__lastCreatedStaff;
    msg(createdInfo ? `Member created ✓  Staff ID: ${createdInfo.staff_id}` : 'Saved successfully');
    delete window.__lastCreatedStaff;
    form.reset();
    refresh()
  }catch(err){alert(err.message)}
}));
$('#pointTransferForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));try{await api('/point-transfers',{method:'POST',body:JSON.stringify(d)});msg('Point transfer request sent to Admin');e.target.reset();loadPointTransfers();}catch(err){alert(err.message)}});
$('#directPointTransferForm')?.addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));if(!confirm(`Change point for Staff ID ${d.staff_id} to ${d.to_location}?`))return;try{const r=await api('/point-transfers/direct',{method:'PUT',body:JSON.stringify(d)});msg(r.message||'Point changed successfully');e.target.reset();loadPointTransfers();refresh();}catch(err){alert(err.message)}});
['front','back','left','right'].forEach(k=>{
  $('#p_photo_'+k+'_file')?.addEventListener('change',e=>{
    const f=e.target.files?.[0]; if(!f)return;
    const rd=new FileReader(); rd.onload=()=>{
      $('#p_photo_'+k).value=rd.result;
      const img=$('#p_photo_'+k+'_preview'); if(img)img.src=rd.result;
      if(k==='front' && $('#p_dp'))$('#p_dp').value=rd.result;
    }; rd.readAsDataURL(f);
  });
});
$('#profileForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const d=Object.fromEntries(new FormData(e.target));
  try{
    await api('/profile/me',{method:'PUT',body:JSON.stringify(d)});
    const fresh=await api('/profile/me');sessionStorage.setItem('sndfUser',JSON.stringify(fresh.user));
    msg('Complete profile submitted to Admin Panel ✓');loadProfile();refresh();
  }catch(err){alert(err.message)}
});
$('#suspendForm')?.addEventListener('submit',async e=>{e.preventDefault();try{await api('/staff/'+$('#suspendStaff').value+'/suspend',{method:'PUT',body:JSON.stringify({hours:Number($('#suspendHours').value),reason:$('#suspendReason').value})});msg('ID suspended');refresh()}catch(err){alert(err.message)}});
$('#downloadDaily')?.addEventListener('click',()=>{const d=$('#dailyDate')?.value||new Date().toISOString().slice(0,10);const loc=($('#dailyLocation')?.value||'').trim();const duty=$('#dailyDutyHours')?.value||'all';const shift=$('#dailyShift')?.value||'all';downloadAttendance('',d,'',loc,duty,shift)});
$('#downloadAttendanceMatrix')?.addEventListener('click',()=>{const m=$('#attendanceMonth')?.value||new Date().toISOString().slice(0,7);const loc=$('#attendanceLocation')?.value||'all';const duty=$('#attendanceDutyHours')?.value||'all';const shift=$('#attendanceShift')?.value||'all';downloadAttendance('', '', m, loc,duty,shift)});
$('#attendanceMonth')?.addEventListener('change',()=>{if(isAdminRole)refresh()});$('#dailyDate')?.setAttribute('value',new Date().toISOString().slice(0,10));$('#attendanceMonth')?.setAttribute('value',new Date().toISOString().slice(0,7));$('#dailyDate')?.addEventListener('change',()=>renderDaily(window._attendanceRows||[]));$('#dailyLocation')?.addEventListener('input',()=>renderDaily(window._attendanceRows||[]));$('#dailyIdSearch')?.addEventListener('input',()=>renderDaily(window._attendanceRows||[]));$('#attendanceIdSearch')?.addEventListener('input',()=>renderAttendance(window._attendanceRows||[]));window.downloadAttendanceMonth=(r)=>{const m=$('#attendanceMonth')?.value;if(!m)return alert('Select a month first');downloadAttendance(r,'',m)};
$('form[data-type="staff"] select[name="role"]')?.addEventListener('change',()=>fillCreateParent(staff));
$('#createLocation')?.addEventListener('change',()=>fillCreateParent(staff));
$('#profileRoleFilter')?.addEventListener('change',()=>renderProfileRecords(staff));
$('#profileLocationFilter')?.addEventListener('change',()=>renderProfileRecords(staff));
$('#downloadProfileUpdateSheet')?.addEventListener('click',()=>{
  const qs=new URLSearchParams();
  const r=$('#profileRoleFilter')?.value||'all';
  const l=$('#profileLocationFilter')?.value||'all';
  if(r!=='all')qs.set('role',r); if(l!=='all')qs.set('location',l);
  fetch(API_URL+'/profile-update-sheet?'+qs.toString(),{headers:{'x-staff-id':user.staff_id,'x-role':user.role}})
    .then(async x=>{if(!x.ok){let d={};try{d=await x.json()}catch{}throw Error(d.error||'Download failed')}return x.blob()})
    .then(blob=>{const z=URL.createObjectURL(blob),a=document.createElement('a');a.href=z;a.download='profile-update-sheet-'+new Date().toISOString().slice(0,10)+'.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(z);msg('Profile Update Sheet downloaded ✓')})
    .catch(e=>alert(e.message));
});

filterMemberLists();
// =====================================================
// SECTION: FUNCTION updateShiftDropdown
// =====================================================
function updateShiftDropdown(id,dutyId){const sel=$(id), duty=$(dutyId)?.value||'all';if(!sel)return;const current=sel.value||'all';let opts=[['all','All Shifts']];if(duty==='8'||duty==='all'){opts.push(['Morning Shift','Morning Shift (8H)'],['Evening Shift','Evening Shift (8H)'],['Night Shift 8H','Night Shift (8H)']);}if(duty==='12'||duty==='all'){opts.push(['Day Shift','Day Shift (12H)'],['Night Shift','Night Shift (12H)']);}sel.innerHTML=opts.map(([v,t])=>`<option value="${v}">${t}</option>`).join('');if(opts.some(x=>x[0]===current))sel.value=current;}
// END SECTION: FUNCTION updateShiftDropdown

// =====================================================
// SECTION: FUNCTION setupAttendanceFilters
// =====================================================
function setupAttendanceFilters(){updateShiftDropdown('#attendanceShift','#attendanceDutyHours');updateShiftDropdown('#dailyShift','#dailyDutyHours');$('#attendanceDutyHours')?.addEventListener('change',()=>updateShiftDropdown('#attendanceShift','#attendanceDutyHours'));$('#dailyDutyHours')?.addEventListener('change',()=>updateShiftDropdown('#dailyShift','#dailyDutyHours'));$('#attendanceLocation')?.addEventListener('change',()=>renderAttendance(window._attendanceRows||[]));$('#attendanceDutyHours')?.addEventListener('change',()=>renderAttendance(window._attendanceRows||[]));$('#attendanceShift')?.addEventListener('change',()=>renderAttendance(window._attendanceRows||[]));$('#dailyDutyHours')?.addEventListener('change',()=>renderDaily(window._attendanceRows||[]));$('#dailyShift')?.addEventListener('change',()=>renderDaily(window._attendanceRows||[]));}
// END SECTION: FUNCTION setupAttendanceFilters

setupAttendanceFilters();
$('#attendanceRoleFilter')?.addEventListener('change',()=>renderAttendance(window._attendanceRows||[]));
$('#accountRoleFilter')?.addEventListener('change',()=>loadPayroll());
$('#memberRoleFilter')?.addEventListener('change',()=>filterMemberLists());$('#createRole')?.addEventListener('change',()=>{ if(!isAdminRole)return; fillCreateParent(staff); });
if(user?.role!=='master_admin'){ $('#createRole')?.querySelector('.master-only-option')?.remove(); }
if(user?.role==='master_admin'){ const x=$('#dashboardRoleLabel'); if(x)x.textContent='SNDF MASTER ADMIN'; const note=document.querySelector('#staff .muted-note'); if(note)note.textContent='Master Admin can create Admin, Field Officer, Supervisor and Guard. Normal Admin cannot create another Admin.'; }

// =====================================================

// SECTION: FUNCTION filterMemberLists

// =====================================================

function filterMemberLists(){const role=$('#memberRoleFilter')?.value||'field_officer';document.querySelectorAll('[data-role-list]').forEach(panel=>panel.classList.toggle('hidden',panel.dataset.roleList!==role));}

// END SECTION: FUNCTION filterMemberLists

$('#attendanceMonth')?.addEventListener('change',()=>renderAttendance(window._attendanceRows||[]));


// =====================================================
// TASK MANAGEMENT UI
// =====================================================
// =====================================================
// SECTION: FUNCTION taskCreateAllowed
// =====================================================
function taskCreateAllowed(){return ['master_admin','admin','field_officer','supervisor'].includes(role)}
// END SECTION: FUNCTION taskCreateAllowed

// =====================================================
// SECTION: FUNCTION loadTaskTargets
// =====================================================
async function loadTaskTargets(){
  const sel=$('#taskAssignee'); if(!sel)return;
  if(!taskCreateAllowed()){ $('#taskCreateForm')?.closest('.task-create-panel')?.classList.add('hidden'); return; }
  try{
    const rows=await api('/task-targets');
    sel.innerHTML='<option value="">Select Member</option>'+rows.map(x=>`<option value="${escape(x.staff_id)}">${escape(x.name)} — ${escape(label(x.role))} (${escape(x.staff_id)})${x.location_code?' • '+escape(x.location_code):''}</option>`).join('');
  }catch(e){sel.innerHTML='<option value="">Unable to load members</option>'}
}
// END SECTION: FUNCTION loadTaskTargets

// =====================================================
// SECTION: FUNCTION loadTasks
// =====================================================
async function loadTasks(){
  if(!$('#taskRows'))return;
  try{
    const rows=await api('/tasks'); window._tasks=rows;
    $('#taskRows').innerHTML=rows.map(t=>{
      const canAct=t.assigned_to===user.staff_id && t.status!=='Completed';
      const actions=[
        canAct&&t.status==='Pending'?`<button class="action success" onclick="startTask(${t.id})">▶ Start</button>`:'',
        canAct?`<button class="action" onclick="updateTask(${t.id})">✎ Update</button>`:'',
        canAct?`<button class="action success" onclick="openTaskReport(${t.id})">✓ Complete</button>`:'',
        `<button class="action" onclick="viewTaskUpdates(${t.id})">View Updates</button>`
      ].filter(Boolean).join(' ');
      return `<tr><td>${t.id}</td><td><b>${escape(t.title)}</b><br><small>${escape(t.description||'')}</small></td><td>${escape(t.assignee_name||t.assigned_to)}<br><small>${escape(label(t.assigned_role))} • ${escape(t.assigned_to)}</small></td><td>${escape(t.creator_name||t.created_by)}<br><small>${escape(label(t.created_by_role))}</small></td><td>${escape(t.priority)}</td><td>${t.due_at?escape(new Date(t.due_at).toLocaleString()):'—'}</td><td><b>${escape(t.status)}</b></td><td>${escape(t.last_update||'—')}<br><small>${t.completed_at?'Completed: '+escape(new Date(t.completed_at).toLocaleString()):t.started_at?'Started: '+escape(new Date(t.started_at).toLocaleString()):''}</small></td><td>${actions}</td></tr>`
    }).join('')||'<tr><td colspan="9">No tasks found.</td></tr>';
  }catch(e){console.log(e.message)}
}
// END SECTION: FUNCTION loadTasks

// =====================================================
// SECTION: FUNCTION startTask
// =====================================================
async function startTask(id){
  try{await api('/tasks/'+id+'/start',{method:'PUT'});msg('Task started ✓');loadTasks();}catch(e){alert(e.message)}
}
// END SECTION: FUNCTION startTask

// =====================================================
// SECTION: FUNCTION updateTask
// =====================================================
async function updateTask(id){
  const text=prompt('Enter task progress update:');
  if(!text?.trim())return;
  try{await api('/tasks/'+id+'/update',{method:'POST',body:JSON.stringify({update_text:text.trim(),status:'Started'})});msg('Task update saved ✓');loadTasks();}catch(e){alert(e.message)}
}
// END SECTION: FUNCTION updateTask

// =====================================================
// SECTION: FUNCTION openTaskReport
// =====================================================
function openTaskReport(id){
  const p=$('#taskReportPanel'); if(!p)return;
  $('#reportTaskId').value=id; p.classList.remove('hidden'); p.scrollIntoView({behavior:'smooth',block:'start'});
}
// END SECTION: FUNCTION openTaskReport

// =====================================================
// SECTION: FUNCTION viewTaskUpdates
// =====================================================
async function viewTaskUpdates(id){
  try{
    const rows=await api('/tasks/'+id+'/updates');
    if(!rows.length)return alert('No task updates yet.');
    alert(rows.map(x=>`${new Date(x.created_at).toLocaleString()} — ${x.staff_name||x.staff_id} — ${x.status||''}\n${x.update_text}`).join('\n\n'));
  }catch(e){alert(e.message)}
}
// END SECTION: FUNCTION viewTaskUpdates

window.startTask=startTask;window.updateTask=updateTask;window.openTaskReport=openTaskReport;window.viewTaskUpdates=viewTaskUpdates;
$('#taskCreateForm')?.addEventListener('submit',async e=>{
  e.preventDefault(); const form=e.currentTarget; const fd=new FormData(form), body=Object.fromEntries(fd.entries());
  try{await api('/tasks',{method:'POST',body:JSON.stringify(body)});msg('Task assigned ✓');form.reset();loadTaskTargets();loadTasks();}catch(err){alert(err.message)}
});
$('#taskReportForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const form=e.currentTarget;
  const id=$('#reportTaskId')?.value;
  const body={report_summary:$('#reportSummary')?.value,report_time_summary:$('#reportTimeSummary')?.value,report_result:$('#reportResult')?.value,report_issues:$('#reportIssues')?.value,report_next_action:$('#reportNextAction')?.value};
  try{await api('/tasks/'+id+'/complete',{method:'POST',body:JSON.stringify(body)});msg('Task completed and report submitted ✓');form.reset();$('#taskReportPanel')?.classList.add('hidden');loadTasks();}catch(err){alert(err.message)}
});
$('#cancelTaskReport')?.addEventListener('click',()=>$('#taskReportPanel')?.classList.add('hidden'));

// =====================================================

// SECTION: FUNCTION loadRelievers

// =====================================================

async function loadRelievers(){
  if(!isAdminRole||!$('#relieverStaff'))return;
  try{
    const rows=await api('/relievers'); window._relievers=rows;
    const sel=$('#relieverStaff');
    sel.innerHTML='<option value="">Select Officer / Guard / Supervisor</option>'+rows.filter(x=>x.status==='active'&&['officer','guard','supervisor'].includes(x.role)).map(x=>`<option value="${escape(x.staff_id)}">${escape(x.name)} — ${escape(x.staff_id)} (${label(x.role)})${x.is_reliever?' • Reliever':''}</option>`).join('');
    const b=$('#relieverRows');
    const active=rows.filter(x=>x.status==='active');
    const selected=active.filter(x=>Number(x.is_reliever)===1).length;
    if($('#relieverTotal'))$('#relieverTotal').textContent=active.length; if($('#relieverSelected'))$('#relieverSelected').textContent=selected; if($('#relieverUnselected'))$('#relieverUnselected').textContent=Math.max(0,active.length-selected);
    if(b)b.innerHTML=rows.map(x=>`<tr><td>${label(x.role)}</td><td>${escape(x.name)}</td><td>${escape(x.staff_id)}</td><td>${escape(x.location_code||'—')}</td><td>${escape(x.parent_id||'—')}</td><td>${x.is_reliever?'Yes':'No'}</td><td>${x.is_reliever?escape((Number(x.reliever_duty_hours)===8?8:12)+' Hours'):'—'}</td><td>${x.is_reliever?escape(x.reliever_shift||'—'):'—'}</td><td>${escape(x.status||'active')}</td></tr>`).join('');
    const selectedBox=$('#selectedRelieverRows'), unselectedBox=$('#unselectedRelieverRows');
    const rowMini=x=>`<tr><td>${escape(label(x.role))}</td><td>${escape(x.name)}</td><td>${escape(x.staff_id)}</td><td>${escape(x.location_code||'—')}</td></tr>`;
    if(selectedBox)selectedBox.innerHTML=active.filter(x=>Number(x.is_reliever)===1).map(rowMini).join('')||'<tr><td colspan="4">No selected relievers.</td></tr>';
    if(unselectedBox)unselectedBox.innerHTML=active.filter(x=>Number(x.is_reliever)!==1).map(rowMini).join('')||'<tr><td colspan="4">No unselected members.</td></tr>';
  }catch(e){console.log(e.message)}
}

// END SECTION: FUNCTION loadRelievers

$('#markRelieverBtn')?.addEventListener('click',async()=>{
  const id=$('#relieverStaff')?.value;if(!id)return alert('Select Guard/Supervisor first');
  const s=(window._relievers||[]).find(x=>x.staff_id===id); if(!s)return;
  try{await api('/staff/'+s.id+'/reliever',{method:'PUT',body:JSON.stringify({is_reliever:s.is_reliever?0:1})});msg(s.is_reliever?'Reliever removed':'Reliever enabled');loadRelievers();refresh()}catch(e){alert(e.message)}
});
$('#changeRelieverLocationBtn')?.addEventListener('click',async()=>{const id=$('#relieverStaff')?.value;if(!id)return alert('Select Guard/Supervisor first');const s=(window._relievers||[]).find(x=>x.staff_id===id);const loc=$('#relieverLocation')?.value;if(!s||!loc)return alert('Select Reliever and Location');try{await api('/staff/'+s.id+'/location',{method:'PUT',body:JSON.stringify({location_code:loc})});msg('Reliever location changed ✓');loadRelievers();refresh()}catch(e){alert(e.message)}});
$('#relieverDutyHours')?.addEventListener('change',()=>{
  const hours=Number($('#relieverDutyHours')?.value)===8?8:12;
  const sel=$('#relieverShift'); if(!sel)return;
  const options=hours===8
    ? [['Morning Shift','Morning Shift — 06:00–14:00'],['Evening Shift','Evening Shift — 14:00–22:00'],['Night Shift 8H','Night Shift — 22:00–06:00']]
    : [['Day Shift','Day Shift — 08:00–20:00'],['Night Shift','Night Shift — 20:00–08:00']];
  sel.innerHTML=options.map(([v,t])=>`<option value="${v}">${t}</option>`).join('');
});

$('#relieverForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const id=$('#relieverStaff')?.value, loc=$('#relieverLocation')?.value;
  if(!id||!loc)return alert('Select Reliever and Reliever Location');
  const s=(window._relievers||[]).find(x=>x.staff_id===id);
  if(!s)return alert('Select a valid Guard/Supervisor');
  try{
    const r=await api('/relievers/assign',{method:'POST',body:JSON.stringify({staff_id:s.staff_id,location_code:loc,duty_hours:Number($('#relieverDutyHours')?.value||12),shift:$('#relieverShift')?.value||'Day Shift'})});
    msg(r.whatsapp_sent?'Reliever assigned ✓ WhatsApp message sent':'Reliever assigned ✓ WhatsApp link ready');
    if(r.whatsapp_url && !r.whatsapp_sent){
      const open=confirm('Reliever assigned. WhatsApp Cloud API is not configured on the server. Open WhatsApp message now?');
      if(open) window.open(r.whatsapp_url,'_blank');
    }
    refresh();loadRelievers();
  }catch(e){alert(e.message)}
});
// =====================================================
// SECTION: FUNCTION loadTeamAttendance
// =====================================================
async function loadTeamAttendance(){
  if(!['supervisor','officer','field_officer'].includes(role)||!$('#teamDailyRows'))return;
  try{
    const rows=await api('/team-attendance'); window._teamAttendance=rows;
    const date=$('#teamAttendanceDate')?.value||new Date().toISOString().slice(0,10);
    const month=$('#teamAttendanceMonth')?.value||date.slice(0,7);
    const daily=rows.filter(x=>x.date===date);
    $('#teamDailyRows').innerHTML=daily.map(x=>`<tr><td>${x.photo?`<img class="attendance-photo-thumb" src="${escape(x.photo)}" alt="Photo">`:'—'}</td><td>${escape(x.name)}</td><td>${escape(x.staff_id)}</td><td>${escape(x.staff_location_code||x.location||'—')}</td><td>${escape(x.shift||'')}</td><td>${escape(x.check_in||'—')}</td><td>${escape(x.check_out||'—')}</td><td>${escape(x.hours_worked||0)}</td><td>${escape(x.attendance_status||'')}</td></tr>`).join('')||'<tr><td colspan="9">No guard attendance for selected date.</td></tr>';
    const filtered=rows.filter(x=>String(x.date||'').startsWith(month)), map=new Map();
    filtered.forEach(x=>{if(!map.has(x.staff_id))map.set(x.staff_id,{name:x.name,staff_id:x.staff_id,days:{},p:0});let g=map.get(x.staff_id);g.days[Number(String(x.date).slice(-2))]='P';if(x.check_out)g.p+=x.attendance_status?.startsWith('Half Day') ? 0.5 : 1});
    $('#teamMonthlyRows').innerHTML=[...map.values()].map(g=>`<tr><td>${escape(g.name)}</td><td>${escape(g.staff_id)}</td>${Array.from({length:31},(_,i)=>`<td>${g.days[i+1]||'A'}</td>`).join('')}<td><b>${g.p}</b></td></tr>`).join('')||'<tr><td colspan="34">No monthly attendance.</td></tr>';
  }catch(e){console.log(e.message)}
}
// END SECTION: FUNCTION loadTeamAttendance

$('#teamAttendanceDate')?.addEventListener('change',loadTeamAttendance);
$('#teamAttendanceMonth')?.addEventListener('change',loadTeamAttendance);
// =====================================================
// HOURLY POINT UPDATE UI
// =====================================================
let pointStream=null, pointPhoto='', pointGPS='';
// =====================================================
// SECTION: FUNCTION getPointGPS
// =====================================================
async function getPointGPS(){
  if(!navigator.geolocation)return;
  navigator.geolocation.getCurrentPosition(pos=>{pointGPS=`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;const x=$('#pointLiveLocation');if(x)x.textContent=pointGPS;},()=>{}, {enableHighAccuracy:true,timeout:10000});
}
// END SECTION: FUNCTION getPointGPS

// =====================================================
// SECTION: FUNCTION openPointCamera
// =====================================================
async function openPointCamera(){
  if(!navigator.mediaDevices?.getUserMedia)return;
  try{pointStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});const v=$('#pointCamera');if(v)v.srcObject=pointStream;}catch(e){alert('Camera permission required for Point Update.');}
}
// END SECTION: FUNCTION openPointCamera

// =====================================================
// SECTION: FUNCTION capturePointPhoto
// =====================================================
function capturePointPhoto(){const v=$('#pointCamera'),c=$('#pointCanvas');if(!v||!c)return; c.width=720;c.height=540;c.getContext('2d').drawImage(v,0,0,c.width,c.height);pointPhoto=c.toDataURL('image/jpeg',0.78);const img=$('#pointCaptured');if(img)img.src=pointPhoto;}
// END SECTION: FUNCTION capturePointPhoto

// =====================================================
// SECTION: FUNCTION submitPointUpdate
// =====================================================
async function submitPointUpdate(){
  try{const st=await api('/point-updates/status');if(!st.required)return alert('Point Update is mandatory only during Night Shift.');if(!st.due)return alert(`Next update is due at ${new Date(st.due_at).toLocaleTimeString()}.`);if(!pointPhoto)capturePointPhoto();if(!pointPhoto)throw Error('Take the live photo first');await getPointGPS();if(!pointGPS)throw Error('Live GPS location is required');const d=await api('/point-updates',{method:'POST',body:JSON.stringify({photo:pointPhoto,location:pointGPS})});msg('Hourly Point Update submitted ✓');stopPointAlarm();pointPhoto='';const img=$('#pointCaptured');if(img)img.src='';loadPointStatus();}catch(e){alert(e.message)}}
// END SECTION: FUNCTION submitPointUpdate

// =====================================================
// SECTION: FUNCTION loadPointStatus
// =====================================================
async function loadPointStatus(){
  if(!['guard','supervisor'].includes(role)||!$('#pointStatus'))return;
  try{
    const st=await api('/point-updates/status');
    $('#pointStatus').textContent=st.required?(st.due?'⚠ Point Update DUE NOW':'Next Point Update: '+new Date(st.due_at).toLocaleTimeString()):'Day Shift: Point Update not mandatory';
    $('#pointStatus').className=st.required&&st.due?'point-due':'point-ok';
    if(st.required&&st.due) notifyPointDue();
    else stopPointAlarm();
  }catch(e){}
}
// END SECTION: FUNCTION loadPointStatus

let lastPointNotification=0;
let pointAlarmTimer=null;
let pointAlarmContext=null;
let pointAlarmEnabled=false;

// =====================================================

// SECTION: FUNCTION enablePointAlarm

// =====================================================

async function enablePointAlarm(){
  pointAlarmEnabled=true;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(AC){
      if(!pointAlarmContext)pointAlarmContext=new AC();
      if(pointAlarmContext.state==='suspended')await pointAlarmContext.resume();
      const osc=pointAlarmContext.createOscillator(),gain=pointAlarmContext.createGain();
      gain.gain.value=0.0001;osc.connect(gain);gain.connect(pointAlarmContext.destination);
      osc.start();osc.stop(pointAlarmContext.currentTime+0.05);
    }
  }catch(e){}
  if('Notification' in window && Notification.permission==='default') await Notification.requestPermission();
  try{ await enableWebPush(); }catch(e){ console.log('Web Push:',e.message); }
  const b=$('#enablePointNotifications');
  if(b){b.textContent=window._pushEnabled?'🔔 Push + Alarm Enabled':'🔔 Alarm Enabled';b.classList.add('alarm-enabled');}
  msg(window._pushEnabled?'Point Update alarm + phone push enabled ✓':'Point Update alarm enabled. Phone push could not be enabled.');
}

// END SECTION: FUNCTION enablePointAlarm


// =====================================================

// SECTION: FUNCTION urlBase64ToUint8Array

// =====================================================

function urlBase64ToUint8Array(base64String){
  const padding='='.repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base64);const out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;
}

// END SECTION: FUNCTION urlBase64ToUint8Array


// =====================================================

// SECTION: FUNCTION enableWebPush

// =====================================================

async function enableWebPush(){
  if(!('serviceWorker' in navigator) || !('PushManager' in window)) throw Error('This browser does not support Web Push.');
  if(!window.isSecureContext) throw Error('Web Push requires HTTPS in production.');
  const permission=Notification.permission==='granted'? 'granted' : await Notification.requestPermission();
  if(permission!=='granted') throw Error('Notification permission was not granted.');
  const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
  await navigator.serviceWorker.ready;
  const keyData=await api('/push/public-key');
  let subscription=await reg.pushManager.getSubscription();
  if(!subscription){
    subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(keyData.publicKey)});
  }
  await api('/push/subscribe',{method:'POST',body:JSON.stringify({subscription:subscription.toJSON()})});
  window._pushEnabled=true;
  return subscription;
}

// END SECTION: FUNCTION enableWebPush


// =====================================================

// SECTION: FUNCTION initWebPush

// =====================================================

async function initWebPush(){
  if(!['guard','supervisor'].includes(role))return;
  if(!('serviceWorker' in navigator)||!('PushManager' in window))return;
  try{
    const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
    const sub=await reg.pushManager.getSubscription();
    if(sub){
      await api('/push/subscribe',{method:'POST',body:JSON.stringify({subscription:sub.toJSON()})});
      window._pushEnabled=true;
      const b=$('#enablePointNotifications');if(b)b.textContent='🔔 Push + Alarm Available';
    }
  }catch(e){console.log('Web Push init:',e.message)}
}

// END SECTION: FUNCTION initWebPush


// =====================================================

// SECTION: FUNCTION playPointAlarmBeep

// =====================================================

function playPointAlarmBeep(){
  if(!pointAlarmEnabled)return;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    if(!pointAlarmContext)pointAlarmContext=new AC();
    if(pointAlarmContext.state==='suspended')pointAlarmContext.resume();
    const now=pointAlarmContext.currentTime;
    [0,0.32,0.64].forEach((delay,i)=>{
      const osc=pointAlarmContext.createOscillator(),gain=pointAlarmContext.createGain();
      osc.type='sine';osc.frequency.value=i===1?1046:880;
      gain.gain.setValueAtTime(0.0001,now+delay);
      gain.gain.exponentialRampToValueAtTime(0.22,now+delay+0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001,now+delay+0.22);
      osc.connect(gain);gain.connect(pointAlarmContext.destination);
      osc.start(now+delay);osc.stop(now+delay+0.24);
    });
  }catch(e){}
}

// END SECTION: FUNCTION playPointAlarmBeep


// =====================================================

// SECTION: FUNCTION showPointAlarmPopup

// =====================================================

function showPointAlarmPopup(){
  const modal=$('#pointAlarmModal');if(!modal)return;
  modal.classList.add('show');
  const status=$('#pointAlarmMessage');if(status)status.textContent='Night Shift: आपका 1 घंटे का Point Update अभी pending है। Live photo + live location submit करें।';
  playPointAlarmBeep();
  clearInterval(pointAlarmTimer);
  pointAlarmTimer=setInterval(()=>playPointAlarmBeep(),5000);
}

// END SECTION: FUNCTION showPointAlarmPopup


// =====================================================

// SECTION: FUNCTION stopPointAlarm

// =====================================================

function stopPointAlarm(){
  clearInterval(pointAlarmTimer);pointAlarmTimer=null;
  const modal=$('#pointAlarmModal');if(modal)modal.classList.remove('show');
}

// END SECTION: FUNCTION stopPointAlarm


// =====================================================

// SECTION: FUNCTION notifyPointDue

// =====================================================

function notifyPointDue(){
  const now=Date.now();
  if(now-lastPointNotification<15*60*1000){
    showPointAlarmPopup();
    return;
  }
  lastPointNotification=now;
  showPointAlarmPopup();
  if('Notification' in window){
    if(Notification.permission==='default')Notification.requestPermission();
    if(Notification.permission==='granted')new Notification('SNDF Point Update Due',{body:'Night Shift: 1 hour complete. Please capture and submit your live photo + location.'});
  }
}

// END SECTION: FUNCTION notifyPointDue

// =====================================================
// SECTION: FUNCTION loadPointUpdates
// =====================================================
async function loadPointUpdates(){
  if(!isAdminRole||!$('#pointUpdateRows'))return;
  try{const q=new URLSearchParams();const r=$('#pointUpdateRoleFilter')?.value||'all',l=$('#pointUpdateLocationFilter')?.value||'all',d=$('#pointUpdateDate')?.value||'';if(r!=='all')q.set('role',r);if(l!=='all')q.set('location',l);if(d)q.set('date',d);const rows=await api('/point-updates?'+q.toString());$('#pointUpdateRows').innerHTML=rows.map(x=>`<tr><td><img class="attendance-photo-thumb" src="${escape(x.photo)}" alt="Point photo" onclick="openAttendancePhoto('${escape(x.photo)}')"></td><td>${escape(new Date(x.captured_at).toLocaleTimeString())}</td><td>${escape(new Date(x.captured_at).toLocaleDateString())}</td><td>${escape(label(x.role))}</td><td>${escape(x.name)}</td><td>${escape(x.staff_id)}</td><td>${escape(x.location_code||'—')}</td><td>${escape(x.location||'—')}</td><td>${escape(x.shift)}</td><td>${escape(x.status)}</td></tr>`).join('')||'<tr><td colspan="10">No Point Updates found.</td></tr>';}catch(e){console.log(e.message)}}
// END SECTION: FUNCTION loadPointUpdates

$('#refreshPointUpdates')?.addEventListener('click',loadPointUpdates);$('#pointUpdateRoleFilter')?.addEventListener('change',loadPointUpdates);$('#pointUpdateLocationFilter')?.addEventListener('change',loadPointUpdates);$('#pointUpdateDate')?.addEventListener('change',loadPointUpdates);
if(['guard','supervisor'].includes(role)){
  $('#enablePointNotifications')?.addEventListener('click',enablePointAlarm);
  initWebPush();
  openPointCamera();getPointGPS();loadPointStatus();setInterval(loadPointStatus,60000);
}
$('#logout')?.addEventListener('click',()=>{sessionStorage.removeItem('sndfUser');location.href='index.html'});
loadProfile();refresh();
if($('#p_staff_id')) $('#p_staff_id').value=user.staff_id;
if(!isAdminRole && !['field_officer','supervisor'].includes(role)){ $('#staff')?.remove(); $('#advance')?.remove(); $('#suspend')?.remove(); $('#profile-records')?.remove(); }
if(role==='field_officer'){$('#team-management form[data-type="staff"]')?.remove();$('#team-management h3')?.remove();$('#team-management .muted-note')?.remove();}
if(role==='officer'){['daily','team-attendance','team-management','fine','help','point-transfer','tasks'].forEach(id=>$('#'+id)?.remove());document.querySelectorAll('[data-view="daily"],[data-view="team-attendance"],[data-view="team-management"],[data-view="fine"],[data-view="help"],[data-view="point-transfer"],[data-view="tasks"]').forEach(x=>x.remove());loadOfficerRelieverNotifications();}
if(!isAdminRole) $$('[onclick^="downloadAttendance"]').forEach(b=>b.remove());
if(!['admin','field_officer','officer'].includes(role)) $('#fine')?.querySelector('.fine-form')?.remove();
if(isAdminRole) $('#fine')?.querySelector('.fine-form')?.insertAdjacentHTML('afterend','<p>Admin may fine Guard or Supervisor.</p>');
// Admin controls admin profile; Field Officer, Supervisor and Guard can submit their complete profile.
if(role==='admin') ['name','post','salary','dob','department','location_code'].forEach(k=>$('#p_'+k)?.removeAttribute('disabled'));
$('#p_dp_file')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(!f)return;const rd=new FileReader();rd.onload=()=>$('#p_dp').value=rd.result;rd.readAsDataURL(f)});

$('#profileRoleFilter')?.addEventListener('change',()=>renderProfileRecords(staff));$('#profileLocationFilter')?.addEventListener('change',()=>renderProfileRecords(staff));
$('#reportMonth')?.setAttribute('value',new Date().toISOString().slice(0,7));
$('#reportMonth')?.addEventListener('change',loadReports);
$('#downloadAuditReport')?.addEventListener('click',()=>downloadUrl('/audit-logs/export','sndf-audit-log.csv'));
$('#downloadPayrollReport')?.addEventListener('click',()=>{const m=$('#reportMonth')?.value||new Date().toISOString().slice(0,7);downloadUrl('/reports/payroll/export?month='+encodeURIComponent(m),'sndf-payroll-'+m+'.csv')});

$('#logout')?.addEventListener('click',()=>{sessionStorage.removeItem('sndfUser');location.replace('login.html')});
