import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ensureGuestIdentity } from '../src/auth';
import { seedDemoData } from '../src/demo/seedData';
import { completeOnboarding } from '../src/storage';
import { colors, shadow } from '../src/theme';

const SHOWCASE_IMAGE = require('../assets/onboarding/enter-mealog-scene.png');

type ShowcaseTarget = 'home' | 'archive' | 'add' | 'insights' | 'collection';

const TARGET_PATHS: Record<ShowcaseTarget, string> = {
  home: '/',
  archive: '/archive',
  add: '/add?showcase=1',
  insights: '/insights',
  collection: '/collection',
};

function normalizeTarget(value: string | string[] | undefined): ShowcaseTarget {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'archive' || raw === 'add' || raw === 'insights' || raw === 'collection') {
    return raw;
  }
  return 'home';
}

export default function ShowcaseScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ target?: string }>();
  const target = useMemo(() => normalizeTarget(params.target), [params.target]);
  const [status, setStatus] = useState('Preparing a table with memories...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function prepareShowcase() {
      try {
        setStatus('Setting the table...');
        await ensureGuestIdentity();
        await completeOnboarding();
        const result = await seedDemoData();
        if (!active) return;
        setStatus(
          `${result.mealsPrepared} meals, ${result.peoplePrepared} people, and ${result.keepsakesFound} keepsakes are ready.`,
        );
        setTimeout(() => {
          if (active) router.replace(TARGET_PATHS[target]);
        }, 850);
      } catch (seedError) {
        if (!active) return;
        setError(seedError instanceof Error ? seedError.message : 'The showcase table could not be prepared.');
      }
    }

    void prepareShowcase();

    return () => {
      active = false;
    };
  }, [router, target]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.shell}>
        <Image source={SHOWCASE_IMAGE} style={styles.image} resizeMode="contain" />
        <View style={styles.card}>
          <Text style={styles.kicker}>Mealog showcase</Text>
          <Text style={styles.title}>A full demo table is being prepared.</Text>
          <Text style={styles.body}>
            This route is made for portfolio embeds. It creates local sample meals, people, photos, notes, monthly reflections, and keepsakes, then opens the interactive app.
          </Text>
          <Text style={styles.status}>{error ?? status}</Text>
          {error ? (
            <Pressable
              accessibilityRole="button"
              style={styles.button}
              onPress={() => router.replace('/profile')}
            >
              <Text style={styles.buttonText}>Open Profile</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  shell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 30,
  },
  image: {
    width: 250,
    height: 210,
    marginBottom: 20,
    opacity: 0.96,
  },
  card: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 22,
    backgroundColor: 'rgba(255, 253, 248, 0.76)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.3)',
    ...shadow.soft,
  },
  kicker: {
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: colors.muted,
    marginBottom: 8,
  },
  title: {
    fontSize: 25,
    lineHeight: 31,
    color: colors.primary,
    fontStyle: 'italic',
  },
  body: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: colors.mutedText,
  },
  status: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 19,
    color: colors.secondary,
    fontStyle: 'italic',
  },
  button: {
    marginTop: 16,
    minHeight: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  buttonText: {
    color: colors.surface,
    fontWeight: '700',
  },
});
