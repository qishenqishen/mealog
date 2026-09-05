# Mealog

Mealog is a small, warm meal-memory app.

Instead of tracking calories or posting food photos into another feed, Mealog helps people remember everyday meals as quiet stories: what was eaten, who was there, where it happened, what the mood was, and what the month started to feel like.

You can try the interactive portfolio demo here:

[Open the Mealog demo](https://portfolio.qs2077.workers.dev/#activity-01)

## What You Can Do

- Save a meal with a photo, place, mood, people, and a small note.
- Browse meals by day, month, and memory.
- Add people who shared the table with you.
- See gentle monthly Insights written like a warm reflection.
- Unlock keepsakes as your meal memories build up over time.
- Keep selected photos inside Mealog's own local media storage, so the app does not depend on the original picker path after import.

## Download And Run It

This repo is the source code for the MVP. To run it, you need Node.js and Expo.

1. Download this project from GitHub:

   - Click `Code`
   - Choose `Download ZIP`
   - Unzip the folder

   Or clone it with Git:

   ```bash
   git clone https://github.com/qishenqishen/mealog.git
   cd mealog
   ```

2. Install the dependencies:

   ```bash
   npm install
   ```

3. Start the app:

   ```bash
   npm run start
   ```

4. Use it on your phone:

   - Install the Expo Go app on iPhone or Android.
   - Scan the QR code shown in the terminal.

5. Or open it in a browser:

   ```bash
   npm run web
   ```

## Build A Phone Preview

If you want an installable test build instead of Expo Go, use EAS:

```bash
npx eas-cli login
npx eas-cli build:configure
npm run build:android:preview
npm run build:ios:preview
```

Android preview builds can produce an APK. iOS preview builds require Apple signing access.

## Tech

- Expo
- React Native
- Expo Router
- TypeScript
- AsyncStorage
- Expo FileSystem
- IndexedDB for managed media on web

## Current MVP Scope

Mealog is local-first right now. It works well as an interactive product demo and early phone prototype, but it does not have account sync or cloud backup yet.

That means saved local data can be lost if someone uninstalls the app, clears app data, or clears browser site data. The next production step would be adding cloud storage and account sync.

## Useful Commands

```bash
npm run start
npm run ios
npm run android
npm run web
npm run typecheck
```
