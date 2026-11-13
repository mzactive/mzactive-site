# MZActive — Booking & Provider Intake MVP Design (Draft)

Status: Worker API implemented and deployed separately; D1 schema applied; intake disabled; public site is not yet connected. No customer or provider records have been added. Related: #2.

## Goals
- Preserve current public static site and WhatsApp handoff while building a reliable request intake.
- Never equate form submission or opening WhatsApp with a confirmed booking.
- Keep coach applications separate from athlete booking requests.
- Avoid collecting health records, identity documents, payment cards, or sensitive training details in the initial MVP.

## Current stack
Cloudflare Worker API + a dedicated D1 database, separate from the GitHub Pages site. The Worker is on `workers.dev`; `mzactive.com` DNS and the existing GitHub Pages setup are unchanged. The D1 primary location is APAC with read replication disabled. No data is being collected until privacy and retention requirements are ready. Keep service credentials in environment secrets, never client HTML or Git.

## Proposed entities

```sql
CREATE TABLE booking_requests (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  service_type TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  preferred_date TEXT,
  goal_summary TEXT,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK(status IN ('received','reviewing','accepted','declined','cancelled')),
  consent_at TEXT NOT NULL
);

CREATE TABLE provider_applications (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  applicant_email TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  service_type TEXT NOT NULL,
  experience_summary TEXT,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK(status IN ('received','reviewing','accepted','declined','cancelled')),
  consent_at TEXT NOT NULL
);

CREATE INDEX idx_booking_status_created ON booking_requests(status, created_at);
CREATE INDEX idx_provider_status_created ON provider_applications(status, created_at);
```

## Request flow
1. User completes a first-party form and sees privacy/consent text.
2. Frontend POSTs to a same-origin API over HTTPS.
3. Server validates, rate-limits, generates opaque ID, persists request and returns an acknowledgement ID.
4. UI says **Request received — awaiting review** only on successful server response. Errors show a retry option; never imply success.
5. Admin verifies availability and updates status; only staff confirmation constitutes an accepted booking.
6. Optional WhatsApp follow-up uses request ID, not full personal details in URL.
7. Admin access is authenticated, authorized and audited; no public listing of submissions.

## Security & privacy requirements
- Validate and bound every field server-side; use parameterized SQL; rate limit and anti-spam controls.
- CORS allowlist / same-origin; secure headers; no secrets in browser; no public database endpoint.
- Restrict admin access by role, log status changes without copying personal information into logs.
- Publish privacy notice, retention/deletion policy and contact for access/deletion requests before collecting production submissions.
- Evaluate applicable Qatar and other jurisdictional privacy obligations before launch.
- Avoid storing payment details. Payments, AI training plans and athlete medical data are out of scope.

## Migration plan
- Phase A: validate the existing WhatsApp and Jotform flows in a browser; map all required fields and decide canonical provider intake.
- Phase B: implement API + D1 migration on staging with synthetic test data; add automated validation/security tests.
- Phase C: connect one form at a time; verify acknowledgements and failure handling.
- Phase D: review access, retention, and staff process; launch with rollback plan.

## Acceptance tests
- Invalid email/missing required fields => no record created.
- Valid request => one persisted record and opaque acknowledgement ID.
- Repeated submission/idempotency => no accidental duplicate.
- Unauthenticated caller cannot read or change request status.
- Server failure => visible failure, no false confirmation.
- Mobile and desktop forms remain usable.
- Demo coaches remain clearly labeled as examples, not bookable inventory.
