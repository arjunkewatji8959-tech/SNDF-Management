# SNDF Management System

SNDF Security & Staff Management System — frontend pages + Node.js/Express backend + SQLite.

## Project structure

- `index.html` — landing page
- `login.html` — login
- `admin.html` — admin dashboard
- `field-officer.html` — field officer dashboard
- `supervisor.html` — supervisor dashboard
- `guard.html` — guard dashboard
- `location-management.html` — location management
- `app.js` / `server.js` — application logic and backend
- `style.css` — shared styling
- `package.json` — Node.js dependencies
- image/SVG assets — project graphics

## Run locally

```bash
npm install
npm start
```

Then open:

`http://localhost:5000`

## Deploy on Railway

- Build command: `npm install`
- Start command: `npm start`
- Attach a Railway Volume if persistent SQLite data is required.
- Recommended mount path: `/app/data`
- The server automatically uses `RAILWAY_VOLUME_MOUNT_PATH` when available.

## GitHub note

This repository is prepared for GitHub. The runtime SQLite database is intentionally excluded from the package so production/local database data is not committed.

## Important

Do not commit `.env`, database files, passwords, tokens, or other secrets.


## Hostinger
See `HOSTINGER_DEPLOYMENT.md` for the Node.js Web App deployment steps. The app is configured to use `HOSTINGER_DATA_DIR` when provided, otherwise it stores SQLite data in the local `data/` folder.

## Final member/location build
See `FINAL_MEMBER_LOCATION_BACKEND.md` for the exact hierarchy, validation, persistence and Railway test order.
