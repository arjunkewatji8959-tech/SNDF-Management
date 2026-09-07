# SNDF Management – Point Update Alarm Update

## Added
- Night Shift Point Update due होने पर full-screen red alert popup.
- Repeating alarm beep every 5 seconds while the Point Update remains due.
- Browser notification remains enabled.
- `🔔 Enable Phone Notifications` button now arms the alarm and requests notification permission.
- `📷 Update Now` closes the alert and opens the Point Update section.
- `🔔 Test Alarm` lets staff test the sound.
- Alarm automatically stops after a successful Point Update submission.

## Important
For phone/browser sound, the staff member must tap **Alarm & Notifications Enabled** once after login because mobile browsers require a user gesture before audio can play.

For alerts while the browser/app is completely closed, this feature does not provide background push alarms. A Web Push/service-worker system would be required for that.

## Files changed
- `app.js`
- `guard.html`
- `supervisor.html`
- `style.css`
