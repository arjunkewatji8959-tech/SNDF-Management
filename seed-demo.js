
// =====================================================
// SNDF MANAGEMENT | DEMO DATA SEED
// Creates a clean local demo with:
// 1 Admin + 1 Field Officer + 3 Supervisors + 15 Guards
// 3 Locations + Fine + Suspension + Help + Notice data.
// =====================================================
const sqlite3=require('sqlite3').verbose();
const bcrypt=require('bcryptjs');
const path=require('path');
const fs=require('fs');

const dbPath=path.join(__dirname,'sndf.db');
if(fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
const db=new sqlite3.Database(dbPath);

const run=(sql,p=[])=>new Promise((res,rej)=>db.run(sql,p,function(e){e?rej(e):res(this)}));
const all=(sql,p=[])=>new Promise((res,rej)=>db.all(sql,p,(e,r)=>e?rej(e):res(r)));

(async()=>{
 try{
  await run(`CREATE TABLE staff(
    id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, name TEXT NOT NULL,
    staff_id TEXT UNIQUE NOT NULL, password TEXT NOT NULL, post TEXT, salary REAL DEFAULT 0,
    location_code TEXT, parent_id TEXT, status TEXT DEFAULT 'active', suspended_until TEXT,
    suspension_reason TEXT, dob TEXT, department TEXT, contact_number TEXT, dp TEXT)`);
  await run(`CREATE TABLE attendance(
    id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT, name TEXT, date TEXT, photo TEXT,
    location TEXT, shift TEXT, check_in TEXT, check_in_at TEXT, check_out TEXT,
    hours_worked REAL DEFAULT 0, attendance_status TEXT DEFAULT 'Present')`);
  await run(`CREATE TABLE fines(
    id INTEGER PRIMARY KEY AUTOINCREMENT, guard_id TEXT, reason TEXT, amount REAL,
    issued_by TEXT, created_at TEXT)`);
  await run(`CREATE TABLE advances(
    id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT, amount REAL NOT NULL,
    note TEXT, given_by TEXT, created_at TEXT)`);
  await run(`CREATE TABLE payments(
    id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT NOT NULL, amount REAL NOT NULL,
    paid_by TEXT NOT NULL, paid_at TEXT NOT NULL, note TEXT)`);
  await run(`CREATE TABLE notices(
    id INTEGER PRIMARY KEY AUTOINCREMENT, from_role TEXT, to_role TEXT, message TEXT,
    reply TEXT, created_at TEXT)`);
  await run(`CREATE TABLE help_requests(
    id INTEGER PRIMARY KEY AUTOINCREMENT, from_role TEXT, message TEXT, response TEXT,
    created_at TEXT)`);
  await run(`CREATE TABLE suspension_notifications(
    id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT, staff_name TEXT, staff_role TEXT,
    reason TEXT, suspended_until TEXT, created_at TEXT)`);
  await run(`CREATE TABLE audit_logs(
    id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT, actor_role TEXT,
    action TEXT NOT NULL, target_id TEXT, details TEXT, created_at TEXT NOT NULL)`);
  await run(`CREATE TABLE locations(
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    address TEXT DEFAULT '', latitude REAL NOT NULL, longitude REAL NOT NULL,
    radius_meters INTEGER NOT NULL DEFAULT 200, active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)`);

  const hash=p=>bcrypt.hashSync(p,12);
  const now=new Date().toISOString();

  // ---------------- ADMIN ----------------
  await run(`INSERT INTO staff(role,name,staff_id,password,post,salary,location_code,parent_id,department,contact_number)
    VALUES(?,?,?,?,?,?,?,?,?,?)`,
    ['admin','SNDF Admin','admin',hash('adi2026'),'Admin',0,'','','Management','']);

  // ---------------- LOCATIONS ----------------
  const locs=[
    ['LOC-01','SNDF Main Office','Main Office',22.719568,75.857725,200],
    ['LOC-02','Security Site 02','Site 02',22.725600,75.864000,250],
    ['LOC-03','Security Site 03','Site 03',22.712500,75.850000,250]
  ];
  for(const l of locs) await run(`INSERT INTO locations(code,name,address,latitude,longitude,radius_meters) VALUES(?,?,?,?,?,?)`,l);

  // ---------------- FIELD OFFICER ----------------
  await run(`INSERT INTO staff(role,name,staff_id,password,post,salary,location_code,parent_id,department,contact_number)
    VALUES(?,?,?,?,?,?,?,?,?,?)`,
    ['field_officer','Rajesh Kumar','FO001',hash('field123'),'Field Officer',30000,'','','Operations','9876500001']);

  // ---------------- SUPERVISORS ----------------
  const sups=[
    ['supervisor','Amit Sharma','SUP001','LOC-01','FO001',28000,'9876500011'],
    ['supervisor','Vikas Verma','SUP002','LOC-02','FO001',28000,'9876500012'],
    ['supervisor','Suresh Patel','SUP003','LOC-03','FO001',28000,'9876500013']
  ];
  for(const s of sups) await run(`INSERT INTO staff(role,name,staff_id,password,post,salary,location_code,parent_id,department,contact_number)
    VALUES(?,?,?,?,?,?,?,?,?,?)`,
    [s[0],s[1],s[2],hash('super123'),'Supervisor',s[5],s[3],s[4],'Operations',s[6]]);

  // ---------------- 15 GUARDS ----------------
  for(let i=1;i<=15;i++){
    const id=String(i).padStart(3,'0');
    const sup=i<=5?'SUP001':i<=10?'SUP002':'SUP003';
    const loc=i<=5?'LOC-01':i<=10?'LOC-02':'LOC-03';
    await run(`INSERT INTO staff(role,name,staff_id,password,post,salary,location_code,parent_id,department,contact_number)
      VALUES(?,?,?,?,?,?,?,?,?,?)`,
      ['guard',`Guard ${id}`,`G${id}`,hash('guard123'),'Security Guard',18000,loc,sup,'Security',`987651${id}`]);
  }

  // ---------------- ATTENDANCE DEMO ----------------
  const days=['2026-09-01','2026-09-02','2026-09-03'];
  const staff=await all(`SELECT name,staff_id,role,location_code FROM staff WHERE role IN ('field_officer','supervisor','guard')`);
  for(const d of days){
    for(const s of staff){
      const shift=s.role==='guard' ? (Number(s.staff_id.slice(1))%2?'Day Shift':'Night Shift') : 'Day Shift';
      const inAt=d+'T08:00:00.000Z';
      const outAt=d+'T20:00:00.000Z';
      await run(`INSERT INTO attendance(staff_id,name,date,photo,location,shift,check_in,check_in_at,check_out,hours_worked,attendance_status)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        [s.staff_id,s.name,d,'',`${s.location_code||'ALL'} 22.719568,75.857725`,shift,'08:00',inAt,'20:00',12,'Present']);
    }
  }

  // ---------------- FINE DEMO ----------------
  await run(`INSERT INTO fines(guard_id,reason,amount,issued_by,created_at) VALUES(?,?,?,?,?)`,
    ['G001','Late reporting',500,'admin',now]);
  await run(`INSERT INTO fines(guard_id,reason,amount,issued_by,created_at) VALUES(?,?,?,?,?)`,
    ['G007','Uniform violation',750,'FO001',now]);
  await run(`INSERT INTO fines(guard_id,reason,amount,issued_by,created_at) VALUES(?,?,?,?,?)`,
    ['SUP003','Duty report delay',600,'admin',now]);

  // ---------------- SUSPENSION DEMO ----------------
  const until='2026-09-10T18:30:00.000Z';
  await run(`UPDATE staff SET status='suspended',suspended_until=?,suspension_reason=? WHERE staff_id='G015'`,
    [until,'Repeated late reporting']);
  await run(`INSERT INTO suspension_notifications(staff_id,staff_name,staff_role,reason,suspended_until,created_at)
    VALUES(?,?,?,?,?,?)`,
    ['G015','Guard 015','guard','Repeated late reporting',until,now]);

  // ---------------- NOTICE DEMO ----------------
  await run(`INSERT INTO notices(from_role,to_role,message,reply,created_at) VALUES(?,?,?,?,?)`,
    ['admin','all','सभी स्टाफ समय पर ड्यूटी पर उपस्थित रहें।','Received',now]);
  await run(`INSERT INTO notices(from_role,to_role,message,reply,created_at) VALUES(?,?,?,?,?)`,
    ['admin','guard','आज सभी Guards uniform और ID card के साथ report करें।','Understood',now]);

  // ---------------- HELP DEMO ----------------
  await run(`INSERT INTO help_requests(from_role,message,response,created_at) VALUES(?,?,?,?)`,
    ['guard','मेरी ड्यूटी Location पर GPS issue आ रहा है।','GPS permission और location services check करें।',now]);
  await run(`INSERT INTO help_requests(from_role,message,response,created_at) VALUES(?,?,?,?)`,
    ['supervisor','एक guard का attendance update चाहिए।','Admin ने request receive कर ली है।',now]);

  // ---------------- PAYMENTS / ADVANCE DEMO ----------------
  await run(`INSERT INTO payments(staff_id,amount,paid_by,paid_at,note) VALUES(?,?,?,?,?)`,
    ['G001',15000,'admin',now,'September salary part payment']);
  await run(`INSERT INTO advances(staff_id,amount,note,given_by,created_at) VALUES(?,?,?,?,?)`,
    ['G002',2000,'Emergency advance','admin',now]);

  // ---------------- AUDIT DEMO ----------------
  await run(`INSERT INTO audit_logs(actor_id,actor_role,action,target_id,details,created_at) VALUES(?,?,?,?,?,?)`,
    ['admin','admin','DEMO_DATA_CREATED','ALL','Demo environment initialized',now]);

  console.log('SNDF demo database ready.');
  console.log('Admin: admin / adi2026');
  console.log('Field Officer: FO001 / field123');
  console.log('Supervisors: SUP001-SUP003 / super123');
  console.log('Guards: G001-G015 / guard123 (G015 is suspended for demo)');
 }catch(e){console.error(e);process.exitCode=1;}
 finally{db.close();}
})();
