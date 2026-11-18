import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useI18n } from '../src/i18n';
import { getSlowMailbox, getSlowPhoto, slowMailError, type SlowLetter, type SlowMailbox } from '../src/product/slowMail';
import { colors, fonts } from '../src/theme';

function dateLabel(value: string, zh: boolean) {
  return new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));
}

function LetterPhoto({ id, index, zh }: { id: string; index: number; zh: boolean }) {
  const [uri, setUri] = useState('');
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setUri('');
    setFailed(false);
    void getSlowPhoto(id, index).then(blob => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUri(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, index, retry]);
  const photoLabel = zh ? `原始照片 ${index + 1}` : `Original photo ${index + 1}`;
  if (failed) return <Pressable accessibilityRole="button" accessibilityLabel={zh ? `重试${photoLabel}` : `Retry ${photoLabel}`} onPress={() => setRetry(value => value + 1)} style={styles.button}>
    <Text style={styles.body}>{zh ? '照片加载失败，轻触重试' : 'Photo unavailable. Tap to retry.'}</Text>
  </Pressable>;
  if (!uri) return <ActivityIndicator accessibilityLabel={zh ? `加载${photoLabel}` : `Loading ${photoLabel}`} color={colors.secondary} />;
  return <Image accessibilityRole="image" accessibilityLabel={photoLabel} source={{ uri }} resizeMode="contain" style={styles.photo} onError={() => setFailed(true)} />;
}

export default function SlowMailScreen() {
  const { locale } = useI18n();
  const zh = locale === 'zh';
  const copy = (en: string, cn: string) => zh ? cn : en;
  const [mailbox, setMailbox] = useState<SlowMailbox>();
  const [box, setBox] = useState<'incoming' | 'outgoing'>('incoming');
  const [opened, setOpened] = useState<string>();
  const [error, setError] = useState<unknown>();
  const [retry, setRetry] = useState(0);
  const [copyStatus, setCopyStatus] = useState<'copied' | 'failed'>();
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
  async function copyAddress() {
    if (!mailbox) return;
    try {
      await navigator.clipboard.writeText(mailbox.address);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('failed');
    }
  }
  function stamp(item: SlowLetter) {
    const waiting = outgoing && item.releaseAt === mailbox?.releaseAt;
    return waiting ? copy('Sealed', '已封存') : copy('Delivered', '已送达');
  }

  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
    <ScrollView contentContainerStyle={styles.page}>
      <Pressable accessibilityRole="button" onPress={back} style={styles.back}>
        <Text style={styles.body}>{letter ? copy('‹ Mailbox', '‹ 返回信箱') : copy('‹ Back', '‹ 返回')}</Text>
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>{letter ? copy('A memory letter', '一封记忆来信') : copy('Memory Mail', '记忆慢递')}</Text>
      {Platform.OS !== 'web' ? <Text style={styles.body}>{copy('Open Mealog in your browser to use slow mail.', '请在浏览器打开 Mealog，使用记忆慢递。')}</Text> :
        letter ? <View style={styles.paper}>
          <View style={styles.letterhead}>
            <View style={styles.letterMeta}>
              <Text style={styles.meta}>{copy(`${letter.month} · Shared memory`, `${letter.month} · 共同记忆`)}</Text>
              <Text style={styles.heading}>{copy(`To ${letter.recipientName}`, `致 ${letter.recipientName}`)}</Text>
            </View>
            <Text style={styles.stamp}>{stamp(letter)}</Text>
          </View>
          <Text selectable style={styles.letterText}>{letter.text}</Text>
          {letter.photos.map((_, index) => <LetterPhoto key={`${letter.id}-${index}`} id={letter.id} index={index} zh={zh} />)}
          <View style={styles.signoff}>
            <Text style={styles.heading}>{copy(`From ${letter.senderName}`, `${letter.senderName} 寄`)}</Text>
            <Text style={styles.meta}>{copy(`Delivery · ${dateLabel(letter.releaseAt, zh)}`, `投递 · ${dateLabel(letter.releaseAt, zh)}`)}</Text>
          </View>
        </View> : <>
          <Text style={styles.body}>{copy('Shared memories arrive together at month’s end. Come back to your mailbox to open them.', '每到月底，共同记忆会一起送抵。回来打开信箱，就能读到那封信。')}</Text>
          {error !== undefined && <View style={styles.notice}>
            <Text accessibilityLiveRegion="polite" style={styles.body}>{slowMailError(error, zh)}</Text>
            <Pressable accessibilityRole="button" style={styles.button} onPress={() => { setError(undefined); setRetry(value => value + 1); }}>
              <Text style={styles.body}>{copy('Reload mailbox', '重新读取信箱')}</Text>
            </Pressable>
          </View>}
          {!mailbox && error === undefined && <ActivityIndicator color={colors.secondary} accessibilityLabel={copy('Loading mailbox', '正在打开信箱')} />}
          {mailbox && <>
            <View style={styles.addressCard}>
              <Text style={styles.heading}>{copy('My mailing address', '我的慢邮信箱')}</Text>
              <Text style={styles.body}>{copy('Give this address to the person you shared a meal with. Clearing this browser’s site data removes access to this mailbox.', '把收信地址交给同桌的人。信箱绑定当前浏览器，清除网站数据会失去访问权限。')}</Text>
              <Text selectable accessibilityLabel={copy('My mailing address', '我的慢邮信箱')} style={styles.address}>{mailbox.address}</Text>
              <Pressable accessibilityRole="button" onPress={() => void copyAddress()} style={styles.button}>
                <Text style={styles.body}>{copy('Copy mailing address', '复制收信地址')}</Text>
              </Pressable>
              {copyStatus && <Text style={styles.meta} accessibilityLiveRegion="polite">{copyStatus === 'copied' ? copy('Address copied', '已复制收信地址') : copy('Select the address to copy it manually.', '可选中上方地址手动复制。')}</Text>}
            </View>
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
              <Text style={styles.meta}>{copy(`Next delivery · ${dateLabel(mailbox.releaseAt, zh)}`, `下次投递 · ${dateLabel(mailbox.releaseAt, zh)}`)}</Text>
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
                <Text style={styles.meta}>{dateLabel(item.releaseAt, zh)}</Text>
              </View>
              <Text style={styles.stamp}>{stamp(item)}</Text>
            </Pressable>)}
            {outgoing && <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/insights', params: { period: 'month' } })} style={styles.button}>
              <Text style={styles.body}>{copy('Choose a memory from monthly reflections →', '去月度洞察选一段记忆 →')}</Text>
            </Pressable>}
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
  addressCard: { backgroundColor: colors.accentSoft, padding: 16, borderRadius: 12, gap: 8 },
  address: { fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, fontSize: 13, lineHeight: 21, color: colors.primary },
  notice: { backgroundColor: colors.surfaceWarm, borderRadius: 12, padding: 12, gap: 8 },
  button: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  switcher: { flexDirection: 'row', gap: 8, paddingTop: 6 },
  switcherItem: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 10, backgroundColor: colors.surface },
  selected: { backgroundColor: colors.primary },
  selectedText: { fontFamily: fonts.body, fontSize: 14, color: colors.background },
  paper: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 14 },
  envelope: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 15 },
  pressed: { backgroundColor: colors.accentSoft },
  letterhead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  letterMeta: { flex: 1, gap: 4 },
  stamp: { color: colors.primary, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.border, borderRadius: 4, fontSize: 12, paddingVertical: 5, paddingHorizontal: 8 },
  letterText: { fontFamily: fonts.editorial, fontSize: 18, lineHeight: 30, color: colors.text },
  photo: { width: '100%', height: 245, borderRadius: 8, backgroundColor: colors.accentSoft },
  signoff: { alignItems: 'flex-end', gap: 4, paddingTop: 8 },
});
