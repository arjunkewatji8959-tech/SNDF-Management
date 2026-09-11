# SNDF Management — Production Error Fix Report

## Main error fixed: Location Distribution / 502-or-server-error

The Location Management page calls `/api/staff` while loading Location Distribution. The backend selected
`reliever_duty_hours` and `reliever_shift` from the `staff` table, but those columns were only added by
a later startup migration. On a fresh/older database this could make `/api/staff` fail with a database
column error, which then made the Location Distribution section fail.

### Changes made

1. Added `reliever_duty_hours` and `reliever_shift` to the startup staff migration list.
2. Moved the `locations` and `shift_schedules` schema creation/migrations into the startup schema sequence,
   before `dbReady` becomes true. This prevents Railway cold-start requests from reaching APIs before
   these tables/columns exist.
3. Fixed location assignment re-activation:
   - Previously `INSERT OR IGNORE` could leave an existing unique assignment row inactive.
   - It now uses an UPSERT that sets `active=1` and refreshes `assigned_by` / `assigned_at`.
4. Removed duplicate Location Distribution initial loading in `location-management.html`.
5. Location deletion now refreshes both the saved-location list and ownership/distribution table.
6. Checked JavaScript syntax for all standalone JS files and inline HTML scripts.
7. Checked local HTML asset/file references; no missing local references were found.

## Deployment

Use the generated fixed ZIP as the new GitHub/Railway source.

Railway:
- Build command: `npm install`
- Start command: `npm start`
- Keep the Railway Volume mounted at `/app/data` if persistent SQLite storage is being used.

After deployment, test:
- `/api/health`
- `/api/deployment`
- `location-management.html`

Then hard-refresh the browser with `Ctrl + Shift + R`.

## Important

This fix does not delete or reset existing SQLite data. Existing location assignments are preserved.
