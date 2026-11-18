import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useI18n } from '../i18n';
import { getSlowMailbox, queueSlowLetter, slowMailError, type SlowLetter, type SlowMailbox } from '../product/slowMail';
import { DEFAULT_SLOW_MAIL_STATIONERY, type SlowMailStationery } from '../product/slowMailStationery';
import SlowMailEnvelope, { slowMailPaperColor } from './SlowMailEnvelope';
import SlowMailShare from './SlowMailShare';
import SlowMailStationeryPicker from './SlowMailStationeryPicker';
import { colors, fonts } from '../theme';
import type { MealEntry, PersonProfile } from '../types';

export type SlowMailDraft = {
  month: string;
  text: string;
  recipients: PersonProfile[];
  sources: MealEntry[];
};

const olive = '#414737';
const paperLine = '#CFC7B5';

export default function SlowMailComposer({ draft, onClose, onMailbox }: {
  draft: SlowMailDraft;
  onClose: () => void;
  onMailbox: () => void;
}) {
  const { locale } = useI18n();
  const zh = locale === 'zh';
  const copy = (en: string, cn: string) => zh ? cn : en;
  const [person, setPerson] = useState(draft.recipients[0]);
  const [senderName, setSenderName] = useState('');
  const [text, setText] = useState(draft.text);
  const [stationery, setStationery] = useState<SlowMailStationery>(DEFAULT_SLOW_MAIL_STATIONERY);
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

  const ready = Boolean(mailbox?.remaining && !loading && !saving && senderName.trim() && text.trim() && selected.length);
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
        senderName: senderName.trim(),
        recipientName: (person.nickname?.trim() || person.name.trim()).slice(0, 60),
        text: text.trim(),
        month: draft.month,
        releaseAt: mailbox.releaseAt,
        requestId: requestId.current,
        stationery,
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

  function action(label: string, onPress: () => void, options: { primary?: boolean; quiet?: boolean; disabled?: boolean } = {}) {
    return <Pressable accessibilityRole="button" disabled={options.disabled} onPress={onPress}
      style={[styles.button, options.primary && styles.primary, options.quiet && styles.quiet, options.disabled && styles.disabled]}>
      <Text style={[styles.buttonText, options.primary && styles.primaryText]}>{label}</Text>
    </Pressable>;
  }

  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!sending.current) onClose(); }}>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.row}>
            <Text accessibilityRole="header" style={styles.title}>{copy('Memory Mail', '记忆慢递')}</Text>
            {action(copy('Close', '关闭'), onClose, { quiet: true, disabled: saving })}
          </View>
          {letter ? <>
            <View style={styles.receipt}>
              <View aria-hidden style={styles.envelope}>
                <SlowMailEnvelope stationery={letter.stationery ?? DEFAULT_SLOW_MAIL_STATIONERY} compact />
              </View>
              <Text style={styles.addressee}>{copy(`To ${letter.recipientName}`, `寄给 ${letter.recipientName}`)}</Text>
              <Text accessibilityLiveRegion="polite" style={styles.receiptTitle}>{copy('Your letter is sealed.', '这封信已封存。')}</Text>
              <Text style={styles.receiptDate}>{copy(`Opens ${formatDate(letter.releaseAt)}`, `${formatDate(letter.releaseAt)} 可拆阅`)}</Text>
            </View>
            {letter.guestKey && <SlowMailShare guestKey={letter.guestKey} />}
            {action(copy('Open mailbox', '打开信箱'), onMailbox, { quiet: true })}
          </> : <>
            <View style={styles.field}>
              <Text style={styles.body}>{copy(`A memory from ${draft.month}`, `${draft.month} 的共同记忆`)}</Text>
              <View style={styles.addressRow}>
                <Text style={styles.label}>{copy('To', '收信人')}</Text>
                {draft.recipients.length === 1 ? <Text style={[styles.memory, styles.addressName]}>{person.nickname || person.name}</Text> :
                  <View style={[styles.choices, styles.addressName]}>{draft.recipients.map(item => <Pressable key={item.id} accessibilityRole="button"
                    accessibilityState={{ selected: item.id === person.id }} disabled={saving} onPress={() => setPerson(item)}
                    style={[styles.button, item.id === person.id && styles.selected]}>
                    <Text style={styles.buttonText}>{item.nickname || item.name}</Text>
                  </Pressable>)}</View>}
              </View>
            </View>
            <SlowMailStationeryPicker stationery={stationery} onChange={setStationery} zh={zh} disabled={saving} />
            <View style={styles.field}>
              <Text style={styles.label}>{copy('The memory', '信件正文')}</Text>
              <TextInput accessibilityLabel={copy('Letter text', '信件正文')} value={text} onChangeText={setText} multiline maxLength={1200}
                editable={!saving} style={[styles.input, styles.memory, styles.editor, { backgroundColor: slowMailPaperColor(stationery.paper) }]} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>{copy('Sign the letter', '你的署名')}</Text>
              <TextInput accessibilityLabel={copy('Your signature', '你的署名')} placeholder={copy('The name they know you by', '写下对方熟悉的称呼')}
                placeholderTextColor={colors.mutedText} value={senderName} onChangeText={setSenderName} maxLength={60} editable={!saving} style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>{copy('Choose 1–3 original photos', '选 1–3 张原始照片')}</Text>
              <Text style={styles.body}>{copy('JPG, PNG, WebP or GIF · up to 12 MB total', '支持 JPG、PNG、WebP 或 GIF · 合计不超过 12 MB')}</Text>
            </View>
            <View style={styles.choices}>{draft.sources.map(source => {
              const checked = selected.includes(source.id);
              return <Pressable key={source.id} accessibilityRole="checkbox" accessibilityState={{ checked }}
                accessibilityLabel={copy(`Include original photo from ${source.title}`, `附上「${source.title}」的原图`)}
                disabled={saving || (!checked && selected.length >= 3)}
                onPress={() => setSelected(current => checked ? current.filter(id => id !== source.id) : [...current, source.id])}
                style={[styles.photoChoice, checked && styles.selected]}>
                {(source.photoThumbnailUri || source.photoUri) && <Image style={styles.thumbnail} source={{ uri: source.photoThumbnailUri || source.photoUri }} />}
                <Text style={styles.photoCaption} numberOfLines={2}>{checked ? '✓ ' : ''}{source.title}</Text>
                <Text style={styles.body}>{source.date}</Text>
              </Pressable>;
            })}</View>
            <View style={styles.footer}>
              <Text style={styles.body}>{copy('Sealing uploads the letter and original photos, and creates a link you can share. Anyone with the link can open it after delivery. Originals may include capture time and location.', '封存会上传信件和原图，并生成可分享的链接。到期后，持链接的人都可拆信。原图可能含拍摄时间和地点。')}</Text>
              {error != null && <Text accessibilityLiveRegion="polite" style={styles.error}>{slowMailError(error, zh)}</Text>}
              {loading ? <ActivityIndicator color={colors.primary} /> : mailbox ? <>
                <Text style={styles.body}>{copy(`Opens ${formatDate(mailbox.releaseAt)} · ${mailbox.remaining} of 3 letters left this month`, `${formatDate(mailbox.releaseAt)} 可拆阅 · 本月还可寄 ${mailbox.remaining} 封（最多 3 封）`)}</Text>
                {action(saving ? copy('Sealing…', '正在封存…') : copy('Seal for month-end delivery', '封存，月底寄出'), () => void seal(), { primary: true, disabled: !ready })}
              </> : action(copy('Retry loading mailbox', '重试读取信箱'), () => { setError(undefined); void load(); })}
            </View>
          </>}
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 14, backgroundColor: 'rgba(32, 30, 22, 0.54)' },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '92%', backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: paperLine, overflow: 'hidden' },
  content: { gap: 14, padding: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 7, borderBottomWidth: 1, borderColor: paperLine },
  title: { fontFamily: fonts.editorial, fontSize: 27, lineHeight: 34, color: colors.primary },
  field: { gap: 5 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  addressName: { flex: 1 },
  label: { fontFamily: fonts.body, fontSize: 13, fontWeight: '600', color: colors.primary },
  body: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.mutedText },
  memory: { fontFamily: fonts.editorial, fontSize: 17, lineHeight: 27, color: colors.text },
  input: { minHeight: 44, padding: 11, backgroundColor: '#FFFDF7', fontFamily: fonts.body, fontSize: 16, color: colors.text, borderColor: paperLine, borderWidth: 1, borderRadius: 4 },
  editor: { minHeight: 112, textAlignVertical: 'top' },
  button: { minHeight: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surface, borderColor: paperLine, borderWidth: 1, borderRadius: 4, paddingHorizontal: 12 },
  primary: { backgroundColor: olive, borderColor: olive },
  primaryText: { color: colors.surface },
  quiet: { backgroundColor: 'transparent', borderColor: 'transparent' },
  selected: { backgroundColor: '#EEEBDC', borderColor: olive },
  disabled: { opacity: 0.45 },
  buttonText: { color: colors.primary, fontSize: 14, fontFamily: fonts.body },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoChoice: { width: '47%', maxWidth: 170, padding: 5, gap: 3, backgroundColor: '#FFFDF7', borderWidth: 1, borderColor: paperLine, borderRadius: 4 },
  thumbnail: { width: '100%', height: 80, borderRadius: 2, backgroundColor: colors.surfaceWarm },
  photoCaption: { fontFamily: fonts.body, color: colors.primary, fontSize: 13, lineHeight: 18 },
  footer: { gap: 9, paddingTop: 12, borderTopWidth: 1, borderColor: paperLine },
  receipt: { alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 21, backgroundColor: '#EEEBDC', borderWidth: 1, borderColor: paperLine, borderRadius: 4 },
  envelope: { width: 120, alignItems: 'center', marginBottom: 5 },
  addressee: { color: olive, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  receiptTitle: { fontFamily: fonts.editorial, color: colors.primary, fontSize: 25, lineHeight: 32, textAlign: 'center' },
  receiptDate: { fontFamily: fonts.body, color: colors.secondary, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  error: { color: '#A14335', fontSize: 14, lineHeight: 22 },
});
