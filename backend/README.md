# MZ Active Marketplace API

Cloudflare Worker API for coach/pacer accounts, profile review, approved directory listings, and booking requests. The public site remains on GitHub Pages.

## Privacy gate

`DATA_COLLECTION_ENABLED` controls registration, profile edits, and booking requests. The release setting is `true` after publishing the operational privacy notice, including APAC storage, WhatsApp handoff and retention/deletion periods. Set it to `false` to pause intake; paused writes return `503 intake_paused` without touching D1.

## Routes

- `GET /health` — health and intake-gate state.
- `GET /api/providers?type=coach|pacer&city=Doha&q=running` — approved profiles only.
- `POST /api/auth/register` — creates a provider account and a pending profile; an allowlisted Admin email additionally needs `x-admin-setup-key`.
- `POST /api/auth/login`, `POST /api/auth/logout` — short-lived bearer sessions; the raw session token is not stored in D1.
- `POST /api/auth/forgot-password` — centralized emailed recovery for every role (Admin, member, coach, nutritionist, physiotherapist, massage therapist, pacer). Returns the same generic confirmation for known and unknown emails. Fails closed with `503 recovery_unavailable` until mail is configured.
- `POST /api/auth/reset-password` — exchanges a single-use, short-lived reset token for a new password, invalidates every session for that user, and records a privacy-safe audit event. Only token hashes are stored.
- `POST /api/auth/recover` — Admin-only emergency locked-out password reset using the offline `ADMIN_RECOVERY_KEY`; invalidates all existing sessions. This is not the normal Forgot Password flow.
- `POST /api/auth/change-password` — authenticated self-service password change for every role; keeps the current session and signs out other sessions.
- `GET|PUT /api/me/profile` — read or edit the signed-in provider profile; edits return it to pending review.
- `POST /api/bookings` — stores a booking request with `payment_status=pending_payment`; after a successful save the website opens a pre-filled WhatsApp message to the configured management number so MZ Active can coordinate Fawran manually. No payment gateway or payment credentials are used.
- `GET /api/admin/applications` — Admin review queue for pending profiles and booking requests.
- `PATCH /api/admin/providers/{id}` and `/api/admin/bookings/{id}` — Admin-only moderation, including manual Fawran receipt confirmation.

## Bindings and runtime settings

Bind a new, dedicated D1 database as `DB`. Configure Worker variables/secrets outside source control:

- `PUBLIC_ORIGINS`: exact site origins, for example `https://mzactive.com,https://www.mzactive.com`.
- `DATA_COLLECTION_ENABLED`: `true` for release; set `false` to pause writes.
- `ADMIN_EMAILS`: comma-separated Admin email addresses.
- `ADMIN_SETUP_KEY`: secret used only to bootstrap an allowlisted Admin account; remove or rotate it after setup.
- `ADMIN_RECOVERY_KEY`: separate secret for the locked-out Admin emergency recovery route. Keep it offline; it is never returned to the browser and can be rotated at any time.
- `RESEND_API_KEY`: secret for the existing transactional email account. Reuse the current “MZActive Community” Resend key; do not create a duplicate service. Set it with `npx wrangler secret put RESEND_API_KEY --config backend/wrangler.production.toml` and paste the key at the hidden prompt.
- `EMAIL_FROM`: exact verified Resend sender, for example `MZ Active <no-reply@mzactive.com>`. Store it as a secret unless the verified domain is intentionally public. Password recovery is unavailable until both values are present.

Never bind the existing `mz-ai-trader-ledger` database to this application. Apply migrations in numeric order, including `0018_password_recovery.sql`, to the dedicated database before deploying the Worker. No payment credentials or payment endpoints exist.

## MZA AI Coach

Apply `migrations/0029_ai_coach.sql` before enabling the athlete or coach planner. The migration is additive: it creates AI settings/draft tables and marks saved programs with `source`; it does not change existing programs or accounts.

The adapter in `ai-provider.js` defaults to `local`: a deterministic, offline planner with no API key, no network call, no third-party transfer and no cost. No founder action is required for local mode. Optional provider values are read only from Worker configuration:

- `AI_PROVIDER=local|mock`: offline planner (default).
- `AI_PROVIDER=workers`: uses the existing Cloudflare Workers AI binding; no new key.
- `AI_PROVIDER=deepseek`: requires founder-configured `DEEPSEEK_API_KEY` (and optionally `DEEPSEEK_MODEL`, default `deepseek-flash`). This is a paid option; do not set it or call it without explicit approval.
- `AI_PROVIDER=openai-compatible`: requires founder-configured `AI_BASE_URL` (and optionally `AI_COMPATIBLE_KEY`, `AI_MODEL`) for an approved local or hosted OpenAI-compatible endpoint.

Super admins can disable `athlete_coach_enabled` and `coach_planner_enabled` in the AI Brain admin tab. Athletes approve their own drafts; coach-linked drafts always require the approved coach. See `docs/ai-provider-research.md` for the official-source DeepSeek and Linger findings.

## Owner agents

Apply `migrations/0011_owner_agents.sql` and `migrations/0016_owner_agent_task_types.sql` before enabling
the Owner AI Brain task history. The second migration widens the stored agent taxonomy after 0011 was
already applied. The Worker exposes authenticated agent snapshots and approval routes; agents only create
drafts and record activity. Profile, booking, article, and payment decisions remain explicit Admin actions.
Configure a Cloudflare scheduled trigger to call the Worker `scheduled` export for safe monitoring
and analytics snapshots. Add the cron trigger in the deployment configuration, not in website source.

## Cloudflare Preview and Production preparation

The repository includes `wrangler.preview.toml` and `wrangler.production.toml`. Both hourly cron
configs call the Worker scheduled export. Preview writes remain disabled in the Preview config.
Production configuration contains the live D1 binding ID as reference only; `npm run preflight -- production`
hard-blocks deployment until an owner explicitly reviews and enables it. Do not deploy from this branch.

- Run `npm run preflight -- preview` after setting a dedicated Preview D1 database ID.
- Run `npm run preview:local` for an authenticated-free local preview.
- Run `npm run deploy:preview` only after Cloudflare credentials and the Preview database are configured.
- `npm run deploy:production` intentionally blocks deployment and requires explicit owner approval.

The D1 primary is in APAC with read replication disabled. It is not hosted in Qatar. Booking handoff details are also sent to WhatsApp/Meta after the booking is saved.

## Local checks

Run `npm test` in this directory. The SQL migration can also be checked without a persistent database with `sqlite3 :memory: < migrations/0001_marketplace.sql`.
