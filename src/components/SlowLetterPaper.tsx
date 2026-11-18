import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { getSlowGuestPhoto, getSlowPhoto, type SlowLetter } from '../product/slowMail';
import { DEFAULT_SLOW_MAIL_STATIONERY } from '../product/slowMailStationery';
import { colors, fonts } from '../theme';
import { slowMailPaperColor } from './SlowMailEnvelope';

export function formatSlowMailDate(value: string, zh: boolean) {
  return new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }).format(new Date(value));
}

function LetterPhoto({ id, index, zh, guestKey }: { id: string; index: number; zh: boolean; guestKey?: string }) {
  const [photo, setPhoto] = useState<{ uri: string; ratio: number }>();
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setPhoto(undefined);
    setFailed(false);
    const attachment = guestKey ? getSlowGuestPhoto(guestKey, index) : getSlowPhoto(id, index);
    void attachment.then(blob => {
      if (!active) return;
      const uri = URL.createObjectURL(blob);
      objectUrl = uri;
      Image.getSize(uri, (width, height) => {
        if (active) setPhoto({ uri, ratio: Math.max(0.45, Math.min(4, width / height)) });
      }, () => { if (active) setFailed(true); });
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
  if (!photo) return <ActivityIndicator accessibilityLabel={zh ? `加载${label}` : `Loading ${label}`} color={colors.secondary} />;
  return <View style={[styles.photoMount, { maxWidth: Math.ceil(264 * photo.ratio) + 12 }]}>
    <Image accessibilityLabel={label} source={{ uri: photo.uri }}
      resizeMode="contain" style={[styles.photo, { aspectRatio: photo.ratio }]} onError={() => setFailed(true)} />
  </View>;
}

export default function SlowLetterPaper({ letter, status, guestKey, zh: language }: {
  letter: SlowLetter;
  status?: string;
  guestKey?: string;
  zh?: boolean;
}) {
  const { locale } = useI18n();
  const zh = language ?? locale === 'zh';
  const paper = letter.stationery?.paper ?? DEFAULT_SLOW_MAIL_STATIONERY.paper;
  return <View style={[styles.paper, { backgroundColor: slowMailPaperColor(paper) }]}>
    <View style={styles.letterhead}>
      <View style={styles.letterMeta}>
        <Text style={styles.meta}>{letter.month} · {zh ? '共同记忆' : 'Shared memory'}</Text>
        <Text style={styles.salutation}>{zh ? `致 ${letter.recipientName}` : `To ${letter.recipientName}`}</Text>
      </View>
      {status && <Text style={styles.stamp}>{status}</Text>}
    </View>
    <Text selectable style={styles.letterText}>{letter.text}</Text>
    <View style={styles.signoff}>
      <Text style={styles.signature}>{zh ? `${letter.senderName} 寄` : `From ${letter.senderName}`}</Text>
      <Text style={styles.meta}>{zh ? '投递' : 'Delivery'} · {formatSlowMailDate(letter.releaseAt, zh)}</Text>
    </View>
    {letter.photos.length > 0 && <View style={styles.attachments}>
      <Text style={styles.meta}>{zh ? '随信照片' : 'Enclosed photos'} · {letter.photos.length}</Text>
      {letter.photos.map((_, index) => <LetterPhoto key={`${letter.id}-${index}`} id={letter.id} index={index} zh={zh} guestKey={guestKey} />)}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  paper: { borderRadius: 3, borderWidth: 1, borderColor: '#D9D0BE', padding: 20, gap: 18 },
  letterhead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingBottom: 13, borderBottomWidth: 1, borderColor: '#E3DAC8' },
  letterMeta: { flex: 1, minWidth: 0, gap: 5 },
  salutation: { fontFamily: fonts.editorial, fontSize: 26, lineHeight: 34, color: colors.primary },
  meta: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, letterSpacing: 0.25, color: colors.secondary },
  stamp: { color: '#414737', borderWidth: 1, borderColor: '#CFC7B5', borderRadius: 2, fontFamily: fonts.body, fontSize: 12, paddingVertical: 4, paddingHorizontal: 7, flexShrink: 1, textAlign: 'center' },
  letterText: { fontFamily: fonts.editorial, fontSize: 18, lineHeight: 31, color: colors.text },
  signature: { fontFamily: fonts.editorial, fontSize: 18, lineHeight: 26, color: colors.primary },
  signoff: { alignItems: 'flex-end', gap: 3 },
  attachments: { borderTopWidth: 1, borderColor: '#E3DAC8', paddingTop: 13, gap: 9 },
  photoMount: { width: '100%', alignSelf: 'center', borderWidth: 1, borderColor: '#E3DAC8', backgroundColor: colors.surface, padding: 5, borderRadius: 2 },
  photo: { width: '100%', backgroundColor: '#EEEBDC' },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
