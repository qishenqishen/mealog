import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SlowLetterPaper from '../src/components/SlowLetterPaper';
import SlowMailEnvelope, { prefersReducedMailMotion, SLOW_MAIL_OPENING_MS } from '../src/components/SlowMailEnvelope';
import { getSlowGuestLetter, SLOW_MAIL_GUEST_KEY, type SlowGuestLetter } from '../src/product/slowMail';
import { DEFAULT_SLOW_MAIL_STATIONERY } from '../src/product/slowMailStationery';
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
      <View style={styles.header}>
        <Image accessibilityLabel="Mealog" source={require('../assets/brand/mealog-wordmark-v2.png')} resizeMode="contain" style={styles.brand} />
        <Text style={styles.sectionName}>{zh ? '记忆慢递' : 'Memory Mail'}</Text>
      </View>
      {missing ? <View style={styles.message}>
        <Text accessibilityRole="header" style={styles.title}>{zh ? '找不到这封信' : 'This letter could not be found'}</Text>
        <Text style={styles.body}>{zh ? '可以请寄信人再发一次原链接。' : 'Ask the sender for the original link again.'}</Text>
      </View> : failure ? <View style={styles.message}>
        <Text accessibilityLiveRegion="polite" style={styles.body}>{zh ? '暂时打不开，请稍后重试。' : 'The letter could not load. Try again in a moment.'}</Text>
        <Pressable accessibilityRole="button" style={styles.retry} onPress={() => { setState(undefined); setRetry(value => value + 1); }}>
          <Text style={styles.body}>{zh ? '重试' : 'Try again'}</Text>
        </Pressable>
      </View> : result
        ? <GuestEnvelope key={guestKey} result={result} guestKey={guestKey} zh={zh} />
        : <ActivityIndicator accessibilityLabel={zh ? '正在读信' : 'Loading letter'} color={colors.secondary} />}
    </ScrollView>
  </SafeAreaView>;
}

function GuestEnvelope({ result, guestKey, zh }: { result: SlowGuestLetter; guestKey: string; zh: boolean }) {
  const [stage, setStage] = useState<'sealed' | 'opening' | 'opened'>('sealed');
  const title = useRef<View>(null);
  const { letter } = result;
  const opening = stage === 'opening';
  const opened = stage === 'opened' && letter !== null;

  useEffect(() => {
    if (!opening) return;
    const timer = setTimeout(() => setStage('opened'), SLOW_MAIL_OPENING_MS);
    return () => clearTimeout(timer);
  }, [opening]);

  useEffect(() => {
    if (opened) title.current?.focus();
  }, [opened]);

  if (opened) return <div className="mm-letter-revealed">
    <style>{`
      .mm-letter-revealed{display:flex;flex-direction:column;gap:20px;}
      @media(prefers-reduced-motion:no-preference){
        .mm-letter-revealed{animation:mm-reveal-letter 260ms ease-out both;}
        @keyframes mm-reveal-letter{from{opacity:.35;transform:translateY(12px)}to{opacity:1;transform:none}}
      }
    `}</style>
    <View ref={title} tabIndex={-1} accessibilityRole="header">
      <Text style={styles.openTitle}>{zh ? '一封记忆来信' : 'A memory letter'}</Text>
    </View>
    <SlowLetterPaper letter={letter} guestKey={guestKey} zh={zh} />
  </div>;

  const stationery = letter?.stationery ?? result.stationery ?? DEFAULT_SLOW_MAIL_STATIONERY;
  const release = new Date(result.releaseAt);
  const dateLocale = zh ? 'zh-CN' : 'en-US';
  return <View style={styles.waiting}>
    <View aria-hidden style={styles.envelope}>
      <SlowMailEnvelope stationery={stationery} opening={opening} />
    </View>
    <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={styles.title}>{letter
      ? zh ? '现在可以拆信了' : 'It’s time to open your letter'
      : zh ? '有一封信留给你' : 'A letter is waiting for you'}</Text>
    {letter ? <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: opening, disabled: opening }}
      disabled={opening}
      onPress={() => setStage(prefersReducedMailMotion() ? 'opened' : 'opening')}
      style={({ pressed }) => [styles.openButton, pressed && styles.openPressed]}
    >
      <Text style={styles.openButtonText}>{opening
        ? zh ? '正在拆信…' : 'Opening…'
        : zh ? '拆开这封信' : 'Open this letter'}</Text>
    </Pressable> : <>
      <View style={styles.schedule}>
        <Text style={styles.sectionName}>{zh ? '拆信时间 · 当地时间' : 'Opens at · Local time'}</Text>
        <Text style={styles.date}>{release.toLocaleDateString(dateLocale, { year: 'numeric', month: 'long', day: 'numeric' })}</Text>
        <Text style={styles.body}>{release.toLocaleTimeString(dateLocale, { hour: 'numeric', minute: '2-digit' })}</Text>
      </View>
      <Text style={[styles.body, styles.hint]}>{zh ? '留好这条链接，到时间再回来拆信。' : 'Keep this link and come back when it’s time to open your letter.'}</Text>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 40, gap: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 50, paddingBottom: 12, borderBottomWidth: 1, borderColor: '#D9D0BE' },
  brand: { width: 102, height: 32 },
  sectionName: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, letterSpacing: 0.7, color: '#515845' },
  waiting: { alignItems: 'center' },
  envelope: { width: '100%', alignItems: 'center', marginBottom: 20 },
  title: { fontFamily: fonts.editorial, fontSize: 29, lineHeight: 37, color: colors.primary, textAlign: 'center' },
  openTitle: { fontFamily: fonts.editorial, fontSize: 24, lineHeight: 32, color: colors.primary },
  openButton: { minHeight: 48, marginTop: 20, paddingHorizontal: 28, justifyContent: 'center', alignItems: 'center', borderRadius: 4, backgroundColor: '#414737' },
  openPressed: { backgroundColor: '#525945' },
  openButtonText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.surface },
  schedule: { width: '100%', alignItems: 'center', gap: 4, paddingVertical: 14, marginTop: 18, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#D9D0BE' },
  date: { fontFamily: fonts.editorial, fontSize: 23, lineHeight: 32, color: colors.primary, textAlign: 'center' },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.secondary },
  hint: { marginTop: 14, textAlign: 'center', maxWidth: 280 },
  message: { alignItems: 'center', gap: 12, marginTop: 24 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderColor: '#CFC7B5', borderRadius: 3 },
});
