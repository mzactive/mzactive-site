# AI provider research for MZA AI Coach

Research only. No API key was created, no paid call was made, and no credentials or settings were changed. Sources are official provider pages where available.

## DeepSeek

**Identity.** DeepSeek is operated by Hangzhou DeepSeek Artificial Intelligence Co., Ltd. Its privacy policy names the same company as data controller with a registered address in China.

Official sources:
- https://www.deepseek.com/
- https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html
- https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html
- https://api-docs.deepseek.com/
- https://api-docs.deepseek.com/api/create-chat-completion
- https://api-docs.deepseek.com/quick_start/pricing
- https://api-docs.deepseek.com/quick_start/rate_limit
- https://api-docs.deepseek.com/api/get-user-balance
- https://static.deepseek.com/faq/index.html?lang=en#/category/4

**Developer API.** The API is OpenAI-compatible at `https://api.deepseek.com` (chat completions at `POST /chat/completions`). Current model IDs in the API docs are `deepseek-flash` and `deepseek-v4-pro`. The older `deepseek-chat` and `deepseek-reasoner` IDs are retired after 24 July 2026. The API supports JSON mode, tool calls, streaming and a `user_id` field.

**Pricing (per million tokens, from the API pricing page):**

| Model | Cache hit input | Cache miss input | Output |
| --- | ---: | ---: | ---: |
| `deepseek-flash`, off-peak | $0.003 | $0.15 | $0.60 |
| `deepseek-flash`, peak | $0.006 | $0.30 | $1.20 |
| `deepseek-v4-pro`, off-peak | $0.022 | $0.66 | $1.98 |
| `deepseek-v4-pro`, peak | $0.044 | $1.32 | $3.96 |

Off-peak is half of peak; peak hours are 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday. Prices can change. The marketing platform page still shows older figures and says prices may change; the API pricing page is authoritative for billing.

**Free tier.** No genuinely free developer API tier or universal signup trial is promised on official pages. Top-up is documented as the normal funding path. A `granted_balance` field exists in the balance API, but no official page guarantees free credits to new accounts. Do not design around rumoured credits.

**Limits.** Published concurrency limits are account-level: 2,500 for `deepseek-flash`, 500 for `deepseek-v4-pro`. Exceeding them gives HTTP 429. No free-tier-specific quota is documented.

**Privacy.** The privacy policy says personal data is collected, processed and stored in the People's Republic of China, and account/payment data is kept for as long as the account exists. Terms allow minimal use of inputs and outputs to improve services unless the user turns off “Improve the model for everyone”. The privacy policy explicitly says data collected from end users of downstream developer applications is **not covered** by that policy; the developer is the controller for that relationship. No API-specific zero-retention/no-training commitment was found in official API docs. Liability is capped at the greater of amount paid or US$100.

**Suitability.** Credible low-cost paid option for conservative drafts with JSON mode and a compatible adapter shape. Use only with explicit founder approval, a stored secret, spend cap, off-peak scheduling, no personal/health data in prompts, fallback to local mode, and clear privacy notice. Current MZA implementation defaults to local and requires `AI_PROVIDER=deepseek` plus `DEEPSEEK_API_KEY` before any request is possible.

## Linger AI

**Identity.** Linger is not a hosted AI model API. It is an open-source personal agent from SimplexAI that runs on the user's own computer. The official site says “Your personal agent, on your own computer”; the repository describes it as an open-source personal agent that runs fully on your PC. The licence names SIMPLEX AI TECHNOLOGIES PTE. LTD.

Official sources:
- https://heylinger.com/
- https://github.com/simplexai-labs/linger
- https://docs.heylinger.com/
- https://docs.heylinger.com/llms.txt
- https://docs.heylinger.com/security/data-and-privacy.md
- https://docs.heylinger.com/developers/architecture.md
- https://docs.heylinger.com/models/local-and-cloud.md
- https://raw.githubusercontent.com/simplexai-labs/linger/main/LICENSE

Not official Linger APIs:
- https://linger.wiki/ says it is an unofficial community guide not affiliated with Linger.
- The WordPress “Linger AI Bridge for OpenAI-Compatible APIs” plugin is a third-party bridge to an admin-configured endpoint, not a Linger service.
- https://linger.day/ is an unrelated relationship app.

**Developer API.** No trustworthy public developer API documentation, hosted endpoint, API-key issuance or API pricing page exists. Official docs say Linger needs no model gateway or API key of its own; model calls run through the user's Claude Code, Codex or Pi runtime or a local model server, and the model endpoint is not part of Linger. Repository “OpenAPI/contracts” are internal self-hosted process contracts, not a customer API.

**Free tier/pricing.** The software is open source under a modified Apache 2.0 licence. Local inference has no per-token fee but requires the founder's own hardware and a runtime; cloud models count against the founder's own subscription/API account. The licence restricts offering Linger itself as a hosted/managed service to third parties without written authorization.

**Suitability.** Not suitable as an MZActive API provider. There is no hosted endpoint to integrate, it is early-stage/self-hosted, and the licence restricts managed hosting. Do not present Linger as a provider option.

## Recommendation

1. Keep `local` as the default and CI mode: deterministic, bilingual, offline, no cost and no third-party data transfer.
2. Keep the existing Cloudflare Workers AI binding as an optional already-provisioned path where available.
3. Keep generic OpenAI-compatible adapter support for a founder-approved local endpoint if realistic integration tests are needed.
4. Treat DeepSeek as a future low-cost paid option only after founder approval, spend controls and privacy review.
5. Do not integrate Linger as a provider.
