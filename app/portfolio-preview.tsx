import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { colors, shadow } from '../src/theme';

const SHOWCASE_SRC = '/showcase?target=home';

function ShowcaseFrame() {
  if (Platform.OS !== 'web') {
    return (
      <View style={styles.nativeFallback}>
        <Text style={styles.nativeFallbackText}>
          The portfolio embed preview is available in the web build.
        </Text>
      </View>
    );
  }

  return React.createElement('iframe' as any, {
    title: 'Mealog interactive product demo',
    src: SHOWCASE_SRC,
    loading: 'lazy',
    style: {
      width: '100%',
      height: '100%',
      display: 'block',
      border: 0,
      borderRadius: 38,
      background: '#fff8f0',
      overflow: 'hidden',
    },
  });
}

export default function PortfolioPreviewScreen() {
  const router = useRouter();

  const openTarget = (target: 'home' | 'add' | 'insights') => {
    router.push(`/showcase?target=${target}`);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.previewLayout}>
          <View style={styles.phoneFrame}>
            <View style={styles.phoneBar} />
            <View style={styles.phoneScreen}>
              <ShowcaseFrame />
            </View>
          </View>

          <View style={styles.copyPanel}>
            <Text style={styles.kicker}>Interactive product demo</Text>
            <Text style={styles.title}>Mealog keeps a month at the table.</Text>
            <Text style={styles.body}>
              This preview is made for portfolio embedding. It opens with a complete local demo dataset,
              then lets visitors add meal memories, browse the archive, collect keepsakes, and read warm
              monthly Insights shaped from meals, notes, photos, moods, places, and people.
            </Text>

            <View style={styles.buttonRow}>
              <Pressable
                accessibilityRole="button"
                style={[styles.button, styles.buttonPrimary]}
                onPress={() => openTarget('home')}
              >
                <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Open home demo</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.button}
                onPress={() => openTarget('add')}
              >
                <Text style={styles.buttonText}>Start at Add</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.button}
                onPress={() => openTarget('insights')}
              >
                <Text style={styles.buttonText}>Open Insights</Text>
              </Pressable>
            </View>

            <View style={styles.embedCard}>
              <Text style={styles.embedLabel}>Embed URL</Text>
              <Text selectable style={styles.embedCode}>
                /showcase?target=home
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F8F2E8',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingVertical: 26,
  },
  previewLayout: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 44,
  },
  phoneFrame: {
    width: 342,
    maxWidth: '100%',
    height: 668,
    borderRadius: 48,
    padding: 12,
    backgroundColor: '#15110D',
    ...shadow.soft,
  },
  phoneBar: {
    position: 'absolute',
    top: 17,
    left: '42%',
    right: '42%',
    zIndex: 2,
    height: 5,
    borderRadius: 5,
    backgroundColor: 'rgba(255, 253, 248, 0.5)',
  },
  phoneScreen: {
    flex: 1,
    borderRadius: 34,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  nativeFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  nativeFallbackText: {
    textAlign: 'center',
    color: colors.mutedText,
    fontSize: 14,
    lineHeight: 21,
  },
  copyPanel: {
    width: 500,
    maxWidth: '100%',
  },
  kicker: {
    marginBottom: 16,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  title: {
    fontSize: 46,
    lineHeight: 49,
    color: colors.primary,
    fontStyle: 'italic',
  },
  body: {
    marginTop: 22,
    fontSize: 17,
    lineHeight: 27,
    color: colors.mutedText,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 30,
  },
  button: {
    minHeight: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: 'rgba(255, 253, 248, 0.58)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(34, 27, 21, 0.5)',
  },
  buttonPrimary: {
    backgroundColor: '#F2C230',
    borderColor: 'rgba(34, 27, 21, 0.82)',
  },
  buttonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonTextPrimary: {
    color: '#15110D',
  },
  embedCard: {
    marginTop: 28,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: 'rgba(255, 253, 248, 0.62)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.28)',
  },
  embedLabel: {
    marginBottom: 8,
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  embedCode: {
    color: colors.secondary,
    fontSize: 14,
    lineHeight: 20,
  },
});
