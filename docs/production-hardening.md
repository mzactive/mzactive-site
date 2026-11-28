# MZActive production hardening

## Production evidence from 28 November 2026

The public frontend is static GitHub Pages behind Cloudflare's proxied apex and www records. Cloudflare serves HTTPS to visitors and redirects HTTP. The Marketplace API is the separate Cloudflare Worker using production D1. The existing preview API has a different Worker and D1 binding. The frontend hardening preview uses a separate assets-only Worker with no database or production API access.

SSL Labs returned B for all four apex edge endpoints. Each advertised TLS 1.0, 1.1, 1.2 and 1.3. Cloudflare independently reported a zone minimum of 1.0 and TLS 1.3 enabled. SSL Labs caps the grade at B when a server accepts TLS 1.0 or 1.1.

| SSL Labs endpoint | Grade |
| --- | --- |
| `104.21.2.10` | B |
| `172.67.128.126` | B |
| `2606:4700:3034::ac43:807e` | B |
| `2606:4700:3035::6815:20a` | B |

| Production request | Observed response |
| --- | --- |
| `http://mzactive.com/` | Redirects to HTTPS. |
| `https://www.mzactive.com/` | Redirects to the canonical apex. |
| `https://mzactive.com/` | HTTP 200. No HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy or Permissions-Policy headers. |
| `https://mzactive.com/sw.js` | HTTP 200, JavaScript MIME type and `Cache-Control: max-age=14400`. |
| `https://mzactive.com/manifest.json` | HTTP 200, JSON MIME type and `Cache-Control: max-age=600`. |
| Marketplace Worker `/health` | HTTP 200, `Cache-Control: no-store`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`. |

Cloudflare reported SSL mode `full`, HSTS disabled, a browser cache TTL of 14,400 seconds, and no entrypoint for either response header transforms or cache rules. The SSL mode for traffic from Cloudflare to GitHub Pages is independent of the TLS versions advertised to visitors. A direct HTTPS request using the apex hostname returned HTTP 200 with certificate verification passing on all four configured GitHub Pages origin IPs.

## Production rollout after approval

1. Verify the GitHub Pages origin certificate and chain for the proxied hostnames before separately evaluating a change to Full (strict). Confirm the apex, www redirect and any other proxied web hostname are in the scope of the zone-wide TLS policy.
2. Set the zone's minimum TLS version to 1.2 and retain TLS 1.3. Rerun SSL Labs for the apex and www after edge propagation. Record the four apex results and confirm both legacy protocols are gone. Confirm HTTPS and canonical redirects.
3. Install a response transform for apex and www. Start with `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` and `Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'`. Review document embedding and verify page scripts, uploads and the browser install flow. The preview's extra `connect-src 'self'` and `form-action 'self'` directives isolate it and are outside this production policy. A future script or connection policy needs its own report-only inventory and journey testing.
4. Start host-only HSTS after verifying HTTPS across the production hosts. Begin at a short max age, then extend after observation. Keep `includeSubDomains` and preload disabled while mail and any unrelated subdomains are assessed. Browser clients retain an HSTS policy for its advertised lifetime.
5. Bypass Cloudflare edge caching for the exact `/sw.js`, `/manifest.json` and `/offline.html` paths, across query variants. Set `Cache-Control: no-cache, max-age=0, must-revalidate` for the same paths. Validate both bare and versioned requests after propagation. Preserve fingerprinted assets' caching. Apply the branch through the existing GitHub Pages deployment after approval and verify a cold install, an existing install updating and declining an update, and offline navigation. Purge only affected cache entries if they are still served stale.
6. Recheck the public HTML and redirects, the Worker health response, mobile and desktop locale navigation, and a test-account booking or profile journey. Compare mobile Lighthouse runs under the same throttling and recheck the WAVE markers on the production hostname.

## Preview scope

[Open the frontend staging preview](https://mzactive-hardening-staging.mzactive5.workers.dev/). Its frontend can be exercised with synthetic fixtures in the repository's Playwright suite. The preview is served with `X-Robots-Tag: noindex, nofollow`, and its connection policy blocks requests to the production API. The production hostname, DNS, edge configuration, Marketplace Worker and D1 are outside the preview deployment.

## Accessibility and delivery evidence

| WAVE check | Production retest | Hardening preview |
| --- | ---: | ---: |
| AIM score | 8.5 / 10 | 10 / 10 |
| Contrast errors | 3 | 0 |
| Very small text | 43 | 0 |
| Redundant links | 1 | 0 |
| Redundant title alerts | 1 | 0 |

WAVE identified the contrast errors on the numbered onboarding badges. The earlier production capture showed 49 small-text alerts. The side-by-side public reports above used a fresh production retest and the final staging revision. Empty alternatives on category photos and logo repetitions were reviewed against their adjacent visible labels. The hero and standalone informational photographs keep descriptive alternatives.

The three recovery photos retain their original subjects and crops. The 320 px WebP derivatives total 29,668 bytes, compared with 144,475 bytes for the three former 640 px JPEG requests. The original hero still uses a single format-gated high-priority WebP request.

An actual staged PWA update from v9 to v10 was exercised. Choosing Later left v9 active. Explicit confirmation activated v10 and retired the previous cache. Offline navigation to the management page returned the generic offline screen. Unlisted assets and API responses stayed outside Cache Storage. Chromium and an iPhone-sized WebKit session verified the mobile UI. Native Add to Home Screen on a physical iPhone remains a device check.
