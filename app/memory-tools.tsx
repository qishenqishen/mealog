import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { getMeals, getPeopleProfiles, getTrash, restoreMeal, saveMealMemory, setMealArchived, mergePersonProfiles, getPeopleForMeal, type TrashedMemory } from '../src/storage';
import { getFreeMemories, saveFreeMemory, getMemoryCards, getPreferences, savePreferences, getProductEvents, trackEvent, feedbackCard, type FreeMemory, type MemoryCard, type ProductEvent, type ProductPreferences } from '../src/product/store';
import { effectiveMemory, inferMealType, localDate, memoryState } from '../src/product/memory';
import { inspectPhoto, similar, type PhotoSignature } from '../src/product/photoSelection';
import { metadataFromUri } from '../src/product/exif';
import { exportBackup, readBackup, restoreBackup } from '../src/product/backup';
import { cardImage, downloadBlob, shareCard } from '../src/product/exportCard';
import { generateId } from '../src/utils/id';
import type { MealEntry, PersonProfile } from '../src/types';
import { useI18n } from '../src/i18n';
import { colors, fonts } from '../src/theme';

interface Candidate { id: string; uri: string; date: string; time: string; selected: boolean; detectedDate: boolean; fingerprint?: string; saved?: boolean; signature?: PhotoSignature; group?: string }
export default function MemoryTools() {
  const { locale } = useI18n(); const zh = locale === 'zh'; const copy = (en: string, cn: string) => zh ? cn : en;
  const params = useLocalSearchParams<{ tab?: string }>(); const [tab, setTab] = useState(params.tab || 'organize');
  const [meals, setMeals] = useState<MealEntry[]>([]), [people, setPeople] = useState<PersonProfile[]>([]), [trash, setTrash] = useState<TrashedMemory[]>([]);
  const [notes, setNotes] = useState<FreeMemory[]>([]), [cards, setCards] = useState<MemoryCard[]>([]), [events, setEvents] = useState<ProductEvent[]>([]);
  const [prefs, setPrefs] = useState<ProductPreferences>({ localOnlyAI: false, redact: true, analytics: false });
  const [query, setQuery] = useState(''), [selected, setSelected] = useState<string[]>([]), [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]), [busy, setBusy] = useState(false), [status, setStatus] = useState('');
  const [title, setTitle] = useState(''), [text, setText] = useState(''), [noteDate, setNoteDate] = useState(localDate), [editingNote, setEditingNote] = useState<FreeMemory>();
  const [source, setSource] = useState(''), [target, setTarget] = useState(''), [batchNote, setBatchNote] = useState(''), [batchPlace, setBatchPlace] = useState('');
  const stop = useRef(false), active = useRef(true), working = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; stop.current = true; }; }, []);
  const load = useCallback(async () => {
    const [all, profiles, removed, free, savedCards, preferences, logs] = await Promise.all([getMeals(), getPeopleProfiles(), getTrash(), getFreeMemories(), getMemoryCards(), getPreferences(), getProductEvents()]);
    if (!active.current) return;
    setMeals(all.filter(item => item.origin !== 'sample')); setPeople(profiles.filter(item => item.origin !== 'sample')); setTrash(removed); setNotes(free); setCards(savedCards); setPrefs(preferences); setEvents(logs);
  }, []);
  useFocusEffect(useCallback(() => { void load().catch(error => setStatus(String(error))); }, [load]));
  const run = async (action: () => Promise<void>) => {
    if (working.current) return; working.current = true; setBusy(true); setStatus('');
    try { await action(); await load(); } catch (error) { if (active.current) setStatus(error instanceof Error ? error.message : String(error)); }
    finally { working.current = false; if (active.current) setBusy(false); }
  };
  const toggle = (id: string, values: string[], set: (value: string[]) => void) => set(values.includes(id) ? values.filter(value => value !== id) : [...values, id]);
  const button = (label: string, action: () => void, selected = false) => <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled: busy }} disabled={busy} onPress={action} style={[styles.button, selected && styles.selected]}><Text style={selected ? styles.white : styles.body}>{label}</Text></Pressable>;
  const selectPeople = <View style={styles.wrap}>{people.map(person => <React.Fragment key={person.id}>{button(person.nickname || person.name, () => toggle(person.id, selectedPeople, setSelectedPeople), selectedPeople.includes(person.id))}</React.Fragment>)}</View>;
  async function pick() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 1, selectionLimit: 100 });
    if (result.canceled) return;
    const next: Candidate[] = [];
    for (const asset of result.assets) {
      const metadata = await metadataFromUri(asset.uri).catch(() => undefined);
      let fingerprint: string | undefined;
      if (Platform.OS === 'web') {
        const blob = await (await fetch(asset.uri)).blob();
        if (blob.size > 30 * 1024 * 1024) throw new Error(copy('An image exceeds 30 MB. Select a smaller file.', '有照片超过 30 MB，请选择较小文件。'));
        const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
        fingerprint = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
      }
      const duplicate = fingerprint && (meals.some(meal => meal.sourceFingerprint === fingerprint) || next.some(item => item.fingerprint === fingerprint));
      const visual = Platform.OS === 'web' ? await inspectPhoto(asset.uri).catch(() => undefined) : undefined;
      next.push({ signature: visual, id: generateId(), uri: asset.uri, date: metadata?.date || '', time: metadata?.time || '12:00', detectedDate: Boolean(metadata), selected: !duplicate, fingerprint });
    }
    for (const item of next) {
      if (!item.signature) continue;
      const previous = next.find(other => other !== item && other.group && other.signature && (!other.date || !item.date || other.date === item.date) && similar(other.signature, item.signature!));
      item.group = previous?.group || item.id;
    }
    for (const group of new Set(next.map(item => item.group).filter(Boolean))) {
      const members = next.filter(item => item.group === group && item.selected);
      members.sort((a, b) => (b.signature?.quality || 0) - (a.signature?.quality || 0));
      members.slice(1).forEach(item => { item.selected = false; });
    }
    setCandidates(next); setStatus(copy('Similar photos are grouped; the clearest is recommended. Review before adding. Food detection is not yet enabled.', '已对相似照片分组，每组推荐较清晰的一张，可自行改选。餐食识别尚未启用，请确认照片与日期。'));
  }
  async function importSelected() {
    stop.current = false; let count = 0;
    for (const item of candidates.filter(item => item.selected && !item.saved)) {
      if (stop.current || !active.current) break;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) || !Number.isFinite(Date.parse(`${item.date}T12:00:00Z`)) || new Date(`${item.date}T12:00:00Z`).toISOString().slice(0, 10) !== item.date) throw new Error(copy('Confirm a valid date for every selected photo.', '请为每张选中的照片确认有效日期。'));
      const now = new Date().toISOString();
      await saveMealMemory({ id: item.id, origin: 'user', sourceFingerprint: item.fingerprint, title: copy('A remembered moment', '留下的时刻'), photoUri: item.uri,
        date: item.date, time: item.time, mealType: inferMealType(item.time), moodTags: [], peopleTags: [], personIds: selectedPeople,
        location: batchPlace.trim() || undefined, note: batchNote.trim() || undefined, createdAt: now, updatedAt: now }, selectedPeople);
      count++; setCandidates(current => current.map(candidate => candidate.id === item.id ? { ...candidate, saved: true, selected: false } : candidate));
      setStatus(copy(`${count} photos saved.`, `已保存 ${count} 张照片。`)); await trackEvent('import_saved', 1);
    }
  }
  const listed = meals.filter(meal => [meal.title, meal.note, meal.location, meal.date, ...(meal.personIds || []).map(id => people.find(person => person.id === id)?.name || '')].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const stateLabels = { minimal: copy('Photo only', '极简记录'), incomplete: copy('Add context later', '待补全'), complete: copy('Context kept', '有关联的记忆'), archived: copy('Archived', '已归档') };
  const fields = (label: string, value: string, change: (value: string) => void, multiline = false) => <TextInput accessibilityLabel={label} placeholder={label} placeholderTextColor={colors.mutedText} value={value} onChangeText={change} multiline={multiline} maxLength={multiline ? 4000 : 120} style={[styles.input, multiline && { minHeight: 130 }]} />;
  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    {button(copy('‹ My table', '‹ 我的餐桌'), () => router.back())}<Text style={styles.title}>{copy('Keep, organize, return', '留下、整理、回到当时')}</Text>
    <View style={styles.wrap}>{[['organize', copy('Organize', '整理')], ['import', copy('Import', '导入')], ['notes', copy('Free memories', '自由记忆')], ['cards', copy('Cards', '卡片')], ['trash', copy('Restore', '恢复')], ['privacy', copy('Privacy & backup', '隐私与备份')], ['measure', copy('Validation', '验证')]].map(([key, label]) => <React.Fragment key={key}>{button(label, () => { setTab(key); setStatus(''); }, tab === key)}</React.Fragment>)}</View>
    {status && <Text accessibilityLiveRegion="polite" style={styles.notice}>{status}</Text>}
    {busy && <Pressable accessibilityRole="button" style={styles.button} onPress={() => { stop.current = true; }}><Text style={styles.body}>{copy('Stop import after this photo', '导入在当前照片完成后停止')}</Text></Pressable>}
    {tab === 'import' && <View style={styles.section}><Text style={styles.heading}>{copy('Bring memories from your photos', '把相册里的记忆带回来')}</Text><Text style={styles.body}>{copy('Select up to 100 photos. Similar photos are grouped with a sharper recommendation. Confirm capture dates, then add them to their monthly albums. Images stay on this device.', '每批选择最多 100 张。相似照片分组推荐较清晰的一张，确认拍摄日期后归入对应月份。照片保留在设备。')}</Text>
      {button(copy('Select photos', '选择历史照片'), () => void run(pick))}<Text style={styles.body}>{copy('Apply companions to this selection (optional)', '给这批照片关联同桌（可选）')}</Text>{selectPeople}{fields(copy('Shared place (optional)', '共同地点（可选）'), batchPlace, setBatchPlace)}{fields(copy('Shared note (optional)', '共同小记（可选）'), batchNote, setBatchNote)}
      {candidates.map(item => <View key={item.id} style={styles.card}><Image source={{ uri: item.uri }} style={styles.preview}/>{item.group && candidates.filter(other => other.group === item.group).length > 1 && <Text style={styles.body}>{copy('Similar group · ', '相似组 · ')}{candidates.findIndex(other => other.group === item.group) + 1}{item.selected ? copy(' · recommended / selected', ' · 推荐／已选') : copy(' · kept for review', ' · 保留供改选')}</Text>}<Text style={styles.body}>{item.saved ? copy('Saved', '已保存') : item.detectedDate ? copy('EXIF date · please confirm', 'EXIF 拍摄日期 · 请确认') : copy('Capture date missing · fill below', '缺少拍摄日期 · 请在下方填写')}</Text>{!item.saved && <>{fields('YYYY-MM-DD', item.date, value => setCandidates(current => current.map(candidate => candidate.id === item.id ? { ...candidate, date: value } : candidate)))}{button(item.selected ? copy('Selected', '已选中') : copy('Select', '选择'), () => setCandidates(current => current.map(candidate => candidate.id === item.id ? { ...candidate, selected: !candidate.selected } : candidate)), item.selected)}</>}</View>)}
      {candidates.length > 0 && button(copy('Confirm and save selected photos', '确认并保存选中照片'), () => void run(importSelected))}
      {button(copy('Make stickers from saved photos →', '为已保存的照片批量制作贴纸 →'), () => router.push('/food-album'))}
    </View>}
    {tab === 'organize' && <View style={styles.section}>{fields(copy('Search title, person, place or date', '搜索标题、人物、地点或日期'), query, setQuery)}
      <Text style={styles.body}>{copy('Select memories to add companions. Existing companions are kept.', '选择记忆后批量补充同桌，保留已有同桌。')}</Text>{selectPeople}
      {button(copy('Add selected companions to selected memories', '给选中记忆添加同桌'), () => void run(async () => { if (!selectedPeople.length || !selected.length) throw new Error(copy('Select memories and people first', '请先选择记忆和人物')); for (const meal of meals.filter(item => selected.includes(item.id))) { const existing = await getPeopleForMeal(meal.id); await saveMealMemory({ ...meal, origin: 'user' }, [...new Set([...existing.map(person => person.id), ...selectedPeople])]); } setSelected([]); setStatus(copy('Companions saved.', '同桌已补充。')); }))}
      {listed.map(meal => <View key={meal.id} style={styles.card}><Text style={styles.heading}>{meal.title}</Text><Text style={styles.body}>{meal.date} · {stateLabels[memoryState(meal)]}</Text><View style={styles.wrap}>{button(copy('Open', '回看'), () => { void trackEvent('revisit'); router.push(`/meal/${meal.id}`); })}{button(selected.includes(meal.id) ? copy('Selected', '已选') : copy('Select', '选择'), () => toggle(meal.id, selected, setSelected), selected.includes(meal.id))}{button(meal.archivedAt ? copy('Unarchive', '取消归档') : copy('Archive', '归档'), () => void run(() => setMealArchived(meal.id, !meal.archivedAt)))}</View></View>)}
      <Text style={styles.heading}>{copy('Merge duplicate people', '合并重复人物')}</Text><Text style={styles.body}>{copy('Choose the old entry, then the entry to keep. All meal and photo links are combined.', '先选旧条目，再选保留条目。合并双方餐食和照片关联，原条目会收起。')}</Text><View style={styles.wrap}>{people.map(person => <React.Fragment key={person.id}>{button(`${source === person.id ? '① ' : target === person.id ? '② ' : ''}${person.name}`, () => !source ? setSource(person.id) : person.id === source ? setSource('') : setTarget(person.id), source === person.id || target === person.id)}</React.Fragment>)}</View>
      {button(copy('Merge selected people', '合并所选人物'), () => void run(async () => { if (!source || !target || source === target) throw new Error(copy('Choose two different people', '请选择两个不同的人物')); await mergePersonProfiles(source, target); setSource(''); setTarget(''); setStatus(copy('All memories combined.', '共同记忆已合并。')); }))}
    </View>}
    {tab === 'notes' && <View style={styles.section}><Text style={styles.heading}>{copy('A memory without a meal', '一段不依附餐食的记忆')}</Text>{fields(copy('Memory title', '记忆标题'), title, setTitle)}{fields(copy('Memory date YYYY-MM-DD', '记忆日期 YYYY-MM-DD'), noteDate, setNoteDate)}{fields(copy('Recipe, a summer evening, a story…', '一道家传做法、夏天的傍晚、一段故事…'), text, setText, true)}{selectPeople}
      {button(copy('Save memory', '保存自由记忆'), () => void run(async () => { const now = new Date().toISOString(); await saveFreeMemory({ id: editingNote?.id || generateId(), title, text, date: noteDate, personIds: selectedPeople, createdAt: editingNote?.createdAt || now, updatedAt: now }); setTitle(''); setText(''); setEditingNote(undefined); setSelectedPeople([]); setStatus(copy('Memory saved.', '记忆已保存。')); }))}
      {notes.map(note => <View key={note.id} style={styles.card}><Text style={styles.heading}>{note.title}</Text><Text style={styles.body}>{note.date} · {note.text}</Text>{button(copy('Edit', '编辑'), () => { setEditingNote(note); setTitle(note.title); setText(note.text); setNoteDate(note.date); setSelectedPeople(note.personIds); })}</View>)}
    </View>}
    {tab === 'cards' && <View style={styles.section}><Text style={styles.body}>{copy('Private by default. Export or share includes only the card text and dates, never your other records or source photographs.', '默认私密。导出或分享仅含卡片文字与日期，不包含其他记录或原始照片。')}</Text>{!cards.length && <Text style={styles.body}>{copy('Save an AI reflection from Insights to keep it here.', '在回顾页收藏 AI 整理结果，它会出现在这里。')}</Text>}{cards.map(card => <View key={card.id} style={styles.card}><Text style={styles.heading}>{card.narrative.title}</Text><Text style={styles.body}>{card.start} — {card.end}{card.scope === 'sample' ? copy(' · Sample', ' · 示例') : ''}</Text>{card.narrative.observations.map((observation, index) => <View key={index}><Text style={styles.body}>{observation.text}</Text><View style={styles.wrap}>{button(copy('Accurate', '说得对'), () => void run(() => feedbackCard(card.id, index, 'yes')), card.feedback[index] === 'yes')}{button(copy('Inaccurate', '有误'), () => void run(() => feedbackCard(card.id, index, 'no')), card.feedback[index] === 'no')}{observation.mealIds.map(id => <React.Fragment key={id}>{button(copy('Source memory', '查看依据'), () => router.push(`/meal/${id}`))}</React.Fragment>)}</View></View>)}{Platform.OS === 'web' && <View style={styles.wrap}>{button(copy('Export image', '导出长图'), () => void run(async () => downloadBlob(await cardImage(card), `Mealog-${card.start}.png`)))}{button(copy('Share this card', '仅分享这张卡片'), () => void run(() => shareCard(card)))}</View>}</View>)}</View>}
    {tab === 'trash' && <View style={styles.section}><Text style={styles.body}>{copy('Deleted meals and their original images remain here until you restore them. No automatic purge.', '删除的记忆与原图保留在这里，可以恢复，不会自动清空。')}</Text>{!trash.length && <Text style={styles.body}>{copy('Nothing in the recovery area.', '恢复区暂时没有记忆。')}</Text>}{trash.map(item => <View key={item.meal.id} style={styles.card}>{item.meal.photoUri && <Image source={{ uri: item.meal.photoUri }} style={styles.preview}/>}<Text style={styles.heading}>{item.meal.title}</Text>{button(copy('Restore this memory', '恢复这段记忆'), () => void run(() => restoreMeal(item.meal.id)))}</View>)}</View>}
    {tab === 'privacy' && <View style={styles.section}><Text style={styles.heading}>{copy('Your data, your choice', '数据属于你')}</Text><Text style={styles.body}>{copy('Original photos and stickers stay on this device. AI sends selected titles, dates, tags and optional notes to Cloudflare Workers AI only when you generate. GPS coordinates, avatars and person profiles are excluded.', '原图与贴纸保留在设备。只有点击生成时，选中的标题、日期、标签与可选小记才发送给 Cloudflare Workers AI；不发送 GPS、头像或人物资料。')}</Text>
      {(['localOnlyAI', 'redact', 'analytics'] as const).map(key => <View key={key} style={styles.row}><Text style={[styles.body, { flex: 1 }]}>{key === 'localOnlyAI' ? copy('Use only local statistics; disable AI generation', '仅用本地统计，关闭 AI 生成') : key === 'redact' ? copy('Mask known names and exact place labels before AI', 'AI 前遮盖已记录的姓名与完整地点名称') : copy('Record anonymous behavior counts locally (no upload)', '在本机记录匿名行为计数（不上报）')}</Text><Switch accessibilityLabel={key} value={prefs[key]} disabled={busy} onValueChange={value => void run(async () => savePreferences({ ...prefs, [key]: value }))}/></View>)}
      <Text style={styles.body}>{copy('Masking replaces known names and place labels in titles/notes; it cannot guarantee removal of every sensitive detail. Review your text before allowing notes.', '遮盖会替换标题与小记中已记录的姓名和完整地点名称，不能保证识别所有敏感内容。包含小记前请检查文本。')}</Text>
      <Text style={styles.body}>{copy('This app does not log request bodies. Provider handling is described in the privacy page; we do not promise retention terms we cannot verify.', '本应用不记录请求正文。服务商的数据处理说明见隐私页，不承诺未经核实的留存政策。')}</Text>{button(copy('Read privacy & AI details', '查看隐私与 AI 说明'), () => router.push('/privacy'))}
      {Platform.OS === 'web' && <>{button(copy('Export JSON + original photos as ZIP', '导出 JSON 与原图 ZIP 备份'), () => void run(async () => { const bytes = await exportBackup(); setStatus(copy(`Backup generated (${(bytes / 1024 / 1024).toFixed(1)} MB). Check your browser downloads.`, `备份已生成（${(bytes / 1024 / 1024).toFixed(1)} MB），请检查浏览器下载。`)); }))}{React.createElement('label', { style: { color: colors.primary, display: 'block', padding: 12 } }, copy('Choose a Mealog backup to inspect before restoring', '选择 Mealog 备份，先检查再恢复'), React.createElement('input', { type: 'file', accept: '.zip', disabled: busy, 'aria-label': copy('Choose backup', '选择备份'), onChange: (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void run(async () => { const parsed = await readBackup(file); const count = parsed.backup.data['@mealogue/meals']?.length || 0; if (!window.confirm(copy(`Restore ${count} memories and ${parsed.backup.media.length} images? Existing matching records are kept.`, `恢复 ${count} 条记忆与 ${parsed.backup.media.length} 张图片？已有同 ID 记录优先保留。`))) return; await restoreBackup(parsed); setStatus(copy('Backup restored. Existing memories kept.', '备份已恢复，现有记忆保留。')); }); } }))}<Text style={styles.body}>{copy('Backup limit: 250 MB per archive. Keep the ZIP somewhere safe; it contains private text and original images.', '每个备份上限 250 MB。ZIP 含私密文本与原图，请自行妥善保存。')}</Text></>}
    </View>}
    {tab === 'measure' && <View style={styles.section}><Text style={styles.heading}>{copy('Validation, without invented results', '验证，不补造结果')}</Text><Text style={styles.body}>{copy('Effective memory = photo + confirmed date + a person/explicit solo choice/place/mood/note. These counts describe this device, not a user cohort.', '有效记忆＝照片＋确认日期＋至少一项人物／明确独处／地点／心情／小记。本页仅描述当前设备，不能代表用户群体。')}</Text><Text style={styles.heading}>{meals.filter(effectiveMemory).length} {copy('effective memories', '条有效记忆')}</Text><Text style={styles.body}>{copy(`${events.filter(event => event.type === 'revisit').length} revisit events · ${events.filter(event => event.type === 'ai_succeeded').length} successful AI generations`, `${events.filter(event => event.type === 'revisit').length} 次回看事件 · ${events.filter(event => event.type === 'ai_succeeded').length} 次 AI 成功生成`)}</Text><Text style={styles.body}>{copy('North-star hypothesis: among WAU, share with ≥8 effective memories this month and ≥1 revisit. D7, cohort retention and product validation remain unmeasured.', '北极星假设：WAU 中当月 ≥8 条有效记忆且 ≥1 次回看的用户占比。当前尚无跨用户 D7 与留存数据，不能宣称产品验证成功。')}</Text>{Platform.OS === 'web' && button(copy('Export local validation events', '导出本机验证事件'), () => downloadBlob(new Blob([JSON.stringify({ events, scope: 'this_device_only' }, null, 2)], { type: 'application/json' }), 'Mealog-local-validation.json'))}<Text style={styles.heading}>{copy('Future possibilities', '下一步可能性')}</Text><Text style={styles.body}>{copy('Annual printed keepsakes and a private shared table are concepts only. No payment or invitation is created.', '年度纸质纪念册与双人私密餐桌目前为概念验证，不收费，也不发送邀请。')}</Text>{button(copy('Interested in annual printed keepsakes', '我对年度纸质纪念册感兴趣'), () => void run(async () => { await trackEvent('interest', 1); setStatus(copy('Interest noted locally if measurement is enabled.', '若已开启本机统计，兴趣已记录在本机。')); }))}{button(copy('Interested in a private shared table', '我对双人私密餐桌感兴趣'), () => void run(async () => { await trackEvent('interest', 2); setStatus(copy('Interest noted locally if measurement is enabled.', '若已开启本机统计，兴趣已记录在本机。')); }))}</View>}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, page: { padding: 22, paddingBottom: 60 }, title: { fontFamily: fonts.editorial, fontSize: 26, color: colors.primary, lineHeight: 37, marginVertical: 15 }, heading: { fontFamily: fonts.editorial, fontSize: 17, lineHeight: 26, color: colors.primary }, body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 23, color: colors.mutedText }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, button: { minHeight: 44, justifyContent: 'center', padding: 11, borderRadius: 12, backgroundColor: colors.surface }, selected: { backgroundColor: colors.primary }, white: { color: colors.background, fontSize: 14 }, section: { marginTop: 20, gap: 14 }, card: { padding: 16, gap: 12, backgroundColor: colors.surface, borderRadius: 16 }, preview: { width: '100%', height: 180, resizeMode: 'contain', borderRadius: 12 }, input: { fontFamily: fonts.body, minHeight: 46, backgroundColor: colors.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border, color: colors.primary, fontSize: 16 }, notice: { padding: 14, fontSize: 14, lineHeight: 22, color: colors.secondary }, row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 } });
