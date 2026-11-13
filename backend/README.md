# MZ Active Marketplace API

Cloudflare Worker API for coach/pacer accounts, profile review, approved directory listings, and booking requests. The public site remains on GitHub Pages.

## Privacy gate

`DATA_COLLECTION_ENABLED` controls registration, profile edits, and booking requests. The release setting is `true` after publishing the operational privacy notice, including APAC storage, WhatsApp handoff and retention/deletion periods. Set it to `false` to pause intake; paused writes return `503 intake_paused` without touching D1.

## Routes

- `GET /health` — health and intake-gate state.
- `GET /api/providers?type=coach|pacer&city=Doha&q=running` — approved profiles only.
- `POST /api/auth/register` — creates a provider account and a pending profile; an allowlisted Admin email additionally needs `x-admin-setup-key`.
- `POST /api/auth/login`, `POST /api/auth/logout` — short-lived bearer sessions; the raw session token is not stored in D1.
- `GET|PUT /api/me/profile` — read or edit the signed-in provider profile; edits return it to pending review.
- `POST /api/bookings` — stores a booking request with `payment_status=pending_payment`; after a successful save the website opens a pre-filled WhatsApp message to +97466297954 so MZ Active can coordinate Fawran manually. No payment gateway or payment credentials are used.
- `GET /api/admin/applications` — Admin review queue for pending profiles and booking requests.
- `PATCH /api/admin/providers/{id}` and `/api/admin/bookings/{id}` — Admin-only moderation, including manual Fawran receipt confirmation.

## Bindings and runtime settings

Bind a new, dedicated D1 database as `DB`. Configure Worker variables/secrets outside source control:

- `PUBLIC_ORIGINS`: exact site origins, for example `https://mzactive.com,https://www.mzactive.com`.
- `DATA_COLLECTION_ENABLED`: `true` for release; set `false` to pause writes.
- `ADMIN_EMAILS`: comma-separated Admin email addresses.
- `ADMIN_SETUP_KEY`: secret used only to bootstrap an allowlisted Admin account; remove or rotate it after setup.

Never bind the existing `mz-ai-trader-ledger` database to this application. Apply `migrations/0001_marketplace.sql`, `0002_moderation_events.sql`, then `0003_manual_fawran_booking.sql` to the dedicated database before deploying the Worker. No payment credentials or payment endpoints exist.

The D1 primary is in APAC with read replication disabled. It is not hosted in Qatar. Booking handoff details are also sent to WhatsApp/Meta after the booking is saved.

## Local checks

Run `npm test` in this directory. The SQL migration can also be checked without a persistent database with `sqlite3 :memory: < migrations/0001_marketplace.sql`.
