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


  // MASTER ADMIN bootstrap: one permanent top-level account.
  // Master Admin controls Admin + Field Officer + Supervisor + Guard.
  db.get("SELECT id,role FROM staff WHERE staff_id='adi123' LIMIT 1", (masterErr, masterRow) => {
    const ensureMaster = () => {
      bcrypt.hash('sndf1234', 12, (hashErr, hashedPassword) => {
        if(hashErr){ console.error('Master Admin password hash failed:', hashErr.message); return; }
        db.run(`INSERT INTO staff(role,name,staff_id,password,post,salary,location_code,parent_id,department,status)
                VALUES('master_admin','SNDF Master Admin','adi123',?,'Master Admin',0,'','','Management','active')
                ON CONFLICT(staff_id) DO UPDATE SET role='master_admin',post='Master Admin',name='SNDF Master Admin',password=excluded.password,status='active'`,
          [hashedPassword], (e)=>{ if(e) console.error('Master Admin bootstrap failed:',e.message); else console.log('Master Admin ready: adi123'); });
      });
    };
    if(masterErr) console.error('Master Admin lookup failed:', masterErr.message);
    else if(!masterRow || masterRow.role!=='master_admin') ensureMaster();
  });

  // Production database intentionally starts with Master Admin only.
  // Real Admin accounts must be created explicitly from Master Admin -> Create / Manage Members.
});

// =====================================================
// WEB PUSH NOTIFICATIONS
// Push keys are generated once and persisted in the configured data directory so
// subscriptions survive server restarts. For stricter production secret management,
// WEB_PUSH_PUBLIC_KEY / WEB_PUSH_PRIVATE_KEY may be supplied as environment variables.
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

function sendPushToStaff(staffId,payload,done=()=>{}){
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

// Authentication for protected APIs. Frontend sends x-staff-id + x-role after login.
function audit(actor, action, targetId, details=''){
  db.run(`INSERT INTO audit_logs(actor_id,actor_role,action,target_id,details,created_at) VALUES(?,?,?,?,?,?)`,
    [actor?.staff_id||'',actor?.role||'',action,String(targetId||''),String(details||''),new Date().toISOString()],
    ()=>{});
}
function distanceMeters(lat1,lng1,lat2,lng2){
  const R=6371000, rad=Math.PI/180, dLat=(lat2-lat1)*rad, dLng=(lng2-lng1)*rad;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
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
  all(`SELECT id,role,name,staff_id,post,salary,location_code,parent_id,status,suspended_until,suspension_reason,dob,department,contact_number,dp,
      age,height,weight,blood_group,qualification,physical_level,medical_level,skills,police_verification,driving_license,
      training_details,work_experience,photo_front,photo_back,photo_left,photo_right,is_reliever FROM staff ORDER BY id DESC`,[],res);
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

app.post('/api/staff',auth,roles('admin','master_admin','field_officer','officer','supervisor'),(req,res)=>{
  const x=req.body||{};
  const role=['admin','field_officer','officer','supervisor','guard'].includes(x.role)?x.role:null;
  if(!role || !x.name || !x.staff_id || !x.password) return res.status(400).json({error:'Role, name, Staff ID and password are required'});
  if(role==='admin' && req.user.role!=='master_admin') return res.status(403).json({error:'Only Master Admin can create a new Admin'});
  const createTargets={master_admin:['admin','field_officer','officer','supervisor','guard'],admin:['field_officer','officer','supervisor','guard'],field_officer:['officer'],officer:['supervisor'],supervisor:['guard'],guard:[]};
  if(!createTargets[req.user.role]?.includes(role)) return res.status(403).json({error:`${req.user.role} cannot create ${role}`});
  if(role==='master_admin') return res.status(403).json({error:'Master Admin account is controlled by the system'});
  const location=String(x.location_code||'').trim(), parent=role==='admin' ? 'adi123' : String(x.parent_id||'').trim();
  const finish=()=>{
    bcrypt.hash(String(x.password),12,(he,hashed)=>{
      if(he)return res.status(500).json({error:'Password setup failed'});
      run(`INSERT INTO staff(role,name,staff_id,password,post,salary,location_code,parent_id,dob,department,contact_number,dp,age,height,weight,blood_group,qualification,physical_level,medical_level,skills,police_verification,driving_license,training_details,work_experience,photo_front,photo_back,photo_left,photo_right,is_reliever) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [role,x.name,x.staff_id,hashed,x.post||role,x.salary||0,location,parent,x.dob||'',x.department||'',x.contact_number||'',x.dp||'',
         x.age||null,x.height||null,x.weight||null,x.blood_group||'',x.qualification||'',x.physical_level||'',x.medical_level||'',x.skills||'',x.police_verification||'',x.driving_license||'',x.training_details||'',x.work_experience||'',x.photo_front||'',x.photo_back||'',x.photo_left||'',x.photo_right||'',Number(x.is_reliever)?1:0],res,row=>{
          audit(req.user,'STAFF_CREATED',x.staff_id,`${role} ${x.name} created`);
          res.status(201).json({id:row.lastID,message:'Staff created'});
        });
    });
  };
  const validateLocation=(next)=>{
    if(role==='admin' || (role==='field_officer' && !location)) return next();
    if(!location)return res.status(400).json({error:'Please create/select a Location Code first'});
    get('SELECT code FROM locations WHERE code=? AND active=1',[location],(le,lr)=>{
      if(le)return res.status(500).json({error:le.message});
      if(!lr)return res.status(400).json({error:'Invalid or inactive Location Code. Create the location first.'});
      next();
    });
  };
  validateLocation(()=>{
    if(role==='officer')return get('SELECT role FROM staff WHERE staff_id=?',[parent],(e,p)=>{if(e)return res.status(500).json({error:e.message});if(!p||p.role!=='field_officer')return res.status(400).json({error:'Officer Parent ID must be a Field Officer ID'});finish();});
    if(role==='supervisor')return get('SELECT role FROM staff WHERE staff_id=?',[parent],(e,p)=>{if(e)return res.status(500).json({error:e.message});if(!p||p.role!=='officer')return res.status(400).json({error:'Supervisor Parent ID must be an Officer ID'});finish();});
    if(role==='guard')return get('SELECT role,location_code FROM staff WHERE staff_id=?',[parent],(e,p)=>{if(e)return res.status(500).json({error:e.message});if(!p||p.role!=='supervisor')return res.status(400).json({error:'Guard Parent ID must be a Supervisor ID'});if(p.location_code!==location)return res.status(400).json({error:'Guard location must match the Supervisor location'});finish();});
    finish();
  });
});
app.delete('/api/staff/:id',auth,roles('admin','master_admin'),(req,res)=>run('DELETE FROM staff WHERE id=?',[req.params.id],res,()=>res.json({message:'Deleted'})));

// ADMIN PROFILE RECORD EDIT - Admin only. Password is updated only when a new one is supplied.
app.put('/api/staff/:id/profile',auth,roles('admin','master_admin'),(req,res)=>{
  const x=req.body||{};
  get('SELECT * FROM staff WHERE id=?',[req.params.id],(err,s)=>{
    if(err)return res.status(500).json({error:err.message});
    if(!s)return res.status(404).json({error:'Staff not found'});
    if(s.role==='master_admin')return res.status(403).json({error:'Master Admin profile is protected'});
    if(s.role==='admin' && req.user.role!=='master_admin')return res.status(403).json({error:'Only Master Admin can manage Admin profiles'});
    const newRole=['field_officer','officer','supervisor','guard'].includes(x.role)?x.role:s.role;
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
    if(newRole==='officer' && parent){
      return get('SELECT role FROM staff WHERE staff_id=?',[parent],(pe,p)=>{ if(pe)return res.status(500).json({error:pe.message}); if(!p || p.role!=='field_officer')return res.status(400).json({error:'Officer Parent ID must be a Field Officer ID'}); save(); });
    }
    if(newRole==='supervisor' && parent){
      return get('SELECT role FROM staff WHERE staff_id=?',[parent],(pe,p)=>{ if(pe)return res.status(500).json({error:pe.message}); if(!p || p.role!=='officer')return res.status(400).json({error:'Supervisor Parent ID must be an Officer ID'}); save(); });
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
    };
    validateEditLocation(continueEdit);
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
app.get('/api/profile/me',auth,(req,res)=>res.json({user:req.user}));
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

app.post('/api/relievers/assign',auth,roles('admin','master_admin'),async(req,res)=>{
  const staffId=String(req.body?.staff_id||'').trim(), location=String(req.body?.location_code||'').trim();
  const shift=SHIFT_SCHEDULES[req.body?.shift]?req.body.shift:'Day Shift';
  if(!staffId||!location)return res.status(400).json({error:'Select Reliever and Location'});
  get('SELECT * FROM staff WHERE staff_id=? AND role IN ("guard","supervisor")',[staffId],async(e,s)=>{
    if(e)return res.status(500).json({error:e.message}); if(!s)return res.status(404).json({error:'Reliever Guard/Supervisor not found'});
    if(s.status!=='active')return res.status(400).json({error:'Only active staff can be assigned as Reliever'});
    get('SELECT code FROM locations WHERE code=? AND active=1',[location],async(le,lr)=>{
      if(le)return res.status(500).json({error:le.message}); if(!lr)return res.status(400).json({error:'Invalid or inactive Location Code'});
      run('UPDATE staff SET is_reliever=1,location_code=? WHERE id=?',[location,s.id],res,async()=>{
        const text=`SNDF MANAGEMENT – Reliever Duty\n\nHello ${s.name},\nYou have been assigned as a RELIEVER.\n\nLocation: ${location}\nShift: ${shift}\nStaff ID: ${s.staff_id}\nAssigned by: ${req.user.name||req.user.staff_id}\n\nPlease report to the assigned location and complete live attendance check-in.\n\nSNDF Support Services\nWhatsApp: ${process.env.WHATSAPP_SENDER_NUMBER||'8959872715'}`;
        const wa=await sendWhatsAppMessage(s.contact_number,text);
        audit(req.user,'RELIEVER_ASSIGNED',s.staff_id,`${location}; ${shift}; whatsapp=${wa.sent?'sent':'not-sent'}`);
        res.json({message:'Reliever assignment saved',whatsapp_sent:wa.sent,whatsapp_url:wa.whatsapp_url||'',whatsapp_sender:wa.sender,whatsapp_error:wa.error||''});
      });
    });
  });
});

// RELIEVER MANAGEMENT - Admin selects Guard/Supervisor, can change their location and mark a reliever check-in.
app.get('/api/relievers',auth,roles('admin','master_admin'),(req,res)=>{
  all(`SELECT id,role,name,staff_id,location_code,parent_id,status,is_reliever FROM staff
       WHERE role IN ('guard','supervisor') ORDER BY role,name`,[],res);
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
    if(!['guard','supervisor'].includes(s.role))return res.status(400).json({error:'Reliever location can be changed only for Guard/Supervisor'});
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
  const shift=SHIFT_SCHEDULES[x.shift]?x.shift:'Day Shift';
  if(!targetId||!location)return res.status(400).json({error:'Select reliever and location'});
  get('SELECT * FROM staff WHERE staff_id=? AND role IN ("guard","supervisor")',[targetId],(err,s)=>{
    if(err)return res.status(500).json({error:err.message});
    if(!s)return res.status(404).json({error:'Reliever Guard/Supervisor not found'});
    if(!s.is_reliever)return res.status(403).json({error:'Selected member is not marked as Reliever'});
    const now=new Date(), date=now.toISOString().slice(0,10), time=now.toTimeString().slice(0,8), iso=now.toISOString();
    get('SELECT id FROM attendance WHERE staff_id=? AND date=? ORDER BY id DESC LIMIT 1',[targetId,date],(ae,existing)=>{
      if(ae)return res.status(500).json({error:ae.message});
      if(existing)return res.status(409).json({error:'Reliever already has attendance today'});
      db.run('UPDATE staff SET location_code=? WHERE id=?',[location,s.id],(ue)=>{
        if(ue)return res.status(500).json({error:ue.message});
        run('INSERT INTO attendance(staff_id,name,date,photo,location,shift,check_in,check_in_at,attendance_status) VALUES(?,?,?,?,?,?,?,?,?)',
          [s.staff_id,s.name,date,x.photo||'',location,shift,time,iso,'Present - Reliever Check-In'],res,row=>{
            audit(req.user,'RELIEVER_CHECKIN',s.staff_id,`${shift}; location=${location}`);
            res.status(201).json({id:row.lastID,message:'Reliever check-in saved'});
          });
      });
    });
  });
});

// TEAM ATTENDANCE - Supervisor sees only guards assigned to them; Field Officer sees assigned supervisors/guards.
app.get('/api/team-attendance',auth,roles('field_officer','officer','supervisor'),(req,res)=>{
  const parent=req.user.staff_id;
  let condition, params;
  if(req.user.role==='supervisor'){
    condition=`(s.parent_id=? OR s.reliever_parent_id=?) AND s.role='guard'`;
    params=[parent,parent];
  }else if(req.user.role==='officer'){
    condition=`((s.role='supervisor' AND (s.parent_id=? OR s.reliever_parent_id=?))
      OR (s.role='guard' AND (s.parent_id IN (SELECT staff_id FROM staff WHERE parent_id=?)
      OR s.reliever_parent_id IN (SELECT staff_id FROM staff WHERE parent_id=?))))`;
    params=[parent,parent,parent,parent];
  }else{
    // Field Officer sees the complete descendant chain: Officer -> Supervisor -> Guard.
    condition=`s.staff_id IN (
      WITH RECURSIVE descendants(staff_id) AS (
        SELECT staff_id FROM staff WHERE parent_id=? OR reliever_parent_id=?
        UNION
        SELECT s2.staff_id FROM staff s2 JOIN descendants d
          ON s2.parent_id=d.staff_id OR s2.reliever_parent_id=d.staff_id
      ) SELECT staff_id FROM descendants
    ) AND s.role IN ('officer','supervisor','guard')`;
    params=[parent,parent];
  }
  all(`SELECT a.*,s.role,s.location_code AS staff_location_code,s.parent_id,s.reliever_parent_id
       FROM attendance a JOIN staff s ON s.staff_id=a.staff_id
       WHERE ${condition} ORDER BY a.date DESC,a.id DESC`,params,res);
});


// =====================================================
// TASK MANAGEMENT - role hierarchy
// Master Admin -> Admin/Field Officer/Officer/Supervisor/Guard
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
function canAssignTask(from,to){ return (TASK_TARGETS[from]||[]).includes(to); }
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

    function createTaskForAssignee(s){
    if(s.status==='suspended')return res.status(403).json({error:'Cannot assign a task to a suspended member'});
    if(!canAssignTask(req.user.role,s.role))return res.status(403).json({error:`${labelRole(req.user.role)} cannot assign tasks to ${labelRole(s.role)}`});
    const priority=['Low','Normal','High','Urgent'].includes(x.priority)?x.priority:'Normal';
    run(`INSERT INTO tasks(title,description,priority,created_by,created_by_role,assigned_to,assigned_role,due_at,status,created_at)
         VALUES(?,?,?,?,?,?,?,?,'Pending',?)`,
      [String(x.title).trim(),String(x.description||'').trim(),priority,req.user.staff_id,req.user.role,s.staff_id,s.role,x.due_at||'',new Date().toISOString()],
      res,row=>{audit(req.user,'TASK_CREATED',s.staff_id,`${x.title}; priority=${priority}`);res.status(201).json({id:row.lastID,message:'Task created',assigned_to:s.staff_id,assigned_role:s.role});});
    }
  });
});
function labelRole(r){return ({master_admin:'Master Admin',admin:'Admin',field_officer:'Field Officer',officer:'Officer',supervisor:'Supervisor',guard:'Guard'}[r]||r)}
function taskAccess(task,user){
  return task && (task.assigned_to===user.staff_id || task.created_by===user.staff_id);
}
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
// Day Shift is not mandatory. Admin/Master Admin can monitor all submitted points.
// =====================================================
function pointShiftFromAttendance(row){ return row?.shift==='Night Shift' ? 'Night Shift' : (row?.shift||''); }
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

// Profile viewer for Admin/Master Admin. Read-only; no edit action is exposed.
app.get('/api/staff/:id/profile-view',auth,roles('admin','master_admin'),(req,res)=>{
  get(`SELECT id,role,name,staff_id,post,salary,location_code,parent_id,status,suspended_until,suspension_reason,dob,department,contact_number,dp,
      age,height,weight,blood_group,qualification,physical_level,medical_level,skills,police_verification,driving_license,
      training_details,work_experience,photo_front,photo_back,photo_left,photo_right,is_reliever FROM staff WHERE id=?`,[req.params.id],(e,row)=>{
    if(e)return res.status(500).json({error:e.message}); if(!row)return res.status(404).json({error:'Profile not found'});
    res.json(row);
  });
});


// PROFILE PDF DOWNLOAD - Admin/Master Admin only.
// Generates a real PDF and embeds all four full-body photos stored as data URLs.
function profileImageBuffer(value){
  const v=String(value||'');
  const m=v.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,(.+)$/i);
  if(!m)return null;
  try{return Buffer.from(m[1],'base64');}catch{return null;}
}
function pdfSafe(v){
  return String(v??'—').replace(/[^\x20-\x7E₹]/g,'?');
}
function addPdfField(doc,label,value,x,y,w=240){
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#555').text(pdfSafe(label),x,y,{width:w});
  doc.font('Helvetica').fontSize(10).fillColor('#111').text(pdfSafe(value||'—'),x,y+12,{width:w});
}
app.get('/api/staff/:id/profile-pdf',auth,roles('admin','master_admin'),(req,res)=>{
  get(`SELECT id,role,name,staff_id,post,salary,location_code,parent_id,status,suspended_until,suspension_reason,dob,department,contact_number,dp,
      age,height,weight,blood_group,qualification,physical_level,medical_level,skills,police_verification,driving_license,
      training_details,work_experience,photo_front,photo_back,photo_left,photo_right,is_reliever FROM staff WHERE id=?`,[req.params.id],(e,p)=>{
    if(e)return res.status(500).json({error:e.message});
    if(!p)return res.status(404).json({error:'Profile not found'});

    const roleLabel={master_admin:'Master Admin',admin:'Admin',field_officer:'Field Officer',supervisor:'Supervisor',guard:'Guard'}[p.role]||p.role;
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
function shiftForDutyHours(hours){ return Number(hours)===8 ? ['Morning Shift','Evening Shift','Night Shift 8H'] : ['Day Shift','Night Shift']; }
function isShiftAllowedForDuty(shift,hours){ return shiftForDutyHours(hours).includes(shift); }
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
app.post('/api/attendance',auth,(req,res)=>{
  const x=req.body||{};
  const targetId=['admin','master_admin'].includes(req.user.role) ? (x.staff_id||req.user.staff_id) : req.user.staff_id;
  get('SELECT * FROM staff WHERE staff_id=?',[targetId],(err,s)=>{
    if(err)return res.status(500).json({error:err.message}); if(!s)return res.status(404).json({error:'Staff ID not found'});
    if(!['admin','master_admin'].includes(req.user.role) && s.staff_id!==req.user.staff_id)return res.status(403).json({error:'You can mark attendance only for yourself'});
    get('SELECT duty_hours FROM locations WHERE code=? AND active=1',[s.location_code],(le,loc)=>{
    if(le)return res.status(500).json({error:le.message});
    const dutyHours=Number(loc?.duty_hours)===8?8:12;
    const shift=String(x.shift||'');
    if(!isShiftAllowedForDuty(shift,dutyHours)) return res.status(400).json({error:`Invalid shift for ${dutyHours}-hour location. Allowed: ${shiftForDutyHours(dutyHours).join(', ')}`});
    checkGeofence(s.location_code,x.location||'',(ge,geo)=>{
    if(ge)return res.status(500).json({error:ge.message});
    if(geo.configured && !geo.allowed) return res.status(403).json({error:geo.error||`You are outside ${s.location_code} geofence (${geo.distance}m / ${geo.radius}m).`});
    const now=new Date(), date=now.toISOString().slice(0,10), time=now.toTimeString().slice(0,8), iso=now.toISOString();
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
          [s.staff_id,s.name,date,x.photo||'',x.location||'',shift,dutyHours,time,iso,'Present - Shift Started'],res,row=>{audit(req.user,'ATTENDANCE_CHECKIN',s.staff_id,`${shift}; ${dutyHours} hour duty; location=${x.location||''}`);res.status(201).json({id:row.lastID,shift,shift_time:`${SHIFT_SCHEDULES[shift].start} - ${SHIFT_SCHEDULES[shift].end}`,duty_hours:dutyHours,message:`${shift} check-in saved (${dutyHours} hour duty)`});});
      });
    });
    });
    });
  });
});
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
  const x=req.body||{}; if(!x.target_id||!x.reason||Number(x.amount)<=0)return res.status(400).json({error:'Target ID, reason and positive fine amount are required'});
  get('SELECT role FROM staff WHERE staff_id=?',[x.target_id],(err,s)=>{if(err)return res.status(500).json({error:err.message}); if(!s)return res.status(404).json({error:'Target staff not found'}); if(!['guard','supervisor'].includes(s.role))return res.status(403).json({error:'Fine can only be issued to Guard or Supervisor'}); run('INSERT INTO fines(guard_id,reason,amount,issued_by,created_at) VALUES(?,?,?,?,?)',[x.target_id,x.reason,Number(x.amount),req.user.staff_id,new Date().toISOString()],res,row=>res.status(201).json({id:row.lastID,message:'Fine added'}));});
});

// ADVANCE - Admin only.
app.get('/api/advances',auth,(req,res)=>{ const sql=['admin','master_admin'].includes(req.user.role)?'SELECT * FROM advances ORDER BY id DESC':'SELECT * FROM advances WHERE staff_id=? ORDER BY id DESC'; all(sql,['admin','master_admin'].includes(req.user.role)?[]:[req.user.staff_id],res); });
app.post('/api/advances',auth,roles('admin','master_admin'),(req,res)=>{const x=req.body||{}; if(!x.staff_id||Number(x.amount)<=0)return res.status(400).json({error:'Staff ID and positive advance are required'}); run('INSERT INTO advances(staff_id,amount,note,given_by,created_at) VALUES(?,?,?,?,?)',[x.staff_id,Number(x.amount),x.note||'',req.user.staff_id,new Date().toISOString()],res,row=>{audit(req.user,'ADVANCE_ADDED',x.staff_id,`₹${x.amount}`);res.status(201).json({id:row.lastID,message:'Advance recorded'});});});

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
      db.run("UPDATE staff SET location_code=? WHERE staff_id=? AND role IN ('field_officer','officer','supervisor')",[r.to_location,r.staff_id],function(ue){
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
app.put('/api/point-transfers/:id/reject',auth,roles('admin','master_admin'),(req,res)=>{
  get("SELECT * FROM point_transfer_requests WHERE id=?",[req.params.id],(e,r)=>{
    if(e)return res.status(500).json({error:e.message}); if(!r)return res.status(404).json({error:'Transfer request not found'});
    if(r.status!=='Pending')return res.status(409).json({error:'Request already reviewed'});
    run("UPDATE point_transfer_requests SET status='Rejected',reviewed_at=?,reviewed_by=? WHERE id=?",[new Date().toISOString(),req.user.staff_id,r.id],res,()=>{audit(req.user,'POINT_TRANSFER_REJECTED',r.staff_id,r.to_location);res.json({message:'Point transfer rejected'});});
  });
});

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
app.post('/api/login',(req,res)=>{
  const {staff_id,password,role}=req.body||{};
  if(!staff_id||!password||!['master_admin','admin','field_officer','officer','supervisor','guard'].includes(role))return res.status(400).json({error:'Select a valid login role, Staff ID and password'});

  // ============================= LOGIN =============================
  // Passwords are stored as bcrypt hashes. Verify the entered password
  // after finding the account by Staff ID and role.
  get('SELECT id,role,name,staff_id,password,post,salary,location_code,parent_id,status,suspended_until,dob,department,contact_number,dp,age,height,weight,blood_group,qualification,physical_level,medical_level,skills,police_verification,driving_license,training_details,work_experience,photo_front,photo_back,photo_left,photo_right,is_reliever FROM staff WHERE staff_id=? AND role=?',[staff_id,role],async (err,user)=>{
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
    const redirect={master_admin:'admin.html',admin:'admin.html',field_officer:'field-officer.html',officer:'officer.html',supervisor:'supervisor.html',guard:'guard.html'}[role];
    audit({staff_id:user.staff_id,role:user.role},'LOGIN_SUCCESS',user.staff_id,'Successful login');
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
db.run("ALTER TABLE locations ADD COLUMN duty_hours INTEGER NOT NULL DEFAULT 12",()=>{});

function adminOnly(req, res, next) {
  auth(req,res,()=>roles('admin','master_admin')(req,res,next));
}

app.get('/api/locations', auth, (req, res) => {
  db.all('SELECT * FROM locations ORDER BY code ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/locations', adminOnly, (req, res) => {
  const { code, name, address = '', latitude, longitude, radius_meters = 200, duty_shift = '12_hour' } = req.body || {};
  const lat = Number(latitude), lng = Number(longitude), radius = Number(radius_meters);
  const duty = String(duty_shift) === '8_hour' ? 8 : (String(duty_shift) === '12_hour' ? 12 : 0);
  if (!code || !name || !duty || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius) || radius <= 0) {
    return res.status(400).json({ error: 'Code, name, latitude, longitude, valid radius and duty shift are required' });
  }
  db.run(
    `INSERT INTO locations (code,name,address,latitude,longitude,radius_meters,duty_shift,duty_hours)
     VALUES (?,?,?,?,?,?,?,?)`,
    [String(code).trim(), String(name).trim(), String(address).trim(), lat, lng, Math.round(radius), String(duty_shift), duty],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ ok: true, id: this.lastID });
    }
  );
});

app.put('/api/locations/:id', adminOnly, (req, res) => {
  const { code, name, address = '', latitude, longitude, radius_meters = 200, duty_shift = '12_hour', active = 1 } = req.body || {};
  const lat = Number(latitude), lng = Number(longitude), radius = Number(radius_meters);
  const duty = String(duty_shift) === '8_hour' ? 8 : (String(duty_shift) === '12_hour' ? 12 : 0);
  if (!code || !name || !duty || !Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radius) || radius <= 0) {
    return res.status(400).json({ error: 'Code, name, latitude, longitude, valid radius and duty shift are required' });
  }
  db.run(
    `UPDATE locations SET code=?,name=?,address=?,latitude=?,longitude=?,radius_meters=?,duty_shift=?,duty_hours=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    [String(code).trim(), String(name).trim(), String(address).trim(), lat, lng, Math.round(radius), String(duty_shift), duty, active ? 1 : 0, req.params.id],
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

setInterval(scanPointPushDue,30000);
setTimeout(scanPointPushDue,5000);

app.listen(PORT,'0.0.0.0',()=>console.log(`SNDF backend running on port ${PORT}`));
