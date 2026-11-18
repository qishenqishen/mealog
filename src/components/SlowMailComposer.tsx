import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useI18n } from '../i18n';
import { getSlowMailbox, queueSlowLetter, slowMailError, type SlowLetter, type SlowMailbox } from '../product/slowMail';
import { colors, fonts } from '../theme';
import type { MealEntry, PersonProfile } from '../types';

export type SlowMailDraft = {
  month: string;
  text: string;
  recipients: PersonProfile[];
  sources: MealEntry[];
};

export default function SlowMailComposer({ draft, onClose, onMailbox }: {
  draft: SlowMailDraft;
  onClose: () => void;
  onMailbox: () => void;
}) {
  const { locale } = useI18n();
  const zh = locale === 'zh';
  const copy = (en: string, cn: string) => zh ? cn : en;
  const [person, setPerson] = useState(draft.recipients[0]);
  const [address, setAddress] = useState('');
  const [senderName, setSenderName] = useState('');
  const [text, setText] = useState(draft.text);
  const [selected, setSelected] = useState<string[]>([]);
  const [mailbox, setMailbox] = useState<SlowMailbox>();
  const [letter, setLetter] = useState<SlowLetter>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>();
  const sending = useRef(false);
  const requestId = useRef<string | undefined>(undefined);
  const active = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getSlowMailbox();
      if (active.current) setMailbox(next);
    } catch (loadError) {
      if (active.current) setError(loadError);
    } finally {
      if (active.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    active.current = true;
    void load();
    return () => { active.current = false; };
  }, [load]);

  const recipient = address.trim().toLowerCase();
  const ready = Boolean(mailbox?.remaining && !loading && !saving && senderName.trim() && text.trim()
    && /^[a-f0-9]{64}$/.test(recipient) && recipient !== mailbox.address && selected.length);
  const formatDate = (date: string) => new Date(date).toLocaleString(zh ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });

  async function seal() {
    if (!ready || !mailbox || sending.current) return;
    sending.current = true;
    setSaving(true);
    setError(undefined);
    try {
      requestId.current ??= crypto.randomUUID();
      const result = await queueSlowLetter({
        recipient,
        senderName: senderName.trim(),
        recipientName: (person.nickname?.trim() || person.name.trim()).slice(0, 60),
        text: text.trim(),
        month: draft.month,
        releaseAt: mailbox.releaseAt,
        requestId: requestId.current,
        photos: draft.sources.filter(source => selected.includes(source.id)),
      });
      if (active.current) setLetter(result);
    } catch (sendError) {
      if (active.current) {
        setError(sendError);
        if (sendError instanceof Error && ['release_changed', 'monthly_limit'].includes(sendError.message)) await load();
      }
    } finally {
      sending.current = false;
      if (active.current) setSaving(false);
    }
  }

  function action(label: string, onPress: () => void, options: { primary?: boolean; disabled?: boolean } = {}) {
    return <Pressable accessibilityRole="button" disabled={options.disabled} onPress={onPress}
      style={[styles.button, options.primary && styles.primary, options.disabled && styles.disabled]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>;
  }

  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!sending.current) onClose(); }}>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.row}>
            <Text accessibilityRole="header" style={styles.title}>{copy('Memory Mail', '记忆慢递')}</Text>
            {action(copy('Close', '关闭'), onClose, { disabled: saving })}
          </View>
          {letter ? <>
            <Text accessibilityLiveRegion="polite" style={styles.memory}>{copy('Your letter is sealed.', '这封信已封存。')}</Text>
            <Text style={styles.body}>{copy(`To ${letter.recipientName} · Opens at ${formatDate(letter.releaseAt)}`, `寄给${letter.recipientName} · ${formatDate(letter.releaseAt)}送达`)}</Text>
            {action(copy('Open mailbox', '打开信箱'), onMailbox, { primary: true })}
          </> : <>
            <Text style={styles.body}>{copy(`A memory from ${draft.month}`, `${draft.month} 的共同记忆`)}</Text>
            <Text style={styles.label}>{copy('To', '收信人')}</Text>
            {draft.recipients.length === 1 ? <Text style={styles.memory}>{person.nickname || person.name}</Text> :
              <View style={styles.choices}>{draft.recipients.map(item => <Pressable key={item.id} accessibilityRole="button"
                accessibilityState={{ selected: item.id === person.id }} disabled={saving} onPress={() => { setPerson(item); setAddress(''); }}
                style={[styles.button, item.id === person.id && styles.primary]}>
                <Text style={styles.buttonText}>{item.nickname || item.name}</Text>
              </Pressable>)}</View>}
            <TextInput accessibilityLabel={copy('Recipient mailbox address', '收信人信箱地址')} placeholder={copy('Paste their mailbox address', '粘贴对方的信箱地址')}
              placeholderTextColor={colors.mutedText} value={address} onChangeText={setAddress} autoComplete="off" autoCorrect={false} autoCapitalize="none"
              editable={!saving} style={styles.input} />
            <Text style={styles.body}>{copy('Ask them to copy their address from Mealog’s Memory Mail.', '请对方从 Mealog 的「记忆慢递」里复制信箱地址给你。')}</Text>
            {recipient !== '' && (!/^[a-f0-9]{64}$/.test(recipient) || recipient === mailbox?.address) && <Text style={styles.error}>
              {copy('Enter the other person’s 64-character mailbox address.', '请填写对方的 64 位信箱地址。')}
            </Text>}
            <Text style={styles.label}>{copy('Sign the letter', '你的署名')}</Text>
            <TextInput accessibilityLabel={copy('Your signature', '你的署名')} placeholder={copy('The name they know you by', '写下对方熟悉的称呼')}
              placeholderTextColor={colors.mutedText} value={senderName} onChangeText={setSenderName} maxLength={60} editable={!saving} style={styles.input} />
            <Text style={styles.label}>{copy('The memory', '信件正文')}</Text>
            <TextInput accessibilityLabel={copy('Letter text', '信件正文')} value={text} onChangeText={setText} multiline maxLength={1200}
              editable={!saving} style={[styles.input, styles.memory, styles.editor]} />
            <Text style={styles.label}>{copy('Choose 1–3 original photos', '选 1–3 张原始照片')}</Text>
            <Text style={styles.body}>{copy('JPG, PNG, WebP or GIF · up to 12 MB total', '支持 JPG、PNG、WebP 或 GIF · 合计不超过 12 MB')}</Text>
            <View style={styles.choices}>{draft.sources.map(source => {
              const checked = selected.includes(source.id);
              return <Pressable key={source.id} accessibilityRole="checkbox" accessibilityState={{ checked }}
                accessibilityLabel={copy(`Include original photo from ${source.title}`, `附上「${source.title}」的原图`)}
                disabled={saving || (!checked && selected.length >= 3)}
                onPress={() => setSelected(current => checked ? current.filter(id => id !== source.id) : [...current, source.id])}
                style={[styles.photoChoice, checked && styles.primary]}>
                {(source.photoThumbnailUri || source.photoUri) && <Image style={styles.thumbnail} source={{ uri: source.photoThumbnailUri || source.photoUri }} />}
                <Text style={styles.photoCaption} numberOfLines={2}>{checked ? '✓ ' : ''}{source.title}</Text>
                <Text style={styles.body}>{source.date}</Text>
              </Pressable>;
            })}</View>
            <Text style={styles.body}>{copy('Sealing uploads this text and the selected originals for delivery. Originals may contain details such as capture time and location.', '封存会上传这段文字和所选原图，以便月底送达。原图可能含拍摄时间和地点。')}</Text>
            {error != null && <Text accessibilityLiveRegion="polite" style={styles.error}>{slowMailError(error, zh)}</Text>}
            {loading ? <ActivityIndicator color={colors.primary} /> : mailbox ? <>
              <Text style={styles.body}>{copy(`Delivery at ${formatDate(mailbox.releaseAt)} · ${mailbox.remaining} of 3 letters left this month`, `预计 ${formatDate(mailbox.releaseAt)} 送达 · 本月还可寄 ${mailbox.remaining} 封（最多 3 封）`)}</Text>
              {action(saving ? copy('Sealing…', '正在封存…') : copy('Seal for month-end delivery', '封存，月底寄出'), () => void seal(), { primary: true, disabled: !ready })}
            </> : action(copy('Retry loading mailbox', '重试读取信箱'), () => { setError(undefined); void load(); })}
          </>}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 14, backgroundColor: 'rgba(32, 30, 22, 0.42)' },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '92%', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  content: { gap: 12, padding: 18 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontFamily: fonts.editorial, fontSize: 25, color: colors.primary },
  label: { fontFamily: fonts.body, fontSize: 14, fontWeight: '600', color: colors.primary },
  body: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.mutedText },
  memory: { fontFamily: fonts.editorial, fontSize: 17, lineHeight: 27, color: colors.text },
  input: { minHeight: 44, padding: 10, fontFamily: fonts.body, fontSize: 16, color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 8 },
  editor: { minHeight: 115, textAlignVertical: 'top' },
  button: { minHeight: 44, justifyContent: 'center', backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12 },
  primary: { backgroundColor: colors.accentSoft, borderColor: colors.primary },
  disabled: { opacity: 0.45 },
  buttonText: { color: colors.primary, fontSize: 14, fontFamily: fonts.body },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoChoice: { width: 126, padding: 6, gap: 4, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  thumbnail: { width: '100%', height: 76, borderRadius: 4, backgroundColor: colors.surfaceWarm },
  photoCaption: { fontFamily: fonts.body, color: colors.primary, fontSize: 13, lineHeight: 18 },
  error: { color: '#A14335', fontSize: 14, lineHeight: 22 },
});
