# SNDF Management — Railway + Volume (Flat Upload)

All application files are intentionally in a single root directory so this repository can be deployed directly as one Railway service.

## Railway
- Root directory: `.`
- Build command: `npm install`
- Start command: `npm start`
- Attach one Railway Volume to the service.
- Volume mount path: `/app/data`
- The server uses `RAILWAY_VOLUME_MOUNT_PATH` when available and stores SQLite at `/app/data/sndf.db`.
- Set `ADMIN_ID`, `ADMIN_PASSWORD`, and `ADMIN_NAME` in Railway Variables.
- Do not commit `.env` or a production `sndf.db`.

## Local
```bash
npm install
npm start
```
Open `http://localhost:5000`.

## Important
The database is persistent only while the Railway Volume is retained and attached. Take regular backups.
