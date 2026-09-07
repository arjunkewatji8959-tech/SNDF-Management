# SNDF Management - Production Test Build

This build starts with a clean SQLite database containing only the permanent Master Admin account.

Master Admin login:
- ID: adi123
- Password: sndf1234

No demo staff, locations, attendance, fines, advances, payments, notices, tasks, point updates, or transfer requests are included.

Before going live:
1. Run `npm install`.
2. Run `npm start`.
3. Open `http://localhost:5000/login.html`.
4. Login as Master Admin.
5. Create a real Admin.
6. Logout and verify the new Admin can log in.
7. Create real Locations and select either 8 Hours or 12 Hours.
8. Create Field Officer, Supervisor, and Guard accounts.
9. Test attendance, checkout, task assignment, point update, reliever, fines, payroll, profile, and exports.
10. Only after all tests pass, deploy to HTTPS hosting.
