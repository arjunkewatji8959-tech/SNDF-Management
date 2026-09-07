# SNDF Management - Admin Profile + Mobile Attendance Update

## Changes
- Removed Admin Password Management from the Admin Panel.
- Added All Profile Records with Role and Location Code filters.
- Added Edit Profile page for Field Officer, Supervisor and Guard.
- Admin can edit name, role, password, location code, parent ID, post, salary, DOB, department, contact and photo.
- Parent validation: Supervisor -> Field Officer; Guard -> Supervisor, and Guard location must match Supervisor location.
- No demo staff/database is bundled. A fresh database bootstraps only the Admin account.
- Field Officer, Supervisor and Guard attendance is mobile-first:
  - camera starts automatically when browser permission allows
  - Take Photo / Retake
  - GPS is requested automatically
  - name, ID, role, location code, parent ID and shift are auto-filled
  - user only takes photo and presses Check In / Check Out
  - Check Out automatically finds the user's open attendance record
- Camera preview is compact for phones.

## Fresh deployment
The ZIP contains no `sndf.db` demo database. If Railway Volume already contains old demo data, deleting the ZIP does NOT delete the existing Volume database. Clear/replace that database only once before production.

## Admin bootstrap
Fresh database defaults to:
- ID: admin
- Password: adi2026

For production, set `ADMIN_ID`, `ADMIN_PASSWORD`, and `ADMIN_NAME` in Railway Variables before launch.


## Admin Attendance Detail Update
- Admin Attendance page now shows saved attendance details for Field Officer, Supervisor and Guard.
- Each submitted record includes Name, Staff ID, Role, Staff Location Code, submitted GPS/location text, Shift, Check In, Check Out, Hours, Status and the live camera photo.
- Live attendance photo is stored with the attendance record and can be opened from the Admin Attendance table.
- Location Code is read from the staff profile so it remains available even when the attendance location/GPS text changes.
