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
- Provider applications, profile edits and booking requests use the MZ Active Worker/D1 API. Marketplace sign-in is separate from the legacy GoDaddy coaching pages.
- Booking requests are stored as pending manual Fawran payment. A successful save opens a pre-filled WhatsApp handoff to +97466297954; the website has no payment gateway, and a request remains unconfirmed until availability and payment are checked.
- The separate Cloudflare Worker API and D1 database support provider accounts, Admin approval, approved-profile search, and manual-payment booking requests. The API is `https://mzactive-marketplace-api.mzactive5.workers.dev`.
- Booking requests are stored as `pending_payment`. After a successful save, the site opens a pre-filled WhatsApp handoff to +97466297954 for manual Fawran coordination. There is no payment gateway; requests remain unconfirmed until availability and payment are checked.
- The D1 primary is in APAC with read replication disabled; it is not Qatar-local. Booking handoff details also pass to WhatsApp/Meta after a successful API save. The site privacy notice describes the handoff and retention periods.
- The public directory, provider portal, Admin queue and booking form are connected to the API. Public profile search returns only Admin-approved profiles; the roster starts empty.
- The Worker intake gate is enabled for release. Keep the D1 database limited to marketplace data and turn off `DATA_COLLECTION_ENABLED` if collection needs to pause.
- Admin bootstrap uses the allowlisted email and one-time secret configured on the Worker; complete it at `admin.html`, then rotate/remove the setup secret. Never put it in website source.
- High-resolution athlete photo upload is not active yet because dedicated secure image storage has not been configured. The application form states this clearly.
- There is no booking calendar, marketplace checkout, or commission payout system.
- Do not publish unverified provider profiles or imply that a request is a confirmed booking.

## Deployment

The repository is configured for GitHub Pages and includes the custom domain in `CNAME`. Verify the public site after each deployment before announcing a feature as live.

## Brand assets

- `assets/brand/mzactive-logo.webp` — website logo supplied for the site header.
- `assets/images/mzactive-runners.jpg` — supplied running photo used on the homepage hero.
- `assets/images/qatar-finish-line.jpg` — supplied Qatar finish-line photo used on the Champion Pacer page.

## Local checks

From `backend/`, run `npm test`. The checked-in tests cover authentication helpers, validation and API request paths. HTML pages are static files and can be previewed through any local static web server.

## Marketplace references

The simplified visitor flow takes cues from [Enhance Fitness](https://enhancefitness.com/en) (clear value statement and short steps) and [Hire A Pacer](https://hireapacer.com) (separate runner and pacer paths, reviewed profiles, and indicative rates). MZ Active does not copy their content or claim their reviews, vetting, payments, or marketplace scale.
