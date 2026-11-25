# Final launch readiness notes

## Scope of this pass

This branch (`feat/final-launch-readiness`) is based on `main` at `26b9e39` (PR #102) and
focuses on verified fixes in the Pacer journey, booking integrity, AI reporting and
shared reliability. It does not rebuild working platform components.

## Verified fixes

### Pacer journey
- **Registration issues a real session.** `/api/pacer/register` now returns a session token
  via `issueSession`. The dedicated registration page stores it with `MZActiveAuth.store`,
  so the photo upload actually authenticates and the applicant can open their workspace.
- **Photo upload protocol corrected.** The registration page sends the raw image body with
  its MIME type, matching `readImageBody` in the Worker (the old `FormData` body always failed).
- **Flexible pacing dates.** A Pacer request without a date is accepted (stored as an empty
  string) and the response status is `pending`, matching the stored row.
- **Pacer workspace fixed.** `pacer-dashboard.html` now renders the real `pacer_requests`
  contract (`pending`, `event_name`, `date`, `location`, `message`) instead of legacy
  booking fields, so incoming requests appear and can be accepted/declined/completed.
- **Admin Pacer requests** show the correct event/date/location fields.
- **Public Pacer profile** escapes every submitted field before `innerHTML`, and its back
  link points to the existing `pacer.html` directory (the old `pacers.html` was 404).
- **Pacer directory filters added** for country, city, distance, target pace, finishing time,
  availability and language, backed by `/api/pacers` query parameters. Cards link to the
  dedicated public profile as well as the request form, and use the correct photo field.

### Booking integrity
- Identical repeat submissions (same phone, provider, goal and preferred date) within 15
  minutes are rejected with `409 duplicate_request`. Distinct requests remain allowed.
- Requesters now receive one bilingual confirmation email (when email delivery is
  configured) for both coaching bookings and Pacer pacing requests, deduplicated by event
  key. It states clearly that nothing is confirmed and no payment was taken.

### AI Brain
- The configurable daily report time now works with the hourly cron: an `HH:MM` setting
  such as `07:30` is delivered on the first hourly tick at or after that time.
- Manual forced reports update the existing report row instead of writing a fresh id that
  never matched the unique `report_date` row.

### Reliability / consistency
- The coach directory loads `management-contact.js`, so its WhatsApp contact link works.
- The 4-week 10K page uses one consistent price (US$14) instead of mixing US$14/QAR 49.
- Preview hosts (`.pages.dev`) route to the preview Worker in `api-base.js`, so staging
  cannot write to production D1.
- Fixed two regressions found in the existing `main` E2E baseline: sign-in now follows the
  backend destination returned by the login response, and the booking status copy again
  states that a request is not a confirmed booking and no payment was collected.
- Updated E2E specs that still asserted the pre-Coach-Studio UI (legacy dashboard URL,
  old card label/colour, old booking href, and a missing `/api/connections` mock) so they
  test the current behaviour instead of a removed layout.

## Test evidence

- Static: `npm run test:static` — 237 passed.
- Backend: `npm test --prefix backend` — 166 passed.
- E2E: `npx playwright test --config playwright.config.cjs` — see PR conversation for the
  final run (desktop, iPhone, Android; EN + AR/RTL). All API traffic is mocked by
  `tests/e2e/helpers.cjs`; no production writes occur.
- New regression specs:
  - `backend/pacer-independence.test.js` (4 tests)
  - `tests/e2e/pacer-workspace-fixes.spec.cjs` (3 tests x 3 projects)
  - `tests/e2e/pacers-directory.spec.cjs` (filter + profile-link assertions)

## Deployment and rollback plan

1. Review and merge the PR into `main`.
2. Apply no new migration: migration 0043 is already present in production D1 from PR #85.
3. Deploy the Worker: `cd backend && npx wrangler deploy --config wrangler.production.toml`.
4. Publish the static site through the existing GitHub Pages path (push to `main`).
5. Smoke-test: `/api/pacers` 200, `/api/pacer/register`, Pacer directory filters, Pacer
   dashboard, `/samla/` Arabic default, admin Pacers tab, homepage coach cards.
6. Rollback: revert the merge commit on `main`; redeploy the previous Worker version with
   `npx wrangler rollback` (or redeploy the previous commit's `worker.js`); re-publish the
   previous Pages commit. No production data is deleted by rollback.

## Known limitations / blockers (not changed in this pass)

- **Linear tickets MZ-5…MZ-18 could not be updated**: no Linear API credential or MCP server
  is configured in this environment. MZA-BUG-001/002/003 also have no description in the
  repository, so they were investigated by code audit rather than by ticket ID.
- **Activity privacy is still boolean-based** (`share_with_coaches` plus account visibility),
  not a three-state per-activity `private/shared_with_coach/public` model with revocation.
- **Athlete profile does not list followed coaches** (only a count endpoint exists).
- Admin/provider booking status transitions still do not email the requester (only creation
  confirmation was added in this pass).
- **A priced 4-week 10K product remains live** with manual WhatsApp ordering. No online
  payment is collected; this conflicts with a strict reading of "payments disabled" and
  should be confirmed by the owner before launch.
- **Strava/Garmin link fields remain in registration forms** as public profile URLs only;
  no sync or OAuth integration exists.
- **No hosted staging URL**: the Cloudflare account has no Pages project and the GitHub
  repository uses GitHub Pages, which has no per-branch preview. A local preview and PR
  were supplied for review instead. Confirm the preferred staging mechanism before merge.
