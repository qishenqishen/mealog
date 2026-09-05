import { useEffect } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { hasCompletedOnboarding, runMediaMigrationOnce } from '../src/storage';

export default function RootLayout() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let active = true;

    runMediaMigrationOnce().catch((error) => {
      console.warn('Mealog media migration could not complete', error);
    });

    hasCompletedOnboarding().then((completed) => {
      if (!active) return;

      if (
        !completed
        && pathname !== '/onboarding'
        && pathname !== '/showcase'
        && pathname !== '/portfolio-preview'
      ) {
        router.replace('/onboarding');
        return;
      }

      // Completed users may still revisit onboarding from the profile page.
    });

    return () => {
      active = false;
    };
    // First-launch routing is intentionally checked once on app mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="showcase" />
        <Stack.Screen name="portfolio-preview" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="meal/[id]" />
        <Stack.Screen name="people/index" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="people/[id]" />
      </Stack>
    </>
  );
}
