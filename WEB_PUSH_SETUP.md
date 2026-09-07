# SNDF Management — Complete Web Push

## What it does
- Guard/Supervisor can enable browser push notifications from the Point Update screen.
- Server independently checks Night Shift Point Update due status every 30 seconds.
- When a point update is due, the server sends a Web Push notification even if the dashboard tab is not open.
- The push notification has **Update Now** and opens the Point Update screen.
- It repeats at most every 15 minutes until the staff member submits the Point Update.
- Existing red popup + alarm remains active when the dashboard is open.
- Expired browser subscriptions (404/410) are automatically removed.

## One-time user action
After login, each Guard/Supervisor must press:
**🔔 Enable Phone Notifications**

The browser will ask for notification permission. Allow it.

## HTTPS
Production must use HTTPS. Web Push requires a secure origin (localhost is also allowed for development).

## VAPID keys
The server uses `web-push`.
- If `WEB_PUSH_PUBLIC_KEY` and `WEB_PUSH_PRIVATE_KEY` are set, those are used.
- Otherwise, the server generates VAPID keys once and stores them in `web-push-vapid.json` inside the configured persistent data directory.
- On Railway, keep the database/data directory on a persistent Volume so the VAPID key file survives redeploys/restarts.

## Install
Run:
`npm install`

Then start:
`npm start`

## Test
1. Login as Guard or Supervisor.
2. Open Point Update.
3. Press **Enable Phone Notifications** and allow notifications.
4. Keep the phone/browser available for the first permission/subscription step.
5. During Night Shift, when the hourly due time is reached, the server sends the push.
6. Submit Point Update; the next hourly cycle is scheduled from the successful submission.

## Important mobile/browser limitation
Web Push is not a guaranteed hardware alarm or emergency call. The OS/browser controls delivery, battery optimization, Focus/Do Not Disturb, and notification settings. For guaranteed audible alarms when an app/browser is fully closed, a native Android app with a foreground service would be stronger.
