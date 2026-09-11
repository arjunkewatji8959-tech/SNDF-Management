# SNDF Management — Production Audit Report

## Scope
Audited the uploaded `SNDF_MANAGEMENT_FULL_BACKEND_LOCATION_ADMIN_FIXED` project for account creation/login, hierarchy, locations, attendance, shifts, accounts/fines, profiles, tasks, relievers, notices/help, frontend references, API coverage, database migrations, and security.

## Fixed in this build
1. **Admin/member creation SQL error fixed**
   - The `staff` INSERT statement had an incorrect number of placeholders.
   - This could cause Admin/Member creation to fail with a SQLite binding error, which also explained why the newly created Admin was missing from the list and could not log in.
2. **Database startup readiness**
   - API requests are held until the SQLite schema and Master Admin bootstrap are ready.
   - Prevents early deployment requests from receiving temporary `no such table/column` errors.
3. **Master Admin bootstrap ordering**
   - Bootstrap is ordered before the database-ready flag.
   - Existing staff records are not cleared.
4. **Admin data isolation**
   - Normal Admin no longer receives other Admin accounts from `/api/staff`.
5. **Staff deletion safety**
   - Master Admin cannot be deleted.
   - Normal Admin cannot delete Admin accounts.
   - Related location assignments and shift schedules are cleaned when a staff record is deleted.
6. **Location deletion safety**
   - Related assignments and schedules are removed.
   - Staff records using the deleted location have their `location_code` cleared rather than keeping a stale point.
7. **Profile security**
   - `/api/profile/me` no longer returns the password hash.
8. **Fine target suggestions**
   - Fixed the Staff ID datalist population so the fine target input works correctly.
9. **Admin Present listener**
   - Prevented repeated refreshes from attaching duplicate submit listeners.
10. **Login UI**
   - Removed the role dropdown; the server determines the dashboard from the authenticated account role.

## Static validation completed
- `server.js` syntax: PASS
- `app.js` syntax: PASS
- `login.js` syntax: PASS
- `profile-view.js` syntax: PASS
- `edit-profile.js` syntax: PASS
- `sw.js` syntax: PASS
- Inline JavaScript in HTML pages: PASS
- Duplicate HTML IDs: none detected
- Local script/CSS references: no missing references detected
- Client API references matched backend route families
- Fixed `staff` INSERT was executed against a matching SQLite schema with 29 parameters: PASS

## Important runtime-test limitation
The execution environment could not install the project's npm dependencies (`express`, `sqlite3`, `bcryptjs`, `pdfkit`, `web-push`, `cors`) because package installation timed out. Therefore a complete live HTTP end-to-end test against Node/SQLite was not possible in this environment.

The production ZIP intentionally does **not** contain `data/sndf.db`, so it will not overwrite the existing Railway/Hostinger database.

## Deployment
Upload this source build to GitHub and redeploy the service. Keep the existing persistent Railway Volume / Hostinger database directory connected.
