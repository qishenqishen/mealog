import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SlowLetterPaper, { formatSlowMailDate } from '../src/components/SlowLetterPaper';
import { getSlowGuestLetter, SLOW_MAIL_GUEST_KEY, type SlowGuestLetter } from '../src/product/slowMail';
import { useI18n } from '../src/i18n';
import { colors, fonts } from '../src/theme';

export default function GuestLetterScreen() {
  const { locale } = useI18n();
  const web = Platform.OS === 'web' && typeof window !== 'undefined';
  const [hash, setHash] = useState(() => web ? window.location.hash : '');
  const [requestedLanguage, candidate] = hash.slice(1).split('.', 2);
  const zh = requestedLanguage === 'en' ? false : requestedLanguage === 'zh' || locale === 'zh';
  const guestKey = SLOW_MAIL_GUEST_KEY.test(candidate) ? candidate : '';
  const [state, setState] = useState<{ key: string; result?: SlowGuestLetter; failure?: string }>();
  const result = state?.key === guestKey ? state.result : undefined;
  const failure = state?.key === guestKey ? state.failure : undefined;
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!web) return;
    const syncHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [web]);
  useEffect(() => {
    if (!guestKey) return;
    let active = true;
    let reading = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (!active || reading || document.hidden) return;
      if (timer) clearTimeout(timer);
      reading = true;
      try {
        const next = await getSlowGuestLetter(guestKey);
        if (!active) return;
        setState({ key: guestKey, result: next });
        if (!next.letter) {
          const remaining = Date.parse(next.releaseAt) - Date.now();
          // Wake at delivery time or when the tab becomes visible again.
          const delay = remaining > 0 ? Math.min(remaining + 500, 12 * 60 * 60_000) : 60_000;
          timer = setTimeout(() => void refresh(), delay);
        }
      } catch (error) {
        if (active) setState({ key: guestKey, failure: error instanceof Error ? error.message : 'unavailable' });
      } finally {
        reading = false;
      }
    };
    void refresh();
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [guestKey, retry]);

  const missing = !guestKey || failure === 'not_found';
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <ScrollView contentContainerStyle={styles.page}>
      <Image accessibilityLabel="Mealog" source={require('../assets/brand/mealog-wordmark-v2.png')} resizeMode="contain" style={styles.brand} />
      {missing ? <View style={styles.envelope}>
        <Text accessibilityRole="header" style={styles.title}>{zh ? '找不到这封信' : 'This letter could not be found'}</Text>
        <Text style={styles.body}>{zh ? '可以请寄信人再发一次原链接。' : 'Ask the sender for the original link again.'}</Text>
      </View> : failure ? <View style={styles.envelope}>
        <Text accessibilityLiveRegion="polite" style={styles.body}>{zh ? '暂时打不开，请稍后重试。' : 'The letter could not load. Try again in a moment.'}</Text>
        <Pressable accessibilityRole="button" style={styles.retry} onPress={() => { setState(undefined); setRetry(value => value + 1); }}>
          <Text style={styles.body}>{zh ? '重试' : 'Try again'}</Text>
        </Pressable>
      </View> : !result ? <ActivityIndicator accessibilityLabel={zh ? '正在读信' : 'Loading letter'} color={colors.secondary} /> : result.letter ? <>
        <Text accessibilityRole="header" style={styles.title}>{zh ? '一封记忆来信' : 'A memory letter'}</Text>
        <SlowLetterPaper letter={result.letter} guestKey={guestKey} zh={zh} />
      </> : <View style={styles.envelope}>
        <View aria-hidden style={styles.envelopeMark}><View style={styles.flap} /></View>
        <Text accessibilityRole="header" style={styles.title}>{zh ? '有一封信留给你' : 'A letter is waiting for you'}</Text>
        <Text style={styles.date}>{formatSlowMailDate(result.releaseAt, zh)} {zh ? '可拆开' : '· Opens at this time'}</Text>
        <Text style={styles.body}>{zh ? '到时间后，打开这条链接就能拆信。' : 'Come back to this link when it’s time to open your letter.'}</Text>
      </View>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { padding: 22, paddingBottom: 36, gap: 16 },
  brand: { width: 102, height: 34, marginBottom: 8 },
  title: { fontFamily: fonts.editorial, fontSize: 26, lineHeight: 36, color: colors.primary },
  envelope: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 23, alignItems: 'flex-start', gap: 12 },
  envelopeMark: { width: 43, height: 29, borderRadius: 3, borderWidth: 1, borderColor: colors.secondary, backgroundColor: colors.accentSoft, overflow: 'hidden', marginBottom: 7 },
  flap: { position: 'absolute', width: 30, height: 30, left: 5.5, top: -18, borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.secondary, transform: [{ rotate: '45deg' }] },
  date: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.primary, fontWeight: '600' },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.mutedText },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
});
