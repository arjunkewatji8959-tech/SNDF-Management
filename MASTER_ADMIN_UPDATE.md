# SNDF Management — Master Admin & Hourly Point Update

## Master Admin
- Login Role: Master Admin
- Staff ID: `adi123`
- Password: `sndf1234`
- Master Admin uses the same Admin dashboard.
- Master Admin can create Admin, Field Officer, Supervisor and Guard.
- Normal Admin cannot create an Admin. Backend also blocks it.

## All Profile Records
- Includes Admin, Field Officer, Supervisor and Guard.
- Action is `View`, not Edit.
- View opens `profile-view.html` with complete details and 4 full-body photos.
- Download Profile exports the record as CSV.

## Reliever
- Total Selectable, Selected and Unselected counters.
- Admin/Master Admin can mark/unmark Guard/Supervisor as reliever.
- Location can be changed separately and reliever check-in is available.

## Fine
- Admin Fine Section has 10 reason options.
- Amount is automatically selected from the chosen reason.

## Hourly Point Update
- Guard and Supervisor only.
- Night Shift: mandatory live photo + GPS point update every 60 minutes.
- Day Shift: not mandatory.
- Admin dashboard has Point Update section with Location Code and Role filters.
- Records show photo, date, time, role, name, ID, location code, GPS location, shift and status.
- Browser/mobile notification is triggered when an hourly update becomes due. For phone notifications in production, use HTTPS and allow notifications on the phone/browser.
