# SNDF Management – Upgraded Build

## Added
- Secure password hashing with bcryptjs. Existing plain demo passwords are migrated to bcrypt on first successful login.
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
