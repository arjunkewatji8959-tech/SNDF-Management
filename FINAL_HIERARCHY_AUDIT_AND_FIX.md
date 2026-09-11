# SNDF Management – Final Hierarchy Audit & Fix

## Required hierarchy
- Master Admin: existing behavior preserved.
- Admin: creates Field Officer, Officer, Supervisor, Guard.
- Normal Admin cannot create another Admin.
- Field Officer and Officer require the logged-in Admin Staff ID as Parent ID and at least one location.
- Field Officer supports multiple assigned locations.
- Officer uses exactly one location.
- Supervisor requires an active Field Officer Parent ID and one location assigned to that Field Officer.
- Guard requires an active Supervisor Parent ID and the exact Supervisor location.
- Shift management remains restricted to Master Admin/Admin.

## Fixes applied
1. Repaired the Admin create-member UI so Field Officer can select multiple locations.
2. Parent dropdown now displays the Parent Staff ID first, followed by name and location(s).
3. Field Officer parent is automatically set to the logged-in Admin Staff ID.
4. Officer parent is automatically set to the logged-in Admin Staff ID.
5. Supervisor parent candidates are filtered to Field Officers assigned to the selected location.
6. Guard parent candidates are filtered to Supervisors at the selected location.
7. Server-side validation remains authoritative for all parent/location rules.
8. Staff INSERT query verified: 29 columns / 29 placeholders.
9. JavaScript syntax checks: passed.
10. Inline HTML JavaScript checks: passed.
11. Admin HTML duplicate-ID check: passed.
12. Production `sndf.db` is not included in the ZIP.

## Important
This package was statically and database-query validated. A complete live Railway HTTP test could not be run in this environment because npm dependency installation timed out.
