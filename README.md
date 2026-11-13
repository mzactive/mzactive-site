# MZ Active — Train Smart. Perform Strong.

Responsive, multi-page MZ Active website for the coaching brand and sports-services marketplace.

## Website pages

- `index.html` — main MZ Active home page
- `marketplace.html` — marketplace overview
- `coaches.html` — approved Coach/Pacer directory, with search and Qatar city filters
- `pacer.html` — pacer and service booking requests
- `training-programmes.html` — dedicated digital training programme page
- `providers.html` — bilingual Coach/Pacer registration, sign-in, profile editing and review status
- `admin.html` — private Admin sign-in, provider moderation and booking-request queue (`noindex`)
- `privacy.html` — operational privacy notice that documents the paused state and remaining policy decisions
- `4-week-10k/` — existing 4-week 10K digital product

## Preserve the existing coaching route

The personal coaching profile and registration remain on the original MZ Active pages:
- Profile / team: https://mzaction.godaddysites.com/the-team
- Registration: https://mzaction.godaddysites.com/register-تسجيل

These are intentionally separate from third-party provider applications and digital programme purchases.

## Provider onboarding

Providers can create a Coach or Pacer account, edit its profile, and check moderation status. Edits return a profile to pending review. Only approved profiles are returned by the public API and shown in `coaches.html`. Admin reviews are available at `admin.html`.

## Current functional boundaries

- The public pages remain static HTML on GitHub Pages; the custom domain remains in `CNAME`.
- Directory search fetches only Admin-approved profiles from the API.
- Provider applications, profile edits and booking requests use the API when intake is enabled.
- Booking requests do not collect payment and are not confirmed bookings.
- A separate Cloudflare Worker API and empty D1 database now support provider accounts, profile editing, Admin approval, approved-profile search, and unpaid booking-request records. The API currently serves `https://mzactive-marketplace-api.mzactive5.workers.dev`.
- API data intake is disabled. Registration, profile edits, and API booking submissions respond with `503 intake_paused` and write no data. Do not enable collection until the public privacy notice and retention/deletion process are ready.
- The empty D1 primary is in APAC with read replication disabled; it is not Qatar-local.
- The public directory, provider portal, Admin queue and booking form are connected to the API. The live API currently returns no profiles.
- `DATA_COLLECTION_ENABLED` is intentionally `false`. The booking form and registration are disabled and the API rejects intake. Do not enable it until Qatar privacy review, data retention/deletion periods, and cross-border processing disclosures are approved and added to `privacy.html`.
- Admin account creation requires setting `ADMIN_EMAILS` and `ADMIN_SETUP_KEY` as Worker secrets/vars, then registering that email through the provider portal with the setup key header. Do not put the setup key in the website.
- There is no booking calendar, marketplace checkout, or commission payout system.
- Do not publish unverified provider profiles or imply that a request is a confirmed booking.

## Deployment

The repository is configured for GitHub Pages and includes the custom domain in `CNAME`. Verify the public site after each deployment before announcing a feature as live.

## Brand assets

- `assets/brand/mzactive-logo.webp` — website logo supplied for the site header.
- `assets/images/mzactive-runners.jpg` — supplied running photo used on the homepage hero.

## Local checks

From `backend/`, run `npm test`. The checked-in tests cover authentication helpers, validation and API request paths. HTML pages are static files and can be previewed through any local static web server.

## Marketplace references

The simplified visitor flow takes cues from [Enhance Fitness](https://enhancefitness.com/en) (clear value statement and short steps) and [Hire A Pacer](https://hireapacer.com) (separate runner and pacer paths, reviewed profiles, and indicative rates). MZ Active does not copy their content or claim their reviews, vetting, payments, or marketplace scale.
