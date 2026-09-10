# SNDF Management — Role Hierarchy Update

## New hierarchy
Master Admin → Admin → Field Officer → Supervisor → Guard

- Field Officer is a multi-point manager: no mandatory location is stored on the Field Officer.
- Field Officer parent ID must be an Admin or Master Admin Staff ID.
- Supervisor parent ID must be a Field Officer Staff ID, and Supervisor must have a valid Location Code.
- Guard parent ID must be a Supervisor Staff ID, and Guard location must match the Supervisor location.
- Admin cannot create Admins; only Master Admin can create Admins.
- Existing `officer` records are preserved, but the new Create Member flow no longer offers Officer as a new role.

## Initial accounts
These are created only if the Staff ID does not already exist:
- Admin 1 — Staff ID: `admin001` — Password: `admin001`
- Admin 2 — Staff ID: `admin002` — Password: `admin002`
- Field Officer 1 — Staff ID: `field001` — Password: `field001` — Parent: `admin001`

Existing production data/accounts are not deleted or overwritten by this bootstrap.
