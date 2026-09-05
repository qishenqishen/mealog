# Mealog

Mealog is a small, warm meal-memory app built with Expo, React Native, expo-router, and TypeScript.

It records meals as quiet memories: a seasonal table, what was eaten, who was there, photos, notes, reflections, and keepsakes. It does not include authentication, backend sync, calorie tracking, analytics, or social features.

## Run locally

```bash
npm install
npm run start
```

Scan the QR code with Expo Go to test on a real device.

Other useful commands:

```bash
npm run ios
npm run android
npm run web
npm run typecheck
```

## Build installable test apps

The project includes EAS build profiles for internal preview and production builds.

```bash
npm run build:android:preview
npm run build:ios:preview
```

Before the first EAS build, sign in to Expo/EAS and connect the project:

```bash
npx eas-cli login
npx eas-cli build:configure
```

## Product scope

Working MVP areas:

- first-launch onboarding
- Home with 12 monthly table illustrations and interactive meal / people hotspots
- Add Meal with structured meal data
- local managed media import for meal photos, avatars, and shared photos
- meal detail memory page
- Archive with Calendar / Memories views
- People / meal companions
- gentle Insights
- Collection / Keepsake system

Current storage is local-first. User-selected images are copied into app-managed storage on native and IndexedDB on web. There is no cloud backup yet, so uninstalling the app or clearing browser site data can still remove local data.

## Device QA

Use `docs/DEVICE_QA_CHECKLIST.md` before handing the app to testers.
