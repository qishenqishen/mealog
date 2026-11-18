import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { getSlowGuestPhoto, getSlowPhoto, type SlowLetter } from '../product/slowMail';
import { colors, fonts } from '../theme';

export function formatSlowMailDate(value: string, zh: boolean) {
  return new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(value));
}

function LetterPhoto({ id, index, zh, guestKey }: { id: string; index: number; zh: boolean; guestKey?: string }) {
  const [uri, setUri] = useState('');
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setUri('');
    setFailed(false);
    const attachment = guestKey ? getSlowGuestPhoto(guestKey, index) : getSlowPhoto(id, index);
    void attachment.then(blob => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUri(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, index, retry, guestKey]);
  const label = zh ? `原始照片 ${index + 1}` : `Original photo ${index + 1}`;
  if (failed) return <Pressable accessibilityRole="button" accessibilityLabel={zh ? `重试${label}` : `Retry ${label}`}
    onPress={() => setRetry(value => value + 1)} style={styles.retry}>
    <Text style={styles.meta}>{zh ? '照片加载失败，轻触重试' : 'Photo unavailable. Tap to retry.'}</Text>
  </Pressable>;
  if (!uri) return <ActivityIndicator accessibilityLabel={zh ? `加载${label}` : `Loading ${label}`} color={colors.secondary} />;
  return <Image accessibilityRole="image" accessibilityLabel={label} source={{ uri }}
    resizeMode="contain" style={styles.photo} onError={() => setFailed(true)} />;
}

export default function SlowLetterPaper({ letter, status, guestKey, zh: language }: {
  letter: SlowLetter;
  status?: string;
  guestKey?: string;
  zh?: boolean;
}) {
  const { locale } = useI18n();
  const zh = language ?? locale === 'zh';
  return <View style={styles.paper}>
    <View style={styles.letterhead}>
      <View style={styles.letterMeta}>
        <Text style={styles.meta}>{letter.month} · {zh ? '共同记忆' : 'Shared memory'}</Text>
        <Text style={styles.heading}>{zh ? `致 ${letter.recipientName}` : `To ${letter.recipientName}`}</Text>
      </View>
      {status && <Text style={styles.stamp}>{status}</Text>}
    </View>
    <Text selectable style={styles.letterText}>{letter.text}</Text>
    {letter.photos.map((_, index) => <LetterPhoto key={`${letter.id}-${index}`} id={letter.id} index={index} zh={zh} guestKey={guestKey} />)}
    <View style={styles.signoff}>
      <Text style={styles.heading}>{zh ? `${letter.senderName} 寄` : `From ${letter.senderName}`}</Text>
      <Text style={styles.meta}>{zh ? '投递' : 'Delivery'} · {formatSlowMailDate(letter.releaseAt, zh)}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  paper: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 14 },
  letterhead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  letterMeta: { flex: 1, gap: 4 },
  heading: { fontFamily: fonts.editorial, fontSize: 18, lineHeight: 26, color: colors.primary },
  meta: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.secondary },
  stamp: { color: colors.primary, backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.border, borderRadius: 4, fontSize: 12, paddingVertical: 5, paddingHorizontal: 8 },
  letterText: { fontFamily: fonts.editorial, fontSize: 18, lineHeight: 30, color: colors.text },
  photo: { width: '100%', height: 245, borderRadius: 8, backgroundColor: colors.accentSoft },
  signoff: { alignItems: 'flex-end', gap: 4, paddingTop: 8 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
