import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useI18n } from '../src/i18n';
import { getSlowMailbox, slowMailError, type SlowLetter, type SlowMailbox } from '../src/product/slowMail';
import SlowLetterPaper, { formatSlowMailDate } from '../src/components/SlowLetterPaper';
import SlowMailShare from '../src/components/SlowMailShare';
import { colors, fonts } from '../src/theme';

export default function SlowMailScreen() {
  const { locale } = useI18n();
  const zh = locale === 'zh';
  const copy = (en: string, cn: string) => zh ? cn : en;
  const [mailbox, setMailbox] = useState<SlowMailbox>();
  const [box, setBox] = useState<'incoming' | 'outgoing'>('incoming');
  const [opened, setOpened] = useState<string>();
  const [error, setError] = useState<unknown>();
  const [retry, setRetry] = useState(0);
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
    if (letter) setOpened(undefined);
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  }
  function stamp(item: SlowLetter) {
    const waiting = outgoing && item.releaseAt === mailbox?.releaseAt;
    if (waiting) return copy('Sealed', '已封存');
    return item.guestKey ? copy('Ready to open', '可拆阅') : copy('Delivered', '已送达');
  }

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable accessibilityRole="button" onPress={back} style={styles.back}>
        <Text style={styles.body}>{letter ? copy('‹ Mailbox', '‹ 返回信箱') : copy('‹ Back', '‹ 返回')}</Text>
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>{letter ? copy('A memory letter', '一封记忆来信') : copy('Memory Mail', '记忆慢递')}</Text>
      {Platform.OS !== 'web' ? <Text style={styles.body}>{copy('Open Mealog in your browser to use slow mail.', '请在浏览器打开 Mealog，使用记忆慢递。')}</Text> :
        letter ? <>
          {outgoing && letter.guestKey && <SlowMailShare guestKey={letter.guestKey} />}
          <SlowLetterPaper letter={letter} status={stamp(letter)} />
        </> : <>
          <Text style={styles.body}>{copy('Turn a shared meal into a letter. Seal it, share the link, and they can open it at month’s end.', '把一起吃过的饭写成信。封存后分享链接，对方月底就能拆信。')}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/insights', params: { period: 'month' } })}
            style={[styles.button, styles.writeButton]}>
            <Text style={styles.body}>{copy('Write a letter', '去写一封信')}</Text>
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
                <Text style={box === value ? styles.selectedText : styles.body}>
                  {value === 'incoming' ? copy('Received letters', '收到的信') : copy('Sent letters', '寄出的信')}
                </Text>
              </Pressable>)}
            </View>
            {outgoing && <>
              <Text style={styles.body}>{copy(`${mailbox.remaining} of 3 letters left this month`, `本月还可寄 ${mailbox.remaining} / 3 封`)}</Text>
              <Text style={styles.meta}>{copy(`Next delivery · ${formatSlowMailDate(mailbox.releaseAt, zh)}`, `下次投递 · ${formatSlowMailDate(mailbox.releaseAt, zh)}`)}</Text>
            </>}
            {!letters.length && <View style={styles.paper}>
              <Text style={styles.heading}>{outgoing ? copy('No letters queued or sent', '还没有寄出的信') : copy('Your mailbox is quiet', '还没有收到信')}</Text>
              <Text style={styles.body}>{outgoing ? copy('Choose a shared memory from a monthly reflection to prepare a letter.', '在月度洞察里选一段共同记忆，就能写成信。') : copy('A letter will appear here when its delivery date arrives.', '信到了投递时间，就会出现在这里。')}</Text>
            </View>}
            {letters.map((item, index) => <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={outgoing ? copy(`Read letter to ${item.recipientName} · ${index + 1}`, `打开寄给 ${item.recipientName} 的信 · ${index + 1}`) : copy(`Open letter from ${item.senderName} · ${index + 1}`, `开信：${item.senderName} · ${index + 1}`)}
              onPress={() => setOpened(item.id)}
              style={({ pressed }) => [styles.envelope, pressed && styles.pressed]}
            >
              <View style={styles.letterMeta}>
                <Text style={styles.heading}>{outgoing ? copy(`To ${item.recipientName}`, `寄给 ${item.recipientName}`) : copy(`From ${item.senderName}`, `${item.senderName} 的来信`)}</Text>
                <Text style={styles.meta}>{formatSlowMailDate(item.releaseAt, zh)}</Text>
              </View>
              <Text style={styles.stamp}>{stamp(item)}</Text>
            </Pressable>)}
          </>}
        </>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  page: { paddingHorizontal: 22, paddingBottom: 32, gap: 14 },
  back: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center' },
  title: { fontFamily: fonts.editorial, fontSize: 26, lineHeight: 36, color: colors.primary },
  heading: { fontFamily: fonts.editorial, fontSize: 18, lineHeight: 26, color: colors.primary },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.text },
  meta: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.secondary },
  notice: { backgroundColor: colors.surfaceWarm, borderRadius: 12, padding: 12, gap: 8 },
  button: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  writeButton: { backgroundColor: colors.accent, borderColor: colors.primary },
  switcher: { flexDirection: 'row', gap: 8, paddingTop: 6 },
  switcherItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 10, backgroundColor: colors.surface },
  selected: { backgroundColor: colors.primary },
  selectedText: { fontFamily: fonts.body, fontSize: 14, color: colors.background },
  paper: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 14 },
  envelope: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 15 },
  pressed: { backgroundColor: colors.accentSoft },
  letterMeta: { flex: 1, gap: 4 },
  stamp: { color: colors.primary, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.border, borderRadius: 4, fontSize: 12, paddingVertical: 5, paddingHorizontal: 8 },
});
