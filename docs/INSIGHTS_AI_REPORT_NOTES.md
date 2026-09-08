# Monthly AI Insights

Insights generates a report only after the user presses Generate. The hosted app sends an allowlisted monthly text payload to its same-origin Cloudflare Worker, which calls Workers AI model `@cf/meta/llama-3.1-8b-instruct-fast` using JSON Mode. Provider metadata is `cloudflare_workers_ai`.

The server computes meal, day, note, photo-presence, mood, type and companionship counts from validated input. AI writes the reflection and cites supplied meal IDs; it does not supply aggregate metrics. A bounded sample of meal text supports the narrative. References open the original meal. Local people and shared-meal counts open person profiles without sending contact profiles to AI.

English and Chinese reports are cached locally by month, language and a stable input snapshot. Editing relevant meal details marks a previous report stale. Errors preserve saved reports and deterministic metrics. No automatic generation or replacement narrative runs when AI fails.

Meal text and notes may contain personal information. Photos, GPS fields and contact profiles stay on the device; the worker accepts only the documented fields and does not log or persist request bodies. One SQLite Durable Object stores quota counters and salted IP hashes: 50 global generation attempts per UTC day and 3 attempts per IP per 10 minutes. Failed provider calls count, too. AI calls have a server abort signal after 30 seconds; client requests time out after 45 seconds.

See [worker integration notes](../worker/INTEGRATION.md) for schemas, scripts, cache deletion integration, limits, and verification details. No account upgrade is performed. Billing-subscription inspection was denied by the current OAuth scope; the implementation does not claim to have verified the account's billing plan. Keep the account on Workers Free for platform-enforced no-overage behavior. Other apps on the same account can consume its shared free allocation.
