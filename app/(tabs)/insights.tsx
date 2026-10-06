import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getMeals, getPeopleProfiles, getMonthlyReflections, saveMonthlyReflection } from '../../src/storage';
import { getPreferences, getMemoryCards, saveMemoryCard, feedbackCard, trackEvent, type ProductPreferences, type MemoryCard } from '../../src/product/store';
import { filterPeriod, periodRange, localDate, recordedComparison, type ReflectionPeriod } from '../../src/product/memory';
import { generateId } from '../../src/utils/id';
import { checkInput, generateMonthlyReport, makePeriodInput, readReportCache, saveReportCache, inputSnapshot, type CachedReport } from '../../src/insights/monthlyReport';
import type { MealEntry, PersonProfile } from '../../src/types';
import { InsightError, type MonthlyReport } from '../../src/insights/contract';
import { useI18n } from '../../src/i18n';
import { colors, fonts } from '../../src/theme';

export default function InsightsScreen() {
  const { locale } = useI18n(); const zh = locale === 'zh'; const copy = (en: string, cn: string) => zh ? cn : en;
  const params = useLocalSearchParams<{ personId?: string }>();
  const [period, setPeriod] = useState<ReflectionPeriod>('week'), [anchor, setAnchor] = useState(localDate), [personId, setPersonId] = useState(params.personId || '');
  const [showFacts, setShowFacts] = useState(false), [showWords, setShowWords] = useState(false), [showSources, setShowSources] = useState(false);
  const [scope, setScope] = useState<'personal' | 'sample'>('personal');
  const [meals, setMeals] = useState<MealEntry[]>([]), [people, setPeople] = useState<PersonProfile[]>([]), [cache, setCache] = useState<CachedReport[]>([]);
  const [prefs, setPrefs] = useState<ProductPreferences>({ localOnlyAI: false, redact: true, analytics: false });
  const [notes, setNotes] = useState<Record<string, string>>({}), [drafts, setDrafts] = useState<Record<string, string>>({});
  const [includeNotes, setIncludeNotes] = useState(false), [consent, setConsent] = useState(false), [pending, setPending] = useState(false), [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState(''), [loadError, setLoadError] = useState(''), [card, setCard] = useState<MemoryCard>();
  const [shown, setShown] = useState<{ snapshot: string; report: MonthlyReport }>(); const inFlight = useRef(false);
  const load = useCallback(async () => {
    setLoaded(false);
    try {
      const [all, profiles, reports, preferences, reflections] = await Promise.all([getMeals(), getPeopleProfiles(), readReportCache(), getPreferences(), getMonthlyReflections()]);
      setMeals(all); setPeople(profiles); setCache(reports); setPrefs(preferences); setNotes(Object.fromEntries(reflections.map(item => [`${item.scope}:${item.month}`, item.text]))); setLoaded(true); setLoadError('');
    } catch { setLoadError(copy('Could not load memories. Retry without overwriting data.', '暂时无法读取记忆，可重试；原有数据不会覆盖。')); }
  }, [locale]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const range = useMemo(() => { try { return periodRange(anchor, period); } catch { return undefined; } }, [anchor, period]);
  const scoped = meals.filter(meal => scope === 'sample' ? meal.origin === 'sample' : meal.origin !== 'sample');
  const selected = range ? filterPeriod(scoped, anchor, period, personId) : [];
  const previousAnchor = range ? new Date(`${range.start}T12:00:00`) : new Date();
  if (period === 'week') previousAnchor.setDate(previousAnchor.getDate() - 7);
  if (period === 'month') previousAnchor.setMonth(previousAnchor.getMonth() - 1);
  if (period === 'year') previousAnchor.setFullYear(previousAnchor.getFullYear() - 1);
  const previous = range ? filterPeriod(scoped, localDate(previousAnchor), period, personId) : [];
  const comparison = recordedComparison(selected, previous);
  const terms = prefs.redact ? [...people.flatMap(person => [person.name, person.nickname || '']), ...meals.map(meal => meal.location || '')] : [];
  const input = range ? makePeriodInput(selected, range.start, range.end, period, locale, includeNotes, terms) : undefined;
  const snapshot = input ? inputSnapshot(input) : '';
  const report = shown?.snapshot === snapshot ? shown.report : cache.find(entry => entry.snapshot === snapshot && entry.scope === scope)?.report;
  const cardKey = `${scope}:${personId}:${period}:${range?.start}:${range?.end}:${report?.generatedAt || ''}`;
  useEffect(() => { let active = true; getMemoryCards().then(items => { if (active) setCard(items.find(item => item.id === cardKey)); }).catch(() => undefined); return () => { active = false; }; }, [cardKey]);
  const savedCard = card?.id === cardKey ? card : undefined;
  const noteKey = `${scope}:${anchor.slice(0, 7)}`, ownNote = drafts[noteKey] ?? notes[noteKey] ?? '';
  const eligible = period !== 'week' || selected.length >= 3;
  const btn = (label: string, action: () => void, chosen = false, disabled = pending) => <Pressable accessibilityRole="button" accessibilityState={{ selected: chosen, disabled }} disabled={disabled} onPress={action} style={[styles.button, chosen && styles.chosen, disabled && { opacity: 0.45 }]}><Text style={chosen ? styles.white : styles.body}>{label}</Text></Pressable>;
  const resetConsent = () => { setConsent(false); setMessage(''); };
  async function generate() {
    if (inFlight.current || !loaded || !input || !consent || prefs.localOnlyAI || !eligible || !selected.length) return;
    inFlight.current = true; setPending(true); setMessage(''); const started = Date.now();
    await trackEvent('ai_requested');
    try {
      checkInput(input); const result = await generateMonthlyReport(input); const next = { snapshot, scope, report: result };
      setShown(next); setCache(current => [next, ...current.filter(item => item.snapshot !== snapshot || item.scope !== scope)].slice(0, 12));
      await trackEvent('ai_succeeded', input.meals.length, Date.now() - started);
      try { await saveReportCache(next); } catch { setMessage(copy('Visible now; cache could not be saved. Save as a card to retry.', '回顾已显示，但缓存保存失败，可收藏为卡片重试。')); }
    } catch (error) {
      await trackEvent('ai_failed', undefined, Date.now() - started);
      const code = error instanceof InsightError ? error.code : 'unavailable';
      setMessage(copy(`AI unavailable (${code}). Local counts and existing cards are kept.`, `AI 暂时不可用（${code}）。本地统计与已有卡片仍然保留。`));
    } finally { inFlight.current = false; setPending(false); }
  }
  async function keepCard() {
    if (!report || !range) return;
    const next: MemoryCard = { id: cardKey, scope, period, start: range.start, end: range.end, personId: personId || undefined, narrative: report.narrative, generatedAt: report.generatedAt, feedback: savedCard?.feedback || {} };
    await saveMemoryCard(next); setCard(next); setMessage(copy('Saved to your private memory cards.', '已收藏到私密记忆卡片。'));
  }
  async function feedback(index: number, value: 'yes' | 'no') {
    await keepCard(); await feedbackCard(cardKey, index, value); const cards = await getMemoryCards(); setCard(cards.find(item => item.id === cardKey));
  }
  const safely = (action: () => Promise<void>) => { void action().catch(() => setMessage(copy('Could not save. Please retry.', '保存失败，请重试。'))); };
  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Text style={styles.kicker}>{copy('MEALOG / REFLECTIONS', 'MEALOG / 回望')}</Text><Text style={styles.title}>{copy('A little time to return.', '回味那些日子。')}</Text>
    <View style={styles.wrap}>{(['week', 'month', 'year'] as const).map(value => <View key={value}>{btn(value === 'week' ? copy('Week', '本周小记') : value === 'month' ? copy('Month', '月度回顾') : copy('Year', '年度餐桌'), () => { setPeriod(value); resetConsent(); }, period === value)}</View>)}</View>
    <TextInput accessibilityLabel={copy('Period anchor date YYYY-MM-DD', '回顾日期 YYYY-MM-DD')} value={anchor} onChangeText={value => { setAnchor(value); resetConsent(); }} style={styles.input} maxLength={10}/>
    {!range ? <Text style={styles.error}>{copy('Enter a valid date YYYY-MM-DD', '请输入有效日期 YYYY-MM-DD')}</Text> : <Text style={styles.body}>{range.start} — {range.end}</Text>}
    <View style={styles.wrap}>{btn(copy('My table', '我的餐桌'), () => { setScope('personal'); setPersonId(''); resetConsent(); }, scope === 'personal')}{btn(copy('Sample table', '示例餐桌'), () => { setScope('sample'); setPersonId(''); resetConsent(); }, scope === 'sample')}</View>
    {scope === 'sample' && <Text style={styles.body}>{copy('Examples are separate from your life and your validation data.', '示例与个人生活、验证数据分开。')}</Text>}
    <Text style={styles.heading}>{copy('Who were these moments with?', '想回到和谁的时刻？')}</Text><View style={styles.wrap}>{btn(copy('Everyone / myself', '所有人／自己'), () => { setPersonId(''); resetConsent(); }, !personId)}{people.filter(person => scope === 'sample' ? person.origin === 'sample' : person.origin !== 'sample').map(person => <View key={person.id}>{btn(person.nickname || person.name, () => { setPersonId(person.id); resetConsent(); }, personId === person.id)}</View>)}</View>
    {loadError ? <View><Text style={styles.error}>{loadError}</Text>{btn(copy('Retry', '重试'), () => void load())}</View> : !loaded ? <ActivityIndicator/> : <>
      <View style={styles.card}><Text style={styles.heading}>{copy('In these pages', '这一页里')}</Text><Text style={styles.count}>{selected.length} <Text style={styles.body}>{copy('moments', '个时刻')}</Text></Text><Text style={styles.body}>{copy(`${comparison.now.effective} contextual photo memories · ${new Set(selected.map(meal => meal.date)).size} recorded days`, `${comparison.now.effective} 条有效照片记忆 · ${new Set(selected.map(meal => meal.date)).size} 个记录日`)}</Text>
        {btn(copy(showFacts ? 'Close recorded details −' : 'Recorded details +', showFacts ? '收起记录详情 −' : '查看记录详情 ＋'), () => setShowFacts(!showFacts))}
        {showFacts && <>
        <Text style={styles.body}>{copy(`Previous period: ${previous.length} records. Counts reflect saved records, not all your meals.`, `上一周期：${previous.length} 条记录。变化只描述已保存记录，不代表全部生活。`)}</Text>
        <Text style={styles.body}>{comparison.soloShare === null ? copy('No confirmed companionship data; no solo share inferred.', '缺少确认的同行信息，不推断独处比例。') : copy(`Explicit solo: ${comparison.now.solo}/${comparison.now.knownCompany} records with known companionship (${Math.round(comparison.soloShare * 100)}%). Unknown companions excluded.`, `明确独处：${comparison.now.solo}/${comparison.now.knownCompany} 条已知同行记录（${Math.round(comparison.soloShare * 100)}%）。未填写不计入分母。`)}</Text>
        {comparison.newPersonIds.length > 0 && <Text style={styles.body}>{copy('Newly recorded this period: ', '本周期新出现的已记录人物：')}{comparison.newPersonIds.map(id => people.find(person => person.id === id)?.name).filter(Boolean).join('、')}</Text>}
        </>}
      </View>
      <View style={styles.card}><Text style={styles.heading}>{copy('Gather a few memories.', '把记忆，轻轻串起来。')}</Text><Text style={styles.body}>{copy('AI uses selected titles, dates and tags; notes are optional. Photos and location coordinates stay here. Text is processed by Cloudflare Workers AI.', 'AI 整理选定的标题、日期与标签，小记由你选择。照片、GPS 和人物资料留在本地，文字交由 Cloudflare Workers AI 处理。')}</Text>
        <View style={styles.row}><Text style={[styles.body, { flex: 1 }]}>{copy('Include notes (up to 240 characters each)', '包含小记（每条最多 240 字符）')}</Text><Switch accessibilityLabel={copy('Include notes', '包含小记')} value={includeNotes} disabled={pending} onValueChange={value => { setIncludeNotes(value); resetConsent(); }}/></View>
        <Text style={styles.body}>{prefs.redact ? copy('Known names and place labels are masked. Other private details can remain in your writing.', '已记录的姓名与完整地点名称会遮盖，文字中的其他私密信息仍可能保留。') : copy('Masking is disabled. Titles and included notes may contain personal details.', '遮盖已关闭。标题与参与生成的小记可能含个人信息。')}</Text>
        <View style={styles.row}><Text style={[styles.body, { flex: 1 }]}>{copy('I allow the selected text to be sent for this reflection', '我同意为本次回顾发送选中的文本')}</Text><Switch accessibilityLabel={copy('Allow AI text upload', '授权 AI 文本上传')} value={consent} disabled={pending || prefs.localOnlyAI} onValueChange={setConsent}/></View>
        {prefs.localOnlyAI && <Text style={styles.body}>{copy('AI disabled in privacy settings. Local facts remain available.', '隐私设置已关闭 AI，本地事实统计仍可使用。')}</Text>}
        {!eligible && <Text style={styles.body}>{copy('Weekly reflections need 3 saved moments. Add or import memories first.', '本周小记需要至少 3 条记录，可以先记录或导入历史照片。')}</Text>}
        {input && input.meals.length < selected.length && <Text style={styles.body}>{copy(`AI receives ${input.meals.length} of ${selected.length} chronologically sampled records. Local counts use all records.`, `AI 接收 ${selected.length} 条中的 ${input.meals.length} 条时间分布样本，本地统计包含全部记录。`)}</Text>}
        {btn(pending ? copy('Generating…', '正在整理…') : copy('Compose a reflection', '整理这一页'), () => void generate(), true, pending || !consent || prefs.localOnlyAI || !eligible || !selected.length || !range || Platform.OS !== 'web')}
        {message && <Text accessibilityLiveRegion="polite" style={styles.body}>{message}</Text>}
        {report && <View style={styles.section}>{report.usage && <Text style={styles.body}>{copy(`Measured AI latency: ${(report.usage.latencyMs / 1000).toFixed(1)}s · input/output tokens: ${report.usage.inputTokens ?? 'not returned'}/${report.usage.outputTokens ?? 'not returned'}`, `实测 AI 耗时 ${(report.usage.latencyMs / 1000).toFixed(1)} 秒 · 输入／输出 tokens：${report.usage.inputTokens ?? '服务商未返回'}/${report.usage.outputTokens ?? '服务商未返回'}`)}</Text>}<Text style={styles.heading}>{report.narrative.title}</Text>{report.narrative.observations.map((observation, index) => <View key={index} style={styles.section}><Text selectable style={styles.narrative}>{observation.text}</Text><View style={styles.wrap}>{observation.mealIds.map(id => { const source = meals.find(meal => meal.id === id); return source ? <View key={id}>{btn(`${source.date} · ${source.title}`, () => { if (scope === 'personal') void trackEvent('revisit'); router.push(`/meal/${id}`); })}</View> : <Text key={id} style={styles.body}>{copy('Source no longer available', '依据记录暂不可用')}</Text>; })}</View><Text style={styles.body}>{copy('Is this observation accurate?', '这句说得对吗？')}</Text><View style={styles.wrap}>{btn(copy('Yes', '说得对'), () => safely(() => feedback(index, 'yes')), savedCard?.feedback[index] === 'yes')}{btn(copy('No', '有误'), () => safely(() => feedback(index, 'no')), savedCard?.feedback[index] === 'no')}</View></View>)}<Text style={styles.body}>{copy('AI interpretation can be wrong; each observation links to its evidence.', 'AI 解读可能有误，每句话均可回到引用依据。')}</Text>{btn(copy('Keep as a private memory card', '收藏为私密记忆卡片'), () => safely(keepCard))}{btn(copy('Open cards and image export', '打开卡片与长图导出'), () => router.push('/memory-tools?tab=cards'))}</View>}
      </View>
      {btn(copy(showWords ? 'Close my words −' : 'A few words of my own +', showWords ? '收起我的小记 −' : '这个月，我想留下 ＋'), () => setShowWords(!showWords))}
      {showWords && <View style={styles.card}><Text style={styles.heading}>{copy('Your words for this month', '这个月，我想留下')}</Text><TextInput accessibilityLabel={copy('Monthly words', '月度感想')} multiline value={ownNote} maxLength={1200} onChangeText={value => setDrafts(current => ({ ...current, [noteKey]: value }))} style={[styles.input, { minHeight: 120 }]}/><Text style={styles.body}>{copy('Always local. Never sent to AI.', '始终只保存在本地，不发送给 AI。')}</Text>{btn(copy('Save my words', '保存我的感想'), () => safely(async () => { await saveMonthlyReflection(anchor.slice(0, 7), scope, ownNote); setNotes(current => ({ ...current, [noteKey]: ownNote.trim() })); setMessage(copy('Your words are saved.', '感想已保存。')); }), false, pending || !range)}</View>}
      {btn(copy(showSources ? 'Close source moments −' : 'Browse source moments +', showSources ? '收起原始时刻 −' : '翻阅原始时刻 ＋'), () => setShowSources(!showSources))}
      {showSources && <><Text style={styles.heading}>{copy('Source moments', '回到这些时刻')}</Text>{!selected.length && <Text style={styles.body}>{copy('No memories in this period yet.', '这段时间还没有记录。')}</Text>}{selected.slice(0, 20).map(meal => <View key={meal.id}>{btn(`${meal.date} · ${meal.title}`, () => { if (scope === 'personal') void trackEvent('revisit'); router.push(`/meal/${meal.id}`); })}</View>)}{btn(copy('Import older photos', '导入历史照片'), () => router.push('/memory-tools?tab=import'))}</>}
    </>}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, page: { padding: 22, paddingBottom: 28, gap: 12 }, kicker: { fontFamily: fonts.body, fontSize: 13, color: colors.secondary }, title: { fontFamily: fonts.editorial, fontSize: 26, lineHeight: 36, color: colors.primary }, heading: { fontFamily: fonts.editorial, fontSize: 17, lineHeight: 25, color: colors.primary }, body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 23, color: colors.mutedText }, narrative: { fontFamily: fonts.editorial, fontSize: 17, lineHeight: 28, color: colors.text }, count: { fontSize: 32, color: colors.primary }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, button: { minHeight: 44, padding: 12, borderRadius: 12, justifyContent: 'center', backgroundColor: colors.surface }, chosen: { backgroundColor: colors.primary }, white: { color: colors.background, fontSize: 14 }, input: { fontFamily: fonts.body, minHeight: 46, padding: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.primary, fontSize: 16 }, card: { backgroundColor: colors.surface, padding: 18, borderRadius: 12, gap: 12, borderWidth: 1, borderColor: colors.primary }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, section: { gap: 12, paddingTop: 12 }, error: { color: '#A14335' } });
