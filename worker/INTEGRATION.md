# Monthly Insights Worker

The public App and API deploy together. There is no API key in the browser and no separate backend to start in production.

## Request and response

`POST /api/insights/monthly` accepts JSON with exactly `version`, `month`, `locale`, and `meals`. Each meal contains exactly `id`, `date`, `title`, `mealType`, `moodTags`, `companyTags`, `note`, and `hasPhoto`.

- Version: `1`; month: `YYYY-MM`; locale: `en` or `zh`.
- At most 200 meals and 64 KiB per request; titles at most 80 and notes at most 240 UTF-16 code units.
- No image bytes, image URLs, GPS fields, location fields, or contact profiles. User-written text may itself contain personal details.
- Browser requests must be same-origin. Unknown API routes return JSON 404, not the App's HTML fallback.

The response includes version, contentVersion (currently 2), month, locale, provider, model, generation time, deterministic metrics, a short title, one to three observations, and evidence meal IDs. Server and client validate the response. All cited IDs must belong to the supplied evidence. The client still accepts historical reports without contentVersion, but marks them stale.

Model: `@cf/meta/llama-3.1-8b-instruct-fast`. Provider: `cloudflare_workers_ai`. JSON Mode uses a schema followed by application validation. A prompt of at most 4096 UTF-8 bytes contains a bounded sample of up to 12 meals. Output is limited to 640 tokens. Metrics use every validated meal, not model guesses. English and Chinese instructions require natural language and forbid invented events, locations, or psychological/relationship conclusions. Schema validation cannot guarantee semantic truth; the UI says AI can be mistaken and links to the meals.

## Privacy and cost controls

One SQLite Durable Object, `InsightsQuota/global-v1`, atomically reserves attempts before AI runs. Limits: 50 attempts per UTC day across the public deployment and 3 per IP/network per 10-minute window. Failures count. SQLite contains counters, a salt, hashed IP identifiers, and expiry times, not journal contents. Expired network-counter rows are removed on subsequent traffic.

The API is public; callers can exhaust the shared allowance. The global counter is the hard generation cap. Clearing browser data cannot reset it. No paid-plan upgrade is performed. The OAuth session could deploy but could not inspect subscriptions (403); the billing plan is not independently verified. Keep Workers Free enabled for platform no-overage behavior. Other applications share the account's free allocation.

App request-body logging, Worker observability logs/traces, and Wrangler telemetry are disabled. No AI Gateway is configured. Cloudflare still processes the requested text; this is not on-device inference.

The server supplies a 30-second abort signal to AI; the client times out after 45 seconds. There are no hidden retries or automatic generations. Provider errors, invalid structured output, timeouts, and quota exhaustion preserve saved reports and statistics.

## Client integration

`src/insights/monthlyReport.ts` caches up to 12 reports in `@mealogue/insightsCache/v1`, keyed by personal/sample scope, month, language, and the sanitized input snapshot. Source filtering occurs locally. No stale fallback crosses scopes, including legacy unscoped reports. Notes are opt-in; changed sharing choices, inputs or content version mark an old report stale until explicit regeneration. Full data clearing removes this cache and the separate private monthly reflections list. The language provider stores the UI preference; it never rewrites meal titles, notes, or names.

`wrangler.jsonc` serves `dist` with SPA fallback and routes `/api` and `/api/*` through the Worker first. App and Worker have separate TypeScript environments. Use Node 22.13 or later; Node 24 is recommended. Regenerate bindings with `npx wrangler types worker/env.d.ts`.

## Tests

- `node worker/tests.cjs`: validation, privacy allowlist, bounded bodies/prompts, SQLite concurrency and reopen persistence, 50/51 cap, UTC reset, provider failures, timeout path, and client cache.
- `node worker/ui-check.cjs`: mocked browser checks for explicit generation, cached/stale reports, failures, empty months, languages, and reference navigation.
- `CHROME_CHANNEL=chrome node tests/proposal-browser.mjs`: mocked AI UI plus real browser storage checks for personal/sample isolation, private monthly writing, note opt-in, write failure/retry, camera file capture, managed photos and deliberate location access.
- `CHROME_CHANNEL=chrome MEALOG_URL=https://mealog.qs2077.workers.dev node tests/live-ai-browser.mjs`: opt-in live test, consuming three AI attempts. Generates English, adds a meal and regenerates, generates Chinese, then deliberately hits the network limit. Closes and reopens Chrome to check persistence.
- `node worker/smoke.cjs URL`: optional two-call real AI smoke test. Do not run alongside the three-call suite within the same network window.

See the [MVP QA report](../docs/STANDALONE_MVP_QA.md) for observed results. Local preview uses real remote AI but local test quota storage; preview calls also consume the account's AI allowance.

## Official references

- [Workers AI model](https://developers.cloudflare.com/workers-ai/models/llama-3.1-8b-instruct-fast/)
- [JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/)
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [SQLite Durable Object storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Static assets and Worker routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
