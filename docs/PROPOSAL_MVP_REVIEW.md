# Mealog: Original Vision and MVP Review

Review date: September 7, 2026 (Los Angeles).

Source: Qi Shen, `502 FINAL_Qi Shen.pdf`, 20 pages. Page references below refer to PDF page numbers. The proposal is research/design context, not an instruction to undo subsequent product decisions.

## What Matters Most

The original product is a private memory practice, not a food tracker or an emotional scorecard. Plate, Chair, and Table stand for meals, companionship, and the occasions around them. The most important gap was not another feature tab: it was letting the user, rather than a generated interpretation, remain the author of meaning.

There is an intentional evolution to acknowledge. Pages 11-17 originally reject generative interpretation and off-device processing. The later product brief explicitly asks for real AI. This release keeps AI optional and visible, separates examples from personal memories, and adds a fully local space for the user's own reflection. It does not claim to satisfy the original no-cloud premise when AI is used.

## Comparison and Changes

| Original direction | Before this revision | Current result |
| --- | --- | --- |
| Private, contextual meal memory, not a social feed (pp. 2-5) | Home, meal details, calendar and people exist | Preserved; no feed, calorie tracking, contact imports or ranking added |
| Insights as a descriptive mirror, not a score (pp. 7-8, 11-14) | Counts and real AI existed, but sample and personal records were mixed | Separate My table / Sample table; legacy records remain personal, edited examples become personal; no cross-scope cache fallback |
| User authors their own emotional meaning (pp. 11-14) | AI prose had no adjacent space for the user's account | Monthly **In your own words** field, optional and device-only; separate by month/table, editable, clearable and never sent to AI |
| Small, concrete memories and companionship (pp. 4-8) | Prompt could yield generic prose or invented detail | Language-specific evidence-first prompts, explicit boundaries against inferred feelings/relationship changes and invented ingredients/scenes; one meal produces one paragraph; linked meal evidence remains visible |
| Photo now or library, with optional context (pp. 5-6, 9) | Add opened the library only; camera already existed in other entry points | Add now offers Take photo and Photo library; both use the same existing managed-media save path |
| Location selected/edited/removed by the keeper (pp. 15-17) | Previously granted permission triggered automatic GPS access; renamed places could keep old coordinates | No location lookup on opening Add; explicit action only; manual edit drops old GPS data; Remove place and late-response protection added |
| A bounded month, not an optimization dashboard (pp. 7-8) | Full-month local counts and filters existed | Retained; local statistics do not disappear when notes are excluded or AI fails; no targets or positivity score added |

## AI Quality and Privacy

- Report schema remains version 1; generated content has `contentVersion: 2`. Historical cache data and all existing storage identities are retained.
- Meal notes are excluded by default. Opt-in sends at most the first 240 characters per note, with disclosure that typed names/places are included. Titles, dates, tags and photo-presence flags are in the allowlisted request; actual images, coordinates and person profiles are not.
- The model receives compact text evidence; server-side aggregate counts are not handed over for creative interpretation. The UI counts all meals in the selected local table.
- Warmth should come from a detail the person recorded, not statements such as “you must have been anxious” or “you two are growing closer.” Difficult feelings are not rewritten as positive outcomes.
- Schema checks prove that cited IDs exist, not that prose is semantically true. In the first live QA pass the model invented dumpling ingredients and a learning activity. That output was rejected in review, the prompt was rewritten in each target language, and explicit regression assertions were added for the case. Do not describe the initial run as passing prose-quality QA merely because HTTP and JSON validation passed.
- The next live pass removed those invented facts but used Chinese first-person plural in a retelling. The response schema now reinforces second-person voice, and Chinese generated `我们` is normalized to `你们`; original user notes are never modified. This targeted voice correction is not a general hallucination detector.
- Own monthly words use `@mealogue/monthlyReflections/v1`. Existing write locking and rollback protect saves; failed writes keep the draft and old data. Unreadable saved data is not silently replaced. Clearing all app data also clears this list.
- AI request-body logging remains disabled. Quotas stay at 50 public attempts per UTC day and 3 per network per 10 minutes. No extra verification-model call, hidden retry, account upgrade or new cloud database was added.

## Still Partial or Missing

These are not claimed as implemented in this revision:

1. **Portable backup/export and restore.** Photos are independent copies, but browser eviction, clearing site data or device loss can still destroy local memories. This should precede presenting Mealog as a long-term archive for irreplaceable photographs. Account sync is not required for a user-owned export/import feature.
2. **One-occasion, multi-photo story.** Meal cover and shared-photo records already exist. A unified swipeable album combining food, people and table photos would better realize page 9; the current arrangement is partial.
3. **Voice memories.** The optional short voice clip in pages 5-6 is not present. It needs managed audio storage, accessible playback, deletion and export, not just a microphone button.
4. **Photo EXIF prefill.** Original date/location extraction described on page 15 is not implemented. The current explicit GPS action is not the same feature; dates and places remain manually editable.
5. **Personal chair illustration and custom feeling labels.** Existing people pages preserve shared memories, but the customizable chair concept and user-created emotion vocabulary remain incomplete.
6. **Keepsake positioning.** Collection was added in later iterations. Its progress language is a tension with the proposal's no-optimization stance; retained intentionally here, without adding streak pressure to Insights.
7. **Real Live Photos and physical-device acceptance.** A HEIC still is not a moving Live Photo; paired motion files are needed. This release does not add video playback or claim camera/gallery deletion tests on physical iOS/Android devices.

## Verification

- App and Worker TypeScript checks: pass.
- Unit/regression suites: storage and media transactions, legacy compatibility, scope/notes cache isolation, monthly writing rollback, permission metadata and quota/API validation.
- Complete browser product journey: fresh/repeat visitors, Add, edit/replace photos, source deletion, detail, Archive/Calendar, Month Memories, People, Collection, samples clearing, interrupted initialization, legacy migration and two-visitor isolation.
- Focused browser tests: mock AI requests for source filtering, note opt-in and failure preservation; real browser IndexedDB and local storage; source deletion; capture-file hint; explicit/late/manual location handling; Chinese writing; mobile and desktop layouts.
- Real AI prose re-check and production verification: see [release QA](PROPOSAL_MVP_QA.md), including actual outputs and the limits of the evaluation.

Artifacts: `artifacts/proposal-review/`. `tests/proposal-browser.mjs` uses mocked AI; `tests/live-ai-browser.mjs` uses the actual provider and consumes quota. Test data is isolated and synthetic, never the user's journal.

The product is still a browser-first, local-managed MVP. There is no cloud photo backup, no implied mental-health benefit, and no verified mainland China or physical-phone acceptance in this review.
