# SNDF Management – Upgraded Build

## Added
- Secure password hashing with bcryptjs. Existing passwords are migrated to bcrypt on first successful login.
- Admin Reports & Audit dashboard.
- Audit log for login, staff create/edit/delete, password change, attendance check-in/out, fine, advance, payment, notice, help and suspension actions.
- Audit CSV download.
- Monthly payroll CSV report.
- Monthly report summary for attendance, duty days, hours, fines and payments.
- Optional GPS geofence for LOC-01/02/03.
- Morning Shift auto-detection (06:00–08:00), while Day/Night remain 12-hour shifts.
- Existing mobile Camera + Captured Photo side-by-side layout preserved.

## Optional Railway geofence variables
Set these only if you know the official location coordinates:
- LOC_01_LAT
- LOC_01_LNG
- LOC_02_LAT
- LOC_02_LNG
- LOC_03_LAT
- LOC_03_LNG
- GEOFENCE_RADIUS_METERS (default 200)

If location coordinates are not configured, GPS is still captured but check-in is not blocked.

## Production security
Change the Admin password and set:
ADMIN_ID, ADMIN_PASSWORD, ADMIN_NAME
in Railway Variables before public launch.

The system still uses the existing frontend header-based API session architecture; for a high-security production deployment, replace it with server-side sessions/JWT + HTTPS-only cookies.


## 2026-09-06 Profile, Attendance & Reliever Update

- Field Officer, Supervisor and Guard now have a complete Edit Profile form.
- Profile includes 4 full-photo uploads (Front, Back, Left, Right).
- Added Name, Age, Height, Weight, Blood Group, Qualification.
- Added Physical Level and Medical Level dropdowns: Low / Medium / High.
- Added Skills, Police Verification (Yes/No), Driving License (Yes/No), Training Details and Work Experience.
- Submit Profile saves the record to the Admin Panel → All Profile Records.
- Admin can review/edit all submitted profile details and see photo completion (0/4 to 4/4).
- Added 30-minute shift check-in window for normal staff. Late check-in is rejected after 30 minutes from shift start.
- Added Reliever Management for Admin: mark Guard/Supervisor as Reliever, change location, and check in the selected Reliever.
- Added Supervisor → My Guards Attendance with daily and monthly Guard attendance.
- Fine Amount now supports multi-select predefined amounts; backend records the combined total.
- Database migration adds all new profile and reliever fields automatically, and the database is pre-migrated.
