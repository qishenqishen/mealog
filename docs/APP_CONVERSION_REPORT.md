# Mealog App Conversion Report

## Completed

- Visible app name is `Mealog`.
- iOS bundle identifier is configured as `com.qishen.mealog`.
- Android package is configured as `com.qishen.mealog`.
- Internal Expo slug, deep link scheme, and AsyncStorage keys are left compatible with the original project.
- EAS build profiles are available for development, preview, and production.
- Build uploads now ignore large prototype files such as `.mov`, `.mp4`, `.fig`, `.pdf`, and `.zip`.
- Package scripts now include local run, typecheck, web export, and EAS build commands.

## Why Internal Names Were Preserved

The original local data keys still use the older `@mealogue/...` namespace. They are not user-visible, and changing them would risk losing existing tester data. They can be migrated later with a dedicated data migration if a full internal rename becomes necessary.

## Current Build Identity

- Expo visible name: Mealog
- iOS bundle identifier: com.qishen.mealog
- Android package: com.qishen.mealog
- Expo slug: mealogue
- Deep link scheme: mealogue

## Remaining Store-Readiness Work

- Replace placeholder app icon and splash art only if the current assets are not final.
- Add App Store / Play Store screenshots and descriptions.
- Add privacy policy URL before public release.
- Decide whether cloud backup is needed before production.
