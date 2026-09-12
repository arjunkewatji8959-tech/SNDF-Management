# SNDF Management — Hostinger Node.js Deployment

This package is prepared for **Hostinger Node.js hosting**. It contains both the website frontend and the Express/SQLite backend.

## Important
The project is NOT a static-only website. `server.js` is required for login, staff management, attendance, fines, notices, help, reports, etc.

### Hostinger hPanel
1. Create a **Node.js Web App** in Hostinger (a plan that supports Node.js).
2. Upload/extract this complete project into the application's project directory.
3. Select Node.js **18+**.
4. Set the application/startup file to:
   `server.js`
5. Install dependencies:
   `npm install`
6. Start/restart the application. The server uses Hostinger's assigned `PORT` automatically.
7. Point your domain/subdomain to this Node.js application in Hostinger.

### Environment variables
No secret environment variable is required for the basic deployment.

Optional:
- `HOSTINGER_DATA_DIR` — folder for the SQLite database, e.g. `/home/USER/domains/example.com/sndf-data`
- `DB_DIR` — alternative database folder
- `PORT` — normally supplied automatically by Hostinger; do not hard-code it.

### SQLite database
The app creates `sndf.db` automatically in `data/` by default. If your Hostinger Node.js setup uses a non-persistent/redeploy directory, set `HOSTINGER_DATA_DIR` to a persistent writable folder so staff, attendance and other records survive restarts/redeployments.

### First login / setup
Use the login page:
`/login.html`

If the application is already initialized with demo/admin data, use the credentials configured in that database. Do not put production passwords in GitHub.

### Troubleshooting
- If the homepage opens but login/API fails, verify the Node.js app is running and that `/api/deployment` returns JSON.
- If the app returns 500 errors, check Hostinger Node.js application logs.
- If data disappears after redeploy, configure `HOSTINGER_DATA_DIR` to a persistent writable directory.
- Do not upload `.env` files or database files containing production data to GitHub.

## Static hosting warning
Do **not** upload only the HTML files to Hostinger's normal `public_html` static directory if you need the management dashboard/backend. The Node.js backend is required.
