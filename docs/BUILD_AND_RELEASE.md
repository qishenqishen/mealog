# Build And Release Notes

## Local Development

```bash
npm run start
```

Use Expo Go for device testing, or run platform-specific commands:

```bash
npm run ios
npm run android
npm run web
```

## Preview Builds

Preview builds are for real-device testing outside Expo Go.

```bash
npm run build:android:preview
npm run build:ios:preview
```

## Production Builds

```bash
npm run build:android:production
npm run build:ios:production
```

## Notes

- The app currently has no backend, auth, analytics, push notifications, or calorie tracking.
- Local managed media protects saved images from source-file deletion, but not from app uninstall or browser data clearing.
- Cloud backup would require a future account and storage design.
