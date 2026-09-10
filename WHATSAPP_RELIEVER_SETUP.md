# SNDF Reliever WhatsApp Notification Setup

The Reliever Management assignment now prepares a WhatsApp notification for the assigned Guard/Supervisor.

## Requested SNDF WhatsApp number

`8959872715` is stored as the default sender/business number label.

## Automatic sending on Railway

Set these Railway environment variables:

```text
WHATSAPP_SENDER_NUMBER=8959872715
WHATSAPP_PHONE_NUMBER_ID=<Meta WhatsApp Cloud API phone number ID>
WHATSAPP_ACCESS_TOKEN=<Meta WhatsApp Cloud API access token>
```

The staff member must have a valid Indian 10-digit mobile number in their Contact Number profile field. The backend normalizes it to `91XXXXXXXXXX`.

### Important
A normal phone number alone cannot programmatically send WhatsApp messages. Automatic sending requires a WhatsApp Business/Cloud API sender and access token. If the API variables are not configured, SNDF returns a pre-filled `wa.me` link so an authorized user can open/send the message manually.

For Meta business-initiated messaging, use an approved WhatsApp template when your Meta account requires template messaging; the current fallback link remains available if automatic delivery is unavailable.
