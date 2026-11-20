# Free E2E and performance checks

All browser and performance automation here is free, local and offline-safe. It uses `npx playwright` (Chromium already installed) and `npx lighthouse`. There are no paid device clouds, no third-party test runners, no secrets, and no production writes.

## Scripts

From the repository root:

```sh
npm run test:static      # node --test tests/*.cjs (existing static checks)
npm run test:backend     # npm test --prefix backend
npm run test:e2e         # npx playwright test --config playwright.config.cjs
npm run test:e2e:list    # list specs without running them
npm run perf:lighthouse  # node scripts/perf-budget.cjs
```

`package.json` intentionally has no dependencies or lockfile. If Playwright/Lighthouse are already in the npx cache, no network access is needed. The spec shim (`tests/e2e/pw.cjs`) reuses the Playwright copy that runs the CLI, so no local `npm install` is required.

## Running E2E against a local preview

The default `BASE_URL` is `http://127.0.0.1:8080`. Playwright starts a local static server automatically when the base URL points at localhost/127.0.0.1:

```sh
npm run test:e2e
```

To attach to your own already-running local server, opt in explicitly so Playwright does not start its own process on the same port:

```sh
BASE_URL=http://127.0.0.1:8080 PW_REUSE_SERVER=1 npm run test:e2e
```

Two mobile-first Chromium projects run every spec: an iPhone-like 390×844 device and an Android-like 412×915 device. No real phones or cloud devices are involved.

## Running E2E against production (read-only)

```sh
BASE_URL=https://mzactive.com npm run test:e2e
```

Even against production HTML, **all worker API traffic and every cross-origin request is intercepted locally** by `installApiMock()` in `tests/e2e/helpers.cjs`. Unmocked API paths are answered with a visible `e2e_unmocked_api` error; other external requests are blocked and recorded, while `wa.me` pop-ups are fulfilled locally with HTTP 204 and recorded without leaving the page. `assertOfflineSafe()` fails a test if anything escaped the boundary. No real credentials, recovery keys, tokens or production data are used; test values are obviously fake (`example.invalid`, `e2e-only-mock-token-not-a-secret`).

## Journey coverage

| Spec | What it verifies |
| --- | --- |
| `booking.spec.cjs` | Required-field and consent validation, exactly one mocked booking POST, "not a confirmed booking" wording, failure messaging with no WhatsApp pop-up. |
| `admin-auth.spec.cjs` | Invalid sign-in/recovery behaviour with synthetic inputs only, password toggle, role workspace stays locked, no token stored. |
| `coach-dashboard.spec.cjs` | Mock sign-in, approved coach tools, pending-coach permission limits (no team creation, no admin booking inbox), no stuck loading state. |
| `athlete-workspace.spec.cjs` | Booking-created workspace stays inactive until athlete acceptance; coach accept action unlocks private messaging. All PATCH calls are mocked. |
| `private-workspace.spec.cjs` | Private message round-trip, program history, session draft persistence keyed by a hash of the fake token (never the token itself), member permission boundaries. |
| `garmin.spec.cjs` | Garmin is shown as a public HTTPS profile link only; explicit "no credentials or health data" wording; non-HTTPS input is rejected without an API call. No sync/OAuth flow exists or is tested as if it did. |
| `pwa.spec.cjs` | Service worker script served by a route mock, update detected via `registration.update()`, waiting-worker confirmation contract, page remains usable. |
| `mobile-nav.spec.cjs` | Mobile menu open/navigate/close and pages that settle instead of spinning forever. |

### PWA update prompt

`assets/js/pwa-register.js` renders `.mza-update-banner` with the text "A new version of MZ Active is available." and the controls `.mza-update-confirm` and `.mza-update-later`. `pwa.spec.cjs` intercepts `/sw.js` with two byte-different local worker scripts, calls `registration.update()`, then verifies both paths:

- **Confirm** sends `MZA_SKIP_WAITING`, activates the waiting worker, reloads the page and hides the banner.
- **Later** hides the banner without activating the waiting worker.

No site files were changed to add or alter the prompt.

## Lighthouse performance and PWA budgets

Start a local server first (only needed for the perf command; the E2E command starts its own):

```sh
python3 -m http.server 8080 --bind 127.0.0.1
npm run perf:lighthouse
```

Against production or an explicit local URL:

```sh
node scripts/perf-budget.cjs https://mzactive.com/
node scripts/perf-budget.cjs --url=http://127.0.0.1:8080/ --out=/tmp/mzactive-lighthouse.json
PERF_URL=https://mzactive.com/ npm run perf:lighthouse
```

`scripts/perf-budget.cjs` invokes `npx lighthouse` with `--output=json --output-path=...` and mobile Chromium flags, parses the JSON, and enforces:

- LCP ≤ 2500 ms
- INP ≤ 200 ms **when measurable**
- CLS ≤ 0.1

Lab runs cannot measure field INP/CrUX. When the INP audit is absent or `notApplicable`, the script prints `SKIP` with an explanation rather than claiming a pass or failing. Any measured regression exits with status 1.

Current local baseline in this worktree: LCP was measured at 2.53s and 2.64s across two runs (over the 2.50s budget), CLS was 0.000, INP was unavailable, and the performance score was 95–97. The script therefore exits 1 until LCP is reduced. No site, asset or service-worker files were changed to tune that baseline as part of this automation work.

Lighthouse 13 no longer ships a PWA category. The script reports that explicitly and still checks the local `manifest.json`, `sw.js`, the manifest link and worker registration. Lighthouse JSON is written to the OS temp directory (or `--out`) so no report artifacts pollute the repository.

## Files added

- `package.json`
- `playwright.config.cjs`
- `tests/e2e/helpers.cjs`, `tests/e2e/pw.cjs`
- `tests/e2e/*.spec.cjs` (booking, admin auth, coach dashboard, athlete workspace, private workspace, Garmin, PWA, mobile navigation)
- `scripts/perf-budget.cjs`
- `docs/e2e-testing.md`

No existing site, backend, service worker, asset, test or Wrangler file was modified.
