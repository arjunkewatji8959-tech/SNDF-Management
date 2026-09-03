# SNDF Management — Demo Seed

This package contains a demo SQLite database plus a repeatable seed script.

## Demo period
- July 1, 2026 to August 31, 2026
- September 1–3, 2026 (through today in this demo)
- 12-hour shifts are used for most records.
- Mixed shifts: Morning, Day, Night.
- Selected records are Half Day (6 hours) to demonstrate the automatic half-day rule.

## Staff
- 1 Admin: `admin` / `adi2026`
- 1 Field Officer: `FO001` / `field123`
- 3 Supervisors: `SUP001`, `SUP002`, `SUP003` / `super123`
- 12 Guards: `G001`–`G012` / `guard123`
- `G006` demo password is `guard789` because its profile-edit history contains a password change.

## Locations
- LOC-01 → SUP001 → G001–G004
- LOC-02 → SUP002 → G005–G008
- LOC-03 → SUP003 → G009–G012
- Field Officer location code: `ALL`

## Records included
- 1,040 attendance records
- Morning / Day / Night shifts
- Half Day records
- GPS/location text for each attendance record
- Fines
- Advances
- Salary payments
- Notices with replies
- Help requests with responses
- Profile edit history, including password changes without exposing the password

## Downloading profile edit history
Login as Admin → All Profile Records → **Download Profile Edit History**.
The server endpoint also supports a CSV download at `/api/profile-edit-history/export` for an authenticated Admin.

## Re-seed the database
The included `seed-demo.js` resets the configured SQLite database and recreates the demo.

```bash
npm install
npm run seed-demo
npm start
```

On Railway, do not run the seed against your production Volume unless you intentionally want to replace its data with this demo.
