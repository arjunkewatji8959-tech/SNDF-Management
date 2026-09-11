# SNDF Management — Field Officer Location & Attendance Rule

## Updated rule
- Admin or Director can create a Field Officer by selecting **any one active Location Code**.
- That first location is only the Field Officer's initial assigned point; it is enough to create the ID.
- Admin/Director can later assign additional locations from **Location Distribution**.
- A Field Officer can manage the data/operations permitted to them across every location currently assigned to their Staff ID.
- Attendance is separate from field assignment: a Field Officer's own **Check In / Check Out is allowed only at the location marked `Main Office`**.
- The Field Officer dashboard displays the Main Office as the attendance location.
- Geofence validation for Field Officer attendance uses the Main Office GPS/radius.
- Supervisors and Guards continue to use their assigned duty location for attendance.

## Main Office setup
Open **Location Management** and edit/create the desired office location, then select:
`Main Office → Yes — Field Officers check in/out here`

Only one location should be marked Main Office; saving another Main Office automatically clears the flag from other locations.

## Multiple field locations
Use:
`Location Management → Location Distribution`

Select the Field Officer and choose all locations that officer should manage. The existing server-side location scope remains active, so the officer cannot access locations that are not assigned.

## Important
Existing SQLite data is preserved. The update adds the `is_main_office` column safely when the server starts.
