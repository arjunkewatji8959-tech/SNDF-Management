# SNDF MANAGEMENT - GitHub Ready

## Upload
1. Extract this ZIP.
2. Create/open the GitHub repository.
3. Upload ALL files and folders from this extracted folder (not the ZIP itself).
4. Commit changes.
5. Railway/Render can deploy from the repository using `npm start`.

## Important
- `data/sndf.db` is intentionally NOT included. Production database data must stay on the persistent Railway Volume.
- `node_modules` is intentionally NOT included. The hosting service runs `npm install` from `package.json`.
- `.env` is intentionally NOT included. Use environment variables in the hosting dashboard.
- `location_assignments` is created automatically by `server.js` during database startup.

## Local test
```powershell
npm install
npm start
```
Then open `http://localhost:5000`.

## GitHub web upload
If using GitHub's web interface, upload the extracted files/folders. GitHub does not deploy a ZIP merely by storing the ZIP file in the repository.
