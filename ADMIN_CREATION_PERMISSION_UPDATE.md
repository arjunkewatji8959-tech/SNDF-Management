# Admin / Master Admin Creation Permission Update

Updated rules:

- Only **Admin** and **Master Admin** can create staff accounts.
- **Field Officer, Officer, Supervisor and Guard cannot create any account**.
- Admin and Master Admin can create Admin, Field Officer, Officer, Supervisor and Guard accounts.
- A valid **Field Officer ID is mandatory** when creating an Officer, Supervisor or Guard.
- Supervisor is linked directly to the selected Field Officer ID.
- Guard creation requires both Supervisor ID and Field Officer ID. The backend verifies that the selected Supervisor belongs to that Field Officer and that the Guard location matches the Supervisor location.
- Permission is enforced in the backend API, not only hidden in the interface.
