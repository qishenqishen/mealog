# Portfolio Embed

Mealog can be embedded as an interactive portfolio demo after deploying the Expo web export.

## Recommended embed URL

Use the showcase route so every visitor gets a complete local demo dataset before entering the app:

```html
<iframe
  title="Mealog interactive product demo"
  src="https://YOUR_DEPLOYED_MEALOG_URL/showcase?target=home"
  style="width: 390px; height: 844px; border: 0; border-radius: 36px; overflow: hidden;"
  loading="lazy"
></iframe>
```

Target options:

- `target=home`
- `target=archive`
- `target=add`
- `target=insights`
- `target=collection`

## Portfolio preview page

Use this local route to preview how the demo feels inside a portfolio-style phone frame:

```txt
http://localhost:8086/portfolio-preview
```

For the actual portfolio iframe, embed `/showcase?target=home` rather than `/portfolio-preview`. The preview page is a design aid; the showcase route is the clean, phone-sized interactive product demo.

## What the showcase route prepares

- Onboarding is marked complete for the demo visitor.
- A local guest identity is created.
- Sample meals, companions, people, notes, moods, photos, shared photos, and keepsakes are inserted through the same app storage APIs as normal use.
- Demo photos are imported through the managed media flow instead of being kept as temporary picker/object URLs.
- The Insights tab receives enough sample data to show a warm monthly report, not just empty analytics.

## Deployment command

```bash
npm run export:web
```

Deploy the generated `dist` directory to any static host. The demo is local-first, so each portfolio visitor gets their own browser-local sample state.

## Product note

The current Insights report uses a deterministic on-device provider named `local_narrative_demo`. It is shaped as the future AI monthly report boundary, without exposing private notes or requiring a frontend API key.
