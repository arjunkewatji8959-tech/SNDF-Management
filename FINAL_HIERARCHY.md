# SNDF MANAGEMENT — FINAL STAFF HIERARCHY

## Production hierarchy
Master Admin → Admin → Field Officer → Supervisor → Guard

## Creation rules
- Master Admin: creates Admin only.
- Admin: creates Field Officer only. Field Officer location is optional.
- Field Officer: manages all active locations and creates Supervisors.
- Supervisor creation: Field Officer Staff ID + active Location Code are mandatory.
- Supervisor: creates Guards.
- Guard creation: Supervisor Staff ID + Location Code are mandatory.
- Guard location must exactly match the selected Supervisor location.
- The fixed Master Admin is `adi123`. Password remains the system bootstrap password.
- No demo staff accounts are seeded in the production database.
- The production SQLite database is intentionally not included in this code ZIP.

## Location visibility
Field Officers can see/use all active locations. A Field Officer does not need one fixed location to manage locations.

## Data safety
Upload this ZIP as code only. Keep the production `data/sndf.db` and uploaded user files on the server/volume. Back up the production database before deployment.
