# SNDF Location Management

Admin can open `location-management.html` and:
- Add Location Code, Name, Address
- Set Latitude / Longitude
- Capture current GPS coordinates from the device
- Set allowed radius in meters
- Edit or Delete locations

Locations are stored in the SQLite `locations` table.

For production use, keep HTTPS enabled because browser GPS permission requires a secure context on most devices.
