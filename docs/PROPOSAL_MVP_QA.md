# Proposal-Aligned MVP: Release QA

Date: September 7, 2026, Los Angeles (September 8 UTC).

Product: https://mealog.qs2077.workers.dev/

Final deployed Worker: `3ef7785b-d51d-419c-b7e4-91d3d542d307`.
Final web bundle: `entry-4abd46e1794ab187f77d7296a988f3da.js`.

## Results

| Check | Observed result |
| --- | --- |
| App and Worker TypeScript | PASS, `npm run check` |
| Web production build | PASS, `npm run build`; 867 modules, 1.44 MB JS before compression |
| Unit suites | PASS: 21 storage/media tests, 4 sample-data tests, 4 language tests, plus Worker validation/quota/client assertions |
| Full browser product journey | PASS, 15 checkpoints in `artifacts/proposal-review/full-flow/results.json` |
| Focused new UI/storage regressions | PASS, 6 checkpoints locally and on production; AI mocked in this suite |
| Existing Insights browser suite | PASS: generation only on click, meal/person links, cache, stale titles, failure retention, language/month switching |
| Real provider on production | PASS: English sample report, personal report excluding examples, Chinese report, cache/restart and fourth-attempt HTTP 429 |
| Final Chinese wording regression | PASS: a recorded earlier output replayed through actual handler; final real-provider re-run also passed |
| Source deletion | PASS on Chrome: capture-file input -> managed IndexedDB image -> remove temporary source file -> reload -> readable original and thumbnail |
| Location | PASS: no passive lookup despite permission already granted; explicit lookup; manual name edit removes old coordinates; Remove place persists; late response cannot overwrite typing |
| Monthly writing | PASS: scope isolation, persistence, write failure/rollback/retry, invalid-data protection and full-data-clear coverage; never present in AI payload |
| Browser restart | PASS: close and relaunch a persistent Chrome profile; language, saved AI report, meal and image survive |
| Viewports | PASS: 390 x 844 mobile and 1440 x 1000 desktop; app width <=460px, no document horizontal overflow or uncaught page errors |

## Real AI Review

The first live iteration was **not** accepted for prose quality: the model invented ingredients and a learning activity for a dumpling note. A second iteration removed those inventions but used Chinese first-person narration. These failures are retained in the local QA artifacts rather than hidden.

After language-specific prompts, schema descriptions, single-meal paragraph limiting and narrow wording cleanup, the final actual-provider run at approximately 05:29:45-05:29:48 UTC returned:

English personal reflection:

> Amy made a tiny star-shaped dumpling, which brought a heartfelt moment.

Chinese personal reflection:

> 你们一起包饺子，Amy做了一个小型星形的饺子，你们一起笑了。

Source fixture: one synthetic meal titled “Dumplings folded with Amy”, the note “We folded dumplings together. Amy made a tiny star-shaped one, and we laughed about it.”, and an explicitly selected `heartfelt` tag. The final output retained that detail without the previously invented filling, kitchen, learning activity, or growing-closeness claim. The Chinese heading was localized. The photo is not analyzed by the model.

The complete final real-provider run has six passing assertions in `artifacts/proposal-review/final-real-ai/results.json`. Its provider calls used local preview with real Cloudflare AI and local quota storage. The separate production run is in `artifacts/proposal-review/production-ai/results.json`. Production UI regressions are in `artifacts/proposal-review/production-ui/results.json` and explicitly mark AI as mocked.

The final deployed build was rechecked in `artifacts/proposal-review/release-ui/results.json`: all six UI/storage checkpoints passed. The final small frontend change also aligns Chinese mood labels with the Add screen instead of using a stronger interpretation of the selected feeling.

These examples establish observed improvements, not a guarantee of truth or literary quality. The model can still be terse, especially without notes. More diverse bilingual evaluation is needed before claiming consistently polished or emotionally supportive prose. JSON and reference validation cannot prove all statements true. There is no claimed therapeutic effect.

## Screenshots

- `artifacts/proposal-review/final-real-ai/01-real-ai-english.png`
- `artifacts/proposal-review/final-real-ai/03-real-ai-chinese.png`
- `artifacts/proposal-review/final-real-ai/05-full-browser-restart.png`
- `artifacts/proposal-review/production-ui/own-words-chinese-mobile.png`
- `artifacts/proposal-review/production-ui/insights-desktop.png`
- `artifacts/proposal-review/production-ui/saved-camera-upload-mobile.png`
- `artifacts/proposal-review/production-ui/add-photo-actions-mobile.png`

## Not Tested / Still Limited

- No physical iPhone/Android camera, native app restart, system-gallery deletion or hardware-keyboard acceptance. Web capture was tested as a file input with the capture hint, not as a real camera session.
- No mainland China network environment was available.
- Own words and photos are local-managed only. There is no account sync, cloud photo backup, portable export/restore, or recovery after site-data deletion.
- Voice clips, EXIF date/place extraction, a unified swipeable occasion album, customizable chair art and Live Photo motion remain incomplete or absent; see the proposal comparison report.
- Browser drafts survive in-page failure/retry and month/table switching while mounted; unsaved text is not promised to survive a browser crash or refresh. Saved text is persistent.
- The model's known Chinese literal translation received a narrow correction, not a general-purpose semantic verifier. Existing user-written text is never rewritten.

## Changed Files

Application: `app/(tabs)/add.tsx`, `app/(tabs)/insights.tsx`, `src/i18n/add.ts`, `src/services/mealMetadata.ts`, `src/storage/index.ts`, `src/insights/contract.ts`, `src/insights/monthlyReport.ts`.

API: `worker/handler.ts`. No binding, identity, quota or billing changes.

Tests: `tests/proposal-browser.mjs`, `tests/storage.test.cjs`, `tests/standalone-browser.mjs`, `tests/live-ai-browser.mjs`, `worker/tests.cjs`, `worker/ui-check.cjs`.

Documentation: `README.md`, `docs/INSIGHTS_AI_REPORT_NOTES.md`, `docs/PROPOSAL_MVP_REVIEW.md`, this report, `worker/INTEGRATION.md`.
