# Build And Release

## Live Product

[Mealog](https://mealog.qs2077.workers.dev/) is the independent browser MVP. The root URL opens Home, not the portfolio or an onboarding gate. Direct links such as /archive and /insights are supported.

## Development

Use Node.js 22.13 or newer; Node 24 is recommended.

```bash
npm ci
npm run web
```

Expo serves the UI. Real AI is only available with the same-origin Worker below; there is no frontend API key.

## App + AI Preview

Use your own Cloudflare account. Change account_id in wrangler.jsonc when deploying a fork. Never commit an OAuth token, API token, or .dev.vars file.

```bash
npx wrangler login
npm run build
npm run preview
```

Open http://127.0.0.1:8793/. Assets come from dist; /api/insights/monthly calls Workers AI remotely, even during local preview.

## Verification

```bash
npm test
npm run check
npx playwright install chromium
npm run test:browser
```

Browser tests use fresh isolated contexts and temporary copies of test images. They never remove original user photos. Set MEALOG_URL to test a deployment and CHROME_CHANNEL=chrome to use installed Chrome. The browser suite does not consume AI quota; worker/ui-check.cjs tests AI UI behavior using explicitly mocked fixtures. worker/smoke.cjs URL makes two real, quota-consuming AI requests.

## Deployment

```bash
npm run deploy
```

The mealog Worker serves dist and the AI API together. SPA fallback supports refresh/deep links; unknown /api paths return JSON 404. One SQLite Durable Object persists quota counters, not journal contents.

No purchased domain, account signup, paid plan upgrade, or cloud photo bucket is configured. Keep the Cloudflare account on Workers Free for a platform-enforced free ceiling; this deployment itself caps generation at 50 attempts per UTC day. Account subscription inspection was unavailable to the current OAuth token, so billing status is not asserted.

## Native Status

The Expo native code and Documents media store are retained, including existing bundle/package/slug/scheme/storage names. This release was validated as a browser product. It is not an App Store/TestFlight/Play Store release. EAS scripts remain available for a later signed build and physical-device QA.

## Limits

Records and images stay in the current browser. No account sync or cloud photo restoration. Clearing site data can remove them. AI processes explicitly submitted text and can make mistakes. Mainland China access and physical iOS/Android behavior require separate testing.
