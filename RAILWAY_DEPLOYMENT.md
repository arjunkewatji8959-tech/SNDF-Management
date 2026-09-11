# SNDF Management — Railway + Volume

This build is prepared to keep the SQLite database on a Railway persistent Volume.

## Railway settings
1. Deploy this repository as a Node.js service.
2. Root directory: use the repository root (`.`); `package.json` and `server.js` are in the root.
3. Build command: `npm install`
4. Start command: `npm start`
5. Attach one Railway Volume to the service.
6. Set the Volume Mount Path to: `/app/data`
7. Railway will provide `RAILWAY_VOLUME_MOUNT_PATH`; the app stores `sndf.db` at `/app/data/sndf.db`.
8. Set these variables in Railway: `ADMIN_ID`, `ADMIN_PASSWORD`, `ADMIN_NAME`. Do not commit `.env`.
9. The server listens on Railway's `PORT` automatically.

## Important
- Do NOT store `sndf.db` in GitHub for a fresh production database.
- Do NOT commit `.env`.
- The database is persistent only while the Railway Volume is retained and attached.
- The free plan/usage limits and Volume limits are controlled by Railway and can change.
- Take regular backups of `sndf.db`.

## Quick test
After deployment, open `/api/health` and `/api/deployment`. The latter should report `storage: "railway-volume"`.

## DATA PERSISTENCE (FINAL)
- This build stores all members, passwords (bcrypt hashes), locations, location assignments, attendance, fines, payroll/payment records, notices, tasks and audit logs in SQLite.
- On Railway, attach a **Volume** and set its mount path as `RAILWAY_VOLUME_MOUNT_PATH`. Without a persistent Volume, Railway can recreate the container and SQLite data can be lost.
- The backend creates the core SQLite tables before reporting `dbReady=true`, preventing first-request schema race errors.
- Master Admin bootstrap uses `INSERT ... DO NOTHING`; it no longer overwrites the Master Admin password on every restart.
