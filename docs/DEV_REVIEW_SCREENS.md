# Dev Review Screens

The former routed files under `app/dev/*` were moved to `src/devScreens/*`.

Why:

- They were review-only design utilities.
- Expo Router treats files under `app/` as real routes.
- Keeping them there caused development review assets to be bundled into deployable builds.

They are preserved as source references, but they are no longer reachable inside the product demo.
