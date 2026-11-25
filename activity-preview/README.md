# MZ Active activity and Garmin integration plan

## Staging today

[Activity staging](https://mzactive-activity-staging.mzactive5.workers.dev/) accepts FIT, GPX and TCX files, draws route previews, supports manual multi-sport entries, and tests a paginated feed of 5,000 synthetic activities. The English and Arabic views have been checked at desktop and mobile sizes. The service worker caches the static shell for offline access. Files and routes are processed in browser memory and cleared when the tab closes. Staging never requests production credentials. Its feed measurement covers browser rendering.

## Production architecture

- Keep the current Cloudflare Worker and existing opaque session tokens. Resolve the account and (user_id) server-side through the existing authentication path before any import, read, publish or coach action. Account type comes from existing member access, approved coach profiles, independent Pacer profiles and Admin Portal permissions. Reuse existing community groups, membership, follow relationships and coach connections.
- Put `activities`, visibility, reactions, comments, challenge enrollments and provider references next to existing account metadata in D1 initially. Store full telemetry and raw files in private object storage when provisioned. Add PostgreSQL and PostGIS for geographic queries and segment efforts in Phase 4. Project authorized public polylines and IDs into PostGIS with a replayable queue. Keep production credentials and bindings separate from staging.
- Create one import pipeline for file uploads, manual logs, wearable events and optional PWA recording. Validate file format, size and coordinate limits, deduplicate uploads using owner-scoped hashes, and deduplicate wearable notifications with a unique provider connection and external activity ID. Extract only supported metrics. Distinguish elapsed time from device-reported moving time. Persist drafts offline with IndexedDB and remove a draft only after an acknowledged upload. Use a queue for parsing, thumbnail generation and re-aggregation. Keep precise coordinates out of logs and public URLs.
- Default activities to private. Resolve visibility before querying each feed and again before serving details, streams or media. Use the athlete-approved coach link for coach-only data. Keep daily sleep, HRV, resting heart rate and recovery metrics in a separate store with independent consent and revocation. Expose these only to the athlete and explicitly authorized coach. Allow a Pacer to manage routes and events independently from coach permissions.
- Produce separate route views. Render a sanitized route and remove coordinates within privacy zones before serving any public map, thumbnail, split map or share payload. Apply an additional start and end margin to public GPS data. Keep full route totals independent of redaction. Preview the public view before publishing.
- Garmin inbound work starts after approval and a confirmed integration contract. Use the approved authorization flow, encrypted credentials, independent permissions, a signed or otherwise provider-verified webhook intake, idempotent background jobs and revocation cleanup. Show device attribution where required by the granted agreement. Require separate athlete opt-in before showing an eligible activity publicly and confirm that the granted agreement permits public display. Keep auto-post disabled by default.
- Garmin Training sends structured workouts or courses through the granted Training and Courses APIs after athlete authorization. Preserve the existing text workout. An explicit structured step mapping is required for watch export. Report queued, accepted by Garmin and failed separately. A compatible device receives published data when it syncs.
- Keep Strava disconnected for this rollout. A future authorized personal import would use segregated, expiring storage and would never provide data to the community or coach views.

## Schedule and implementation estimate

Planning estimates use $45–$75 per hour. Costs below are implementation labor in USD. Hosting, map tiles, storage, wearable commercial terms and post-launch support are separate. The staging preview provisions no paid add-on. The schedule assumes stable scope and overlapping work during Garmin review.

| Phase | Target | Deliverable | Hours | Labor |
| --- | --- | --- | ---: | ---: |
| 1 | Weeks 1–2 | Existing-auth logging, indoor sports, private file ingestion, Garmin access preparation | 55–85 | $2,475–$6,375 |
| 2 | Weeks 3–4 | Authorized Garmin Activity/Health sync, file pipeline, route and performance cards, bilingual QA | 85–125 | $3,825–$9,375 |
| 3 | Weeks 5–7 | Coach planned vs completed, private readiness, Training/Courses export, social feed and club interactions | 105–155 | $4,725–$11,625 |
| 4 | Weeks 8–9 | Club and event leaderboards, moderation controls and initial PostGIS segments | 70–105 | $3,150–$7,875 |
| 5 | Week 10 onward | Route privacy verification, Garmin partner checks and closed beta for 30 participants | 70–110 | $3,150–$8,250 |
| **Total** | | | **385–580** | **$17,325–$43,500** |

Garmin's public Starter page lists limited capacity and push delivery. The public materials reviewed did not establish a free 1,000-user entitlement or a webhook latency guarantee. The access application still requires verified company contact details and the granted API scope and terms. [Garmin program overview](https://developer.garmin.com/gc-developer-program/overview/) · [Garmin access request](https://www.garmin.com/en-US/forms/StarterGarminConnectDeveloperAccess/) · [Strava API agreement](https://www.strava.com/legal/api?hl=en)

## Build the staging shell

Run `npm ci` and `npm run build` inside `activity-preview`. The isolated Worker serves `public/` with no API or database binding.
