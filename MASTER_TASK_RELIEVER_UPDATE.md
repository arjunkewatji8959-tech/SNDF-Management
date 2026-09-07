# SNDF MANAGEMENT — Reliever + Task Management Update

## Reliever Management
- Removed Admin/Master Admin reliever check-in button and replaced it with **Done**.
- Done marks the selected Guard/Supervisor as a reliever and saves the selected Location Code.
- Reliever must use normal live GPS attendance check-in at the assigned location.
- Added Total Selectable, Selected Reliever and Unselected counts.
- Added separate Selected Reliever and Unselected lists.
- For a reliever Guard, the active Supervisor at the selected location is stored as `reliever_parent_id`.
- Supervisor/Field Officer team attendance includes reliever assignments so attendance appears under the location hierarchy.

## Task Management
Task hierarchy:
- Master Admin -> Admin / Field Officer / Supervisor / Guard
- Admin -> Field Officer / Supervisor / Guard
- Field Officer -> Supervisor / Guard
- Supervisor -> Guard
- Guard -> cannot create tasks; can receive/start/update/complete assigned tasks.

Task lifecycle:
- Pending
- Started
- Completed

When assigned staff starts or updates a task, the creator can see the live status/update.
Completion requires a report:
- Report Summary
- Time Summary
- Result / Outcome
- Issues / Observations
- Next Action

Master Admin can see all tasks across the hierarchy.

## Security
- Server-side task hierarchy validation prevents unauthorized assignment.
- Only the assigned member can start or complete a task.
- Task updates are recorded in `task_updates`.
- Task actions are added to audit logs.

## Local test
```bash
npm install
npm start
```
Then open:
`http://localhost:5000`

Keep the terminal running.

## Production
Yes, after local testing the project can be deployed to a Node.js-compatible host with a domain.
For live GPS/geofence and browser camera/notification features, use HTTPS.
For Railway, attach persistent storage/volume for SQLite and configure location coordinates/geofence environment variables.
