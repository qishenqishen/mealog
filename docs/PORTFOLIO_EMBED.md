# Optional Portfolio Embed

The primary experience is now the independent App:

[Open Mealog](https://mealog.qs2077.workers.dev/)

Send this link to reviewers. It works without visiting a portfolio or downloading code.

An existing portfolio can optionally embed the same App:

```html
<iframe
  title="Mealog"
  src="https://mealog.qs2077.workers.dev/"
  style="width:100%;max-width:460px;height: min(844px, 90dvh);border:0;"
  loading="lazy"
></iframe>
```

Each browser has its own local data. Browser restrictions on third-party storage can affect embeds, so always provide the direct App link. Camera/location in an iframe additionally need appropriate permissions; the direct URL is preferred.

The old /showcase?target=home route still redirects to Home, and supported legacy targets redirect to their respective tabs. /portfolio-preview redirects to Home. Neither route resets existing data. First-visit preparation and interruption recovery now belong to the main App bootstrap.

The portfolio site itself is not changed by this standalone MVP release.
