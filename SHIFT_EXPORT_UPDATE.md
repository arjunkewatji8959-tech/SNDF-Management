# Attendance Shift Export Update

Admin Attendance and Daily Attendance download controls now include a Shift dropdown:
- All Shifts
- Day Shift
- Night Shift

Monthly and Daily CSV exports send the selected shift to `/api/attendance/export?shift=...`.
The on-screen monthly matrix and daily attendance table also filter by the selected shift.
