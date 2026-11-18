import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useI18n } from '../src/i18n';
import { getSlowMailbox, slowMailError, type SlowLetter, type SlowMailbox } from '../src/product/slowMail';
import SlowLetterPaper, { formatSlowMailDate } from '../src/components/SlowLetterPaper';
import SlowMailShare from '../src/components/SlowMailShare';
import { colors, fonts } from '../src/theme';

const ink = '#414737';
const crease = '#CFC7B5';
const lining = '#EEEBDC';

export default function SlowMailScreen() {
  const { locale } = useI18n();
  const zh = locale === 'zh';
  const copy = (en: string, cn: string) => zh ? cn : en;
  const [mailbox, setMailbox] = useState<SlowMailbox>();
  const [box, setBox] = useState<'incoming' | 'outgoing'>('incoming');
  const [opened, setOpened] = useState<string>();
  const [error, setError] = useState<unknown>();
  const [retry, setRetry] = useState(0);
  const scroll = useRef<ScrollView>(null);
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'web') return;
    let active = true;
    let reading = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let releaseAt = 0;
    async function refresh() {
      if (!active || reading || document.hidden) return;
      if (timer) clearTimeout(timer);
      reading = true;
      try {
        const next = await getSlowMailbox();
        if (active) {
          releaseAt = Date.parse(next.releaseAt);
          setMailbox(next);
          setError(undefined);
        }
      } catch (failure) {
        if (active) setError(failure);
      } finally {
        reading = false;
        if (active) {
          const untilRelease = releaseAt - Date.now();
          const interval = untilRelease > 0 ? Math.min(60_000, untilRelease + 500) : 60_000;
          timer = setTimeout(() => void refresh(), interval);
        }
      }
    }
    void refresh();
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [retry]));
  const letters = mailbox?.[box] ?? [];
  const letter = letters.find(item => item.id === opened);
  const outgoing = box === 'outgoing';

  function back() {
    if (letter) {
      setOpened(undefined);
      scroll.current?.scrollTo({ y: 0, animated: false });
    } else if (router.canGoBack()) router.back();
    else router.replace('/');
  }
  function stamp(item: SlowLetter) {
    const waiting = outgoing && item.releaseAt === mailbox?.releaseAt;
    if (waiting) return copy('Sealed', '已封存');
    return item.guestKey ? copy('Ready to open', '可拆阅') : copy('Delivered', '已送达');
  }

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <ScrollView ref={scroll} contentContainerStyle={styles.page}>
      <View style={styles.nav}>
        <Pressable accessibilityRole="button" onPress={back} style={styles.navAction}>
          <View aria-hidden style={[styles.chevron, styles.backArrow]} />
          <Text style={styles.navLabel}>{letter ? copy('Mailbox', '返回信箱') : copy('Back', '返回')}</Text>
        </Pressable>
        {outgoing && letter?.guestKey && <Pressable accessibilityRole="button" onPress={() => scroll.current?.scrollToEnd({ animated: false })} style={styles.navAction}>
          <Text style={[styles.navLabel, styles.shareLabel]}>{copy('Sharing options', '分享选项')}</Text>
        </Pressable>}
      </View>
      <View style={styles.intro}>
        <Text accessibilityRole="header" style={styles.title}>{letter
          ? outgoing ? copy('Sent letter', '寄出的信') : copy('A memory letter', '一封记忆来信')
          : copy('Memory Mail', '记忆慢递')}</Text>
        {!letter && Platform.OS === 'web' && <Text style={styles.body}>{copy('Turn a shared meal into a letter. Seal it, share the link, and they can open it at month’s end.', '把一起吃过的饭写成信。封存后分享链接，对方月底就能拆信。')}</Text>}
      </View>
      {Platform.OS !== 'web' ? <Text style={styles.body}>{copy('Open Mealog in your browser to use slow mail.', '请在浏览器打开 Mealog，使用记忆慢递。')}</Text> :
        letter ? <View style={styles.detail}>
          <SlowLetterPaper letter={letter} status={stamp(letter)} />
          {outgoing && letter.guestKey && <SlowMailShare guestKey={letter.guestKey} />}
        </View> : <>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/insights', params: { period: 'month' } })}
            style={({ pressed }) => [styles.button, styles.writeButton, pressed && styles.writePressed]}>
            <Text style={styles.writeLabel}>{copy('Write a letter', '去写一封信')}</Text>
            <View aria-hidden style={[styles.chevron, styles.writeArrow]} />
          </Pressable>
          {error !== undefined && <View style={styles.notice}>
            <Text accessibilityLiveRegion="polite" style={styles.body}>{slowMailError(error, zh)}</Text>
            <Pressable accessibilityRole="button" style={styles.button} onPress={() => { setError(undefined); setRetry(value => value + 1); }}>
              <Text style={styles.body}>{copy('Reload mailbox', '重新读取信箱')}</Text>
            </Pressable>
          </View>}
          {!mailbox && error === undefined && <ActivityIndicator color={colors.secondary} accessibilityLabel={copy('Loading mailbox', '正在打开信箱')} />}
          {mailbox && <>
            <View style={styles.switcher}>
              {(['incoming', 'outgoing'] as const).map(value => <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: box === value }}
                onPress={() => { setBox(value); setOpened(undefined); }}
                style={[styles.switcherItem, box === value && styles.selected]}
              >
                <Text style={[styles.tabLabel, box === value && styles.selectedText]}>
                  {value === 'incoming' ? copy('Received letters', '收到的信') : copy('Sent letters', '寄出的信')}
                </Text>
              </Pressable>)}
            </View>
            {outgoing && <View style={styles.delivery}>
              <Text style={styles.quota}>{copy(`${mailbox.remaining} of 3 letters left this month`, `本月还可寄 ${mailbox.remaining} / 3 封`)}</Text>
              <Text style={styles.meta}>{copy(`Next delivery · ${formatSlowMailDate(mailbox.releaseAt, zh)}`, `下次投递 · ${formatSlowMailDate(mailbox.releaseAt, zh)}`)}</Text>
            </View>}
            {!letters.length && <View style={styles.paper}>
              <Text style={styles.heading}>{outgoing ? copy('No letters queued or sent', '还没有寄出的信') : copy('Your mailbox is quiet', '还没有收到信')}</Text>
              <Text style={styles.body}>{outgoing ? copy('Choose a shared memory from a monthly reflection to prepare a letter.', '在月度洞察里选一段共同记忆，就能写成信。') : copy('A letter will appear here when its delivery date arrives.', '信到了投递时间，就会出现在这里。')}</Text>
            </View>}
            {letters.map((item, index) => <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={outgoing ? copy(`Read letter to ${item.recipientName} · ${index + 1}`, `打开寄给 ${item.recipientName} 的信 · ${index + 1}`) : copy(`Open letter from ${item.senderName} · ${index + 1}`, `开信：${item.senderName} · ${index + 1}`)}
              onPress={() => { setOpened(item.id); scroll.current?.scrollTo({ y: 0, animated: false }); }}
              style={({ pressed }) => [styles.envelope, pressed && styles.pressed]}
            >
              <Image accessible={false} aria-hidden source={require('../assets/keepsakes/pastel-v1/monthly-letter.png')} style={styles.envelopeArt} resizeMode="contain" />
              <View style={styles.letterMeta}>
                <Text style={styles.heading}>{outgoing ? copy(`To ${item.recipientName}`, `寄给 ${item.recipientName}`) : copy(`From ${item.senderName}`, `${item.senderName} 的来信`)}</Text>
                <Text style={styles.meta}>{formatSlowMailDate(item.releaseAt, zh)}</Text>
                <Text style={styles.stamp}>{stamp(item)}</Text>
              </View>
              <View aria-hidden style={styles.chevron} />
            </Pressable>)}
          </>}
        </>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 36, gap: 16 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  navAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, gap: 8 },
  navLabel: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: ink },
  shareLabel: { textDecorationLine: 'underline' },
  intro: { gap: 9, marginBottom: 4 },
  title: { fontFamily: fonts.editorial, fontSize: 33, lineHeight: 42, color: colors.primary },
  heading: { fontFamily: fonts.editorial, fontSize: 19, lineHeight: 26, color: colors.primary },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.secondary },
  meta: { fontFamily: fonts.body, fontSize: 12, lineHeight: 19, color: colors.secondary },
  detail: { gap: 18 },
  notice: { backgroundColor: lining, borderRadius: 4, padding: 13, gap: 8 },
  button: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 15, borderRadius: 4, borderWidth: 1, borderColor: crease, backgroundColor: colors.surface },
  writeButton: { backgroundColor: ink, borderColor: ink, flexDirection: 'row', alignItems: 'center', gap: 14 },
  writePressed: { opacity: 0.84 },
  writeLabel: { fontFamily: fonts.body, fontSize: 14, fontWeight: '600', color: colors.surface },
  writeArrow: { borderColor: colors.surface },
  switcher: { flexDirection: 'row', marginTop: 10, borderBottomWidth: 1, borderColor: crease },
  switcherItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderBottomWidth: 2, borderColor: 'transparent' },
  selected: { borderColor: ink },
  tabLabel: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.secondary },
  selectedText: { color: ink, fontWeight: '600' },
  delivery: { gap: 3, backgroundColor: lining, borderRadius: 3, paddingVertical: 11, paddingHorizontal: 14 },
  quota: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: ink, fontWeight: '600' },
  paper: { backgroundColor: colors.surface, borderRadius: 4, borderWidth: 1, borderColor: crease, padding: 17, gap: 6 },
  envelope: { flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.surface, borderRadius: 4, borderWidth: 1, borderColor: crease, padding: 14 },
  pressed: { backgroundColor: lining },
  envelopeArt: { width: 46, height: 46 },
  letterMeta: { flex: 1, minWidth: 0, gap: 2 },
  stamp: { color: ink, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, fontWeight: '600', marginTop: 3 },
  chevron: { width: 6, height: 6, borderTopWidth: 1, borderRightWidth: 1, borderColor: ink, transform: [{ rotate: '45deg' }] },
  backArrow: { transform: [{ rotate: '225deg' }] },
});
