import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';
import { slowMailGuestUrl } from '../product/slowMail';
import { colors, fonts } from '../theme';

export default function SlowMailShare({ guestKey }: { guestKey: string }) {
  const { locale } = useI18n();
  const zh = locale === 'zh';
  const [status, setStatus] = useState<'copied' | 'manual' | 'share-failed'>();
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function share() {
    try {
      await navigator.share({
        title: zh ? '一封 Mealog 记忆来信' : 'A memory letter from Mealog',
        url: slowMailGuestUrl(guestKey, locale),
      });
      setStatus(undefined);
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setStatus('share-failed');
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(slowMailGuestUrl(guestKey, locale));
      setStatus('copied');
    } catch {
      setStatus('manual');
    }
  }

  return <View style={styles.panel}>
    <Text style={styles.body}>{zh ? '把链接发给收信人。到期后，持链接的人都可以拆信。' : 'Send the link to your recipient. Anyone with it can open the letter after delivery.'}</Text>
    <View style={styles.actions}>
      {canShare && <Pressable accessibilityRole="button" style={[styles.button, styles.primary]} onPress={() => void share()}>
        <Text style={styles.label}>{zh ? '分享信件链接' : 'Share letter link'}</Text>
      </Pressable>}
      <Pressable accessibilityRole="button" style={[styles.button, !canShare && styles.primary]} onPress={() => void copy()}>
        <Text style={styles.label}>{zh ? '复制信件链接' : 'Copy letter link'}</Text>
      </Pressable>
    </View>
    {status === 'copied' && <Text accessibilityLiveRegion="polite" style={styles.body}>{zh ? '链接已复制' : 'Letter link copied'}</Text>}
    {status === 'share-failed' && <Text accessibilityLiveRegion="polite" style={styles.body}>{zh ? '请复制链接后分享。' : 'Copy the link to share it.'}</Text>}
    {status === 'manual' && <>
      <Text accessibilityLiveRegion="polite" style={styles.body}>{zh ? '长按或选中下方链接，手动复制。' : 'Select the link below to copy it manually.'}</Text>
      <Text selectable style={styles.link}>{slowMailGuestUrl(guestKey, locale)}</Text>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: 8, padding: 12, borderRadius: 8, backgroundColor: colors.accentSoft },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  body: { color: colors.mutedText, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
  label: { color: colors.primary, fontFamily: fonts.body, fontSize: 14 },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  primary: { backgroundColor: colors.accent, borderColor: colors.primary },
  link: { color: colors.text, fontFamily: fonts.body, fontSize: 13, lineHeight: 20 },
});
