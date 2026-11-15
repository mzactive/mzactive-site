# Coaching Studio

The dashboard is progressively enhanced by `assets/js/coaching-studio.js` and `assets/css/coaching-studio.css`. The existing dashboard forms and authenticated Worker API remain authoritative. If the enhancement script does not load, the original weekly form remains usable.

## User flows

- `dashboard.html#loginForm`: shared sign-in for existing accounts.
- `dashboard.html#signup` or `#registerForm`: athlete registration. Coach registration links to the existing provider portal.
- Coaches create a week by selecting a date and adding workouts to individual days. On narrow screens, the day selector shows one day at a time. Desktop shows seven columns.
- Workout title, instructions, optional kilometres and minutes are composed into the existing bounded session details field. An internal `[MZ:{...}]` line stores numeric metadata. History and WhatsApp format that line as readable units.
- Save stores the program through the existing API. Save and share stores first, then opens a WhatsApp handoff. Delivery still requires pressing Send in WhatsApp. No delivery receipt is claimed.
- The workout library derives from the signed-in coach's saved program history. It is not a separately persisted template database.
- History can copy a saved program to the following week. Changing an already-saved athlete/week is not an update operation: the existing API rejects duplicate weeks. A repeated save of the identical payload in the current page reuses the successful response.

## Drafts and privacy

Unsubmitted drafts are held in sessionStorage for the current tab, namespaced by SHA-256 of the current session token. Tokens are never written to draft keys or records. Drafts are cleared after a successful save or sign-out. This is tab recovery, not cross-device synchronization. Saved programs remain in the authenticated database. A new login token cannot load another session's draft.

## Verification

Run `node --test tests/coaching-studio.test.cjs` for save-only, sharing, repeated submission, save failure, popup blocking, refresh failure, and JavaScript parsing checks. The native browser must be used for visual and touch verification.

Existing backend tests had three failures before backend changes in this release (no Worker changes): member dashboard response shape, optional profile-edit validation, and AI model expectation. Resolve and independently audit backend flows before claiming production or acquisition readiness.

## Follow-up product work

Authenticated saved-program revisions with completion preservation, server-side draft sync, standalone template libraries, password recovery, and verified delivery are separate backend work. Do not show placeholder controls or claim those features are active.
