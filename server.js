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
const PDFDocument = require('pdfkit');
const webpush = require('web-push');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;
const frontendPath = __dirname;
// Railway persistent storage: when a Volume is attached, Railway exposes its mount
// path through RAILWAY_VOLUME_MOUNT_PATH. Locally, the database stays beside server.js.
const dataDir = process.env.HOSTINGER_DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DB_DIR || path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'sndf.db');
console.log(`SNDF SQLite database: ${dbPath}`);
const db = new sqlite3.Database(dbPath);
let dbReady = false;
db.run('PRAGMA journal_mode=WAL', err => { if (err) console.warn('SQLite WAL mode unavailable:', err.message); });
db.run('PRAGMA synchronous=NORMAL', err => { if (err) console.warn('SQLite synchronous mode warning:', err.message); });

db.configure('busyTimeout', 5000);

app.use(cors());
app.use(express.json({limit:'12mb'}));
app.use(express.urlencoded({extended:true}));
app.use(express.static(frontendPath));

// Hold API requests until SQLite schema + Director bootstrap are complete.
// This prevents early Railway/Hostinger requests from seeing temporary "no such table/column" errors.
app.use('/api', (req,res,next)=>{
  if (req.path === '/deployment' || req.path === '/health' || dbReady) return next();
  return res.status(503).json({error:'Database is starting. Please retry in a moment.'});
});

// Simple deployment diagnostics (does not expose database credentials).
app.get('/api/deployment', (req,res)=>res.json({
  service:'SNDF backend',
  storage: process.env.RAILWAY_VOLUME_MOUNT_PATH ? 'railway-volume' : 'local',
  database: path.basename(dbPath)
}));

// =====================================================

// SECTION: FUNCTION all

// =====================================================

function all(sql, params, res){ db.all(sql, params || [], (err, rows)=> err ? res.status(500).json({error:err.message}) : res.json(rows)); }

// END SECTION: FUNCTION all

// =====================================================
// SECTION: FUNCTION run
// =====================================================
function run(sql, params, res, success){ db.run(sql, params || [], function(err){ if(err) return res.status(500).json({error:err.message}); success(this); }); }
// END SECTION: FUNCTION run

// =====================================================
// SECTION: FUNCTION get
// =====================================================
function get(sql, params, cb){ db.get(sql, params || [], cb); }
// END SECTION: FUNCTION get


const columns = {
  staff: [
    ['post','TEXT'],['salary','REAL DEFAULT 0'],['location_code','TEXT'],['parent_id','TEXT'],
    ['status',"TEXT DEFAULT 'active'"],['suspended_until','TEXT'],['suspension_reason','TEXT'],
    ['dob','TEXT'],['department','TEXT'],['contact_number','TEXT'],['dp','TEXT'],
    ['age','INTEGER'],['height','REAL'],['weight','REAL'],['blood_group','TEXT'],['qualification','TEXT'],
    ['physical_level','TEXT'],['medical_level','TEXT'],['skills','TEXT'],['police_verification','TEXT'],
    ['driving_license','TEXT'],['training_details','TEXT'],['work_experience','TEXT'],
    ['photo_front','TEXT'],['photo_back','TEXT'],['photo_left','TEXT'],['photo_right','TEXT'],['is_reliever','INTEGER DEFAULT 0'],['reliever_parent_id','TEXT']
  ],
  attendance: [['photo','TEXT'],['location','TEXT'],['shift','TEXT'],['duty_hours','INTEGER DEFAULT 12'],['check_in','TEXT'],['check_in_at','TEXT'],['check_out','TEXT'],['hours_worked','REAL DEFAULT 0'],['attendance_status','TEXT DEFAULT \'Present\'']],
  fines: [], notices: [], help_requests: [], point_transfer_requests: []
};

db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, name TEXT NOT NULL,
    staff_id TEXT UNIQUE NOT NULL, password TEXT NOT NULL, post TEXT, salary REAL DEFAULT 0,
    location_code TEXT, parent_id TEXT, status TEXT DEFAULT 'active', suspended_until TEXT,
    suspension_reason TEXT, dob TEXT, department TEXT, contact_number TEXT, dp TEXT,
    age INTEGER, height REAL, weight REAL, blood_group TEXT, qualification TEXT,
    physical_level TEXT, medical_level TEXT, skills TEXT, police_verification TEXT,
    driving_license TEXT, training_details TEXT, work_experience TEXT,
    photo_front TEXT, photo_back TEXT, photo_left TEXT, photo_right TEXT,
    is_reliever INTEGER DEFAULT 0, reliever_parent_id TEXT
  )`);
  columns.staff.forEach(([c,t])=>db.run(`ALTER TABLE staff ADD COLUMN ${c} ${t}`,()=>{}));

  db.run(`CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT, name TEXT, date TEXT, photo TEXT,
    location TEXT, shift TEXT, duty_hours INTEGER DEFAULT 12, check_in TEXT, check_in_at TEXT, check_out TEXT, hours_worked REAL DEFAULT 0,
    attendance_status TEXT DEFAULT 'Present'
  )`);
  columns.attendance.forEach(([c,t])=>db.run(`ALTER TABLE attendance ADD COLUMN ${c} ${t}`,()=>{}));

  db.run(`CREATE TABLE IF NOT EXISTS fines (
    id INTEGER PRIMARY KEY AUTOINCREMENT, guard_id TEXT, reason TEXT, amount REAL,
    issued_by TEXT, image TEXT, created_at TEXT
  )`);
  db.run("ALTER TABLE fines ADD COLUMN image TEXT",()=>{});
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
  db.run(`CREATE TABLE IF NOT EXISTS reliever_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT NOT NULL, message TEXT NOT NULL,
    created_at TEXT NOT NULL, read_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS help_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT, from_role TEXT, message TEXT, response TEXT,
    created_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS suspension_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT, staff_name TEXT, staff_role TEXT,
    reason TEXT, suspended_until TEXT, created_at TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS point_transfer_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT NOT NULL, staff_name TEXT NOT NULL, staff_role TEXT NOT NULL,
    from_location TEXT, to_location TEXT NOT NULL, reason TEXT, status TEXT DEFAULT 'Pending',
    requested_at TEXT NOT NULL, reviewed_at TEXT, reviewed_by TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT, actor_role TEXT,
    action TEXT NOT NULL, target_id TEXT, details TEXT, created_at TEXT NOT NULL
  )`);
  // HOURLY POINT UPDATES - mandatory during Night Shift for Guard/Supervisor.
  db.run(`CREATE TABLE IF NOT EXISTS point_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL,
    location_code TEXT, location TEXT NOT NULL, photo TEXT NOT NULL, shift TEXT NOT NULL,
    captured_at TEXT NOT NULL, status TEXT DEFAULT 'On Time', attendance_id INTEGER
  )`);
  // WEB PUSH - one or more browser subscriptions per staff member.
  db.run(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, staff_id TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL, auth TEXT NOT NULL, user_agent TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS point_push_state (
    staff_id TEXT NOT NULL, attendance_id INTEGER NOT NULL, due_at TEXT NOT NULL, last_sent_at TEXT,
    PRIMARY KEY(staff_id, attendance_id, due_at)
  )`);
  // TASK MANAGEMENT - hierarchical task assignment and progress/report history.
  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL, description TEXT, priority TEXT DEFAULT 'Normal',
    created_by TEXT NOT NULL, created_by_role TEXT NOT NULL,
    assigned_to TEXT NOT NULL, assigned_role TEXT NOT NULL,
    due_at TEXT, status TEXT DEFAULT 'Pending',
    started_at TEXT, completed_at TEXT,
    last_update TEXT, report_summary TEXT, report_time_summary TEXT,
    report_result TEXT, report_issues TEXT, report_next_action TEXT,
    created_at TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS task_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL,
    staff_id TEXT NOT NULL, staff_name TEXT, update_text TEXT NOT NULL,
    status TEXT, created_at TEXT NOT NULL
  )`);

  // LOCATION ASSIGNMENTS - create this table during the main startup schema pass.
  // This must exist BEFORE dbReady becomes true because staff/location APIs use it
  // during startup and on the first login. Existing rows are preserved.
  db.run(`CREATE TABLE IF NOT EXISTS location_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id TEXT NOT NULL,
    location_code TEXT NOT NULL,
    assigned_by TEXT NOT NULL,
    assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
    active INTEGER NOT NULL DEFAULT 1,
    UNIQUE(staff_id,location_code)
  )`);
  // LOCATION MASTER TABLE - created before dbReady so first Railway request cannot race schema creation.
  db.run(`CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    address TEXT DEFAULT '',
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    radius_meters INTEGER NOT NULL DEFAULT 200,
    duty_shift TEXT NOT NULL DEFAULT '12_hour',
    duty_hours INTEGER NOT NULL DEFAULT 12,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  // Main Office flag: Field Officers can check in/out only at the designated Main Office.
  // Safe migration for existing SQLite databases.
  db.all('PRAGMA table_info(locations)',[],(tableErr,cols)=>{
    if(!tableErr && !(cols||[]).some(c=>c.name==='is_main_office')){
      db.run('ALTER TABLE locations ADD COLUMN is_main_office INTEGER NOT NULL DEFAULT 0');
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS shift_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id TEXT NOT NULL,
    location_code TEXT NOT NULL,
    schedule_date TEXT NOT NULL,
    duty_hours INTEGER NOT NULL,
    shift TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(staff_id,location_code,schedule_date)
  )`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_staff_role_status ON staff(role,status)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_staff_parent ON staff(parent_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_staff_location ON staff(location_code)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_attendance_staff_date ON attendance(staff_id,date)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_location_assignments_staff ON location_assignments(staff_id,active)`);
  db.run(`INSERT OR IGNORE INTO location_assignments(staff_id,location_code,assigned_by,active)
    SELECT staff_id,location_code,'system-migration',1 FROM staff
    WHERE role IN ('admin','field_officer') AND TRIM(COALESCE(location_code,''))<>''`);


  // DIRECTOR bootstrap:
  // Keep one fixed top-level account and never delete/overwrite other staff records.
  // Using a synchronous bcrypt hash here keeps the final database-ready signal ordered.
  const masterPasswordHash = bcrypt.hashSync('sndf1234', 12);
  db.run(
    `INSERT INTO staff(role,name,staff_id,password,post,salary,location_code,parent_id,department,status)
     VALUES('master_admin','SNDF Director','adi123',?,'Director',0,'','','Management','active')
     ON CONFLICT(staff_id) DO NOTHING`,
    [masterPasswordHash],
    (masterErr) => {
      if (masterErr) {
        console.error('Director bootstrap failed:', masterErr.message);
        return;
      }
      console.log('Director ready: adi123');
      dbReady = true;
    }
  );

  // Production database intentionally starts with Director only when no other
  // records exist. Existing production records are never cleared by this startup code.

});

// =====================================================
// WEB PUSH NOTIFICATIONS
// Push keys are generated once and persisted in the configured data directory so
// subscriptions survive server restarts. For stricter production secret management,
// WEB_PUSH_PUBLIC_KEY / WEB_PUSH_PRIVATE_KEY may be supplied as environment variables.
// =====================================================
// =====================================================
// SECTION: FUNCTION loadWebPushKeys
// =====================================================
function loadWebPushKeys(){
  let publicKey=process.env.WEB_PUSH_PUBLIC_KEY, privateKey=process.env.WEB_PUSH_PRIVATE_KEY;
  const keyFile=path.join(dataDir,'web-push-vapid.json');
  try{
    if(!publicKey || !privateKey){
      if(fs.existsSync(keyFile)){
        const saved=JSON.parse(fs.readFileSync(keyFile,'utf8'));
        publicKey=saved.publicKey; privateKey=saved.privateKey;
      }
    }
  }catch(e){ console.error('Web Push key file read failed:',e.message); }
  if(!publicKey || !privateKey){
    const generated=webpush.generateVAPIDKeys(); publicKey=generated.publicKey; privateKey=generated.privateKey;
    try{fs.writeFileSync(keyFile,JSON.stringify({publicKey,privateKey},null,2),{mode:0o600});}
    catch(e){console.warn('Could not persist Web Push VAPID keys:',e.message);}
  }
  const subject=process.env.WEB_PUSH_SUBJECT || 'mailto:admin@sndfmanagementsystem.in';
  webpush.setVapidDetails(subject,publicKey,privateKey);
  return publicKey;
}
// END SECTION: FUNCTION loadWebPushKeys

let WEB_PUSH_PUBLIC_KEY='';
try{WEB_PUSH_PUBLIC_KEY=loadWebPushKeys(); console.log('Web Push notifications ready.');}
catch(e){console.error('Web Push setup failed:',e.message);}

app.get('/api/push/public-key',(req,res)=>{
  if(!WEB_PUSH_PUBLIC_KEY) return res.status(503).json({error:'Web Push is not configured'});
  res.json({publicKey:WEB_PUSH_PUBLIC_KEY});
});

app.post('/api/push/subscribe',auth,(req,res)=>{
  const sub=req.body?.subscription||req.body;
  if(!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return res.status(400).json({error:'Valid push subscription is required'});
  const now=new Date().toISOString();
  db.run(`INSERT INTO push_subscriptions(staff_id,endpoint,p256dh,auth,user_agent,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?)
          ON CONFLICT(endpoint) DO UPDATE SET staff_id=excluded.staff_id,p256dh=excluded.p256dh,auth=excluded.auth,user_agent=excluded.user_agent,updated_at=excluded.updated_at`,
    [req.user.staff_id,String(sub.endpoint),String(sub.keys.p256dh),String(sub.keys.auth),String(req.get('user-agent')||''),now,now],function(err){
      if(err)return res.status(500).json({error:err.message});
      audit(req.user,'PUSH_SUBSCRIBED',req.user.staff_id,'Web Push enabled');
      res.json({ok:true,id:this.lastID});
    });
});

app.delete('/api/push/subscribe',auth,(req,res)=>{
  const endpoint=String(req.body?.endpoint||'').trim();
  if(endpoint) db.run('DELETE FROM push_subscriptions WHERE staff_id=? AND endpoint=?',[req.user.staff_id,endpoint],()=>res.json({ok:true}));
  else db.run('DELETE FROM push_subscriptions WHERE staff_id=?',[req.user.staff_id],()=>res.json({ok:true}));
});

// =====================================================

// SECTION: FUNCTION sendPushToStaff

// =====================================================

function sendPushToStaff(staffId,payload,done=()=>{}

// END SECTION: FUNCTION sendPushToStaff
){
  db.all('SELECT * FROM push_subscriptions WHERE staff_id=?',[staffId],(e,subs)=>{
    if(e)return done(e); if(!subs.length)return done(null,0);
    let remaining=subs.length, sent=0;
    subs.forEach(sub=>{
      const subscription={endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}};
      webpush.sendNotification(subscription,JSON.stringify(payload),{TTL:300}).then(()=>{
        sent++; if(--remaining===0)done(null,sent);
      }).catch(err=>{
        if(err.statusCode===404 || err.statusCode===410) db.run('DELETE FROM push_subscriptions WHERE id=?',[sub.id],()=>{});
        if(--remaining===0)done(null,sent);
      });
    });
  });
}

// =====================================================

// SECTION: FUNCTION scanPointPushDue

// =====================================================

function scanPointPushDue(){
  db.all(`SELECT staff_id FROM staff WHERE role IN ('guard','supervisor') AND status='active'`,[],(e,rows)=>{
    if(e || !rows?.length)return;
    rows.forEach(r=>pointStatusForStaff(r.staff_id,(err,status)=>{
      if(err || !status?.required || !status?.due)return;
      const dueAt=status.due_at;
      const now=new Date();
      db.get(`SELECT last_sent_at FROM point_push_state WHERE staff_id=? AND attendance_id=? AND due_at=?`,[r.staff_id,status.attendance_id,dueAt],(ge,state)=>{
        if(ge)return;
        const last=state?.last_sent_at ? new Date(state.last_sent_at) : null;
        if(last && (now-last)<15*60*1000)return; // repeat at most every 15 minutes until submitted
        const sentAt=now.toISOString();
        db.run(`INSERT INTO point_push_state(staff_id,attendance_id,due_at,last_sent_at) VALUES(?,?,?,?)
                ON CONFLICT(staff_id,attendance_id,due_at) DO UPDATE SET last_sent_at=excluded.last_sent_at`,
          [r.staff_id,status.attendance_id,dueAt,sentAt],()=>{
            get('SELECT name,role,location_code FROM staff WHERE staff_id=?',[r.staff_id],(ne,staff)=>{
              if(ne||!staff)return;
              sendPushToStaff(r.staff_id,{type:'point-update-due',title:'🚨 SNDF Point Update Due',body:`${staff.name}: Night Shift Point Update is due. Location: ${staff.location_code||'Assigned Location'}.`,tag:`sndf-point-${r.staff_id}-${status.attendance_id}`,url:`/${staff.role==='supervisor'?'supervisor':'guard'}.html#point-update`,staff_id:r.staff_id,location_code:staff.location_code||'',due_at:dueAt},()=>{});
            });
          });
      });
    }));
  });
}

// END SECTION: FUNCTION scanPointPushDue


// Authentication for protected APIs. Frontend sends x-staff-id + x-role after login.
// =====================================================
// SECTION: FUNCTION audit
// =====================================================
function audit(actor, action, targetId, details=''){
  db.run(`INSERT INTO audit_logs(actor_id,actor_role,action,target_id,details,created_at) VALUES(?,?,?,?,?,?)`,
    [actor?.staff_id||'',actor?.role||'',action,String(targetId||''),String(details||''),new Date().toISOString()],
    ()=>{});
}
// END SECTION: FUNCTION audit

// =====================================================
// SECTION: FUNCTION distanceMeters
// =====================================================
function distanceMeters(lat1,lng1,lat2,lng2){
  const R=6371000, rad=Math.PI/180, dLat=(lat2-lat1)*rad, dLng=(lng2-lng1)*rad;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
// END SECTION: FUNCTION distanceMeters

// =====================================================
// SECTION: FUNCTION checkGeofence
// =====================================================
function checkGeofence(locationCode, locationText, cb){
  const code=String(locationCode||'').trim();
  if(!code)return cb(null,{configured:false,allowed:true});
  get('SELECT latitude,longitude,radius_meters,active FROM locations WHERE code=? LIMIT 1',[code],(e,cfg)=>{
    if(e)return cb(e);
    if(!cfg || !cfg.active)return cb(null,{configured:false,allowed:true,missing:true});
    const m=String(locationText||'').match(/(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)/);
    if(!m)return cb(null,{configured:true,allowed:false,error:'Valid GPS coordinates are required for attendance.'});
    const lat=Number(m[1]),lng=Number(m[2]);
    const distance=Math.round(distanceMeters(lat,lng,Number(cfg.latitude),Number(cfg.longitude)));
    const radius=Math.max(1,Number(cfg.radius_meters)||200);
    cb(null,{configured:true,allowed:distance<=radius,distance,radius});
  });
}
// END SECTION: FUNCTION checkGeofence


// =====================================================

// SECTION: FUNCTION auth

// =====================================================

function auth(req,res,next){
  const staffId=String(req.get('x-staff-id')||'').trim();
  const role=String(req.get('x-role')||'').trim().toLowerCase();
  if(!staffId || !role) return res.status(401).json({error:'Login required'});
  get('SELECT * FROM staff WHERE staff_id=? AND role=?',[staffId,role],(err,user)=>{
    if(err) return res.status(500).json({error:err.message});
    if(!user) return res.status(401).json({error:'Invalid session'});
    if(user.status==='suspended' && user.suspended_until && new Date(user.suspended_until)>new Date()) return res.status(403).json({error:`Account suspended until ${new Date(user.suspended_until).toLocaleString()}`});
    req.user=user; next();
  });
}

// END SECTION: FUNCTION auth

// =====================================================
// SECTION: FUNCTION roles
// =====================================================
function roles(...allowed){ return (req,res,next)=>allowed.includes(req.user.role) ? next() : res.status(403).json({error:`Only ${allowed.join(' or ')} can perform this action`}); }
// END SECTION: FUNCTION roles


app.get('/api/health',(req,res)=>res.status(dbReady?200:503).json({status:dbReady?'healthy':'starting',ready:dbReady,service:'SNDF backend',time:new Date().toISOString()}));

// STAFF - only Admin creates/deletes/suspends. Everyone can read directory needed by their dashboard.
app.get('/api/staff',auth,(req,res)=>{
  all(`SELECT id,role,name,staff_id,post,salary,location_code,parent_id,status,suspended_until,suspension_reason,dob,department,contact_number,dp,
      age,height,weight,blood_group,qualification,physical_level,medical_level,skills,police_verification,driving_license,
      training_details,work_experience,photo_front,photo_back,photo_left,photo_right,is_reliever,reliever_duty_hours,reliever_shift FROM staff ORDER BY id DESC`,[],(err,rows)=>{
    if(err)return res.status(500).json({error:err.message});
    const finish=(list)=>{
      db.all('SELECT staff_id,location_code FROM location_assignments WHERE active=1',[],(ae,assignments)=>{
        if(ae)return res.status(500).json({error:ae.message});
        const by={}; (assignments||[]).forEach(a=>(by[a.staff_id]??=[]).push(a.location_code));
        let out=list.map(r=>({...r,assigned_locations:by[r.staff_id]||[]}));
        if(req.user.role==='master_admin')return res.json(out);
        if(req.user.role==='admin') {
          const mine=new Set(by[req.user.staff_id]||[]);
          out=out.filter(r=>r.staff_id===req.user.staff_id || r.role==='master_admin' || (r.role==='field_officer'&&(by[r.staff_id]||[]).some(x=>mine.has(x))) || (['officer','supervisor','guard'].includes(r.role)&&mine.has(r.location_code)));
        } else if(req.user.role==='field_officer') {
          const mine=new Set(by[req.user.staff_id]||[]);
          out=out.filter(r=>r.staff_id===req.user.staff_id || ((r.role==='supervisor'||r.role==='guard') && mine.has(r.location_code) && (r.role==='supervisor'?r.parent_id===req.user.staff_id:true)));
        } else if(req.user.role==='supervisor') {
          out=out.filter(r=>r.staff_id===req.user.staff_id || (r.role==='guard' && (r.parent_id===req.user.staff_id || r.reliever_parent_id===req.user.staff_id)));
        } else if(req.user.role==='guard') out=out.filter(r=>r.staff_id===req.user.staff_id);
        res.json(out);
      });
    };
    finish(rows||[]);
  });
});
// PROFILE UPDATE SHEET - Admin only. Exports current profile records as CSV.
app.get('/api/profile-update-sheet',auth,roles('admin','master_admin'),(req,res)=>{
  const allowed=['admin','field_officer','officer','supervisor','guard'];
  const role=String(req.query.role||'all');
  const location=String(req.query.location||'all');
  const params=[];
  let sql=`SELECT role,name,staff_id,post,salary,dob,department,location_code,parent_id,contact_number,status,suspended_until,suspension_reason,dp,
      age,height,weight,blood_group,qualification,physical_level,medical_level,skills,police_verification,driving_license,training_details,work_experience,
      photo_front,photo_back,photo_left,photo_right,is_reliever FROM staff WHERE role IN (?,?,?,?)`;
  params.push(...allowed);
  if(role!=='all' && allowed.includes(role)){sql+=' AND role=?';params.push(role);}
  if(location!=='all' && location){sql+=' AND location_code=?';params.push(location);}
  sql+=' ORDER BY CASE role WHEN \'master_admin\' THEN 0 WHEN \'admin\' THEN 1 WHEN \'field_officer\' THEN 2 WHEN \'supervisor\' THEN 3 WHEN \'guard\' THEN 4 ELSE 5 END, staff_id';
  db.all(sql,params,(err,rows)=>{
    if(err)return res.status(500).json({error:err.message});
    const headers=['Role','Name','Staff ID','Post','Salary','DOB','Department','Location Code','Parent ID','Contact Number','Status','Suspended Until','Suspension Reason','Photo','Age','Height','Weight','Blood Group','Qualification','Physical Level','Medical Level','Skills','Police Verification','Driving License','Training Details','Work Experience','Front Photo','Back Photo','Left Photo','Right Photo','Reliever'];
    const csvVal=v=>{let x=String(v??''); if(/[",\n\r]/.test(x)) x='"'+x.replace(/"/g,'""')+'"'; return x;};
    const csv=[headers.join(','),...rows.map(r=>[r.role,r.name,r.staff_id,r.post,r.salary,r.dob,r.department,r.location_code,r.parent_id,r.contact_number,r.status,r.suspended_until,r.suspension_reason,r.dp,
      r.age,r.height,r.weight,r.blood_group,r.qualification,r.physical_level,r.medical_level,r.skills,r.police_verification,r.driving_license,r.training_details,r.work_experience,
      r.photo_front,r.photo_back,r.photo_left,r.photo_right,r.is_reliever].map(csvVal).join(','))].join('\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename="profile-update-sheet-${new Date().toISOString().slice(0,10)}.csv"`);
    res.send('\ufeff'+csv);
  });
});

// =====================================================
// SECTION: STAFF CREATION + HIERARCHY
// Director -> Admin -> Field Officer -> Supervisor -> Guard
// =====================================================
app.post('/api/staff',auth,roles('admin','master_admin'),(req,res)=>{
  const x=req.body||{};
  const role=String(x.role||'').trim().toLowerCase();
  const name=String(x.name||'').trim();
  const staffId=String(x.staff_id||'').trim();
  const password=String(x.password??'');
  const post=String(x.post||'').trim();
  const department=String(x.department||'').trim();
  const contact=String(x.contact_number||'').trim();
  const dob=String(x.dob||'').trim();
  const salary=Number(x.salary||0);
  const parent=String(x.parent_id||'').trim();
  const singleLocation=String(x.location_code||'').trim();
  const requestedLocations=Array.isArray(x.location_codes)
    ? [...new Set(x.location_codes.map(v=>String(v||'').trim()).filter(Boolean))]
    : (singleLocation ? [singleLocation] : []);
  const masterCreating=req.user.role==='master_admin';
  const adminCreating=req.user.role==='admin';

  if(!['admin','field_officer','officer','supervisor','guard'].includes(role))
    return res.status(400).json({error:'Invalid member role'});
  if(!name||!staffId||!password||!post||!department||!dob||!contact)
    return res.status(400).json({error:'Name, Staff ID, Password, Post, Date of Birth, Department and Phone Number are required'});
  if(password.length<6)return res.status(400).json({error:'Password must be at least 6 characters'});
  if(!Number.isFinite(salary)||salary<0)return res.status(400).json({error:'Salary must be a valid number (0 or more)'});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dob))return res.status(400).json({error:'Date of Birth must be in YYYY-MM-DD format'});
  if(!/^\+?[0-9\s()-]{10,20}$/.test(contact))return res.status(400).json({error:'Enter a valid phone number'});

  // Strict hierarchy: Director -> Admin -> Field Officer/Officer -> Supervisor -> Guard.
  // Director may create every role, but every created member still gets a real parent.
  if(role==='admin'){
    if(!masterCreating)return res.status(403).json({error:'Only Director can create Admin'});
    if(parent && parent!=='adi123')return res.status(400).json({error:'Admin Parent ID must be Director ID adi123'});
  }else{
    if(!parent)return res.status(400).json({error:`Parent ID is required for ${role}`});
  }

  // All created members must have at least one active Location. Field Officer/Admin may have multiple;
  // Officer/Supervisor/Guard use exactly one working location.
  if(!requestedLocations.length)return res.status(400).json({error:`Location Code is required for ${role}`});
  if(['officer','supervisor','guard'].includes(role) && requestedLocations.length!==1)
    return res.status(400).json({error:`${role} can use only one Location Code`});

  if(adminCreating && role==='admin')return res.status(403).json({error:'Only Director can create Admin'});

  get('SELECT id,role,name,staff_id,status FROM staff WHERE staff_id=?',[staffId],(duplicateErr,duplicate)=>{
    if(duplicateErr)return res.status(500).json({error:duplicateErr.message});
    if(duplicate)return res.status(409).json({error:`Staff ID ${staffId} already exists. Use a unique Staff ID.`});

    const finishCreation=(row)=>{
      audit(req.user,'STAFF_CREATED',staffId,`${role} ${name}; parent=${parent||'adi123'}; locations=${requestedLocations.join(',')}`);
      res.status(201).json({id:row.lastID,staff_id:staffId,role,name,assigned_locations:requestedLocations,message:`Staff created successfully. Staff ID: ${staffId}`});
    };

    const saveAssignments=(row)=>{
      const stmt=db.prepare('INSERT OR IGNORE INTO location_assignments(staff_id,location_code,assigned_by,active) VALUES(?,?,?,1)');
      requestedLocations.forEach(code=>stmt.run(staffId,code,req.user.staff_id));
      stmt.finalize(err=>{
        if(err){
          db.run('DELETE FROM staff WHERE id=?',[row.lastID]);
          return res.status(500).json({error:'Member save failed; no partial member was kept: '+err.message});
        }
        finishCreation(row);
      });
    };

    const createRecord=()=>{
      bcrypt.hash(password,12,(he,hashed)=>{
        if(he)return res.status(500).json({error:'Password setup failed'});
        const storedLocation=requestedLocations[0]||'';
        run(`INSERT INTO staff(role,name,staff_id,password,post,salary,location_code,parent_id,dob,department,contact_number,dp,age,height,weight,blood_group,qualification,physical_level,medical_level,skills,police_verification,driving_license,training_details,work_experience,photo_front,photo_back,photo_left,photo_right,is_reliever)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [role,name,staffId,hashed,post,salary,storedLocation,parent||'adi123',dob,department,contact,x.dp||'',x.age||null,x.height||null,x.weight||null,x.blood_group||'',x.qualification||'',x.physical_level||'',x.medical_level||'',x.skills||'',x.police_verification||'',x.driving_license||'',x.training_details||'',x.work_experience||'',x.photo_front||'',x.photo_back||'',x.photo_left||'',x.photo_right||'',Number(x.is_reliever)?1:0],
          res,row=>saveAssignments(row));
      });
    };

    // Parent validation is role-specific and always performed server-side.
    const validateParent=next=>{
      if(role==='admin')return get("SELECT staff_id,role,status FROM staff WHERE staff_id='adi123' LIMIT 1",[],(e,p)=>{
        if(e)return res.status(500).json({error:e.message});
        if(!p||p.role!=='master_admin'||p.status!=='active')return res.status(400).json({error:'Director parent is not available'});
        next();
      });
      get('SELECT id,role,status,staff_id,location_code FROM staff WHERE staff_id=?',[parent],(e,p)=>{
        if(e)return res.status(500).json({error:e.message});
        if(!p||p.status!=='active')return res.status(400).json({error:'Selected Parent ID is not an active member'});
        if(['field_officer','officer'].includes(role) && p.role!=='admin')return res.status(400).json({error:`${role} Parent ID must be an active Admin Staff ID`});
        if(role==='supervisor' && p.role!=='field_officer')return res.status(400).json({error:'Supervisor Parent ID must be an active Field Officer Staff ID'});
        if(role==='guard' && p.role!=='supervisor')return res.status(400).json({error:'Guard Parent ID must be an active Supervisor Staff ID'});
        if(adminCreating && ['field_officer','officer'].includes(role) && parent!==req.user.staff_id)
          return res.status(400).json({error:'Admin can create Field Officer/Officer only under its own Admin ID'});
        next(p);
      });
    };

    const validateLocations=next=>{
      const placeholders=requestedLocations.map(()=>'?').join(',');
      db.all(`SELECT code FROM locations WHERE active=1 AND code IN (${placeholders})`,requestedLocations,(le,rows)=>{
        if(le)return res.status(500).json({error:le.message});
        const valid=new Set((rows||[]).map(r=>String(r.code)));
        const invalid=requestedLocations.filter(c=>!valid.has(c));
        if(invalid.length)return res.status(400).json({error:'Invalid or inactive Location Code: '+invalid.join(', ')});
        if(masterCreating)return next();
        db.all(`SELECT location_code FROM location_assignments WHERE staff_id=? AND active=1 AND location_code IN (${placeholders})`,[req.user.staff_id,...requestedLocations],(ae,owned)=>{
          if(ae)return res.status(500).json({error:ae.message});
          const ownedSet=new Set((owned||[]).map(r=>String(r.location_code)));
          const notOwned=requestedLocations.filter(c=>!ownedSet.has(c));
          if(notOwned.length)return res.status(403).json({error:'Admin can use only its assigned locations: '+notOwned.join(', ')});
          next();
        });
      });
    };

    const validateRoleLocation=(parentRow,next)=>{
      if(role==='supervisor'){
        const loc=requestedLocations[0];
        return get('SELECT 1 FROM location_assignments WHERE staff_id=? AND location_code=? AND active=1',[parent,loc],(e,r)=>{
          if(e)return res.status(500).json({error:e.message});
          if(!r)return res.status(400).json({error:'Selected Location is not assigned to the Field Officer Parent'});
          next();
        });
      }
      if(role==='guard'){
        const loc=requestedLocations[0];
        if(String(parentRow?.location_code||'')!==loc)return res.status(400).json({error:'Guard Location must exactly match the Supervisor Parent Location'});
      }
      next();
    };

    validateParent(parentRow=>validateLocations(()=>validateRoleLocation(parentRow,createRecord)));
  });
});
// END SECTION: STAFF CREATION + HIERARCHY

app.delete('/api/staff/:id',auth,roles('admin','master_admin'),(req,res)=>{
  get('SELECT id,role,staff_id,name,location_code FROM staff WHERE id=?',[req.params.id],(err,target)=>{
    if(err)return res.status(500).json({error:err.message});
    if(!target)return res.status(404).json({error:'Staff not found'});
    if(target.role==='master_admin')return res.status(403).json({error:'Director cannot be deleted'});
    if(req.user.role==='admin' && target.role==='admin')
      return res.status(403).json({error:'Only Director can delete Admin accounts'});
    const remove=()=>db.serialize(()=>{
      db.run('DELETE FROM location_assignments WHERE staff_id=?',[target.staff_id]);
      db.run('DELETE FROM shift_schedules WHERE staff_id=?',[target.staff_id]);
      db.run('DELETE FROM staff WHERE id=?',[target.id],function(de){
        if(de)return res.status(500).json({error:de.message});
        if(!this.changes)return res.status(404).json({error:'Staff not found'});
        audit(req.user,'STAFF_DELETED',target.staff_id,`${target.role} ${target.name}`);
        res.json({message:'Deleted'});
      });
    });
    if(req.user.role==='admin'){
      if(!target.location_code)return res.status(403).json({error:'You cannot delete a member without an assigned point'});
      return get('SELECT 1 FROM location_assignments WHERE staff_id=? AND location_code=? AND active=1',[req.user.staff_id,target.location_code],(oe,owned)=>{
        if(oe)return res.status(500).json({error:oe.message});
        if(!owned)return res.status(403).json({error:'You cannot delete a member outside your assigned points'});
        remove();
      });
    }
    remove();
  });
});

// ADMIN PROFILE RECORD EDIT - Admin only. Password is updated only when a new one is supplied.
app.put('/api/staff/:id/profile',auth,roles('admin','master_admin'),(req,res)=>{
  const x=req.body||{};
  get('SELECT * FROM staff WHERE id=?',[req.params.id],(err,s)=>{
    if(err)return res.status(500).json({error:err.message});
    if(!s)return res.status(404).json({error:'Staff not found'});
    if(s.role==='master_admin')return res.status(403).json({error:'Director profile is protected'});
    const newRole=['admin','field_officer','officer','supervisor','guard'].includes(x.role)?x.role:s.role;
    // Normal Admin cannot edit another Admin, create/elevate to Admin, or touch Director.
    if(req.user.role==='admin' && (s.role==='admin' || s.role==='master_admin' || newRole==='admin')){
      return res.status(403).json({error:'Only Director can manage Admin accounts'});
    }
    const location=String(x.location_code||'').trim();
    const parent=String(x.parent_id||'').trim();
    const validateEditLocation=(next)=>{
      if(newRole==='admin' || (newRole==='field_officer' && !location)) return next();
      if(!location)return res.status(400).json({error:'Please select an active Location Code'});
      get('SELECT code FROM locations WHERE code=? AND active=1',[location],(le,lr)=>{
        if(le)return res.status(500).json({error:le.message});
        if(!lr)return res.status(400).json({error:'Invalid or inactive Location Code'});
        next();
      });
    };
    const continueEdit=()=>{
      // Field Officer has access to ALL active locations; parent is not required.
      if(newRole==='field_officer') return save();

      // Supervisor must always belong to a Field Officer and have a location.
      if(newRole==='supervisor'){
        if(!parent)return res.status(400).json({error:'Supervisor Parent ID must be a Field Officer Staff ID'});
        if(!location)return res.status(400).json({error:'Supervisor Location Code is required'});
        return get('SELECT role FROM staff WHERE staff_id=?',[parent],(pe,p)=>{
          if(pe)return res.status(500).json({error:pe.message});
          if(!p || p.role!=='field_officer')return res.status(400).json({error:'Supervisor Parent ID must be a Field Officer Staff ID'});
          save();
        });
      }

      // Guard must always belong to a Supervisor and use exactly the Supervisor location.
      if(newRole==='guard'){
        if(!parent)return res.status(400).json({error:'Guard Parent ID must be a Supervisor Staff ID'});
        if(!location)return res.status(400).json({error:'Guard Location Code is required'});
        return get('SELECT role,location_code FROM staff WHERE staff_id=?',[parent],(pe,p)=>{
          if(pe)return res.status(500).json({error:pe.message});
          if(!p || p.role!=='supervisor')return res.status(400).json({error:'Guard Parent ID must be a Supervisor Staff ID'});
          if(String(p.location_code||'')!==location)return res.status(400).json({error:'Guard location must exactly match the Supervisor location'});
          save();
        });
      }

      // Admin profile does not require a parent or location.
      if(newRole==='admin') return save();

      return res.status(400).json({error:'Unsupported role. Use Admin, Field Officer, Supervisor or Guard.'});
    };
    validateEditLocation(continueEdit);
    // =====================================================
    // SECTION: FUNCTION save
    // =====================================================
    function save(){
      const vals=[x.name||s.name,newRole,x.post||s.post,x.salary??s.salary,x.dob||'',x.department||'',location,parent,x.contact_number||'',x.dp||s.dp||'',
        x.age||null,x.height||null,x.weight||null,x.blood_group||'',x.qualification||'',x.physical_level||'',x.medical_level||'',x.skills||'',x.police_verification||'',x.driving_license||'',x.training_details||'',x.work_experience||'',
        x.photo_front||s.photo_front||'',x.photo_back||s.photo_back||'',x.photo_left||s.photo_left||'',x.photo_right||s.photo_right||'',Number(x.is_reliever)?1:0,req.params.id];
      let sql='UPDATE staff SET name=?,role=?,post=?,salary=?,dob=?,department=?,location_code=?,parent_id=?,contact_number=?,dp=?,age=?,height=?,weight=?,blood_group=?,qualification=?,physical_level=?,medical_level=?,skills=?,police_verification=?,driving_license=?,training_details=?,work_experience=?,photo_front=?,photo_back=?,photo_left=?,photo_right=?,is_reliever=?';
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
    // END SECTION: FUNCTION save

  });
});

// PASSWORD MANAGEMENT - Admin only. Existing passwords are never returned to the frontend.
app.put('/api/staff/:id/password',auth,roles('admin','master_admin'),(req,res)=>{
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
app.get('/api/profile/me',auth,(req,res)=>{
  const safe={...req.user};
  delete safe.password;
  res.json({user:safe});
});
app.put('/api/profile/me',auth,(req,res)=>{
  const x=req.body||{};
  const role=req.user.role;
  if(role==='admin'){
    return run('UPDATE staff SET name=?,post=?,salary=?,dob=?,department=?,location_code=?,contact_number=?,dp=? WHERE id=?',
      [x.name||req.user.name,x.post||req.user.post,x.salary||0,x.dob||'',x.department||'',x.location_code||'',x.contact_number||'',x.dp||'',req.user.id],res,()=>res.json({message:'Admin profile updated'}));
  }
  const vals=[
    x.name||req.user.name,x.dob||'',x.contact_number||'',x.dp||'',
    x.age||null,x.height||null,x.weight||null,x.blood_group||'',x.qualification||'',
    x.physical_level||'',x.medical_level||'',x.skills||'',x.police_verification||'No',
    x.driving_license||'No',x.training_details||'',x.work_experience||'',
    x.photo_front||'',x.photo_back||'',x.photo_left||'',x.photo_right||''
  ];
  run(`UPDATE staff SET name=?,dob=?,contact_number=?,dp=?,age=?,height=?,weight=?,blood_group=?,qualification=?,
       physical_level=?,medical_level=?,skills=?,police_verification=?,driving_license=?,training_details=?,work_experience=?,
       photo_front=?,photo_back=?,photo_left=?,photo_right=? WHERE id=?`,
      [...vals,req.user.id],res,()=>{
        audit(req.user,'PROFILE_SELF_UPDATED',req.user.staff_id,'Complete profile submitted');
        res.json({message:'Complete profile submitted to Admin'});
      });
});



// WhatsApp notification helper. For automatic sending, configure Meta WhatsApp Cloud API
// with WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN. The business number shown to
// users is WHATSAPP_SENDER_NUMBER (default: 8959872715).
// =====================================================
// SECTION: FUNCTION sendWhatsAppMessage
// =====================================================
async function sendWhatsAppMessage(to,text){
  const sender=process.env.WHATSAPP_SENDER_NUMBER || '8959872715';
  const phoneNumberId=process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token=process.env.WHATSAPP_ACCESS_TOKEN;
  const cleanTo=String(to||'').replace(/\D/g,'');
  const normalized=cleanTo.length===10 ? '91'+cleanTo : cleanTo;
  const waText=encodeURIComponent(text);
  const whatsapp_url=normalized ? `https://wa.me/${normalized}?text=${waText}` : '';
  if(!phoneNumberId || !token || !normalized) return {sent:false,whatsapp_url,sender};
  try{
    const r=await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,{
      method:'POST',headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({messaging_product:'whatsapp',to:normalized,type:'text',text:{preview_url:false,body:text}})
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok) return {sent:false,whatsapp_url,sender,error:data?.error?.message||`WhatsApp API ${r.status}`};
    return {sent:true,whatsapp_url,sender};
  }catch(e){ return {sent:false,whatsapp_url,sender,error:e.message}; }
}
// END SECTION: FUNCTION sendWhatsAppMessage


app.post('/api/relievers/assign',auth,roles('admin','master_admin'),async(req,res)=>{
  const staffId=String(req.body?.staff_id||'').trim(), location=String(req.body?.location_code||'').trim();
  const dutyHours=Number(req.body?.duty_hours)===8?8:12;
  const allowedShifts=shiftForDutyHours(dutyHours);
  const shift=allowedShifts.includes(String(req.body?.shift||''))?String(req.body.shift):allowedShifts[0];
  if(!staffId||!location)return res.status(400).json({error:'Select Reliever and Location'});
  get('SELECT * FROM staff WHERE staff_id=? AND role IN ("officer","guard","supervisor")',[staffId],async(e,s)=>{
    if(e)return res.status(500).json({error:e.message}); if(!s)return res.status(404).json({error:'Reliever Officer/Guard/Supervisor not found'});
    if(s.status!=='active')return res.status(400).json({error:'Only active staff can be assigned as Reliever'});
    get('SELECT code FROM locations WHERE code=? AND active=1',[location],async(le,lr)=>{
      if(le)return res.status(500).json({error:le.message}); if(!lr)return res.status(400).json({error:'Invalid or inactive Location Code'});
      run('UPDATE staff SET is_reliever=1,location_code=?,reliever_duty_hours=?,reliever_shift=? WHERE id=?',[location,dutyHours,shift,s.id],res,async()=>{
        // Save an in-app notification for the assigned reliever.
        db.run('INSERT INTO reliever_notifications(staff_id,message,created_at,read_at) VALUES(?,?,?,NULL)',[s.staff_id,`Reliever Duty assigned at ${location} • ${dutyHours} Hours • ${shift}`,new Date().toISOString()]);
        const text=`SNDF MANAGEMENT – Reliever Duty\n\nHello ${s.name},\nYou have been assigned as a RELIEVER.\n\nLocation: ${location}\nDuty Hours: ${dutyHours} Hours\nShift: ${shift} (${SHIFT_SCHEDULES[shift].start} - ${SHIFT_SCHEDULES[shift].end})\nStaff ID: ${s.staff_id}\nAssigned by: ${req.user.name||req.user.staff_id}\n\nPlease report to the assigned location and complete live attendance check-in.\n\nSNDF Support Services\nWhatsApp: ${process.env.WHATSAPP_SENDER_NUMBER||'8959872715'}`;
        const wa=await sendWhatsAppMessage(s.contact_number,text);
        audit(req.user,'RELIEVER_ASSIGNED',s.staff_id,`${location}; ${dutyHours} hour; ${shift}; whatsapp=${wa.sent?'sent':'not-sent'}`);
        res.json({message:'Reliever assignment saved',whatsapp_sent:wa.sent,whatsapp_url:wa.whatsapp_url||'',whatsapp_sender:wa.sender,whatsapp_error:wa.error||'',duty_hours:dutyHours,shift,shift_time:`${SHIFT_SCHEDULES[shift].start} - ${SHIFT_SCHEDULES[shift].end}`});
      });
    });
  });
});

// RELIEVER MANAGEMENT - Admin selects Guard/Supervisor, can change their location and mark a reliever check-in.
app.get('/api/relievers',auth,roles('admin','master_admin','field_officer'),(req,res)=>{
  const base=`SELECT id,role,name,staff_id,location_code,parent_id,status,is_reliever,reliever_duty_hours,reliever_shift FROM staff WHERE role IN ('officer','guard','supervisor')`;
  if(req.user.role==='field_officer') return all(base+' AND location_code IN (SELECT location_code FROM location_assignments WHERE staff_id=? AND active=1) ORDER BY role,name',[req.user.staff_id],res);
  all(base+' ORDER BY role,name',[],res);
});
app.put('/api/staff/:id/reliever',auth,roles('admin','master_admin'),(req,res)=>{
  const enabled=Number(req.body?.is_reliever)?1:0;
  run('UPDATE staff SET is_reliever=?,reliever_parent_id=? WHERE id=?',[enabled,enabled?'':null,req.params.id],res,()=>{
    audit(req.user,enabled?'RELIEVER_ENABLED':'RELIEVER_DISABLED',req.params.id,enabled?'Marked as reliever':'Removed from reliever list');
    res.json({message:enabled?'Member marked as Reliever':'Member removed from Reliever list'});
  });
});
app.put('/api/staff/:id/location',auth,roles('admin','master_admin'),(req,res)=>{
  const location=String(req.body?.location_code||'').trim();
  if(!location)return res.status(400).json({error:'Select a Location Code'});
  get('SELECT code FROM locations WHERE code=? AND active=1',[location],(le,lr)=>{
    if(le)return res.status(500).json({error:le.message});
    if(!lr)return res.status(400).json({error:'Invalid or inactive Location Code'});
  get('SELECT id,staff_id,role FROM staff WHERE id=?',[req.params.id],(e,s)=>{
    if(e)return res.status(500).json({error:e.message}); if(!s)return res.status(404).json({error:'Staff not found'});
    if(!['officer','guard','supervisor'].includes(s.role))return res.status(400).json({error:'Reliever location can be changed only for Officer/Guard/Supervisor'});
    const saveLocation=(relieverParent)=>{
      run('UPDATE staff SET location_code=?,reliever_parent_id=? WHERE id=?',[location,relieverParent||'',s.id],res,()=>{audit(req.user,'RELIEVER_LOCATION_CHANGED',s.staff_id,`${location}; reliever parent=${relieverParent||''}`);res.json({message:'Location changed',location_code:location,reliever_parent_id:relieverParent||''});});
    };
    get("SELECT staff_id FROM staff WHERE role='supervisor' AND location_code=? AND status='active' ORDER BY id LIMIT 1",[location],(pe,sp)=>{
      if(pe)return res.status(500).json({error:pe.message});
      saveLocation(s.role==='guard' || s.role==='supervisor' ? (sp?.staff_id||'') : '');
    });
  });
  });
});
app.post('/api/reliever-checkin',auth,roles('admin','master_admin'),(req,res)=>{
  const x=req.body||{}, targetId=String(x.staff_id||'').trim(), location=String(x.location_code||'').trim();
  if(!targetId||!location)return res.status(400).json({error:'Select reliever and location'});
  get('SELECT * FROM staff WHERE staff_id=? AND role IN ("officer","guard","supervisor")',[targetId],(err,s)=>{
    if(err)return res.status(500).json({error:err.message});
    if(!s)return res.status(404).json({error:'Reliever Officer/Guard/Supervisor not found'});
    if(!s.is_reliever)return res.status(403).json({error:'Selected member is not marked as Reliever'});
    const dutyHours=Number(s.reliever_duty_hours)===8?8:12;
    const allowedShifts=shiftForDutyHours(dutyHours);
    const shift=allowedShifts.includes(String(x.shift||''))?String(x.shift):String(s.reliever_shift||allowedShifts[0]);
    const finalShift=allowedShifts.includes(shift)?shift:allowedShifts[0];
    const now=new Date(), date=now.toISOString().slice(0,10), time=now.toTimeString().slice(0,8), iso=now.toISOString();
    get('SELECT id FROM attendance WHERE staff_id=? AND date=? ORDER BY id DESC LIMIT 1',[targetId,date],(ae,existing)=>{
      if(ae)return res.status(500).json({error:ae.message});
      if(existing)return res.status(409).json({error:'Reliever already has attendance today'});
      db.run('UPDATE staff SET location_code=? WHERE id=?',[location,s.id],(ue)=>{
        if(ue)return res.status(500).json({error:ue.message});
        run('INSERT INTO attendance(staff_id,name,date,photo,location,shift,duty_hours,check_in,check_in_at,attendance_status) VALUES(?,?,?,?,?,?,?,?,?,?)',
          [s.staff_id,s.name,date,x.photo||'',location,finalShift,dutyHours,time,iso,'Present - Reliever Check-In'],res,row=>{
            audit(req.user,'RELIEVER_CHECKIN',s.staff_id,`${dutyHours}h ${finalShift}; location=${location}`);
            res.status(201).json({id:row.lastID,message:'Reliever check-in saved'});
          });
      });
    });
  });
});

// TEAM ATTENDANCE - Supervisor sees only guards assigned to them; Field Officer sees assigned supervisors/guards.
app.get('/api/team-attendance',auth,roles('field_officer','officer','supervisor'),(req,res)=>{
  const parent=req.user.staff_id;
  const condition=req.user.role==='supervisor'
    ? `(s.parent_id=? OR s.reliever_parent_id=?) AND s.role='guard'`
    : req.user.role==='officer'
      ? `((s.role='supervisor' AND (s.parent_id=? OR s.reliever_parent_id=?)) OR (s.role='guard' AND (s.parent_id IN (SELECT staff_id FROM staff WHERE parent_id=?) OR s.reliever_parent_id IN (SELECT staff_id FROM staff WHERE parent_id=?))))`
      : `(s.parent_id=? OR s.reliever_parent_id=?) AND s.role IN ('officer','supervisor','guard')`;
  all(`SELECT a.*,s.role,s.location_code AS staff_location_code,s.parent_id,s.reliever_parent_id FROM attendance a
       JOIN staff s ON s.staff_id=a.staff_id WHERE ${condition} ORDER BY a.date DESC,a.id DESC`,req.user.role==='officer'?[parent,parent,parent,parent]:[parent,parent],res);
});


// =====================================================
// TASK MANAGEMENT - role hierarchy
// Director -> Admin/Field Officer/Officer/Supervisor/Guard
// Admin -> Field Officer/Officer/Supervisor/Guard
// Field Officer -> Officer
// Officer -> Supervisor; Supervisor -> Guard
// =====================================================
const TASK_TARGETS = {
  master_admin:['admin','field_officer','officer','supervisor','guard'],
  admin:['field_officer','officer','supervisor','guard'],
  field_officer:['officer'],
  officer:['supervisor'],
  supervisor:['guard'],
  guard:[]
};
// =====================================================
// SECTION: FUNCTION canAssignTask
// =====================================================
function canAssignTask(from,to){ return (TASK_TARGETS[from]||[]).includes(to); }
// END SECTION: FUNCTION canAssignTask

app.get('/api/tasks',auth,(req,res)=>{
  const base=`SELECT t.*,s.name AS assignee_name,c.name AS creator_name
             FROM tasks t
             LEFT JOIN staff s ON s.staff_id=t.assigned_to
             LEFT JOIN staff c ON c.staff_id=t.created_by`;
  if(req.user.role==='master_admin') return all(base+' ORDER BY t.id DESC',[],res);
  all(base+' WHERE t.assigned_to=? OR t.created_by=? ORDER BY t.id DESC',[req.user.staff_id,req.user.staff_id],res);
});
app.post('/api/tasks',auth,(req,res)=>{
  const x=req.body||{}, assigned=String(x.assigned_to||'').trim();
  if(!x.title||!assigned)return res.status(400).json({error:'Task title and assignee are required'});
  get('SELECT staff_id,name,role,status FROM staff WHERE LOWER(TRIM(staff_id))=LOWER(TRIM(?)) LIMIT 1',[assigned],(e,s)=>{
    if(e)return res.status(500).json({error:e.message});
    if(!s && /^\d+$/.test(assigned)){
      return get('SELECT staff_id,name,role,status FROM staff WHERE id=? LIMIT 1',[Number(assigned)],(e2,s2)=>{
        if(e2)return res.status(500).json({error:e2.message});
        if(!s2)return res.status(404).json({error:`Assignee not found: ${assigned}`});
        createTaskForAssignee(s2);
      });
    }
    if(!s)return res.status(404).json({error:`Assignee not found: ${assigned}`});
    createTaskForAssignee(s);

    // =====================================================

    // SECTION: FUNCTION createTaskForAssignee

    // =====================================================

    function createTaskForAssignee(s){
    if(s.status==='suspended')return res.status(403).json({error:'Cannot assign a task to a suspended member'});
    if(!canAssignTask(req.user.role,s.role))return res.status(403).json({error:`${labelRole(req.user.role)} cannot assign tasks to ${labelRole(s.role)}`});
    const priority=['Low','Normal','High','Urgent'].includes(x.priority)?x.priority:'Normal';
    run(`INSERT INTO tasks(title,description,priority,created_by,created_by_role,assigned_to,assigned_role,due_at,status,created_at)
         VALUES(?,?,?,?,?,?,?,?,'Pending',?)`,
      [String(x.title).trim(),String(x.description||'').trim(),priority,req.user.staff_id,req.user.role,s.staff_id,s.role,x.due_at||'',new Date().toISOString()],
      res,row=>{audit(req.user,'TASK_CREATED',s.staff_id,`${x.title}; priority=${priority}`);res.status(201).json({id:row.lastID,message:'Task created',assigned_to:s.staff_id,assigned_role:s.role});});
    }

    // END SECTION: FUNCTION createTaskForAssignee

  });
});
// =====================================================
// SECTION: FUNCTION labelRole
// =====================================================
function labelRole(r){return ({master_admin:'Director',admin:'Admin',field_officer:'Field Officer',officer:'Officer',supervisor:'Supervisor',guard:'Guard'}[r]||r)}
// END SECTION: FUNCTION labelRole

// =====================================================
// SECTION: FUNCTION taskAccess
// =====================================================
function taskAccess(task,user){
  return task && (task.assigned_to===user.staff_id || task.created_by===user.staff_id);
}
// END SECTION: FUNCTION taskAccess

app.put('/api/tasks/:id/start',auth,(req,res)=>{
  get('SELECT * FROM tasks WHERE id=?',[req.params.id],(e,t)=>{
    if(e)return res.status(500).json({error:e.message}); if(!t)return res.status(404).json({error:'Task not found'});
    if(t.assigned_to!==req.user.staff_id)return res.status(403).json({error:'Only the assigned member can start this task'});
    if(t.status==='Completed')return res.status(409).json({error:'Completed task cannot be started again'});
    const now=new Date().toISOString();
    run("UPDATE tasks SET status='Started',started_at=?,last_update=? WHERE id=?",[now,'Task started',t.id],res,()=>{
      run("INSERT INTO task_updates(task_id,staff_id,staff_name,update_text,status,created_at) VALUES(?,?,?,?,?,?)",[t.id,req.user.staff_id,req.user.name,'Task started','Started',now],res,()=>{
        audit(req.user,'TASK_STARTED',t.id,t.title);res.json({message:'Task started',started_at:now});
      });
    });
  });
});
app.post('/api/tasks/:id/update',auth,(req,res)=>{
  const text=String(req.body?.update_text||'').trim();
  if(!text)return res.status(400).json({error:'Task update is required'});
  get('SELECT * FROM tasks WHERE id=?',[req.params.id],(e,t)=>{
    if(e)return res.status(500).json({error:e.message}); if(!t)return res.status(404).json({error:'Task not found'});
    if(!taskAccess(t,req.user))return res.status(403).json({error:'You cannot update this task'});
    if(t.status==='Completed')return res.status(409).json({error:'Completed task cannot be updated'});
    const now=new Date().toISOString(), newStatus=req.body?.status==='Started'?'Started':(t.status==='Pending'?'Started':t.status);
    run("UPDATE tasks SET status=?,last_update=? WHERE id=?",[newStatus,text,t.id],res,()=>{
      run("INSERT INTO task_updates(task_id,staff_id,staff_name,update_text,status,created_at) VALUES(?,?,?,?,?,?)",[t.id,req.user.staff_id,req.user.name,text,newStatus,now],res,()=>{
        audit(req.user,'TASK_UPDATED',t.id,text);res.json({message:'Task update saved',status:newStatus});
      });
    });
  });
});
app.post('/api/tasks/:id/complete',auth,(req,res)=>{
  const x=req.body||{};
  const summary=String(x.report_summary||'').trim();
  const timeSummary=String(x.report_time_summary||'').trim();
  const result=String(x.report_result||'').trim();
  if(!summary||!timeSummary||!result)return res.status(400).json({error:'Report Summary, Time Summary and Result are required'});
  get('SELECT * FROM tasks WHERE id=?',[req.params.id],(e,t)=>{
    if(e)return res.status(500).json({error:e.message}); if(!t)return res.status(404).json({error:'Task not found'});
    if(t.assigned_to!==req.user.staff_id)return res.status(403).json({error:'Only the assigned member can complete this task'});
    if(t.status==='Completed')return res.status(409).json({error:'Task is already completed'});
    const now=new Date().toISOString();
    run(`UPDATE tasks SET status='Completed',completed_at=?,last_update=?,report_summary=?,report_time_summary=?,report_result=?,report_issues=?,report_next_action=? WHERE id=?`,
      [now,'Task completed and report submitted',summary,timeSummary,result,String(x.report_issues||'').trim(),String(x.report_next_action||'').trim(),t.id],res,()=>{
        run("INSERT INTO task_updates(task_id,staff_id,staff_name,update_text,status,created_at) VALUES(?,?,?,?,?,?)",[t.id,req.user.staff_id,req.user.name,'Task completed and report submitted','Completed',now],res,()=>{
          audit(req.user,'TASK_COMPLETED',t.id,summary);res.json({message:'Task completed and report submitted',completed_at:now});
        });
      });
  });
});
app.get('/api/tasks/:id/updates',auth,(req,res)=>{
  get('SELECT * FROM tasks WHERE id=?',[req.params.id],(e,t)=>{
    if(e)return res.status(500).json({error:e.message}); if(!taskAccess(t,req.user))return res.status(403).json({error:'Access denied'});
    all('SELECT * FROM task_updates WHERE task_id=? ORDER BY id DESC',[req.params.id],res);
  });
});
app.get('/api/task-targets',auth,(req,res)=>{
  const targets=TASK_TARGETS[req.user.role]||[];
  if(!targets.length)return res.json([]);
  all(`SELECT id,name,staff_id,role,location_code,status FROM staff WHERE role IN (${targets.map(()=>'?').join(',')}) AND status='active' ORDER BY role,name`,targets,res);
});


// Temporary ID suspension - Admin only.
app.put('/api/staff/:id/suspend',auth,roles('admin','master_admin'),(req,res)=>{
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
app.put('/api/staff/:id/activate',auth,roles('admin','master_admin'),(req,res)=>run("UPDATE staff SET status='active',suspended_until=NULL,suspension_reason=NULL WHERE id=?",[req.params.id],res,()=>res.json({message:'Staff activated'})));
app.get('/api/suspension-notifications',auth,roles('admin','master_admin'),(req,res)=>all('SELECT * FROM suspension_notifications ORDER BY id DESC LIMIT 100',[],res));

// =====================================================
// HOURLY POINT UPDATE
// Guard + Supervisor must submit a live photo + GPS once every hour during Night Shift.
// Day Shift is not mandatory. Admin/Director can monitor all submitted points.
// =====================================================
// =====================================================
// SECTION: FUNCTION pointShiftFromAttendance
// =====================================================
function pointShiftFromAttendance(row){ return row?.shift==='Night Shift' ? 'Night Shift' : (row?.shift||''); }
// END SECTION: FUNCTION pointShiftFromAttendance

// =====================================================
// SECTION: FUNCTION pointStatusForStaff
// =====================================================
function pointStatusForStaff(staffId, cb){
  get(`SELECT a.*,s.role,s.name,s.location_code FROM attendance a JOIN staff s ON s.staff_id=a.staff_id
       WHERE a.staff_id=? AND a.check_out IS NULL ORDER BY a.id DESC LIMIT 1`,[staffId],(e,att)=>{
    if(e)return cb(e);
    if(!att || att.shift!=='Night Shift') return cb(null,{required:false,reason:'Point update is mandatory only during Night Shift.'});
    get(`SELECT captured_at FROM point_updates WHERE staff_id=? AND attendance_id=? ORDER BY id DESC LIMIT 1`,[staffId,att.id],(pe,last)=>{
      if(pe)return cb(pe);
      const base=last?.captured_at||att.check_in_at||new Date().toISOString();
      const dueAt=new Date(new Date(base).getTime()+60*60*1000);
      const now=new Date();
      const minutesSince=Math.max(0,Math.floor((now-new Date(base))/60000));
      cb(null,{required:true,attendance_id:att.id,shift:att.shift,location_code:att.location_code||'',last_at:last?.captured_at||att.check_in_at||null,due_at:dueAt.toISOString(),minutes_since_last:minutesSince,due:now>=dueAt,overdue_minutes:Math.max(0,Math.floor((now-dueAt)/60000))});
    });
  });
}
// END SECTION: FUNCTION pointStatusForStaff

app.get('/api/point-updates/status',auth,roles('guard','supervisor'),(req,res)=>pointStatusForStaff(req.user.staff_id,(e,data)=>e?res.status(500).json({error:e.message}):res.json(data)));
app.post('/api/point-updates',auth,roles('guard','supervisor'),(req,res)=>{
  const x=req.body||{}; const photo=String(x.photo||'').trim(), location=String(x.location||'').trim();
  if(!photo || !location)return res.status(400).json({error:'Live photo and GPS location are required'});
  pointStatusForStaff(req.user.staff_id,(e,status)=>{
    if(e)return res.status(500).json({error:e.message});
    if(!status.required)return res.status(403).json({error:'Hourly Point Update is required only during Night Shift.'});
    if(!status.due)return res.status(409).json({error:`Next Point Update is due at ${new Date(status.due_at).toLocaleTimeString()}.`});
    checkGeofence(status.location_code,location,(ge,geo)=>{
      if(ge)return res.status(500).json({error:ge.message});
      if(geo.configured && !geo.allowed)return res.status(403).json({error:geo.error||`Outside ${status.location_code} geofence (${geo.distance}m / ${geo.radius}m).`});
      const capturedAt=new Date().toISOString();
      const pointStatus=status.overdue_minutes>0?`Late by ${status.overdue_minutes} min`:'On Time';
      run(`INSERT INTO point_updates(staff_id,name,role,location_code,location,photo,shift,captured_at,status,attendance_id) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        [req.user.staff_id,req.user.name,req.user.role,status.location_code,location,photo,status.shift,capturedAt,pointStatus,status.attendance_id],res,row=>{
          audit(req.user,'POINT_UPDATE_SUBMITTED',req.user.staff_id,`${status.shift}; ${status.location_code}; ${pointStatus}`);
          res.status(201).json({id:row.lastID,message:'Hourly Point Update submitted',captured_at:capturedAt,status:pointStatus});
        });
    });
  });
});
app.get('/api/point-updates',auth,roles('admin','master_admin'),(req,res)=>{
  const role=String(req.query.role||'all'), location=String(req.query.location||'all'), date=String(req.query.date||'');
  const where=[],params=[];
  if(['guard','supervisor'].includes(role)){where.push('p.role=?');params.push(role)}
  if(location!=='all'&&location){where.push('p.location_code=?');params.push(location)}
  if(date){where.push('substr(p.captured_at,1,10)=?');params.push(date)}
  let sql=`SELECT p.* FROM point_updates p`;
  if(where.length)sql+=' WHERE '+where.join(' AND ');
  sql+=' ORDER BY p.captured_at DESC,p.id DESC LIMIT 1000';
  all(sql,params,res);
});

// Profile viewer for Admin/Director. Read-only; no edit action is exposed.
app.get('/api/staff/:id/profile-view',auth,roles('admin','master_admin'),(req,res)=>{
  get(`SELECT id,role,name,staff_id,post,salary,location_code,parent_id,status,suspended_until,suspension_reason,dob,department,contact_number,dp,
      age,height,weight,blood_group,qualification,physical_level,medical_level,skills,police_verification,driving_license,
      training_details,work_experience,photo_front,photo_back,photo_left,photo_right,is_reliever FROM staff WHERE id=?`,[req.params.id],(e,row)=>{
    if(e)return res.status(500).json({error:e.message}); if(!row)return res.status(404).json({error:'Profile not found'});
    res.json(row);
  });
});


// PROFILE PDF DOWNLOAD - Admin/Director only.
// Generates a real PDF and embeds all four full-body photos stored as data URLs.
// =====================================================
// SECTION: FUNCTION profileImageBuffer
// =====================================================
function profileImageBuffer(value){
  const v=String(value||'');
  const m=v.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,(.+)$/i);
  if(!m)return null;
  try{return Buffer.from(m[1],'base64');}catch{return null;}
}
// END SECTION: FUNCTION profileImageBuffer

// =====================================================
// SECTION: FUNCTION pdfSafe
// =====================================================
function pdfSafe(v){
  return String(v??'—').replace(/[^\x20-\x7E₹]/g,'?');
}
// END SECTION: FUNCTION pdfSafe

// =====================================================
// SECTION: FUNCTION addPdfField
// =====================================================
function addPdfField(doc,label,value,x,y,w=240){
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#555').text(pdfSafe(label),x,y,{width:w});
  doc.font('Helvetica').fontSize(10).fillColor('#111').text(pdfSafe(value||'—'),x,y+12,{width:w});
}
// END SECTION: FUNCTION addPdfField

app.get('/api/staff/:id/profile-pdf',auth,roles('admin','master_admin'),(req,res)=>{
  get(`SELECT id,role,name,staff_id,post,salary,location_code,parent_id,status,suspended_until,suspension_reason,dob,department,contact_number,dp,
      age,height,weight,blood_group,qualification,physical_level,medical_level,skills,police_verification,driving_license,
      training_details,work_experience,photo_front,photo_back,photo_left,photo_right,is_reliever FROM staff WHERE id=?`,[req.params.id],(e,p)=>{
    if(e)return res.status(500).json({error:e.message});
    if(!p)return res.status(404).json({error:'Profile not found'});

    const roleLabel={master_admin:'Director',admin:'Admin',field_officer:'Field Officer',supervisor:'Supervisor',guard:'Guard'}[p.role]||p.role;
    const doc=new PDFDocument({size:'A4',margin:42,info:{Title:`SNDF Profile - ${p.name}`,Author:'SNDF Management'}});
    const chunks=[];
    doc.on('data',c=>chunks.push(c));
    doc.on('error',err=>res.status(500).json({error:'PDF generation failed: '+err.message}));
    doc.on('end',()=>{
      const pdf=Buffer.concat(chunks);
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition',`attachment; filename="SNDF-profile-${String(p.staff_id).replace(/[^a-zA-Z0-9_-]/g,'_')}.pdf"`);
      res.setHeader('Content-Length',pdf.length);
      res.end(pdf);
    });

    doc.fillColor('#123').font('Helvetica-Bold').fontSize(20).text('SNDF MANAGEMENT');
    doc.font('Helvetica').fontSize(9).fillColor('#666').text('STAFF PROFILE • OFFICIAL PROFILE REPORT');
    doc.moveDown(1);
    doc.strokeColor('#bbb').moveTo(42,90).lineTo(553,90).stroke();

    const avatar=profileImageBuffer(p.dp||p.photo_front);
    if(avatar){try{doc.image(avatar,455,105,{fit:[95,115],align:'center',valign:'center'});}catch(_){} }
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(18).text(pdfSafe(p.name||'Staff Member'),42,108,{width:390});
    doc.font('Helvetica').fontSize(11).fillColor('#333').text(`${pdfSafe(roleLabel)}  |  ID: ${pdfSafe(p.staff_id)}`,42,133,{width:390});
    doc.fontSize(10).text(`Post: ${pdfSafe(p.post)}   Location: ${pdfSafe(p.location_code)}   Parent: ${pdfSafe(p.parent_id)}`,42,153,{width:390});
    doc.text(`Status: ${pdfSafe(p.status)}   Reliever: ${p.is_reliever?'Yes':'No'}`,42,171,{width:390});

    let y=215;
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#123').text('Personal & Professional Details',42,y); y+=24;
    const fields=[
      ['Age',p.age],['Height',p.height?`${p.height} cm`:'' ],['Weight',p.weight?`${p.weight} kg`:'' ],['Blood Group',p.blood_group],
      ['Qualification',p.qualification],['Physical Level',p.physical_level],['Medical Level',p.medical_level],['Skills',p.skills],
      ['Police Verification',p.police_verification],['Driving License',p.driving_license],['Training Details',p.training_details],['Work Experience',p.work_experience],
      ['Contact Number',p.contact_number],['Department',p.department],['DOB',p.dob],['Salary',p.salary!=null?`₹${p.salary}`:''],['Suspension Reason',p.suspension_reason]
    ];
    for(let i=0;i<fields.length;i++){
      const col=i%2, row=Math.floor(i/2), x=42+col*255, yy=y+row*43;
      addPdfField(doc,fields[i][0],fields[i][1],x,yy,235);
    }
    y += Math.ceil(fields.length/2)*43 + 8;
    doc.strokeColor('#ddd').moveTo(42,y).lineTo(553,y).stroke();
    y+=15;
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#123').text('Profile Photos',42,y); y+=22;
    doc.font('Helvetica').fontSize(9).fillColor('#666').text('Front / Back / Left / Right full-body photographs are embedded in this PDF.',42,y);

    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#123').text('SNDF MANAGEMENT — 4 FULL-BODY PHOTOS',42,42);
    const photos=[['Front Full',p.photo_front],['Back Full',p.photo_back],['Left Full',p.photo_left],['Right Full',p.photo_right]];
    const boxes=[[42,85],[305,85],[42,390],[305,390]];
    photos.forEach(([label,img],i)=>{
      const [x,yy]=boxes[i];
      doc.roundedRect(x,yy,248,275,8).stroke('#ccc');
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#222').text(label,x+10,yy+10,{width:228,align:'center'});
      const b=profileImageBuffer(img);
      if(b){try{doc.image(b,x+18,yy+34,{fit:[212,220],align:'center',valign:'center'});}catch(_){doc.font('Helvetica').fontSize(9).fillColor('#888').text('Photo format could not be embedded',x+20,yy+150,{width:208,align:'center'});}}
      else doc.font('Helvetica').fontSize(10).fillColor('#888').text('No photo submitted',x+20,yy+150,{width:208,align:'center'});
    });
    doc.font('Helvetica').fontSize(8).fillColor('#777').text(`Generated by SNDF Management • Staff ID: ${pdfSafe(p.staff_id)} • ${new Date().toLocaleString('en-IN')}`,42,770,{width:510,align:'center'});
    doc.end();
  });
});

// ATTENDANCE - Two 12-hour shifts: Day 08:00-20:00 / Night 20:00-08:00.
// Full shift = 12 hours. Checkout before 8 hours is automatically Half Day.
// Field Officer, Supervisor and Guard can mark/view ONLY their own attendance.
const SHIFT_SCHEDULES = {
  // 12-hour locations: 2 shifts
  'Day Shift': { start: '08:00', end: '20:00', targetHours: 12, dutyHours: 12, halfDayThreshold: 8 },
  'Night Shift': { start: '20:00', end: '08:00', targetHours: 12, dutyHours: 12, halfDayThreshold: 8 },
  // 8-hour locations: 3 shifts
  'Morning Shift': { start: '06:00', end: '14:00', targetHours: 8, dutyHours: 8 },
  'Evening Shift': { start: '14:00', end: '22:00', targetHours: 8, dutyHours: 8 },
  'Night Shift 8H': { start: '22:00', end: '06:00', targetHours: 8, dutyHours: 8 }
};
// =====================================================
// SECTION: FUNCTION shiftForDutyHours
// =====================================================
function shiftForDutyHours(hours){ return Number(hours)===8 ? ['Morning Shift','Evening Shift','Night Shift 8H'] : ['Day Shift','Night Shift']; }
// END SECTION: FUNCTION shiftForDutyHours

// =====================================================
// SECTION: FUNCTION isShiftAllowedForDuty
// =====================================================
function isShiftAllowedForDuty(shift,hours){ return shiftForDutyHours(hours).includes(shift); }
// END SECTION: FUNCTION isShiftAllowedForDuty

app.get('/api/attendance',auth,(req,res)=>{
  // Admin gets the complete attendance record, including the staff Location Code
  // and the live photo captured at Check In. Other roles see only their own records.
  const sql=['admin','master_admin'].includes(req.user.role)
    ? `SELECT a.*,s.role,s.location_code AS staff_location_code
       FROM attendance a LEFT JOIN staff s ON s.staff_id=a.staff_id
       ORDER BY a.id DESC`
    : `SELECT a.*,s.role,s.location_code AS staff_location_code
       FROM attendance a LEFT JOIN staff s ON s.staff_id=a.staff_id
       WHERE a.staff_id=? ORDER BY a.id DESC`;
  all(sql,['admin','master_admin'].includes(req.user.role)?[]:[req.user.staff_id],res);
});
// MAIN OFFICE — single designated check-in/out point for Field Officers.
app.get('/api/main-office',auth,(req,res)=>{
  get('SELECT id,code,name,address,latitude,longitude,radius_meters,duty_shift,duty_hours FROM locations WHERE active=1 AND is_main_office=1 LIMIT 1',[],(e,row)=>{
    if(e)return res.status(500).json({error:e.message});
    if(!row)return res.status(404).json({error:'Main Office is not configured. Admin/Director must mark one location as Main Office.'});
    res.json(row);
  });
});

app.post('/api/attendance',auth,(req,res)=>{
  const x=req.body||{};
  const targetId=['admin','master_admin'].includes(req.user.role) ? (x.staff_id||req.user.staff_id) : req.user.staff_id;
  get('SELECT * FROM staff WHERE staff_id=?',[targetId],(err,s)=>{
    if(err)return res.status(500).json({error:err.message}); if(!s)return res.status(404).json({error:'Staff ID not found'});
    if(!['admin','master_admin'].includes(req.user.role) && s.staff_id!==req.user.staff_id)return res.status(403).json({error:'You can mark attendance only for yourself'});
    // Field Officers are mobile operational staff: their attendance is always recorded
    // at the designated Main Office, while their assigned locations are management scope only.
    const resolveAttendanceLocation=(cb)=>{
      if(s.role==='field_officer'){
        return get('SELECT * FROM locations WHERE active=1 AND is_main_office=1 LIMIT 1',[],(oe,office)=>{
          if(oe)return cb(oe);
          if(!office)return res.status(400).json({error:'Main Office is not configured. Please ask Admin/Director to mark one location as Main Office.'});
          cb(null,office);
        });
      }
      get('SELECT * FROM locations WHERE code=? AND active=1',[s.location_code],cb);
    };
    resolveAttendanceLocation((le,loc)=>{
    if(le)return res.status(500).json({error:le.message});
    const attendanceLocationCode=String(loc?.code||'').trim();
    if(!attendanceLocationCode)return res.status(400).json({error:'Attendance Location is not configured for this staff member.'});
    const dutyHours=Number(loc?.duty_hours)===8?8:12;
    const requestedShift=String(x.shift||'');
    const attendanceDate=new Date().toISOString().slice(0,10);
    const applyAttendance=()=>{
      getEffectiveShift(targetId,attendanceLocationCode,attendanceDate,(se,saved)=>{
        const shift=String(saved?.shift||requestedShift||'');
        const effectiveDuty=Number(saved?.duty_hours)===8?8:dutyHours;
        if(!isShiftAllowedForDuty(shift,effectiveDuty)) return res.status(400).json({error:`Invalid shift for ${effectiveDuty}-hour location. Allowed: ${shiftForDutyHours(effectiveDuty).join(', ')}`});
        continueAttendance(shift,effectiveDuty);
      });
    };
    const continueAttendance=(shift,effectiveDuty)=>{
    checkGeofence(attendanceLocationCode,x.location||'',(ge,geo)=>{
    if(ge)return res.status(500).json({error:ge.message});
    if(geo.configured && !geo.allowed) return res.status(403).json({error:geo.error||`You are outside ${s.location_code} geofence (${geo.distance}m / ${geo.radius}m).`});
    const now=new Date(), date=attendanceDate, time=now.toTimeString().slice(0,8), iso=now.toISOString();
    // 30-minute check-in window: normal staff cannot start a shift more than 30 minutes after shift start.
    // Admin reliever check-ins use the dedicated reliever endpoint and are exempt from this window.
    if(!['admin','master_admin'].includes(req.user.role)){
      const schedule=SHIFT_SCHEDULES[shift];
      const [sh,sm]=schedule.start.split(':').map(Number);
      const start=new Date(now); start.setHours(sh,sm,0,0);
      if((shift==='Night Shift' && now.getHours()<8) || (shift==='Night Shift 8H' && now.getHours()<6)) start.setDate(start.getDate()-1);
      const minutesLate=(now-start)/60000;
      if(minutesLate>30) return res.status(403).json({error:`Check-in closed: ${shift} check-in is allowed only within 30 minutes of ${schedule.start}.`});
      if(minutesLate < -30) return res.status(403).json({error:`Check-in opens at ${schedule.start} for ${shift}.`});
    }
    // Never allow a second open shift. This also protects an overnight Night Shift.
    get('SELECT id,check_out FROM attendance WHERE staff_id=? AND check_out IS NULL ORDER BY id DESC LIMIT 1',[targetId],(ae,open)=>{
      if(ae)return res.status(500).json({error:ae.message});
      if(open)return res.status(409).json({error:'An attendance shift is already open. Please Check Out first.'});
      // One attendance record is allowed per shift, so 8-hour locations can have 3
      // separate records on the same calendar date and 12-hour locations can have 2.
      get('SELECT id FROM attendance WHERE staff_id=? AND date=? AND shift=? ORDER BY id DESC LIMIT 1',[targetId,date,shift],(de,existing)=>{
        if(de)return res.status(500).json({error:de.message});
        if(existing)return res.status(409).json({error:`${shift} attendance is already completed today`});
        run('INSERT INTO attendance(staff_id,name,date,photo,location,shift,duty_hours,check_in,check_in_at,attendance_status) VALUES(?,?,?,?,?,?,?,?,?,?)',
          [s.staff_id,s.name,date,x.photo||'',attendanceLocationCode+' | '+(x.location||''),shift,effectiveDuty,time,iso,'Present - Shift Started'],res,row=>{audit(req.user,'ATTENDANCE_CHECKIN',s.staff_id,`${shift}; ${dutyHours} hour duty; attendance_location=${attendanceLocationCode}; gps=${x.location||''}`);res.status(201).json({id:row.lastID,shift,shift_time:`${SHIFT_SCHEDULES[shift].start} - ${SHIFT_SCHEDULES[shift].end}`,duty_hours:dutyHours,message:`${shift} check-in saved (${dutyHours} hour duty)`});});
      });
    });
    });
    };
    applyAttendance();
    });
  });
});
// =====================================================
// SECTION: ADMIN MARK PRESENT BY STAFF ID
// Admin/Director can manually mark a staff member Present using Staff ID.
// This creates a completed attendance record without requiring a camera photo.
// =====================================================
app.post('/api/attendance/admin-mark-present',auth,roles('admin','master_admin'),(req,res)=>{
  const x=req.body||{};
  const targetId=String(x.staff_id||'').trim();
  const date=/^\d{4}-\d{2}-\d{2}$/.test(String(x.date||''))?String(x.date):new Date().toISOString().slice(0,10);
  if(!targetId)return res.status(400).json({error:'Staff ID is required'});
  get('SELECT * FROM staff WHERE staff_id=? LIMIT 1',[targetId],(err,s)=>{
    if(err)return res.status(500).json({error:err.message});
    if(!s)return res.status(404).json({error:'Staff ID not found'});
    if(!['admin','field_officer','officer','supervisor','guard'].includes(s.role))return res.status(400).json({error:'This role cannot be marked through staff attendance'});
    const requestedLocation=String(x.location_code||'').trim();
    const locationCode=requestedLocation||String(s.location_code||'').trim();
    if(!locationCode)return res.status(400).json({error:'Staff has no Location Code. Enter Location Code manually.'});
    get('SELECT duty_hours FROM locations WHERE code=? AND active=1',[locationCode],(le,loc)=>{
      if(le)return res.status(500).json({error:le.message});
      const dutyHours=Number(loc?.duty_hours)===8?8:12;
      const allowed=shiftForDutyHours(dutyHours);
      const requestedShift=String(x.shift||'').trim();
      const chooseShift=(saved)=>{
        const shift=String(saved?.shift||requestedShift||allowed[0]);
        const effectiveDuty=Number(saved?.duty_hours)===8?8:dutyHours;
        if(!isShiftAllowedForDuty(shift,effectiveDuty))return res.status(400).json({error:`Invalid shift for ${effectiveDuty}-hour location. Allowed: ${shiftForDutyHours(effectiveDuty).join(', ')}`});
        get('SELECT id FROM attendance WHERE staff_id=? AND date=? AND shift=? LIMIT 1',[targetId,date,shift],(de,existing)=>{
          if(de)return res.status(500).json({error:de.message});
          if(existing)return res.status(409).json({error:`${shift} attendance is already marked for ${targetId} on ${date}`});
          const now=new Date(),time=now.toTimeString().slice(0,8),iso=now.toISOString();
          run(`INSERT INTO attendance(staff_id,name,date,photo,location,shift,duty_hours,check_in,check_in_at,check_out,hours_worked,attendance_status)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
            [s.staff_id,s.name,date,'',locationCode,shift,effectiveDuty,time,iso,time,0,'Present - Admin Marked'],res,row=>{
              audit(req.user,'ADMIN_MARK_PRESENT',s.staff_id,`${shift}; ${effectiveDuty} hour duty; date=${date}; location=${locationCode}`);
              res.status(201).json({id:row.lastID,staff_id:s.staff_id,name:s.name,date,shift,duty_hours:effectiveDuty,message:`${s.name} (${s.staff_id}) marked Present`});
            });
        });
      };
      getEffectiveShift(targetId,locationCode,date,(se,saved)=>{
        if(se)return res.status(500).json({error:se.message});
        chooseShift(saved);
      });
    });
  });
});
// END SECTION: ADMIN MARK PRESENT BY STAFF ID

app.put('/api/attendance/:id/checkout',auth,(req,res)=>{
  const lookup=(cb)=>{ if(req.params.id==='current') return get('SELECT a.*,s.role FROM attendance a LEFT JOIN staff s ON s.staff_id=a.staff_id WHERE a.staff_id=? AND a.check_out IS NULL ORDER BY a.id DESC LIMIT 1',[req.user.staff_id],cb); get('SELECT a.*,s.role FROM attendance a LEFT JOIN staff s ON s.staff_id=a.staff_id WHERE a.id=?',[req.params.id],cb); };
  lookup((err,row)=>{
    if(err)return res.status(500).json({error:err.message}); if(!row)return res.status(404).json({error:'Attendance record not found'});
    if(!['admin','master_admin'].includes(req.user.role) && row.staff_id!==req.user.staff_id)return res.status(403).json({error:'You can check out only your own attendance'});
    if(row.check_out)return res.status(409).json({error:'Already checked out'});
    const now=new Date();
    let hours=0;
    if(row.check_in_at){ hours=(now-new Date(row.check_in_at))/3600000; }
    else { const [hh,mm,ss]=String(row.check_in||'00:00:00').split(':').map(Number); const start=new Date(now); start.setHours(hh||0,mm||0,ss||0,0); hours=(now-start)/3600000; if(hours<0)hours+=24; }
    if(hours<0 || hours>24)return res.status(409).json({error:'Invalid check-in time'});
    hours=Number(hours.toFixed(2));
    const dutyHours=Number(row.duty_hours)===8?8:12;
    const halfDay=dutyHours===12 && hours<8;
    const status=halfDay?'Half Day - Early Leave (< 8 Hours)':'Present - Shift Completed';
    run('UPDATE attendance SET check_out=?,hours_worked=?,attendance_status=? WHERE id=? AND check_out IS NULL',
      [now.toTimeString().slice(0,8),hours,status,row.id],res,()=>{audit(req.user,'ATTENDANCE_CHECKOUT',row.staff_id,`${hours} hours; duty=${dutyHours}; ${status}`);res.json({message:'Check-out saved',hours_worked:hours,duty_hours:dutyHours,attendance_status:status,half_day:halfDay});});
  });
});
app.delete('/api/attendance/:id',auth,roles('admin','master_admin'),(req,res)=>run('DELETE FROM attendance WHERE id=?',[req.params.id],res,()=>res.json({message:'Attendance deleted'})));
app.get('/api/attendance/export',auth,roles('admin','master_admin'),(req,res)=>{
  const wanted=req.query.role;
  const allowed=['admin','field_officer','officer','supervisor','guard'];
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
  const dutyFilter=String(req.query.duty_hours||'').trim();
  if(dutyFilter==='8' || dutyFilter==='12'){where.push('a.duty_hours=?');params.push(Number(dutyFilter))}
  const shiftFilter=String(req.query.shift||'').trim();
  if(shiftFilter && shiftFilter!=='all'){where.push('a.shift=?');params.push(shiftFilter)}
  if(where.length)sql+=' WHERE '+where.join(' AND ');
  sql+=' ORDER BY a.date DESC,a.id DESC';
  all(sql,params,{json:x=>{ const rows=x; const header='Date,Staff ID,Name,Role,Location Code,Duty Hours,Shift,Check In,Check Out,Hours,Status,Attendance Location'; const csv=[header,...rows.map(r=>[r.date,r.staff_id,r.name,r.role,r.location_code,r.duty_hours,r.shift,r.check_in,r.check_out,r.hours_worked,r.attendance_status,r.location].map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(','))].join('\n'); res.setHeader('Content-Type','text/csv'); res.setHeader('Content-Disposition',`attachment; filename="${roleFilter||'all'}-${dateFilter||'all'}-attendance.csv"`); res.send(csv); }});
});

// FINES - Admin and Field Officer can issue fines to Guard or Supervisor. Others can view.
app.get('/api/fines',auth,(req,res)=>{ const sql=['admin','master_admin'].includes(req.user.role) ? 'SELECT * FROM fines ORDER BY id DESC' : 'SELECT * FROM fines WHERE guard_id=? ORDER BY id DESC'; all(sql,['admin','master_admin'].includes(req.user.role)?[]:[req.user.staff_id],res); });
app.post('/api/fines',auth,roles('admin','master_admin','field_officer'),(req,res)=>{
  const x=req.body||{}; const targetId=String(x.target_id||'').trim();
  if(!targetId||!x.reason||Number(x.amount)<=0)return res.status(400).json({error:'Target ID, reason and positive fine amount are required'});
  get('SELECT role FROM staff WHERE staff_id=?',[targetId],(err,s)=>{
    if(err)return res.status(500).json({error:err.message});
    if(!s)return res.status(404).json({error:'Target Staff ID not found'});
    if(!['guard','supervisor'].includes(s.role))return res.status(403).json({error:'Fine can only be issued to Guard or Supervisor'});
    run('INSERT INTO fines(guard_id,reason,amount,issued_by,image,created_at) VALUES(?,?,?,?,?,?)',[targetId,x.reason,Number(x.amount),req.user.staff_id,x.image||'',new Date().toISOString()],res,row=>{audit(req.user,'FINE_ADDED',targetId,`₹${Number(x.amount)}; ${x.reason}; image=${x.image?'yes':'no'}`);res.status(201).json({id:row.lastID,message:'Fine added with image record'});});
  });
});

// ADVANCE - Admin only.
app.get('/api/advances',auth,(req,res)=>{ const sql=['admin','master_admin'].includes(req.user.role)?'SELECT * FROM advances ORDER BY id DESC':'SELECT * FROM advances WHERE staff_id=? ORDER BY id DESC'; all(sql,['admin','master_admin'].includes(req.user.role)?[]:[req.user.staff_id],res); });
app.post('/api/advances',auth,roles('admin','master_admin'),(req,res)=>{const x=req.body||{}; if(!x.staff_id||Number(x.amount)<=0)return res.status(400).json({error:'Staff ID and positive advance are required'}); run('INSERT INTO advances(staff_id,amount,note,given_by,created_at) VALUES(?,?,?,?,?)',[x.staff_id,Number(x.amount),x.note||'',req.user.staff_id,new Date().toISOString()],res,row=>{audit(req.user,'ADVANCE_ADDED',x.staff_id,`₹${x.amount}`);res.status(201).json({id:row.lastID,message:'Advance recorded'});});});

// ACCOUNT + PAYROLL. Admin can view/pay all staff except Admin's own salary.
// =====================================================
// SECTION: FUNCTION accountForStaff
// =====================================================
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
// END SECTION: FUNCTION accountForStaff


app.get('/api/account/me',auth,(req,res)=>{
  accountForStaff(req.user.staff_id,(err,data)=>err?res.status(500).json({error:err.message}):res.json(data));
});

app.get('/api/account/payroll',auth,roles('admin','master_admin'),(req,res)=>{
  all(`SELECT s.id,s.role,s.name,s.staff_id,s.contact_number,s.post,s.salary,
      COALESCE((SELECT SUM(amount) FROM fines f WHERE f.guard_id=s.staff_id),0) fine,
      COALESCE((SELECT SUM(amount) FROM advances a WHERE a.staff_id=s.staff_id),0) advance,
      COALESCE((SELECT SUM(CASE WHEN attendance_status LIKE 'Half Day%' THEN 0.5 ELSE 1 END) FROM attendance at WHERE at.staff_id=s.staff_id AND at.check_out IS NOT NULL),0) duty_days,
      COALESCE((SELECT SUM(amount) FROM payments p WHERE p.staff_id=s.staff_id),0) paid
      FROM staff s WHERE s.role IN ('field_officer','officer','supervisor','guard') ORDER BY CASE s.role WHEN 'field_officer' THEN 1 WHEN 'supervisor' THEN 2 ELSE 3 END,s.id`,[],res);
});

app.post('/api/payments',auth,roles('admin','master_admin'),(req,res)=>{
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
  const sql=['admin','master_admin'].includes(req.user.role)?'SELECT * FROM payments ORDER BY id DESC':'SELECT * FROM payments WHERE staff_id=? ORDER BY id DESC';
  all(sql,['admin','master_admin'].includes(req.user.role)?[]:[req.user.staff_id],res);
});


// Point Transfer: Supervisor / Field Officer request; Admin approves and changes the assigned point.
app.get('/api/point-transfers',auth,(req,res)=>{
  const sql=['admin','master_admin'].includes(req.user.role)
    ? "SELECT * FROM point_transfer_requests ORDER BY CASE status WHEN 'Pending' THEN 0 ELSE 1 END, id DESC LIMIT 200"
    : 'SELECT * FROM point_transfer_requests WHERE staff_id=? ORDER BY id DESC LIMIT 50';
  all(sql,['admin','master_admin'].includes(req.user.role)?[]:[req.user.staff_id],res);
});
app.post('/api/point-transfers',auth,roles('supervisor','officer','field_officer'),(req,res)=>{
  const to=String(req.body?.to_location||'').trim();
  const reason=String(req.body?.reason||'').trim();
  if(!to) return res.status(400).json({error:'Select the new point / Location Code'});
  if(to===String(req.user.location_code||'')) return res.status(400).json({error:'New point must be different from current point'});
  get('SELECT id FROM locations WHERE code=? AND active=1',[to],(e,loc)=>{
    if(e) return res.status(500).json({error:e.message});
    const allowed = !!loc;
    if(!allowed) return res.status(400).json({error:'Invalid Location Code'});
    get("SELECT id FROM point_transfer_requests WHERE staff_id=? AND status='Pending'",[req.user.staff_id],(pe,pending)=>{
      if(pe)return res.status(500).json({error:pe.message});
      if(pending)return res.status(409).json({error:'A point transfer request is already pending'});
      run('INSERT INTO point_transfer_requests(staff_id,staff_name,staff_role,from_location,to_location,reason,status,requested_at) VALUES(?,?,?,?,?,?,?,?)',
        [req.user.staff_id,req.user.name,req.user.role,req.user.location_code||'',to,reason,'Pending',new Date().toISOString()],res,row=>{
          audit(req.user,'POINT_TRANSFER_REQUESTED',req.user.staff_id,`${req.user.location_code||''} -> ${to}`);
          res.status(201).json({id:row.lastID,message:'Point transfer request sent to Admin'});
        });
    });
  });
});
app.put('/api/point-transfers/:id/approve',auth,roles('admin','master_admin'),(req,res)=>{
  get("SELECT * FROM point_transfer_requests WHERE id=?",[req.params.id],(e,r)=>{
    if(e)return res.status(500).json({error:e.message});
    if(!r)return res.status(404).json({error:'Transfer request not found'});
    if(r.status!=='Pending')return res.status(409).json({error:'Request already reviewed'});
    db.serialize(()=>{
      db.run("UPDATE staff SET location_code=? WHERE staff_id=? AND role IN ('field_officer','officer','supervisor','guard')",[r.to_location,r.staff_id],function(ue){
        if(ue)return res.status(500).json({error:ue.message});
        if(this.changes!==1)return res.status(404).json({error:'Staff member not found'});
        db.run("UPDATE point_transfer_requests SET status='Approved',reviewed_at=?,reviewed_by=? WHERE id=?",[new Date().toISOString(),req.user.staff_id,r.id],(re)=>{
          if(re)return res.status(500).json({error:re.message});
          audit(req.user,'POINT_TRANSFER_APPROVED',r.staff_id,`${r.from_location||''} -> ${r.to_location}`);
          res.json({message:'Point transfer approved',staff_id:r.staff_id,new_location:r.to_location});
        });
      });
    });
  });
});
// DIRECT POINT TRANSFER - Admin/Director can change any non-admin staff point by Staff ID without a request.
app.put('/api/point-transfers/direct',auth,roles('admin','master_admin'),(req,res)=>{
  const staffId=String(req.body?.staff_id||'').trim();
  const to=String(req.body?.to_location||'').trim();
  const reason=String(req.body?.reason||'').trim();
  if(!staffId||!to)return res.status(400).json({error:'Staff ID and new Location Code are required'});
  get('SELECT * FROM staff WHERE staff_id=?',[staffId],(e,s)=>{
    if(e)return res.status(500).json({error:e.message});
    if(!s)return res.status(404).json({error:'Staff ID not found'});
    if(['master_admin','admin'].includes(s.role))return res.status(403).json({error:'Admin/Director point cannot be changed from Point Transfer'});
    get('SELECT code FROM locations WHERE code=? AND active=1',[to],(le,loc)=>{
      if(le)return res.status(500).json({error:le.message});
      if(!loc)return res.status(400).json({error:'Invalid or inactive Location Code'});
      if(String(s.location_code||'')===to)return res.status(400).json({error:'Staff is already assigned to this point'});
      db.run('UPDATE staff SET location_code=? WHERE staff_id=?',[to,staffId],function(ue){
        if(ue)return res.status(500).json({error:ue.message});
        if(this.changes!==1)return res.status(404).json({error:'Staff member not found'});
        run('INSERT INTO point_transfer_requests(staff_id,staff_name,staff_role,from_location,to_location,reason,status,requested_at,reviewed_at,reviewed_by) VALUES(?,?,?,?,?,?,?,?,?,?)',
          [s.staff_id,s.name,s.role,s.location_code||'',to,reason||'Direct transfer by Admin','Direct',new Date().toISOString(),new Date().toISOString(),req.user.staff_id],res,()=>{
            audit(req.user,'POINT_TRANSFER_DIRECT',s.staff_id,`${s.location_code||''} -> ${to}${reason?` | ${reason}`:''}`);
            res.json({message:`Point changed successfully for ${s.staff_id}`,staff_id:s.staff_id,new_location:to});
          });
      });
    });
  });
});

app.put('/api/point-transfers/:id/reject',auth,roles('admin','master_admin'),(req,res)=>{
  get("SELECT * FROM point_transfer_requests WHERE id=?",[req.params.id],(e,r)=>{
    if(e)return res.status(500).json({error:e.message}); if(!r)return res.status(404).json({error:'Transfer request not found'});
    if(r.status!=='Pending')return res.status(409).json({error:'Request already reviewed'});
    run("UPDATE point_transfer_requests SET status='Rejected',reviewed_at=?,reviewed_by=? WHERE id=?",[new Date().toISOString(),req.user.staff_id,r.id],res,()=>{audit(req.user,'POINT_TRANSFER_REJECTED',r.staff_id,r.to_location);res.json({message:'Point transfer rejected'});});
  });
});

// RELIEVER NOTIFICATIONS - Staff receive a notification whenever Admin/Director assigns reliever duty.
app.get('/api/reliever-notifications',auth,(req,res)=>all('SELECT * FROM reliever_notifications WHERE staff_id=? ORDER BY id DESC LIMIT 50',[req.user.staff_id],res));
app.put('/api/reliever-notifications/:id/read',auth,(req,res)=>run('UPDATE reliever_notifications SET read_at=? WHERE id=? AND staff_id=?',[new Date().toISOString(),req.params.id,req.user.staff_id],res,()=>res.json({message:'Notification marked as read'})));

// Notice / Help.
app.get('/api/notices',auth,(req,res)=>{ const sql=['admin','master_admin'].includes(req.user.role) ? 'SELECT * FROM notices ORDER BY id DESC LIMIT 200' : "SELECT * FROM notices WHERE to_role=? OR to_role='all' OR from_role=? ORDER BY id DESC LIMIT 200"; all(sql,['admin','master_admin'].includes(req.user.role)?[]:[req.user.role,req.user.role],res); });
app.post('/api/notices',auth,(req,res)=>{const x=req.body||{}; if(!x.to_role||!x.message)return res.status(400).json({error:'Recipient and message required'}); run('INSERT INTO notices(from_role,to_role,message,created_at) VALUES(?,?,?,?)',[req.user.role,x.to_role,x.message,new Date().toISOString()],res,()=>res.status(201).json({message:'Notice sent'}));});
app.get('/api/help',auth,(req,res)=>{ const sql=['admin','master_admin'].includes(req.user.role)?'SELECT * FROM help_requests ORDER BY id DESC LIMIT 200':'SELECT * FROM help_requests WHERE from_role=? ORDER BY id DESC LIMIT 200'; all(sql,['admin','master_admin'].includes(req.user.role)?[]:[req.user.role],res); });
app.post('/api/help',auth,(req,res)=>{const x=req.body||{}; if(!x.message)return res.status(400).json({error:'Help message required'}); run('INSERT INTO help_requests(from_role,message,created_at) VALUES(?,?,?)',[req.user.role,x.message,new Date().toISOString()],res,()=>res.status(201).json({message:'Help request sent'}));});

// REPORTS + AUDIT LOGS - Admin only.
app.get('/api/reports/summary',auth,roles('admin','master_admin'),(req,res)=>{
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
app.get('/api/audit-logs',auth,roles('admin','master_admin'),(req,res)=>{
  const limit=Math.min(500,Math.max(1,Number(req.query.limit||200)));
  all(`SELECT * FROM audit_logs ORDER BY id DESC LIMIT ${limit}`,[],res);
});
app.get('/api/audit-logs/export',auth,roles('admin','master_admin'),(req,res)=>{
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
app.get('/api/reports/payroll/export',auth,roles('admin','master_admin'),(req,res)=>{
  const month=/^\\d{4}-\\d{2}$/.test(String(req.query.month||''))?String(req.query.month):new Date().toISOString().slice(0,7);
  all(`SELECT s.staff_id,s.name,s.role,s.location_code,s.salary,
    COALESCE((SELECT SUM(amount) FROM fines f WHERE f.guard_id=s.staff_id AND substr(f.created_at,1,7)=?),0) fine,
    COALESCE((SELECT SUM(amount) FROM advances a WHERE a.staff_id=s.staff_id AND substr(a.created_at,1,7)=?),0) advance,
    COALESCE((SELECT SUM(amount) FROM payments p WHERE p.staff_id=s.staff_id AND substr(p.paid_at,1,7)=?),0) paid
    FROM staff s WHERE s.role IN ('field_officer','officer','supervisor','guard') ORDER BY s.role,s.staff_id`,[month,month,month],res);
});

// Login supports exactly four roles.
app.post('/api/login',async(req,res)=>{
  const staffId=String(req.body?.staff_id||'').trim();
  const password=String(req.body?.password??'');
  const selectedRole=String(req.body?.role||'').trim().toLowerCase();
  const validRoles=['master_admin','admin','field_officer','officer','supervisor','guard'];
  if(!staffId||!password)return res.status(400).json({error:'Staff ID and password are required'});
  if(selectedRole && !validRoles.includes(selectedRole))return res.status(400).json({error:'Invalid login role'});

  get('SELECT id,role,name,staff_id,password,post,salary,location_code,parent_id,status,suspended_until,dob,department,contact_number,dp,age,height,weight,blood_group,qualification,physical_level,medical_level,skills,police_verification,driving_license,training_details,work_experience,photo_front,photo_back,photo_left,photo_right,is_reliever FROM staff WHERE staff_id=? LIMIT 1',[staffId],async(err,user)=>{
    if(err)return res.status(500).json({error:err.message});
    if(!user)return res.status(401).json({error:'Staff ID not found'});

    let passwordOk=false;
    try{passwordOk=await bcrypt.compare(password,String(user.password));}catch(e){passwordOk=false;}
    if(!passwordOk && String(user.password)===password){
      passwordOk=true;
      try{
        const hashed=await bcrypt.hash(password,12);
        db.run('UPDATE staff SET password=? WHERE id=?',[hashed,user.id],()=>{});
      }catch(e){}
    }
    if(!passwordOk)return res.status(401).json({error:'Incorrect password'});
    if(user.status==='suspended'&&user.suspended_until&&new Date(user.suspended_until)>new Date()){
      return res.status(403).json({error:`Account suspended until ${new Date(user.suspended_until).toLocaleString()}`});
    }

    const redirect={
      master_admin:'admin.html',
      admin:'admin.html',
      field_officer:'field-officer.html',
      officer:'officer.html',
      supervisor:'supervisor.html',
      guard:'guard.html'
    }[user.role];
    if(!redirect)return res.status(403).json({error:'This account has no valid dashboard role'});

    audit({staff_id:user.staff_id,role:user.role},'LOGIN_SUCCESS',user.staff_id,selectedRole&&selectedRole!==user.role?`Successful login; selected role ${selectedRole} corrected to ${user.role}`:'Successful login');
    delete user.password;
    res.json({message:'Login successful',redirect,user});
  });
});

app.get('/api/stats',auth,(req,res)=>{
  const today=new Date().toISOString().slice(0,10);
  const month=today.slice(0,7);
  const sql=`SELECT
    (SELECT COUNT(*) FROM staff WHERE status='active') staff,
    (SELECT COUNT(*) FROM staff WHERE status='active' AND role='guard') total_guards,
    (SELECT COUNT(DISTINCT staff_id) FROM attendance WHERE date=? AND (attendance_status='Present' OR attendance_status IS NULL)) present,
    (SELECT COUNT(DISTINCT staff_id) FROM attendance WHERE date=? AND check_in IS NOT NULL AND check_out IS NULL AND (attendance_status='Present' OR attendance_status IS NULL)) on_duty,
    (SELECT COUNT(*) FROM staff WHERE status='active' AND role='guard' AND staff_id NOT IN (SELECT DISTINCT staff_id FROM attendance WHERE date=? AND (attendance_status='Present' OR attendance_status IS NULL))) absent_guards,
    (SELECT COUNT(*) FROM staff WHERE is_reliever=1 AND status='active') relievers,
    (SELECT COUNT(*) FROM locations) active_sites,
    (SELECT COALESCE(SUM(salary),0) FROM staff WHERE status='active' AND role IN ('guard','supervisor','officer','field_officer')) monthly_payroll,
    (SELECT COALESCE(SUM(amount),0) FROM fines) fine_total,
    (SELECT COALESCE(SUM(salary),0) FROM staff WHERE role='guard') salary_total
  `;
  db.get(sql,[today,today,today],(err,row)=>err?res.status(500).json({error:err.message}):res.json(row));
});
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
  duty_shift TEXT NOT NULL DEFAULT '12_hour',
  duty_hours INTEGER NOT NULL DEFAULT 12,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);
// Location duty-shift migration: 12-hour or 8-hour duty per location.
db.run("ALTER TABLE locations ADD COLUMN duty_shift TEXT NOT NULL DEFAULT '12_hour'",()=>{});
// Reliever shift migration: stores assigned duty hours and shift separately.
db.run("ALTER TABLE staff ADD COLUMN reliever_duty_hours INTEGER DEFAULT 12",()=>{});
db.run("ALTER TABLE staff ADD COLUMN reliever_shift TEXT DEFAULT 'Day Shift'",()=>{});
db.run("ALTER TABLE locations ADD COLUMN duty_hours INTEGER NOT NULL DEFAULT 12",()=>{});

// =====================================================

// SECTION: FUNCTION adminOnly

// =====================================================

function adminOnly(req, res, next) {
  auth(req,res,()=>roles('admin','master_admin')(req,res,next));
}

// END SECTION: FUNCTION adminOnly


// =====================================================
// LOCATION OWNERSHIP / ASSIGNMENT TABLE
// Safe migration for older single-location records is included below.
// =====================================================
db.run(`CREATE TABLE IF NOT EXISTS location_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id TEXT NOT NULL,
  location_code TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  assigned_at TEXT DEFAULT CURRENT_TIMESTAMP,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(staff_id,location_code)
)`);
db.run(`INSERT OR IGNORE INTO location_assignments(staff_id,location_code,assigned_by,active)
  SELECT staff_id,location_code,'system-migration',1 FROM staff
  WHERE role IN ('admin','field_officer') AND TRIM(COALESCE(location_code,''))<>''`);

// =====================================================
// SECTION: LOCATION SCOPE HELPERS
// Director sees all locations. Admin/Field Officer see only locations assigned to them.
// Supervisor/Guard see only their current location.
// =====================================================
function assignedLocations(staffId, cb){
  db.all(`SELECT la.location_code,l.name,l.address,l.latitude,l.longitude,l.radius_meters,l.duty_shift,l.duty_hours,l.active
          FROM location_assignments la JOIN locations l ON l.code=la.location_code
          WHERE la.staff_id=? AND la.active=1 AND l.active=1 ORDER BY l.code`,[staffId],cb);
}

function canUseLocation(req, code, cb){
  const location=String(code||'').trim();
  if(!location)return cb(null,false);
  if(req.user.role==='master_admin')return get('SELECT code FROM locations WHERE code=? AND active=1',[location],(e,r)=>cb(e,!!r));
  if(['admin','field_officer'].includes(req.user.role))return get(`SELECT la.id FROM location_assignments la JOIN locations l ON l.code=la.location_code
    WHERE la.staff_id=? AND la.location_code=? AND la.active=1 AND l.active=1 LIMIT 1`,[req.user.staff_id,location],(e,r)=>cb(e,!!r));
  cb(null,String(req.user.location_code||'')===location);
}

// END SECTION: LOCATION SCOPE HELPERS

app.get('/api/locations', auth, (req, res) => {
  if(req.user.role==='master_admin') return all('SELECT * FROM locations ORDER BY code ASC',[],res);
  if(['admin','field_officer'].includes(req.user.role)) return assignedLocations(req.user.staff_id,(err,rows)=>{
    if(err)return res.status(500).json({error:err.message});
    res.json(rows||[]);
  });
  if(req.user.location_code) return all('SELECT * FROM locations WHERE code=? AND active=1 ORDER BY code ASC',[req.user.location_code],res);
  res.json([]);
});

// LOCATION ASSIGNMENTS - only Director/Admin can distribute points.
app.get('/api/location-assignments', auth, roles('admin','master_admin'), (req,res)=>{
  const target=String(req.query.staff_id||'').trim();
  const sql=`SELECT la.id,la.staff_id,la.location_code,la.assigned_by,la.assigned_at,la.active,l.name,l.address,l.duty_shift,l.duty_hours
             FROM location_assignments la JOIN locations l ON l.code=la.location_code
             ${target?'WHERE la.staff_id=? AND la.active=1':'WHERE la.active=1'} ORDER BY la.staff_id,l.code`;
  all(sql,target?[target]:[],res);
});

app.post('/api/location-assignments', auth, roles('admin','master_admin'), (req,res)=>{
  const target=String(req.body?.staff_id||'').trim();
  const locations=Array.isArray(req.body?.location_codes)?[...new Set(req.body.location_codes.map(x=>String(x).trim()).filter(Boolean))]:[];
  if(!target||!locations.length)return res.status(400).json({error:'Staff ID and at least one Location Code are required'});
  get("SELECT id,role FROM staff WHERE staff_id=? AND status='active'",[target],(e,member)=>{
    if(e)return res.status(500).json({error:e.message});
    if(!member || !['admin','field_officer'].includes(member.role))return res.status(400).json({error:'Locations can only be assigned to Admin or Field Officer'});
    if(req.user.role==='admin' && member.role!=='field_officer')return res.status(403).json({error:'Admin can assign locations only to Field Officers'});
    const verify=()=>{
      db.serialize(()=>{
        db.run('UPDATE location_assignments SET active=0 WHERE staff_id=?',[target]);
        const stmt=db.prepare('INSERT OR IGNORE INTO location_assignments(staff_id,location_code,assigned_by,active) VALUES(?,?,?,1)');
        locations.forEach(code=>stmt.run(target,code,req.user.staff_id));
        stmt.finalize(err=>{
          if(err)return res.status(500).json({error:err.message});
          audit(req.user,'LOCATIONS_ASSIGNED',target,locations.join(', '));
          res.json({ok:true,staff_id:target,location_codes:locations});
        });
      });
    };
    const placeholders=locations.map(()=>'?').join(',');
    db.all(`SELECT code FROM locations WHERE active=1 AND code IN (${placeholders})`,locations,(le,rows)=>{
      if(le)return res.status(500).json({error:le.message});
      const valid=new Set((rows||[]).map(r=>r.code));
      const bad=locations.filter(x=>!valid.has(x));
      if(bad.length)return res.status(400).json({error:'Invalid or inactive Location Code: '+bad.join(', ')});
      // Admin may only distribute locations that are already assigned to that Admin. Master can distribute any.
      if(req.user.role==='master_admin')return verify();
      db.all(`SELECT location_code FROM location_assignments WHERE staff_id=? AND active=1 AND location_code IN (${placeholders})`,[req.user.staff_id,...locations],(ae,owned)=>{
        if(ae)return res.status(500).json({error:ae.message});
        const ownedSet=new Set((owned||[]).map(r=>r.location_code));
        const notOwned=locations.filter(x=>!ownedSet.has(x));
        if(notOwned.length)return res.status(403).json({error:'Admin can assign only its own assigned locations: '+notOwned.join(', ')});
        verify();
      });
    });
  });
});

// =====================================================
// SHIFT SCHEDULE MANAGEMENT
// Admin/Director select Staff ID + Location + 8/12 hour shift.
// =====================================================
db.run(`CREATE TABLE IF NOT EXISTS shift_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id TEXT NOT NULL,
  location_code TEXT NOT NULL,
  schedule_date TEXT NOT NULL,
  duty_hours INTEGER NOT NULL,
  shift TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(staff_id,location_code,schedule_date)
)`);

function shiftsForHours(hours){
  return Number(hours)===8
    ? ['Morning Shift','Evening Shift','Night Shift 8H']
    : ['Day Shift','Night Shift'];
}

// =====================================================
// SECTION: EFFECTIVE SHIFT LOOKUP
// A staff member keeps the latest assigned shift until a
// new effective date is created or the existing assignment
// is changed. This makes Shift Schedule persistent.
// =====================================================
function getEffectiveShift(staffId, locationCode, date, cb){
  get(`SELECT duty_hours,shift,schedule_date FROM shift_schedules
       WHERE staff_id=? AND location_code=? AND schedule_date<=?
       ORDER BY schedule_date DESC,id DESC LIMIT 1`,
    [staffId,locationCode,date],cb);
}
// END SECTION: EFFECTIVE SHIFT LOOKUP


app.get('/api/shift-schedules',auth,roles('admin','master_admin'),(req,res)=>{
  const date=String(req.query.date||'').trim();
  const target=String(req.query.staff_id||'').trim();
  let sql=`SELECT ss.*,s.name,s.role,l.name AS location_name FROM shift_schedules ss
           LEFT JOIN staff s ON s.staff_id=ss.staff_id LEFT JOIN locations l ON l.code=ss.location_code`;
  const params=[]; const where=[];
  if(date){where.push('ss.schedule_date<=?');params.push(date)}
  if(target){where.push('ss.staff_id=?');params.push(target)}
  if(req.user.role==='admin'){where.push(`ss.location_code IN (SELECT location_code FROM location_assignments WHERE staff_id=? AND active=1)`);params.push(req.user.staff_id)}
  if(where.length)sql+=' WHERE '+where.join(' AND ');
  sql+=' ORDER BY ss.schedule_date DESC,ss.location_code,ss.staff_id';
  all(sql,params,res);
});

app.post('/api/shift-schedules',auth,roles('admin','master_admin'),(req,res)=>{
  const staffId=String(req.body?.staff_id||'').trim(), location=String(req.body?.location_code||'').trim();
  const date=String(req.body?.schedule_date||new Date().toISOString().slice(0,10)).trim();
  const requestedDuty=Number(req.body?.duty_hours)===8?8:12; const shift=String(req.body?.shift||'').trim();
  if(!staffId||!location||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!shiftsForHours(requestedDuty).includes(shift))return res.status(400).json({error:'Staff ID, Location, valid effective date and matching shift are required'});
  canUseLocation(req,location,(ce,allowed)=>{
    if(ce)return res.status(500).json({error:ce.message}); if(!allowed)return res.status(403).json({error:'You cannot schedule a location outside your assigned points'});
    get('SELECT duty_hours FROM locations WHERE code=? AND active=1',[location],(le,loc)=>{
      if(le)return res.status(500).json({error:le.message}); if(!loc)return res.status(404).json({error:'Active location not found'});
      const dutyHours=Number(loc.duty_hours)===8?8:12;
      if(requestedDuty!==dutyHours)return res.status(400).json({error:`This location is configured for ${dutyHours} Hours. Select a matching shift.`});
      get('SELECT id,role,status,location_code,parent_id FROM staff WHERE staff_id=?',[staffId],(e,s)=>{
        if(e)return res.status(500).json({error:e.message}); if(!s||s.status!=='active')return res.status(404).json({error:'Active Staff ID not found'});
        if(['guard','supervisor'].includes(s.role) && String(s.location_code||'')!==location)return res.status(400).json({error:'Staff location does not match selected location'});
        if(s.role==='field_officer'){
          return get('SELECT id FROM location_assignments WHERE staff_id=? AND location_code=? AND active=1',[staffId,location],(ae,ar)=>{
            if(ae)return res.status(500).json({error:ae.message}); if(!ar)return res.status(400).json({error:'This Field Officer is not assigned to the selected location'}); save();
          });
        }
        save();
      });
      function save(){run(`INSERT INTO shift_schedules(staff_id,location_code,schedule_date,duty_hours,shift,created_by) VALUES(?,?,?,?,?,?)
        ON CONFLICT(staff_id,location_code,schedule_date) DO UPDATE SET duty_hours=excluded.duty_hours,shift=excluded.shift,created_by=excluded.created_by,created_at=CURRENT_TIMESTAMP`,
        [staffId,location,date,dutyHours,shift,req.user.staff_id],res,()=>{audit(req.user,'SHIFT_SCHEDULE_SET',staffId,`${date}; ${location}; ${dutyHours}h; ${shift}`);res.json({ok:true,message:`Shift assigned from ${date}. It will remain ${shift} until changed.`});});}
    });
  });
});

app.delete('/api/shift-schedules/:id',auth,roles('admin','master_admin'),(req,res)=>{
  get('SELECT location_code FROM shift_schedules WHERE id=?',[req.params.id],(e,row)=>{
    if(e)return res.status(500).json({error:e.message}); if(!row)return res.status(404).json({error:'Schedule not found'});
    canUseLocation(req,row.location_code,(ce,allowed)=>{if(ce)return res.status(500).json({error:ce.message});if(!allowed)return res.status(403).json({error:'You cannot delete a schedule outside your assigned points'});run('DELETE FROM shift_schedules WHERE id=?',[req.params.id],res,()=>res.json({ok:true}));});
  });
});

// =====================================================
// ADDRESS -> GPS GEOCODING
// OpenStreetMap Nominatim is used only when an admin presses Get GPS.
// =====================================================
app.get('/api/geocode',auth,roles('admin','master_admin'),async(req,res)=>{
  const q=String(req.query.q||'').trim(); if(!q)return res.status(400).json({error:'Address is required'});
  try{
    const r=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q='+encodeURIComponent(q),{headers:{'User-Agent':'SNDF-Management/1.0'}});
    if(!r.ok)return res.status(502).json({error:'Geocoding service unavailable'});
    const rows=await r.json(); if(!rows?.length)return res.status(404).json({error:'Address not found. Try a more complete address.'});
    res.json({latitude:Number(rows[0].lat),longitude:Number(rows[0].lon),display_name:rows[0].display_name||q});
  }catch(e){res.status(502).json({error:'Unable to get GPS from address right now'});}
});

app.delete('/api/location-assignments/:id', auth, roles('admin','master_admin'), (req,res)=>{
  get('SELECT * FROM location_assignments WHERE id=? AND active=1',[req.params.id],(e,row)=>{
    if(e)return res.status(500).json({error:e.message}); if(!row)return res.status(404).json({error:'Assignment not found'});
    if(req.user.role==='admin')return get(`SELECT 1 FROM location_assignments WHERE staff_id=? AND location_code=? AND active=1`,[req.user.staff_id,row.location_code],(ae,owned)=>{
      if(ae)return res.status(500).json({error:ae.message}); if(!owned)return res.status(403).json({error:'You cannot remove a location outside your assigned points'});
      run('UPDATE location_assignments SET active=0 WHERE id=?',[req.params.id],res,()=>res.json({ok:true}));
    });
    run('UPDATE location_assignments SET active=0 WHERE id=?',[req.params.id],res,()=>res.json({ok:true}));
  });
});

app.get('/api/location-ownership', auth, roles('admin','master_admin'), (req,res)=>{
  if(req.user.role==='master_admin') return all(`SELECT l.code,l.name,l.address,l.active,la.id,la.staff_id,s.name AS staff_name,s.role,la.assigned_by,la.assigned_at
       FROM locations l LEFT JOIN location_assignments la ON la.location_code=l.code AND la.active=1
       LEFT JOIN staff s ON s.staff_id=la.staff_id ORDER BY l.code,s.role,s.staff_id`,[],res);
  all(`SELECT l.code,l.name,l.address,l.active,la.id,la.staff_id,s.name AS staff_name,s.role,la.assigned_by,la.assigned_at
       FROM locations l LEFT JOIN location_assignments la ON la.location_code=l.code AND la.active=1
       LEFT JOIN staff s ON s.staff_id=la.staff_id
       WHERE l.code IN (SELECT location_code FROM location_assignments WHERE staff_id=? AND active=1)
       ORDER BY l.code,s.role,s.staff_id`,[req.user.staff_id],res);
});


app.post('/api/locations', adminOnly, (req, res) => {
  const { code, name, address = '', latitude, longitude, radius_meters = 200, duty_shift = '12_hour', is_main_office = 0 } = req.body || {};
  const lat = Number(latitude), lng = Number(longitude), radius = Number(radius_meters);
  const duty = String(duty_shift) === '8_hour' ? 8 : (String(duty_shift) === '12_hour' ? 12 : 0);
  if (!code || !name || !duty || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius) || radius <= 0) {
    return res.status(400).json({ error: 'Code, name, latitude, longitude, valid radius and duty shift are required' });
  }
  const codeValue = String(code).trim();
  const nameValue = String(name).trim();

  db.run(
    `INSERT INTO locations (code,name,address,latitude,longitude,radius_meters,duty_shift,duty_hours,is_main_office)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [codeValue, nameValue, String(address).trim(), lat, lng, Math.round(radius), String(duty_shift), duty, is_main_office ? 1 : 0],
    function(err) {
      if (err) {
        if (String(err.message||'').toLowerCase().includes('unique')) return res.status(409).json({ error: `Location Code ${codeValue} already exists. Use a unique Location Code.` });
        return res.status(400).json({ error: err.message });
      }
      const locationId = this.lastID;
      if(is_main_office){
        db.run('UPDATE locations SET is_main_office=0 WHERE id<>?',[locationId]);
      }

      // An Admin owns locations it creates, so the new point is immediately usable
      // in Location Distribution and normal Admin location selectors.
      if (req.user.role === 'admin') {
        return db.run(
          `INSERT OR IGNORE INTO location_assignments(staff_id,location_code,assigned_by,active) VALUES(?,?,?,1)`,
          [req.user.staff_id, codeValue, req.user.staff_id],
          assignErr => {
            if (assignErr) return res.status(500).json({ error: assignErr.message });
            audit(req.user,'LOCATION_CREATED',codeValue,`${String(name).trim()} • ${duty}h`);
            res.json({ ok: true, id: locationId, code: codeValue, message: 'Location saved and assigned to Admin' });
          }
        );
      }

      audit(req.user,'LOCATION_CREATED',codeValue,`${String(name).trim()} • ${duty}h`);
      res.json({ ok: true, id: locationId, code: codeValue, message: 'Location saved successfully' });
    }
  );
});

app.put('/api/locations/:id', adminOnly, (req, res) => {
  const { code, name, address = '', latitude, longitude, radius_meters = 200, duty_shift = '12_hour', active = 1, is_main_office = 0 } = req.body || {};
  const lat = Number(latitude), lng = Number(longitude), radius = Number(radius_meters);
  const duty = String(duty_shift) === '8_hour' ? 8 : (String(duty_shift) === '12_hour' ? 12 : 0);
  if (!code || !name || !duty || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius) || radius <= 0) {
    return res.status(400).json({ error: 'Code, name, latitude, longitude, valid radius and duty shift are required' });
  }
  const newCode = String(code).trim();

  db.get('SELECT code FROM locations WHERE id=?',[req.params.id],(findErr,existing)=>{
    if(findErr)return res.status(500).json({error:findErr.message});
    if(!existing)return res.status(404).json({error:'Location not found'});

    const continueUpdate = () => db.run(
      `UPDATE locations SET code=?,name=?,address=?,latitude=?,longitude=?,radius_meters=?,duty_shift=?,duty_hours=?,active=?,is_main_office=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [newCode, String(name).trim(), String(address).trim(), lat, lng, Math.round(radius), String(duty_shift), duty, active ? 1 : 0, is_main_office ? 1 : 0, req.params.id],
      function(err) {
        if (err) {
          if (String(err.message||'').toLowerCase().includes('unique')) return res.status(409).json({ error: `Location Code ${newCode} already exists. Use a unique Location Code.` });
          return res.status(400).json({ error: err.message });
        }
        if (!this.changes) return res.status(404).json({ error: 'Location not found' });
        if(is_main_office) db.run('UPDATE locations SET is_main_office=0 WHERE id<>?',[req.params.id]);

        // Keep all existing ownership records connected if the location code changes.
        if(existing.code!==newCode){
          db.run('UPDATE location_assignments SET location_code=? WHERE location_code=?',[newCode,existing.code],assignmentErr=>{
            if(assignmentErr)return res.status(500).json({error:assignmentErr.message});
            db.run('UPDATE staff SET location_code=? WHERE location_code=?',[newCode,existing.code],staffErr=>{
              if(staffErr)return res.status(500).json({error:staffErr.message});
              db.run('UPDATE shift_schedules SET location_code=? WHERE location_code=?',[newCode,existing.code],()=>{});
              audit(req.user,'LOCATION_UPDATED',newCode,`${existing.code} → ${newCode}`);
              res.json({ ok: true, code:newCode });
            });
            return;
          });
        } else {
          audit(req.user,'LOCATION_UPDATED',newCode,'Location details updated');
          res.json({ ok: true, code:newCode });
        }
      }
    );

    if(req.user.role==='admin'){
      return get(
        'SELECT 1 FROM location_assignments WHERE staff_id=? AND location_code=? AND active=1 LIMIT 1',
        [req.user.staff_id, existing.code],
        (ownerErr,owned)=>{
          if(ownerErr)return res.status(500).json({error:ownerErr.message});
          if(!owned)return res.status(403).json({error:'You cannot edit a location outside your assigned points'});
          continueUpdate();
        }
      );
    }
    continueUpdate();
  });
});

app.delete('/api/locations/:id', adminOnly, (req, res) => {
  db.get('SELECT code FROM locations WHERE id=?',[req.params.id],(findErr,existing)=>{
    if(findErr)return res.status(500).json({error:findErr.message});
    if(!existing)return res.status(404).json({error:'Location not found'});

    const continueDelete = () => db.serialize(()=>{
      db.run('DELETE FROM location_assignments WHERE location_code=?',[existing.code]);
      db.run('DELETE FROM shift_schedules WHERE location_code=?',[existing.code]);
      // Keep staff records valid after a location is deleted.
      db.run('UPDATE staff SET location_code=? WHERE location_code=?',['',existing.code]);
      db.run('DELETE FROM locations WHERE id=?',[req.params.id],function(err){
        if(err)return res.status(500).json({error:err.message});
        if(!this.changes)return res.status(404).json({error:'Location not found'});
        audit(req.user,'LOCATION_DELETED',existing.code,'Location and related assignments removed');
        res.json({ok:true});
      });
    });

    if(req.user.role==='admin'){
      return get(
        'SELECT 1 FROM location_assignments WHERE staff_id=? AND location_code=? AND active=1 LIMIT 1',
        [req.user.staff_id, existing.code],
        (ownerErr,owned)=>{
          if(ownerErr)return res.status(500).json({error:ownerErr.message});
          if(!owned)return res.status(403).json({error:'You cannot delete a location outside your assigned points'});
          continueDelete();
        }
      );
    }
    continueDelete();
  });
});

// =====================================================
// SECTION: API ERROR HANDLING
// Return JSON for malformed JSON requests and unknown API endpoints.
// This prevents frontend fetch() calls from receiving an HTML error page.
// =====================================================
app.use('/api', (err, req, res, next) => {
  if (err) {
    console.error('API error:', err.message);
    return res.status(err.status || 400).json({error: err.message || 'Invalid API request'});
  }
  next();
});

app.use('/api', (req,res,next)=>{
  if (!res.headersSent) return res.status(404).json({error:'API endpoint not found'});
  next();
});

// END SECTION: API ERROR HANDLING

setInterval(scanPointPushDue,30000);
setTimeout(scanPointPushDue,5000);

app.listen(PORT,'0.0.0.0',()=>console.log(`SNDF backend running on port ${PORT}`));
