// SNDF Management demo seed. Run locally with: npm run seed-demo
// WARNING: this resets the selected SQLite database. Use only for demo/testing.
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const dbPath = process.env.RAILWAY_VOLUME_MOUNT_PATH ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH,'sndf.db') : path.join(__dirname,'sndf.db');
fs.mkdirSync(path.dirname(dbPath),{recursive:true});
const db = new sqlite3.Database(dbPath);
db.configure('busyTimeout',5000);
const run=(sql,p=[])=>new Promise((res,rej)=>db.run(sql,p,function(e){e?rej(e):res(this)}));
const all=(sql,p=[])=>new Promise((res,rej)=>db.all(sql,p,(e,r)=>e?rej(e):res(r)));
const iso=d=>new Date(d).toISOString();
(async()=>{
try{
 await run('PRAGMA foreign_keys=OFF');
 for(const t of ['profile_edit_history','suspension_notifications','help_requests','notices','payments','advances','fines','attendance','staff']) await run(`DROP TABLE IF EXISTS ${t}`);
 await run(`CREATE TABLE staff (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, name TEXT NOT NULL, staff_id TEXT UNIQUE NOT NULL, password TEXT NOT NULL, post TEXT, salary REAL DEFAULT 0, location_code TEXT, parent_id TEXT, status TEXT DEFAULT 'active', suspended_until TEXT, suspension_reason TEXT, dob TEXT, department TEXT, contact_number TEXT, dp TEXT)`);
 await run(`CREATE TABLE attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT, name TEXT, date TEXT, photo TEXT, location TEXT, shift TEXT, check_in TEXT, check_in_at TEXT, check_out TEXT, hours_worked REAL DEFAULT 0, attendance_status TEXT DEFAULT 'Present')`);
 await run(`CREATE TABLE fines (id INTEGER PRIMARY KEY AUTOINCREMENT, guard_id TEXT, reason TEXT, amount REAL, issued_by TEXT, created_at TEXT)`);
 await run(`CREATE TABLE advances (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT, amount REAL NOT NULL, note TEXT, given_by TEXT, created_at TEXT)`);
 await run(`CREATE TABLE payments (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT NOT NULL, amount REAL NOT NULL, paid_by TEXT NOT NULL, paid_at TEXT NOT NULL, note TEXT)`);
 await run(`CREATE TABLE notices (id INTEGER PRIMARY KEY AUTOINCREMENT, from_role TEXT, to_role TEXT, message TEXT, reply TEXT, created_at TEXT)`);
 await run(`CREATE TABLE help_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, from_role TEXT, message TEXT, response TEXT, created_at TEXT)`);
 await run(`CREATE TABLE suspension_notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT, staff_name TEXT, staff_role TEXT, reason TEXT, suspended_until TEXT, created_at TEXT)`);
 await run(`CREATE TABLE profile_edit_history (id INTEGER PRIMARY KEY AUTOINCREMENT, staff_db_id INTEGER, staff_id TEXT, staff_name TEXT, edited_by TEXT, edited_at TEXT, changes_json TEXT)`);
 const staff=[
  ['admin','SNDF Admin','admin','adi2026','Admin',0,'','','active','','','','Management',''],
  ['field_officer','Ravi Sharma','FO001','field123','Field Officer',42000,'ALL','', 'active','','','', 'Operations & Control','9876500099'],
  ['supervisor','Amit Verma','SUP001','super123','Supervisor',32000,'LOC-01','FO001','active','','','', 'Operations','9876500002'],
  ['supervisor','Neha Singh','SUP002','super123','Supervisor',33000,'LOC-02','FO001','active','','','', 'Operations','9876500003'],
  ['supervisor','Suresh Yadav','SUP003','super123','Senior Supervisor',32000,'LOC-03','FO001','active','','','', 'Operations','9876500004']
 ];
 const locs=['LOC-01','LOC-02','LOC-03']; let n=1;
 for(const loc of locs){for(let j=0;j<4;j++){const id=String(n).padStart(3,'0');staff.push(['guard',`Guard ${id}`,`G${id}`,n===6?'guard789':'guard123',n===2?'Senior Security Guard':'Security Guard',22000,loc,`SUP00${loc.slice(-1)}`,'active','','','', 'Security',`${n===10?'9876501999':`9876501${String(n).padStart(3,'0')}`}`]);n++;}}
 for(const x of staff) await run(`INSERT INTO staff(role,name,staff_id,password,post,salary,location_code,parent_id,status,suspended_until,suspension_reason,dob,department,contact_number,dp) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,x);
 const rows=await all('SELECT id,staff_id,name FROM staff'); const dbid=Object.fromEntries(rows.map(r=>[r.staff_id,r.id]));
 const gps={
  'LOC-01':'28.613900,77.209000 (±18m)', 'LOC-02':'28.535500,77.391000 (±21m)', 'LOC-03':'28.459500,77.026600 (±16m)', 'ALL':'28.620000,77.210000 (±25m)'
 };
 const operational=staff.filter(x=>x[0]!=='admin');
 const start=new Date('2026-07-01T00:00:00'); const end=new Date('2026-09-03T00:00:00');
 let attendanceCount=0;
 for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
  const date=d.toISOString().slice(0,10); const day=d.getDate();
  for(const x of operational){
   const role=x[0], sid=x[2], name=x[1], loc=x[6]||'ALL';
   let shift='Morning Shift', inH='06:00:00', outH='18:00:00';
   if(role==='field_officer'){shift='Morning Shift';inH='06:00:00';outH='18:00:00';}
   else if(role==='supervisor'){ if((day+Number(loc.slice(-2)))%2===0){shift='Day Shift';inH='08:00:00';outH='20:00:00';}else{shift='Night Shift';inH='20:00:00';outH='08:00:00';} }
   else { const k=(day+Number(sid.slice(-2)))%3; if(k===0){shift='Morning Shift';inH='06:00:00';outH='18:00:00';} else if(k===1){shift='Day Shift';inH='08:00:00';outH='20:00:00';} else {shift='Night Shift';inH='20:00:00';outH='08:00:00';} }
   // Selected scattered half-days, while most records remain full 12-hour shifts.
   const half=((day*7+sid.charCodeAt(0)+sid.charCodeAt(sid.length-1))%23===0);
   let hours=12, status='Present', out=outH;
   if(half){hours=6;status='Half Day'; out=shift==='Night Shift'?'02:00:00':(shift==='Morning Shift'?'12:00:00':'14:00:00');}
   const inAt=iso(`${date}T${inH}`); let outDate=date; if(shift==='Night Shift') {const nd=new Date(`${date}T00:00:00`);nd.setDate(nd.getDate()+1);outDate=nd.toISOString().slice(0,10)}
   const outAt=iso(`${outDate}T${out}`);
   await run(`INSERT INTO attendance(staff_id,name,date,photo,location,shift,check_in,check_in_at,check_out,hours_worked,attendance_status) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,[sid,name,date,'',gps[loc]||gps.ALL,shift,inH,inAt,out,hours,status]); attendanceCount++;
  }
 }
 const now='2026-09-03T10:00:00.000Z';
 const fines=[['G002','Late reporting',500,'FO001','2026-07-12T09:15:00Z'],['G005','Uniform issue',300,'FO001','2026-07-24T10:00:00Z'],['G009','Late reporting',500,'FO001','2026-08-08T09:00:00Z'],['SUP002','Duty handover delay',550,'FO001','2026-08-19T11:00:00Z'],['G011','Attendance discrepancy',400,'FO001','2026-08-27T10:00:00Z'],['G003','Late reporting',250,'FO001','2026-09-02T08:30:00Z']];
 for(const f of fines) await run('INSERT INTO fines(guard_id,reason,amount,issued_by,created_at) VALUES(?,?,?,?,?)',f);
 const advances=[['G001',2000,'July advance','admin','2026-07-10T09:00:00Z'],['G006',1500,'August advance','admin','2026-08-11T09:00:00Z'],['SUP003',3000,'August advance','admin','2026-08-15T09:00:00Z']];
 for(const a of advances) await run('INSERT INTO advances(staff_id,amount,note,given_by,created_at) VALUES(?,?,?,?,?)',a);
 const pays=[['FO001',40000,'admin','2026-07-31T16:00:00Z','July salary'],['FO001',42000,'admin','2026-08-31T16:00:00Z','August salary'],['SUP001',32000,'admin','2026-07-31T16:10:00Z','July salary'],['SUP002',31500,'admin','2026-07-31T16:12:00Z','July salary after fine'],['SUP003',32000,'admin','2026-08-31T16:10:00Z','August salary'],['G001',20000,'admin','2026-07-31T16:20:00Z','July salary'],['G002',21500,'admin','2026-07-31T16:22:00Z','July salary after fine'],['G005',21700,'admin','2026-08-31T16:24:00Z','August salary'],['G009',20500,'admin','2026-08-31T16:26:00Z','August salary after fine'],['G012',22000,'admin','2026-08-31T16:28:00Z','August salary']];
 for(const p of pays) await run('INSERT INTO payments(staff_id,amount,paid_by,paid_at,note) VALUES(?,?,?,?,?)',p);
 const notices=[
  ['admin','all','July duty roster and location assignments have been published.','Acknowledged by all supervisors','2026-07-01T08:00:00Z'],
  ['admin','supervisor','Maintain 12-hour shift handover and location-wise guard deployment.','SUP001: Roster updated and shared.','2026-07-15T08:30:00Z'],
  ['field_officer','guard','All guards must complete photo + GPS check-in before duty.','G001: Understood.','2026-08-03T09:00:00Z'],
  ['admin','all','August attendance and payroll records are ready for review.','Reviewed by supervisors.','2026-08-31T12:00:00Z'],
  ['admin','guard','September duty discipline and timely check-out are mandatory.','G009: Acknowledged.','2026-09-01T07:30:00Z']
 ];
 for(const x of notices) await run('INSERT INTO notices(from_role,to_role,message,reply,created_at) VALUES(?,?,?,?,?)',x);
 const helps=[
  ['guard','Camera permission was not available during check-in.','Supervisor enabled camera permission and the guard retried successfully.','2026-07-09T07:10:00Z'],
  ['supervisor','Need confirmation for LOC-02 night-shift handover.','Field Officer confirmed the LOC-02 roster.','2026-08-06T19:00:00Z'],
  ['guard','GPS accuracy was low at check-in.','Admin advised the guard to retry outdoors; GPS accuracy improved.','2026-08-22T06:15:00Z'],
  ['supervisor','Please confirm September location roster.','Admin confirmed all three locations.','2026-09-02T08:00:00Z']
 ];
 for(const x of helps) await run('INSERT INTO help_requests(from_role,message,response,created_at) VALUES(?,?,?,?)',x);
 const edits=[
  [dbid.G002,'G002','Guard 002','admin','2026-07-18T11:00:00Z',JSON.stringify({location_code:{from:'LOC-01',to:'LOC-01'},contact_number:{from:'9876501002',to:'9876501002'},post:{from:'Security Guard',to:'Senior Security Guard'}})],
  [dbid.SUP002,'SUP002','Neha Singh','admin','2026-07-25T12:00:00Z',JSON.stringify({location_code:{from:'LOC-02',to:'LOC-02'},salary:{from:32000,to:33000}})],
  [dbid.G006,'G006','Guard 006','admin','2026-08-12T10:00:00Z',JSON.stringify({parent_id:{from:'SUP002',to:'SUP002'},location_code:{from:'LOC-02',to:'LOC-02'},password:{from:'[hidden]',to:'[changed]'}})],
  [dbid.G010,'G010','Guard 010','admin','2026-08-21T14:00:00Z',JSON.stringify({contact_number:{from:'9876501010',to:'9876501999'}})],
  [dbid.SUP003,'SUP003','Suresh Yadav','admin','2026-08-28T15:00:00Z',JSON.stringify({post:{from:'Supervisor',to:'Senior Supervisor'},password:{from:'[hidden]',to:'[changed]'}})],
  [dbid.FO001,'FO001','Ravi Sharma','admin','2026-09-02T09:00:00Z',JSON.stringify({department:{from:'Operations',to:'Operations & Control'},contact_number:{from:'9876500001',to:'9876500099'}})]
 ];
 for(const e of edits) await run('INSERT INTO profile_edit_history(staff_db_id,staff_id,staff_name,edited_by,edited_at,changes_json) VALUES(?,?,?,?,?,?)',e);
 await run('PRAGMA user_version=2');
 console.log(`Demo seeded: ${rows.length} staff, ${attendanceCount} attendance rows, July-August + Sept 1-3 2026.`);
 console.log(`Database: ${dbPath}`);
 db.close();
}catch(e){console.error(e);db.close();process.exit(1)}})();
