# SNDF FINAL - MEMBER + LOCATION + DATA SAVE

## Member Create / Manage
The final form contains:
1. Role
2. Name
3. Staff ID
4. Password
5. Post
6. Salary
7. Date of Birth
8. Department
9. Location Code / Select Location
10. Select Parent ID
11. Phone Number

## Hierarchy enforced by backend
Master Admin -> Admin -> Field Officer / Officer -> Supervisor -> Guard

- Master Admin can create Admin, Field Officer, Officer, Supervisor and Guard.
- Admin can create Field Officer, Officer, Supervisor and Guard.
- Admin cannot create another Admin.
- Field Officer can be assigned multiple locations.
- Officer, Supervisor and Guard use exactly one location.
- Supervisor parent must be an active Field Officer who owns that location.
- Guard parent must be an active Supervisor at the same location.
- Field Officer/Officer parent must be an active Admin.
- Admin parent is Master Admin (adi123).

## Saved data
SQLite stores member records, bcrypt password hashes, location assignments, attendance, fines, advances, payments, notices, tasks and audit logs.

## Location Management
- Master Admin can see/manage all locations.
- Admin can see/manage only its assigned locations.
- Admin-created locations are automatically assigned to that Admin.
- Master Admin can distribute locations to Admin and Field Officer.
- Admin can distribute only its own locations to Field Officer.
- Location Code is unique.
- Location edit supports code/name/address/GPS/radius/duty shift.
- If a Location Code is changed, staff assignments and shift schedules are updated to the new code.
- Delete removes location assignments and schedules and clears the deleted code from staff records.

## Railway persistence
For data to survive Railway redeploy/restart, attach a Railway Volume and mount it as the value of `RAILWAY_VOLUME_MOUNT_PATH` (recommended `/app/data`).

Without a persistent volume, SQLite is container-local and a new Railway instance can start with a new database.

## Safety / consistency fixes
- Passwords are never returned by `/api/staff`.
- Passwords are stored using bcrypt hashes.
- Duplicate Staff IDs return a clear conflict error.
- Duplicate Location Codes return a clear conflict error.
- Required member fields are validated on both browser and backend.
- Core SQLite tables are created before `dbReady=true` to avoid first-request schema race errors.
- SQLite WAL mode is enabled when supported.
- Master Admin bootstrap no longer overwrites the Master Admin password on every restart.
- Partial location assignment failure removes the just-created member so an incomplete member is not left behind.

## Railway test order
1. Deploy with the included `railway.toml` and `npm start`.
2. Confirm `/api/health` reports `healthy`.
3. Login as Master Admin.
4. Create at least one Location.
5. Create an Admin with the location and Master Admin parent.
6. Login as the new Admin.
7. Create Field Officer with Admin parent and one/multiple assigned locations.
8. Create Supervisor under the Field Officer at a matching location.
9. Create Guard under the Supervisor at the same location.
10. Logout/login each account using its saved Staff ID + password.
11. Submit attendance and verify it remains after refresh.
12. Restart/redeploy Railway and verify records remain. This last check requires a persistent Railway Volume.
