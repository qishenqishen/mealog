import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ensureGuestIdentity } from '../src/auth';
import { seedDemoData } from '../src/demo/seedData';
import { I18nProvider, useI18n } from '../src/i18n';
import { completeOnboarding, runMediaMigrationOnce } from '../src/storage';
import { colors } from '../src/theme';

function AppRoot() {
  const { locale } = useI18n();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [viewportHeight, setViewportHeight] = useState<number>();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const viewport = window.visualViewport;
    const resize = () => setViewportHeight(viewport && viewport.scale === 1 ? viewport.height : window.innerHeight);
    resize();
    viewport?.addEventListener('resize', resize);
    window.addEventListener('resize', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      window.removeEventListener('resize', resize);
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function prepare() {
      try {
        setError(false);
        await ensureGuestIdentity();
        await runMediaMigrationOnce();
        await seedDemoData();
        await completeOnboarding();
        if (active) setReady(true);
      } catch {
        if (active) setError(true);
      }
    }
    void prepare();
    return () => { active = false; };
  }, [attempt]);

  return (
    <View style={[styles.stage, viewportHeight ? { height: viewportHeight, flex: undefined } : undefined]}>
      {Platform.OS === 'web' ? React.createElement('style', null,
        'html,body,#root{height:100%;height:100dvh;margin:0;overflow:hidden}#root{min-height:0}*{box-sizing:border-box}body{background:#ebe9e4}button,input,textarea{font:inherit}input,textarea{font-size:16px!important}a:focus-visible,[role=button]:focus-visible{outline:2px solid #5c4033;outline-offset:3px}'
      ) : null}
      <View style={styles.app} testID="mealog-app">
        <StatusBar style="dark" />
        {ready ? (
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="showcase" />
            <Stack.Screen name="portfolio-preview" />
            <Stack.Screen name="meal/[id]" />
            <Stack.Screen name="people/index" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="people/[id]" />
          </Stack>
        ) : (
          <View style={styles.loading}>
            <Text style={styles.brand}>Mealog</Text>
            {!error ? <ActivityIndicator color={colors.primary} /> : null}
            <Text style={styles.message}>
              {error
                ? locale === 'zh' ? '暂时无法准备餐桌。请检查网络，并允许浏览器保存本站数据。你的现有记录不会被清空。' : 'Your table could not be prepared. Check your connection and allow this browser to store site data. Existing memories are kept.'
                : locale === 'zh' ? '正在为你准备一桌回忆…' : 'Setting a table with memories…'}
            </Text>
            {error ? <Pressable accessibilityRole="button" style={styles.retry} onPress={() => setAttempt((value) => value + 1)}>
              <Text style={styles.retryText}>{locale === 'zh' ? '重试' : 'Try again'}</Text>
            </Pressable> : null}
          </View>
        )}
      </View>
    </View>
  );
}

export default function RootLayout() {
  return <I18nProvider><AppRoot /></I18nProvider>;
}

const styles = StyleSheet.create({
  stage: { flex: 1, minHeight: 0, alignItems: 'center', backgroundColor: '#ebe9e4' },
  app: { flex: 1, minHeight: 0, width: '100%', maxWidth: Platform.OS === 'web' ? 460 : undefined, backgroundColor: colors.background, overflow: 'hidden' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36, gap: 20 },
  brand: { color: colors.primary, fontSize: 32, fontStyle: 'italic' },
  message: { color: colors.mutedText, textAlign: 'center', fontSize: 15, lineHeight: 24 },
  retry: { paddingVertical: 14, paddingHorizontal: 28, backgroundColor: colors.primary, borderRadius: 8 },
  retryText: { color: colors.background, fontSize: 15 },
});
