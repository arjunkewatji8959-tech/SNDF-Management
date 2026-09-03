// =====================================================
// SNDF MANAGEMENT | JAVASCRIPT SECTIONS
// File-level guide: keep each feature inside its marked section.
// =====================================================
// SNDF Security Services - role based Node.js + SQLite backend
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 5000;
const frontendPath = __dirname;
// Railway persistent storage: when a Volume is attached, Railway exposes its mount
// path through RAILWAY_VOLUME_MOUNT_PATH. Locally, the database stays beside server.js.
const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DB_DIR || __dirname;
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'sndf.db');
console.log(`SNDF SQLite database: ${dbPath}`);
const db = new sqlite3.Database(dbPath);

db.configure('busyTimeout', 5000);

app.use(cors());
app.use(express.json({limit:'12mb'}));
app.use(express.urlencoded({extended:true}));
app.use(express.static(frontendPath));

// Simple deployment diagnostics (does not expose database credentials).
app.get('/api/deployment', (req,res)=>res.json({
  service:'SNDF backend',
  storage: process.env.RAILWAY_VOLUME_MOUNT_PATH ? 'railway-volume' : 'local',
  database: path.basename(dbPath)
}));

function all(sql, params, res){ db.all(sql, params || [], (err, rows)=> err ? res.status(500).json({error:err.message}) : res.json(rows)); }
function run(sql, params, res, success){ db.run(sql, params || [], function(err){ if(err) return res.status(500).json({error:err.message}); success(this); }); }
function get(sql, params, cb){ db.get(sql, params || [], cb); }

const columns = {
  staff: [
    ['post','TEXT'],['salary','REAL DEFAULT 0'],['location_code','TEXT'],['parent_id','TEXT'],
    ['status',"TEXT DEFAULT 'active'"],['suspended_until','TEXT'],['suspension_reason','TEXT'],
    ['dob','TEXT'],['department','TEXT'],['contact_number','TEXT'],['dp','TEXT']
  ],
  attendance: [['photo','TEXT'],['location','TEXT'],['shift','TEXT'],['check_in','TEXT'],['check_in_at','TEXT'],['check_out','TEXT'],['hours_worked','REAL DEFAULT 0'],['attendance_status','TEXT DEFAULT \'Present\'']],
  fines: [], notices: [], help_requests: []
};

db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, name TEXT NOT NULL,
    staff_id TEXT UNIQUE NOT NULL, password TEXT NOT NULL, post TEXT, salary REAL DEFAULT 0,
    location_code TEXT, parent_id TEXT, status TEXT DEFAULT 'active', suspended_until TEXT,
    suspension_reason TEXT, dob TEXT, department TEXT, contact_number TEXT, dp TEXT
  )`);
  columns.staff.forEach(([c,t])=>db.run(`ALTER TABLE staff ADD COLUMN ${c} ${t}`,()=>{}));

  db.run(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT, name TEXT, date TEXT, photo TEXT,
    location TEXT, shift TEXT, check_in TEXT, check_in_at TEXT, check_out TEXT, hours_worked REAL DEFAULT 0,
    attendance_status TEXT DEFAULT 'Present'
  )`);
  columns.attendance.forEach(([c,t])=>db.run(`ALTER TABLE attendance ADD COLUMN ${c} ${t}`,()=>{}));

  db.run(`CREATE TABLE IF NOT EXISTS fines (
    id INTEGER PRIMARY KEY AUTOINCREMENT, guard_id TEXT, reason TEXT, amount REAL,
    issued_by TEXT, created_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS advances (
    id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT, amount REAL NOT NULL,
    note TEXT, given_by TEXT, created_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT NOT NULL, amount REAL NOT NULL,
    paid_by TEXT NOT NULL, paid_at TEXT NOT NULL, note TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS notices (
    id INTEGER PRIMARY KEY AUTOINCREMENT, from_role TEXT, to_role TEXT, message TEXT,
    reply TEXT, created_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS help_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT, from_role TEXT, message TEXT, response TEXT,
    created_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS suspension_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT, staff_name TEXT, staff_role TEXT,
    reason TEXT, suspended_until TEXT, created_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT, actor_role TEXT,
    action TEXT NOT NULL, target_id TEXT, details TEXT, created_at TEXT NOT NULL
  )`);

  db.run("UPDATE staff SET role='admin',post='Admin' WHERE role='field_officer' OR role='field officer'");
  db.run("UPDATE staff SET role='field_officer',post='Field Officer' WHERE role='fieldofficer'");

  // Production bootstrap: create only one Admin account if the database is empty.
  // Set ADMIN_ID, ADMIN_PASSWORD and ADMIN_NAME in the hosting environment before deployment.
  db.get(`SELECT COUNT(*) AS count FROM staff`, (countErr, row) => {
    if (countErr || Number(row?.count || 0) > 0) return;
    const adminId = process.env.ADMIN_ID || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'adi2026';
    const adminName = process.env.ADMIN_NAME || 'SNDF Admin';
    bcrypt.hash(adminPassword, 12, (hashErr, hashedPassword)=>{
      if(hashErr){ console.error('Admin password hash failed:', hashErr.message); return; }
      db.run(`INSERT INTO staff(role,name,staff_id,password,post,salary,location_code,parent_id,dob,department,contact_number,dp) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        ['admin',adminName,adminId,hashedPassword,'Admin',0,'','','','Management','',''],
        (err) => { if (err) console.error('Admin bootstrap failed:', err.message); else console.log(`Production Admin created: ${adminId}.`); }
      );
    });
  });
});

// Authentication for protected APIs. Frontend sends x-staff-id + x-role after login.
function audit(actor, action, targetId, details=''){
  db.run(`INSERT INTO audit_logs(actor_id,actor_role,action,target_id,details,created_at) VALUES(?,?,?,?,?,?)`,
    [actor?.staff_id||'',actor?.role||'',action,String(targetId||''),String(details||''),new Date().toISOString()],
    ()=>{});
}
const LOCATION_COORDS = {
  'LOC-01': {lat:Number(process.env.LOC_01_LAT), lng:Number(process.env.LOC_01_LNG)},
  'LOC-02': {lat:Number(process.env.LOC_02_LAT), lng:Number(process.env.LOC_02_LNG)},
  'LOC-03': {lat:Number(process.env.LOC_03_LAT), lng:Number(process.env.LOC_03_LNG)}
};
function distanceMeters(lat1,lng1,lat2,lng2){
  const R=6371000, rad=Math.PI/180, dLat=(lat2-lat1)*rad, dLng=(lng2-lng1)*rad;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function checkGeofence(locationCode, locationText){
  const cfg=LOCATION_COORDS[locationCode];
  if(!cfg || !Number.isFinite(cfg.lat) || !Number.isFinite(cfg.lng)) return {configured:false,allowed:true};
  const m=String(locationText||'').match(/(-?\\d+(?:\\.\\d+)?)[,\\s]+(-?\\d+(?:\\.\\d+)?)/);
  if(!m) return {configured:true,allowed:false,error:'Valid GPS coordinates are required for attendance.'};
  const lat=Number(m[1]),lng=Number(m[2]),distance=Math.round(distanceMeters(lat,lng,cfg.lat,cfg.lng));
  return {configured:true,allowed:distance<=Number(process.env.GEOFENCE_RADIUS_METERS||200),distance,radius:Number(process.env.GEOFENCE_RADIUS_METERS||200)};
}

function auth(req,res,next){
  const staffId=req.get('x-staff-id');
  const role=req.get('x-role');
  if(!staffId || !role) return res.status(401).json({error:'Login required'});
  get('SELECT * FROM staff WHERE staff_id=? AND role=?',[staffId,role],(err,user)=>{
    if(err) return res.status(500).json({error:err.message});
    if(!user) return res.status(401).json({error:'Invalid session'});
    if(user.status==='suspended' && user.suspended_until && new Date(user.suspended_until)>new Date()) return res.status(403).json({error:`Account suspended until ${new Date(user.suspended_until).toLocaleString()}`});
    req.user=user; next();
  });
}
function roles(...allowed){ return (req,res,next)=>allowed.includes(req.user.role) ? next() : res.status(403).json({error:`Only ${allowed.join(' or ')} can perform this action`}); }

app.get('/api/health',(req,res)=>res.json({status:'healthy',service:'SNDF backend',time:new Date().toISOString()}));

// STAFF - only Admin creates/deletes/suspends. Everyone can read directory needed by their dashboard.
app.get('/api/staff',auth,(req,res)=>{
  all('SELECT id,role,name,staff_id,post,salary,location_code,parent_id,status,suspended_until,suspension_reason,dob,department,contact_number,dp FROM staff ORDER BY id DESC',[],res);
});
// PROFILE UPDATE SHEET - Admin only. Exports current profile records as CSV.
app.get('/api/profile-update-sheet',auth,roles('admin'),(req,res)=>{
  const allowed=['field_officer','supervisor','guard'];
  const role=String(req.query.role||'all');
  const location=String(req.query.location||'all');
  const params=[];
  let sql=`SELECT role,name,staff_id,post,salary,dob,department,location_code,parent_id,contact_number,status,suspended_until,suspension_reason,dp FROM staff WHERE role IN (?,?,?)`;
  params.push(...allowed);
  if(role!=='all' && allowed.includes(role)){sql+=' AND role=?';params.push(role);}
  if(location!=='all' && location){sql+=' AND location_code=?';params.push(location);}
  sql+=' ORDER BY CASE role WHEN \'field_officer\' THEN 1 WHEN \'supervisor\' THEN 2 WHEN \'guard\' THEN 3 ELSE 4 END, staff_id';
  db.all(sql,params,(err,rows)=>{
    if(err)return res.status(500).json({error:err.message});
    const headers=['Role','Name','Staff ID','Post','Salary','DOB','Department','Location Code','Parent ID','Contact Number','Status','Suspended Until','Suspension Reason','Photo'];
    const csvVal=v=>{let x=String(v??''); if(/[",\n\r]/.test(x)) x='"'+x.replace(/"/g,'""')+'"'; return x;};
    const csv=[headers.join(','),...rows.map(r=>[r.role,r.name,r.staff_id,r.post,r.salary,r.dob,r.department,r.location_code,r.parent_id,r.contact_number,r.status,r.suspended_until,r.suspension_reason,r.dp].map(csvVal).join(','))].join('\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename="profile-update-sheet-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send('\ufeff'+csv);
  });
});

app.post('/api/staff',auth,roles('admin'),(req,res)=>{
  const x=req.body||{};
  const role=['admin','field_officer','supervisor','guard'].includes(x.role)?x.role:null;
  if(!role || !x.name || !x.staff_id || !x.password) return res.status(400).json({error:'Role, name, Staff ID and password are required'});
  const location=String(x.location_code||'').trim(), parent=String(x.parent_id||'').trim();
  if(role!=='field_officer' && !['LOC-01','LOC-02','LOC-03'].includes(location))
    return res.status(400).json({error:'Supervisor/Guard must have a valid Location Code'});
  const finish=()=>{
    bcrypt.hash(String(x.password),12,(he,hashed)=>{
      if(he)return res.status(500).json({error:'Password setup failed'});
      run(`INSERT INTO staff(role,name,staff_id,password,post,salary,location_code,parent_id,dob,department,contact_number,dp) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        [role,x.name,x.staff_id,hashed,x.post||role,x.salary||0,location,parent,x.dob||'',x.department||'',x.contact_number||'',x.dp||''],res,row=>{
          audit(req.user,'STAFF_CREATED',x.staff_id,`${role} ${x.name} created`);
          res.status(201).json({id:row.lastID,message:'Staff created'});
        });
    });
  };
  if(role==='supervisor' && parent)return get('SELECT role FROM staff WHERE staff_id=?',[parent],(e,p)=>{if(e)return res.status(500).json({error:e.message});if(!p||p.role!=='field_officer')return res.status(400).json({error:'Supervisor Parent ID must be a Field Officer ID'});finish();});
  if(role==='guard' && parent)return get('SELECT role,location_code FROM staff WHERE staff_id=?',[parent],(e,p)=>{if(e)return res.status(500).json({error:e.message});if(!p||p.role!=='supervisor')return res.status(400).json({error:'Guard Parent ID must be a Supervisor ID'});if(p.location_code!==location)return res.status(400).json({error:'Guard location must match the Supervisor location'});finish();});
  finish();
});
app.delete('/api/staff/:id',auth,roles('admin'),(req,res)=>run('DELETE FROM staff WHERE id=?',[req.params.id],res,()=>res.json({message:'Deleted'})));

// ADMIN PROFILE RECORD EDIT - Admin only. Password is updated only when a new one is supplied.
app.put('/api/staff/:id/profile',auth,roles('admin'),(req,res)=>{
  const x=req.body||{};
  get('SELECT * FROM staff WHERE id=?',[req.params.id],(err,s)=>{
    if(err)return res.status(500).json({error:err.message});
    if(!s)return res.status(404).json({error:'Staff not found'});
    const newRole=['field_officer','supervisor','guard'].includes(x.role)?x.role:s.role;
    const location=String(x.location_code||'').trim();
    const parent=String(x.parent_id||'').trim();
    if(newRole!=='field_officer' && !['LOC-01','LOC-02','LOC-03'].includes(location))
      return res.status(400).json({error:'Select a valid Location Code: LOC-01, LOC-02 or LOC-03'});
    if(newRole==='field_officer' && location && !['LOC-01','LOC-02','LOC-03'].includes(location))
      return res.status(400).json({error:'Invalid Location Code'});
    if(newRole==='supervisor' && parent){
      return get('SELECT role FROM staff WHERE staff_id=?',[parent],(pe,p)=>{ 
        if(pe)return res.status(500).json({error:pe.message});
        if(!p || p.role!=='field_officer')return res.status(400).json({error:'Supervisor Parent ID must be a Field Officer ID'});
        save();
      });
    }
    if(newRole==='guard' && parent){
      return get('SELECT role,location_code FROM staff WHERE staff_id=?',[parent],(pe,p)=>{
        if(pe)return res.status(500).json({error:pe.message});
        if(!p || p.role!=='supervisor')return res.status(400).json({error:'Guard Parent ID must be a Supervisor ID'});
        if(p.location_code!==location)return res.status(400).json({error:'Guard location must match the Supervisor location'});
        save();
      });
    }
    save();
    function save(){
      const vals=[x.name||s.name,newRole,x.post||s.post,x.salary??s.salary,x.dob||'',x.department||'',location,parent,x.contact_number||'',x.dp||s.dp||'',req.params.id];
      let sql='UPDATE staff SET name=?,role=?,post=?,salary=?,dob=?,department=?,location_code=?,parent_id=?,contact_number=?,dp=?';
      const params=vals;
      const pwd=String(x.password||'').trim();
      const finishUpdate=(hashedPwd)=>{
        let finalSql=sql, finalParams=params.slice();
        if(hashedPwd){finalSql+=',password=?';finalParams.splice(finalParams.length-1,0,hashedPwd);}
        finalSql+=' WHERE id=?';
        run(finalSql,finalParams,res,()=>{
          audit(req.user,'PROFILE_UPDATED',s.staff_id,`Profile updated for ${s.staff_id}; password ${hashedPwd?'changed':'unchanged'}`);
          res.json({message:'Profile updated successfully'});
        });
      };
      if(pwd){
        if(pwd.length<6)return res.status(400).json({error:'Password must be at least 6 characters'});
        bcrypt.hash(pwd,12,(he,h)=>{if(he)return res.status(500).json({error:'Password setup failed'});finishUpdate(h);});
      } else finishUpdate('');

    }
  });
});

// PASSWORD MANAGEMENT - Admin only. Existing passwords are never returned to the frontend.
app.put('/api/staff/:id/password',auth,roles('admin'),(req,res)=>{
  const newPassword=String(req.body?.new_password||'').trim();
  if(newPassword.length<6) return res.status(400).json({error:'Password must be at least 6 characters'});
  get('SELECT id,role,name,staff_id FROM staff WHERE id=?',[req.params.id],(err,s)=>{
    if(err)return res.status(500).json({error:err.message});
    if(!s)return res.status(404).json({error:'Staff not found'});
    bcrypt.hash(newPassword,12,(he,hashed)=>{
      if(he)return res.status(500).json({error:'Password setup failed'});
      run('UPDATE staff SET password=? WHERE id=?',[hashed,s.id],res,()=>{
        audit(req.user,'PASSWORD_CHANGED',s.staff_id,`Password changed for ${s.staff_id}`);
        res.json({message:`Password changed for ${s.name} (${s.staff_id})`});
      });
    });
  });
});

// Admin profile editing; all roles can update their own DP/contact only.
app.get('/api/profile/me',auth,(req,res)=>res.json({user:req.user}));
app.put('/api/profile/me',auth,(req,res)=>{
  const x=req.body||{};
  if(req.user.role==='admin'){
    return run('UPDATE staff SET name=?,post=?,salary=?,dob=?,department=?,location_code=?,contact_number=?,dp=? WHERE id=?',
      [x.name||req.user.name,x.post||req.user.post,x.salary||0,x.dob||'',x.department||'',x.location_code||'',x.contact_number||'',x.dp||'',req.user.id],res,()=>res.json({message:'Admin profile updated'}));
  }
  run('UPDATE staff SET dp=?,contact_number=? WHERE id=?',[x.dp||'',x.contact_number||'',req.user.id],res,()=>res.json({message:'Profile updated'}));
});

// Temporary ID suspension - Admin only.
app.put('/api/staff/:id/suspend',auth,roles('admin'),(req,res)=>{
  const hours=Number(req.body?.hours); const reason=String(req.body?.reason||'Admin suspension').trim();
  if(!Number.isFinite(hours)||hours<=0||hours>720) return res.status(400).json({error:'Suspension must be 1-720 hours'});
  get('SELECT id,role,name,staff_id FROM staff WHERE id=?',[req.params.id],(err,s)=>{
    if(err)return res.status(500).json({error:err.message}); if(!s)return res.status(404).json({error:'Staff not found'});
    if(['admin'].includes(s.role))return res.status(403).json({error:'Admin cannot be suspended here'});
    const until=new Date(Date.now()+hours*3600000).toISOString();
    run("UPDATE staff SET status='suspended',suspended_until=?,suspension_reason=? WHERE id=?",[until,reason,s.id],res,()=>{
      run('INSERT INTO suspension_notifications(staff_id,staff_name,staff_role,reason,suspended_until,created_at) VALUES(?,?,?,?,?,?)',[s.staff_id,s.name,s.role,reason,until,new Date().toISOString()],res,row=>{audit(req.user,'ID_SUSPENDED',s.staff_id,`${reason}; until ${until}`);res.json({message:'ID suspended',notification_id:row.lastID,suspended_until:until});});
    });
  });
});
app.put('/api/staff/:id/activate',auth,roles('admin'),(req,res)=>run("UPDATE staff SET status='active',suspended_until=NULL,suspension_reason=NULL WHERE id=?",[req.params.id],res,()=>res.json({message:'Staff activated'})));
app.get('/api/suspension-notifications',auth,roles('admin'),(req,res)=>all('SELECT * FROM suspension_notifications ORDER BY id DESC LIMIT 100',[],res));

// ATTENDANCE - Two 12-hour shifts: Day 08:00-20:00 / Night 20:00-08:00.
// Full shift = 12 hours. Checkout before 8 hours is automatically Half Day.
// Field Officer, Supervisor and Guard can mark/view ONLY their own attendance.
const SHIFT_SCHEDULES = {
  'Day Shift': { start: '08:00', end: '20:00', targetHours: 12, halfDayThreshold: 8 },
  'Night Shift': { start: '20:00', end: '08:00', targetHours: 12, halfDayThreshold: 8 }
};
app.get('/api/attendance',auth,(req,res)=>{
  const sql=req.user.role==='admin'
    ? 'SELECT a.*,s.role FROM attendance a LEFT JOIN staff s ON s.staff_id=a.staff_id ORDER BY a.id DESC'
    : 'SELECT a.*,s.role FROM attendance a LEFT JOIN staff s ON s.staff_id=a.staff_id WHERE a.staff_id=? ORDER BY a.id DESC';
  all(sql,req.user.role==='admin'?[]:[req.user.staff_id],res);
});
app.post('/api/attendance',auth,(req,res)=>{
  const x=req.body||{};
  const targetId=req.user.role==='admin' ? (x.staff_id||req.user.staff_id) : req.user.staff_id;
  get('SELECT * FROM staff WHERE staff_id=?',[targetId],(err,s)=>{
    if(err)return res.status(500).json({error:err.message}); if(!s)return res.status(404).json({error:'Staff ID not found'});
    if(req.user.role!=='admin' && s.staff_id!==req.user.staff_id)return res.status(403).json({error:'You can mark attendance only for yourself'});
    const shift=SHIFT_SCHEDULES[x.shift]?x.shift:'Day Shift';
    const geo=checkGeofence(s.location_code,x.location||'');
    if(geo.configured && !geo.allowed) return res.status(403).json({error:geo.error||`You are outside ${s.location_code} geofence (${geo.distance}m / ${geo.radius}m).`});
    const now=new Date(), date=now.toISOString().slice(0,10), time=now.toTimeString().slice(0,8), iso=now.toISOString();
    // Never allow a second open shift. This also protects an overnight Night Shift.
    get('SELECT id,check_out FROM attendance WHERE staff_id=? AND check_out IS NULL ORDER BY id DESC LIMIT 1',[targetId],(ae,open)=>{
      if(ae)return res.status(500).json({error:ae.message});
      if(open)return res.status(409).json({error:'An attendance shift is already open. Please Check Out first.'});
      get('SELECT id FROM attendance WHERE staff_id=? AND date=? ORDER BY id DESC LIMIT 1',[targetId,date],(de,existing)=>{
        if(de)return res.status(500).json({error:de.message});
        if(existing)return res.status(409).json({error:'Today attendance is already completed'});
        run('INSERT INTO attendance(staff_id,name,date,photo,location,shift,check_in,check_in_at,attendance_status) VALUES(?,?,?,?,?,?,?,?,?)',
          [s.staff_id,s.name,date,x.photo||'',x.location||'',shift,time,iso,'Present - Shift Started'],res,row=>{audit(req.user,'ATTENDANCE_CHECKIN',s.staff_id,`${shift}; location=${x.location||''}`);res.status(201).json({id:row.lastID,shift,shift_time:`${SHIFT_SCHEDULES[shift].start} - ${SHIFT_SCHEDULES[shift].end}`,message:`${shift} check-in saved`});});
      });
    });
  });
});
app.put('/api/attendance/:id/checkout',auth,(req,res)=>{
  const lookup=(cb)=>{ if(req.params.id==='current') return get('SELECT a.*,s.role FROM attendance a LEFT JOIN staff s ON s.staff_id=a.staff_id WHERE a.staff_id=? AND a.check_out IS NULL ORDER BY a.id DESC LIMIT 1',[req.user.staff_id],cb); get('SELECT a.*,s.role FROM attendance a LEFT JOIN staff s ON s.staff_id=a.staff_id WHERE a.id=?',[req.params.id],cb); };
  lookup((err,row)=>{
    if(err)return res.status(500).json({error:err.message}); if(!row)return res.status(404).json({error:'Attendance record not found'});
    if(req.user.role!=='admin' && row.staff_id!==req.user.staff_id)return res.status(403).json({error:'You can check out only your own attendance'});
    if(row.check_out)return res.status(409).json({error:'Already checked out'});
    const now=new Date();
    let hours=0;
    if(row.check_in_at){ hours=(now-new Date(row.check_in_at))/3600000; }
    else { const [hh,mm,ss]=String(row.check_in||'00:00:00').split(':').map(Number); const start=new Date(now); start.setHours(hh||0,mm||0,ss||0,0); hours=(now-start)/3600000; if(hours<0)hours+=24; }
    if(hours<0 || hours>24)return res.status(409).json({error:'Invalid check-in time'});
    hours=Number(hours.toFixed(2));
    const status=hours<8?'Half Day - Early Leave (< 8 Hours)':'Present - Shift Completed (8+ Hours)';
    run('UPDATE attendance SET check_out=?,hours_worked=?,attendance_status=? WHERE id=? AND check_out IS NULL',
      [now.toTimeString().slice(0,8),hours,status,row.id],res,()=>{audit(req.user,'ATTENDANCE_CHECKOUT',row.staff_id,`${hours} hours; ${status}`);res.json({message:'Check-out saved',hours_worked:hours,attendance_status:status,half_day:hours<8});});
  });
});
app.delete('/api/attendance/:id',auth,roles('admin'),(req,res)=>run('DELETE FROM attendance WHERE id=?',[req.params.id],res,()=>res.json({message:'Attendance deleted'})));
app.get('/api/attendance/export',auth,roles('admin'),(req,res)=>{
  const wanted=req.query.role;
  const allowed=['admin','field_officer','supervisor','guard'];
  const roleFilter=allowed.includes(wanted)?wanted:null;
  const dateFilter=req.query.date||'';
  const monthFilter=req.query.month||'';
  let sql=`SELECT a.date,a.staff_id,a.name,s.role,s.location_code,a.shift,a.check_in,a.check_out,a.hours_worked,a.attendance_status,a.location FROM attendance a LEFT JOIN staff s ON s.staff_id=a.staff_id`;
  const params=[]; const where=[];
  if(roleFilter){where.push('s.role=?');params.push(roleFilter)}
  if(dateFilter){where.push('a.date=?');params.push(dateFilter)}
  if(monthFilter && /^\d{4}-\d{2}$/.test(monthFilter)){where.push('substr(a.date,1,7)=?');params.push(monthFilter)}
  const locationFilter=String(req.query.location||'').trim();
  if(locationFilter){where.push('(LOWER(COALESCE(s.location_code,\'\'))=LOWER(?) OR LOWER(COALESCE(a.location,\'\')) LIKE LOWER(?))');params.push(locationFilter,'%'+locationFilter+'%')}
  if(where.length)sql+=' WHERE '+where.join(' AND ');
  sql+=' ORDER BY a.date DESC,a.id DESC';
  all(sql,params,{json:x=>{ const rows=x; const header='Date,Staff ID,Name,Role,Location Code,Shift,Check In,Check Out,Hours,Status,Attendance Location'; const csv=[header,...rows.map(r=>[r.date,r.staff_id,r.name,r.role,r.location_code,r.shift,r.check_in,r.check_out,r.hours_worked,r.attendance_status,r.location].map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(','))].join('\n'); res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition',`attachment; filename="${roleFilter||'all'}-${dateFilter||'all'}-attendance.csv"`); res.send(csv); }});
});

// FINES - Admin and Field Officer can issue fines to Guard or Supervisor. Others can view.
app.get('/api/fines',auth,(req,res)=>{ const sql=req.user.role==='admin' ? 'SELECT * FROM fines ORDER BY id DESC' : 'SELECT * FROM fines WHERE guard_id=? ORDER BY id DESC'; all(sql,req.user.role==='admin'?[]:[req.user.staff_id],res); });
app.post('/api/fines',auth,roles('admin','field_officer'),(req,res)=>{
  const x=req.body||{}; if(!x.target_id||!x.reason||Number(x.amount)<=0)return res.status(400).json({error:'Target ID, reason and positive fine amount are required'});
  get('SELECT role FROM staff WHERE staff_id=?',[x.target_id],(err,s)=>{if(err)return res.status(500).json({error:err.message}); if(!s)return res.status(404).json({error:'Target staff not found'}); if(!['guard','supervisor'].includes(s.role))return res.status(403).json({error:'Fine can only be issued to Guard or Supervisor'}); run('INSERT INTO fines(guard_id,reason,amount,issued_by,created_at) VALUES(?,?,?,?,?)',[x.target_id,x.reason,Number(x.amount),req.user.staff_id,new Date().toISOString()],res,row=>res.status(201).json({id:row.lastID,message:'Fine added'}));});
});

// ADVANCE - Admin only.
app.get('/api/advances',auth,(req,res)=>{ const sql=req.user.role==='admin'?'SELECT * FROM advances ORDER BY id DESC':'SELECT * FROM advances WHERE staff_id=? ORDER BY id DESC'; all(sql,req.user.role==='admin'?[]:[req.user.staff_id],res); });
app.post('/api/advances',auth,roles('admin'),(req,res)=>{const x=req.body||{}; if(!x.staff_id||Number(x.amount)<=0)return res.status(400).json({error:'Staff ID and positive advance are required'}); run('INSERT INTO advances(staff_id,amount,note,given_by,created_at) VALUES(?,?,?,?,?)',[x.staff_id,Number(x.amount),x.note||'',req.user.staff_id,new Date().toISOString()],res,row=>{audit(req.user,'ADVANCE_ADDED',x.staff_id,`₹${x.amount}`);res.status(201).json({id:row.lastID,message:'Advance recorded'});});});

// ACCOUNT + PAYROLL. Admin can view/pay all staff except Admin's own salary.
function accountForStaff(staffId, cb){
  get('SELECT id,role,name,staff_id,post,salary,contact_number FROM staff WHERE staff_id=?',[staffId],(err,st)=>{
    if(err || !st) return cb(err || new Error('Staff not found'));
    db.get('SELECT COALESCE(SUM(amount),0) fine FROM fines WHERE guard_id=?',[staffId],(fe,f)=>{
      db.get('SELECT COALESCE(SUM(amount),0) advance FROM advances WHERE staff_id=?',[staffId],(ae,a)=>{
        db.get(`SELECT COALESCE(SUM(CASE WHEN attendance_status LIKE 'Half Day%' THEN 0.5 ELSE 1 END),0) duty_days,
                       COALESCE(SUM(hours_worked),0) total_hours
                FROM attendance WHERE staff_id=? AND check_out IS NOT NULL`,[staffId],(de,d)=>{
          db.get('SELECT COALESCE(SUM(amount),0) paid FROM payments WHERE staff_id=?',[staffId],(pe,p)=>{
            if(pe)return cb(pe);
            const fine=Number(f?.fine||0), advance=Number(a?.advance||0), salary=Number(st.salary||0), paid=Number(p?.paid||0);
            const payable=Math.max(0,salary-fine-advance);
            cb(null,{staff:st,duty_days:Number(d?.duty_days||0),total_hours:Number(d?.total_hours||0),fine,advance,paid,total_remaining:Math.max(0,payable-paid),payable_before_payment:payable,paid_status:paid>=payable && payable>0});
          });
        });
      });
    });
  });
}

app.get('/api/account/me',auth,(req,res)=>{
  accountForStaff(req.user.staff_id,(err,data)=>err?res.status(500).json({error:err.message}):res.json(data));
});

app.get('/api/account/payroll',auth,roles('admin'),(req,res)=>{
  all(`SELECT s.id,s.role,s.name,s.staff_id,s.contact_number,s.post,s.salary,
      COALESCE((SELECT SUM(amount) FROM fines f WHERE f.guard_id=s.staff_id),0) fine,
      COALESCE((SELECT SUM(amount) FROM advances a WHERE a.staff_id=s.staff_id),0) advance,
      COALESCE((SELECT SUM(CASE WHEN attendance_status LIKE 'Half Day%' THEN 0.5 ELSE 1 END) FROM attendance at WHERE at.staff_id=s.staff_id AND at.check_out IS NOT NULL),0) duty_days,
      COALESCE((SELECT SUM(amount) FROM payments p WHERE p.staff_id=s.staff_id),0) paid
      FROM staff s WHERE s.role IN ('field_officer','supervisor','guard') ORDER BY CASE s.role WHEN 'field_officer' THEN 1 WHEN 'supervisor' THEN 2 ELSE 3 END,s.id`,[],res);
});

app.post('/api/payments',auth,roles('admin'),(req,res)=>{
  const x=req.body||{}; const staffId=String(x.staff_id||'').trim();
  if(!staffId || Number(x.amount)<=0)return res.status(400).json({error:'Staff ID and positive payment amount are required'});
  accountForStaff(staffId,(err,a)=>{
    if(err)return res.status(404).json({error:'Staff not found'});
    if(a.staff.role==='admin')return res.status(403).json({error:'Admin payment is not applicable'});
    const amount=Number(x.amount); if(amount>a.total_remaining)return res.status(400).json({error:`Payment cannot exceed remaining salary ₹${a.total_remaining}`});
    run('INSERT INTO payments(staff_id,amount,paid_by,paid_at,note) VALUES(?,?,?,?,?)',[staffId,amount,req.user.staff_id,new Date().toISOString(),x.note||'Salary payment'],res,row=>{audit(req.user,'PAYMENT_COMPLETED',staffId,`₹${amount}`);res.status(201).json({id:row.lastID,message:'Payment completed',amount,remaining:a.total_remaining-amount});});
  });
});

app.get('/api/payments',auth,(req,res)=>{
  const sql=req.user.role==='admin'?'SELECT * FROM payments ORDER BY id DESC':'SELECT * FROM payments WHERE staff_id=? ORDER BY id DESC';
  all(sql,req.user.role==='admin'?[]:[req.user.staff_id],res);
});

// Notice / Help.
app.get('/api/notices',auth,(req,res)=>{ const sql=req.user.role==='admin' ? 'SELECT * FROM notices ORDER BY id DESC LIMIT 200' : "SELECT * FROM notices WHERE to_role=? OR to_role='all' OR from_role=? ORDER BY id DESC LIMIT 200"; all(sql,req.user.role==='admin'?[]:[req.user.role,req.user.role],res); });
app.post('/api/notices',auth,(req,res)=>{const x=req.body||{}; if(!x.to_role||!x.message)return res.status(400).json({error:'Recipient and message required'}); run('INSERT INTO notices(from_role,to_role,message,created_at) VALUES(?,?,?,?)',[req.user.role,x.to_role,x.message,new Date().toISOString()],res,()=>res.status(201).json({message:'Notice sent'}));});
app.get('/api/help',auth,(req,res)=>{ const sql=req.user.role==='admin'?'SELECT * FROM help_requests ORDER BY id DESC LIMIT 200':'SELECT * FROM help_requests WHERE from_role=? ORDER BY id DESC LIMIT 200'; all(sql,req.user.role==='admin'?[]:[req.user.role],res); });
app.post('/api/help',auth,(req,res)=>{const x=req.body||{}; if(!x.message)return res.status(400).json({error:'Help message required'}); run('INSERT INTO help_requests(from_role,message,created_at) VALUES(?,?,?)',[req.user.role,x.message,new Date().toISOString()],res,()=>res.status(201).json({message:'Help request sent'}));});

// REPORTS + AUDIT LOGS - Admin only.
app.get('/api/reports/summary',auth,roles('admin'),(req,res)=>{
  const month=/^\\d{4}-\\d{2}$/.test(String(req.query.month||''))?String(req.query.month):new Date().toISOString().slice(0,7);
  const out={month};
  db.get(`SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN attendance_status LIKE 'Half Day%' THEN .5 ELSE 1 END),0) AS duty_days,
    COALESCE(SUM(hours_worked),0) AS hours FROM attendance WHERE substr(date,1,7)=? AND check_out IS NOT NULL`,[month],(e,a)=>{
    if(e)return res.status(500).json({error:e.message}); out.attendance=a;
    db.get(`SELECT COALESCE(SUM(amount),0) AS fines FROM fines WHERE substr(created_at,1,7)=?`,[month],(e,f)=>{
      if(e)return res.status(500).json({error:e.message}); out.fines=f?.fines||0;
      db.get(`SELECT COALESCE(SUM(amount),0) AS payments FROM payments WHERE substr(paid_at,1,7)=?`,[month],(e,p)=>{
        if(e)return res.status(500).json({error:e.message}); out.payments=p?.payments||0;
        res.json(out);
      });
    });
  });
});
app.get('/api/audit-logs',auth,roles('admin'),(req,res)=>{
  const limit=Math.min(500,Math.max(1,Number(req.query.limit||200)));
  all(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT ${limit}`,[],res);
});
app.get('/api/audit-logs/export',auth,roles('admin'),(req,res)=>{
  db.all('SELECT * FROM audit_logs ORDER BY id DESC',(err,rows)=>{
    if(err)return res.status(500).json({error:err.message});
    const headers=['ID','Actor ID','Actor Role','Action','Target ID','Details','Created At'];
    const val=v=>{let x=String(v??'');return /[",\\n\\r]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x};
    const csv=[headers.join(','),...rows.map(r=>[r.id,r.actor_id,r.actor_role,r.action,r.target_id,r.details,r.created_at].map(val).join(','))].join('\\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="sndf-audit-log.csv"');
    res.send('\\ufeff'+csv);
  });
});
app.get('/api/reports/payroll/export',auth,roles('admin'),(req,res)=>{
  const month=/^\\d{4}-\\d{2}$/.test(String(req.query.month||''))?String(req.query.month):new Date().toISOString().slice(0,7);
  all(`SELECT s.staff_id,s.name,s.role,s.location_code,s.salary,
    COALESCE((SELECT SUM(amount) FROM fines f WHERE f.guard_id=s.staff_id AND substr(f.created_at,1,7)=?),0) fine,
    COALESCE((SELECT SUM(amount) FROM advances a WHERE a.staff_id=s.staff_id AND substr(a.created_at,1,7)=?),0) advance,
    COALESCE((SELECT SUM(amount) FROM payments p WHERE p.staff_id=s.staff_id AND substr(p.paid_at,1,7)=?),0) paid
    FROM staff s WHERE s.role IN ('field_officer','supervisor','guard') ORDER BY s.role,s.staff_id`,[month,month,month],res);
});

// Login supports exactly four roles.
app.post('/api/login',(req,res)=>{
  const {staff_id,password,role}=req.body||{};
  if(!staff_id||!password||!['admin','field_officer','supervisor','guard'].includes(role))return res.status(400).json({error:'Select a valid login role, Staff ID and password'});

  // ============================= LOGIN =============================
  // Passwords are stored as bcrypt hashes. Verify the entered password
  // after finding the account by Staff ID and role.
  get('SELECT id,role,name,staff_id,password,post,salary,location_code,parent_id,status,suspended_until,dob,department,contact_number,dp FROM staff WHERE staff_id=? AND role=?',[staff_id,role],async (err,user)=>{
    if(err)return res.status(500).json({error:err.message});
    if(!user)return res.status(401).json({error:'Wrong Staff ID, password or role'});

    let passwordOk=false;
    try { passwordOk=await bcrypt.compare(String(password),String(user.password)); } catch(e) { passwordOk=false; }

    // Legacy plain-text passwords are migrated to bcrypt after a successful login.
    if(!passwordOk && String(user.password)===String(password)){
      passwordOk=true;
      try { const hashed=await bcrypt.hash(String(password),12); db.run('UPDATE staff SET password=? WHERE id=?',[hashed,user.id],()=>{}); } catch(e) {}
    }
    if(!passwordOk)return res.status(401).json({error:'Wrong Staff ID, password or role'});
    delete user.password;
    if(user.status==='suspended'&&user.suspended_until&&new Date(user.suspended_until)>new Date())return res.status(403).json({error:`Account suspended until ${new Date(user.suspended_until).toLocaleString()}`});
    const redirect={admin:'admin.html',field_officer:'field-officer.html',supervisor:'supervisor.html',guard:'guard.html'}[role];
    audit({staff_id:user.staff_id,role:user.role},'LOGIN_SUCCESS',user.staff_id,'Successful login');
    res.json({message:'Login successful',redirect,user});
  });
});

app.get('/api/stats',auth,(req,res)=>{const today=new Date().toISOString().slice(0,10); db.get(`SELECT (SELECT COUNT(*) FROM staff) staff,(SELECT COUNT(*) FROM attendance WHERE date=?) present,(SELECT COALESCE(SUM(amount),0) FROM fines) fine_total,(SELECT COALESCE(SUM(salary),0) FROM staff WHERE role='guard') salary_total`,[today],(err,row)=>err?res.status(500).json({error:err.message}):res.json(row));});
app.get('/',(req,res)=>res.sendFile(path.join(frontendPath,'index.html')));

// =====================================================
// LOCATION MANAGEMENT
// Admin can create, edit, delete and list locations.
// GPS coordinates and allowed radius are stored in SQLite.
// =====================================================
db.run(`CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 200,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

function adminOnly(req, res, next) {
  const role = String(req.headers['x-role'] || '').toLowerCase();
  if (role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

app.get('/api/locations', (req, res) => {
  db.all('SELECT * FROM locations ORDER BY code ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/locations', adminOnly, (req, res) => {
  const { code, name, address = '', latitude, longitude, radius_meters = 200 } = req.body || {};
  const lat = Number(latitude), lng = Number(longitude), radius = Number(radius_meters);
  if (!code || !name || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius) || radius <= 0) {
    return res.status(400).json({ error: 'Code, name, latitude, longitude and valid radius are required' });
  }
  db.run(
    `INSERT INTO locations (code,name,address,latitude,longitude,radius_meters)
     VALUES (?,?,?,?,?,?)`,
    [String(code).trim(), String(name).trim(), String(address).trim(), lat, lng, Math.round(radius)],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ ok: true, id: this.lastID });
    }
  );
});

app.put('/api/locations/:id', adminOnly, (req, res) => {
  const { code, name, address = '', latitude, longitude, radius_meters = 200, active = 1 } = req.body || {};
  const lat = Number(latitude), lng = Number(longitude), radius = Number(radius_meters);
  if (!code || !name || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius) || radius <= 0) {
    return res.status(400).json({ error: 'Code, name, latitude, longitude and valid radius are required' });
  }
  db.run(
    `UPDATE locations SET code=?,name=?,address=?,latitude=?,longitude=?,radius_meters=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [String(code).trim(), String(name).trim(), String(address).trim(), lat, lng, Math.round(radius), active ? 1 : 0, req.params.id],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });
      if (!this.changes) return res.status(404).json({ error: 'Location not found' });
      res.json({ ok: true });
    }
  );
});

app.delete('/api/locations/:id', adminOnly, (req, res) => {
  db.run('DELETE FROM locations WHERE id=?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (!this.changes) return res.status(404).json({ error: 'Location not found' });
    res.json({ ok: true });
  });
});

app.listen(PORT,'0.0.0.0',()=>console.log(`SNDF backend running on port ${PORT}`));
