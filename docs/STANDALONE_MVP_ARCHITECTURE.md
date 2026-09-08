# Standalone Mealog MVP

Public entry: [mealog.qs2077.workers.dev](https://mealog.qs2077.workers.dev/).

## One App, not a portfolio embed

Cloudflare serves Expo's Web export from the root path. A fresh visitor enters Home after migration and sample preparation. Initialization failures have a retry action. Direct links such as `/archive`, `/add`, `/insights`, and meal/person detail routes use the same SPA. Legacy `/showcase` and `/portfolio-preview` redirect into the actual App instead of showing a separate simulation.

The Web App fills the available viewport, up to 460px wide on desktop. Pages scroll internally and the tab bar stays at the bottom. Visual-viewport height updates accommodate browser viewport changes; physical mobile keyboard behavior still needs device testing. Existing artwork and the App's established palette are retained.

Collection uses IntersectionObserver on Web to defer offscreen artwork and its animation until the stamp approaches the viewport. Stamp dimensions are reserved, so loading does not move the layout. Native and browsers without this API keep immediate image rendering.

## Local data ownership

Existing `@mealogue/` storage keys, model identifiers, and media database names are preserved. This release does not change native application identity, reset legacy records, or migrate a different origin's data automatically. Browser storage belongs to its origin: records created on localhost or the portfolio origin do not automatically appear at the new independent domain.

The sample session stores a date anchor before importing anything. Previous-month samples plus only already-past current-month samples use stable IDs. People are saved sequentially; storage operations are serialized within the runtime. Interrupted preparation resumes missing records. Once preparation completes, reloads and future deployments do not reseed. An installation with legacy records is preserved rather than mixed with a new sample set.

Optional `origin: sample | user` metadata identifies removable examples. New and edited records are user-owned; older records with no origin are protected. Clearing examples preserves user edits, shared-photo references, used people and media, and the initialization marker. Progress is recalculated from retained records.

## Managed images

Web stores original image Blobs and separate thumbnails in IndexedDB database `mealog-managed-media`, store `media-blobs`. Records contain media IDs and stable `indexeddb://mealog-media/...` references. Blob/object URLs are resolved only for display and never saved as the final image source. Image bytes are not put into localStorage or AsyncStorage.

Native imports use the existing persistent Documents-based media directory. The imported bytes are retained and thumbnails generated separately. Native persistence logic has automated filesystem-adapter tests, not physical-device certification.

All Add, meal-photo replacement, shared-photo, and person-avatar writes use the common media layer. A new picker selection cannot silently reuse an old image ID. Save failures remain visible and retain the form. Stable draft IDs and compensating record writes support retries without duplicate meals/people/shared photos. Files are deleted only after reference checks following explicit product deletion; there is no startup orphan purge.

Legacy migration validates new copies before changing references. Unreadable sources are reported as missing and do not stop unrelated records loading. A local migration report records counts; it is not a scan of other visitors' browsers.

## AI boundary

Only an explicit generation click sends a validated monthly text snapshot to the same-origin Worker. Cloudflare Workers AI writes a grounded, short reflection. The Worker calculates statistics, validates references, and does not persist or log meal text. A SQLite Durable Object stores durable quota counters and salted network hashes. Cached reports and their input snapshots stay in the browser. See [AI details](../worker/INTEGRATION.md).

This is **local managed only** for photos and records, with **remote AI processing** for opted-in text. It is not cloud-backed photo storage. There are no accounts, cross-device sync, reinstall recovery, automatic paid upgrades, or purchased domains in this MVP.

## Localization

English and Simplified Chinese cover navigation, forms, errors, onboarding, people, Collection, and Insights. The initial language follows the browser; the saved choice wins afterward. User text is never translated or overwritten. Sample stories remain their original stored English examples; Chinese AI output can summarize them in Chinese.
