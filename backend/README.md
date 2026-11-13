# MZ Active Marketplace API

Cloudflare Worker API for coach/pacer accounts, profile review, approved directory listings, and booking requests. The public site remains on GitHub Pages.

## Privacy gate

`DATA_COLLECTION_ENABLED` is off unless explicitly set to the literal string `true`. While off, registration, profile edits, and booking requests return `503 intake_paused` without touching D1. Do not enable it until the public privacy notice, retention/deletion process, and contact for data requests are ready. The migration creates empty tables only.

## Routes

- `GET /health` — health and intake-gate state.
- `GET /api/providers?type=coach|pacer&city=Doha&q=running` — approved profiles only.
- `POST /api/auth/register` — creates a provider account and a pending profile; an allowlisted Admin email additionally needs `x-admin-setup-key`.
- `POST /api/auth/login`, `POST /api/auth/logout` — short-lived bearer sessions; the raw session token is not stored in D1.
- `GET|PUT /api/me/profile` — read or edit the signed-in provider profile; edits return it to pending review.
- `POST /api/bookings` — unpaid booking request, accepted only for an approved profile (or a general request).
- `GET /api/admin/applications` — Admin review queue for pending profiles and booking requests.
- `PATCH /api/admin/providers/{id}` and `/api/admin/bookings/{id}` — Admin-only status changes.

## Bindings and runtime settings

Bind a new, dedicated D1 database as `DB`. Configure Worker variables/secrets outside source control:

- `PUBLIC_ORIGINS`: exact site origins, for example `https://mzactive.com,https://www.mzactive.com`.
- `DATA_COLLECTION_ENABLED`: keep `false` until the privacy gate above is complete.
- `ADMIN_EMAILS`: comma-separated Admin email addresses.
- `ADMIN_SETUP_KEY`: secret used only to bootstrap an allowlisted Admin account; remove or rotate it after setup.

Never bind the existing `mz-ai-trader-ledger` database to this application. Apply `migrations/0001_marketplace.sql` to the new database before deploying the Worker. No payment credentials or payment endpoints exist.

The current empty D1 database is in APAC with read replication disabled. It is not hosted in Qatar; keep personal-data collection disabled until the owner approves the data-location and privacy requirements.

## Local checks

Run `npm test` in this directory. The SQL migration can also be checked without a persistent database with `sqlite3 :memory: < migrations/0001_marketplace.sql`.
