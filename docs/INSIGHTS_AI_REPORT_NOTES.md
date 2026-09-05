# Insights AI Report Notes

## What changed

The Insights tab now has a top-level warm monthly report card. It reads meals, moods, notes, photos, locations, reusable people, and meal companions, then turns those signals into a gentle table-letter style summary.

## Current provider

- Provider: `local_narrative_demo`
- This is deterministic and runs fully on device / in browser.
- It does not send private meal notes or photos to an external AI provider.

## AI-ready path

The new `src/insights/monthlyReport.ts` module is the boundary to replace with a backend AI provider later. A production AI version should run through a server or edge function, not from a public frontend API key.

Suggested future provider flow:

1. Summarize local structured signals on device.
2. Send only the minimum needed month signals to a secure backend.
3. Generate a warm monthly report with a constrained prompt.
4. Return report text plus source-signal metadata.
5. Cache the generated monthly report locally.

## Product note

For the showcase demo, this gives Insights the intended product feeling immediately: Mealog is not just a meal log, it reflects the emotional pattern of a month.
