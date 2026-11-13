# MZ Active — Train Smart. Perform Strong.

Responsive, multi-page MZ Active website for the coaching brand and sports-services marketplace.

## Website pages

- `index.html` — main MZ Active home page
- `marketplace.html` — marketplace overview
- `coaches.html` — coach discovery concept page (sample profiles are explicitly marked as demos)
- `pacer.html` — pacer and service booking requests
- `training-programmes.html` — dedicated digital training programme page
- `providers.html` — bilingual provider application page
- `4-week-10k/` — existing 4-week 10K digital product

## Preserve the existing coaching route

The personal coaching profile and registration remain on the original MZ Active pages:
- Profile / team: https://mzaction.godaddysites.com/the-team
- Registration: https://mzaction.godaddysites.com/register-تسجيل

These are intentionally separate from third-party provider applications and digital programme purchases.

## Provider onboarding

The provider page embeds the bilingual MZ Active application form:
https://form.jotform.com/263130309308045

Applications are collected for manual review. Submitting an application does not approve a provider, publish a searchable profile, or confirm a booking.

## Current functional boundaries

- The public pages remain static HTML on GitHub Pages; the custom domain remains in `CNAME`.
- Pacer/service requests are sent through WhatsApp for manual follow-up.
- Provider applications are collected by Jotform for review.
- Coach directory cards are demonstrations, not verified live listings.
- A separate Cloudflare Worker API and empty D1 database now support provider accounts, profile editing, Admin approval, approved-profile search, and unpaid booking-request records. The API currently serves `https://mzactive-marketplace-api.mzactive5.workers.dev`.
- API data intake is disabled. Registration, profile edits, and API booking submissions respond with `503 intake_paused` and write no data. Do not enable collection until the public privacy notice and retention/deletion process are ready.
- The empty D1 primary is in APAC with read replication disabled; it is not Qatar-local.
- The current public pages are not connected to the API yet. Existing demo cards remain clearly labeled; the API returns only approved profiles (currently none).
- There is no booking calendar, marketplace checkout, or commission payout system.
- Do not publish unverified provider profiles or imply that a request is a confirmed booking.

## Deployment

The repository is configured for GitHub Pages and includes the custom domain in `CNAME`. Verify the public site after each deployment before announcing a feature as live.

## Brand assets

- `assets/brand/mzactive-logo.webp` — website logo supplied for the site header.
- `assets/images/mzactive-runners.jpg` — supplied running photo used on the homepage hero.

## Marketplace references

The simplified visitor flow takes cues from [Enhance Fitness](https://enhancefitness.com/en) (clear value statement and short steps) and [Hire A Pacer](https://hireapacer.com) (separate runner and pacer paths, reviewed profiles, and indicative rates). MZ Active does not copy their content or claim their reviews, vetting, payments, or marketplace scale.
