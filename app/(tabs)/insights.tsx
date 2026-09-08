import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';

import { getMealCompanions, getMeals, getPeopleProfiles } from '../../src/storage';
import { useI18n } from '../../src/i18n';
import { calculateMetrics, InsightError, type ReportLocale } from '../../src/insights/contract';
import {
  checkInput, generateMonthlyReport, inputSnapshot, makeMonthlyInput, readReportCache,
  saveReportCache, selectCachedReport, type CachedReport,
} from '../../src/insights/monthlyReport';
import type { MealCompanion, MealEntry, PersonProfile } from '../../src/types';
import { colors } from '../../src/theme';
import { getHeroAssetForMonth } from '../../src/utils/heroAssets';
import { TabIcon } from '../../src/components/TabIcon';

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month: string, delta: number) {
  const [year, index] = month.split('-').map(Number);
  const date = new Date(year, index - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function errorCopy(code: string, locale: ReportLocale) {
  const messages: Record<string, [string, string]> = {
    daily_limit: ['Today\'s shared AI limit has been reached. Try again after 00:00 UTC.', '今日共享 AI 生成次数已用完，请在 UTC 00:00 后重试。'],
    ip_limit: ['Too many requests from this network. Please wait before trying again.', '此网络的请求过于频繁，请稍后重试。'],
    invalid_output: ['The AI returned an unusable report. Your saved report is still available.', 'AI 返回的报告无法使用，已保存的报告仍可查看。'],
    network_error: ['Could not connect. Your saved report and meal counts are still available.', '暂时无法连接，已保存的报告和用餐统计仍可查看。'],
    request_timeout: ['The request timed out. It may still count toward today\'s limit.', '请求超时，本次请求可能仍计入今日次数。'],
    ai_timeout: ['AI took too long to respond. Your saved report is still available.', 'AI 响应超时，已保存的报告仍可查看。'],
    too_many_meals: ['This month exceeds the 200-meal report limit. Your meal counts remain available.', '本月超过 200 条用餐记录的报告上限，用餐统计仍可查看。'],
    body_too_large: ['This month is too large to send. Your meal counts remain available.', '本月记录超出传输大小限制，用餐统计仍可查看。'],
    invalid_input: ['Some meal details could not be read. Review this month\'s saved meals.', '部分用餐信息无法读取，请检查本月已保存的记录。'],
    storage_error: ['Could not read your saved meals. Reopen Insights to try again.', '无法读取已保存的用餐记录，请重新打开洞察页面重试。'],
    cache_error: ['The report is visible now but could not be saved on this device.', '报告已显示，但无法在此设备上保存。'],
  };
  const fallback = ['AI is unavailable right now. Your saved report and meal counts are still available.', 'AI 暂时不可用，已保存的报告和用餐统计仍可查看。'];
  return (messages[code] ?? fallback)[locale === 'zh' ? 1 : 0];
}

export default function InsightsScreen() {
  const { locale, setLocale } = useI18n();
  const copy = (en: string, zh: string) => locale === 'zh' ? zh : en;
  const [month, setMonth] = useState(currentMonth);
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [companions, setCompanions] = useState<MealCompanion[]>([]);
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [cache, setCache] = useState<CachedReport[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState<{ snapshot: string; code: string; retryAfter?: number }>();
  const generating = useRef(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoaded(false);
    setLoadError(false);
    Promise.all([getMeals(), readReportCache().catch(() => []), getMealCompanions(), getPeopleProfiles()]).then(([allMeals, reports, allCompanions, allPeople]) => {
      if (active) { setMeals(allMeals); setCache(reports); setCompanions(allCompanions); setPeople(allPeople); setLoaded(true); }
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, []));

  const input = useMemo(() => makeMonthlyInput(meals, month, locale), [meals, month, locale]);
  const snapshot = inputSnapshot(input);
  const cached = selectCachedReport(cache, input);
  const stale = Boolean(cached && cached.snapshot !== snapshot);
  const metrics = cached && !stale ? cached.report.metrics : calculateMetrics(input.meals);
  const inputError = useMemo(() => {
    try { checkInput(input); return undefined; }
    catch (error) { return error instanceof InsightError ? error.code : 'invalid_input'; }
  }, [input]);
  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', year: 'numeric' });
  const report = cached?.report;
  const displayedNotice = notice?.snapshot === snapshot ? notice : undefined;
  const mealById = new Map(meals.map((meal) => [meal.id, meal]));
  const peopleOverview = useMemo(() => {
    const ids = new Set(input.meals.map((meal) => meal.id));
    return people.map((person) => ({
      person, count: new Set(companions.filter((companion) => ids.has(companion.mealId) && companion.personId === person.id).map((companion) => companion.mealId)).size,
    })).filter((row) => row.count > 0).sort((a, b) => b.count - a.count || a.person.name.localeCompare(b.person.name));
  }, [input.meals, companions, people]);

  async function generate() {
    if (generating.current || !loaded || !input.meals.length || inputError || Platform.OS !== 'web') return;
    generating.current = true;
    setPending(true);
    setNotice(undefined);
    try {
      const next = { snapshot, report: await generateMonthlyReport(input) };
      setCache((previous) => [next, ...previous.filter((item) => item.snapshot !== snapshot)].slice(0, 12));
      try { await saveReportCache(next); }
      catch { setNotice({ snapshot, code: 'cache_error' }); }
    } catch (error) {
      setNotice({ snapshot, code: error instanceof InsightError ? error.code : 'ai_unavailable',
        retryAfter: error instanceof InsightError ? error.retryAfter : undefined });
    } finally {
      generating.current = false;
      setPending(false);
    }
  }

  const typeLabels: Record<string, string> = {
    breakfast: copy('Breakfast', '早餐'), lunch: copy('Lunch', '午餐'), dinner: copy('Dinner', '晚餐'),
    snack: copy('Snacks', '加餐'), treat: copy('Treats', '小确幸'),
  };
  const moodLabels: Record<string, string> = {
    peaceful: copy('Peaceful', '平静'), everyday: copy('Everyday', '日常'), nostalgic: copy('Nostalgic', '怀念'),
    healing: copy('Healing', '治愈'), heartfelt: copy('Heartfelt', '暖心'), overwhelming: copy('Overwhelming', '不堪重负'), celebratory: copy('Celebratory', '庆祝'),
  };
  const companyLabels: Record<string, string> = {
    'just-me': copy('Just me', '独自用餐'), 'family-table': copy('Family table', '家人相聚'),
    'shared-with-friend': copy('With friends', '朋友相伴'), 'work-lunch': copy('Work lunch', '工作午餐'),
    'celebration-gathering': copy('Celebration', '庆祝相聚'), 'new-encounter': copy('New encounter', '新的相遇'),
  };

  function distribution(counts: Record<string, number>, labels: Record<string, string>) {
    return Object.entries(counts).filter(([, count]) => count > 0).map(([key, count]) => (
      <View key={key} style={styles.barRow}>
        <View style={styles.barLabels}><Text style={styles.body}>{labels[key] ?? key}</Text><Text style={styles.body}>{count}</Text></View>
        <View style={styles.barTrack}><View style={[styles.barFill, { width: `${count / Math.max(1, metrics.mealCount) * 100}%` }]} /></View>
      </View>
    ));
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.topLine}>
            <Text style={styles.kicker}>{copy('Mealog Insights', 'Mealog 月度洞察')}</Text>
            <View style={styles.languages} accessibilityRole="tablist">
              {(['en', 'zh'] as const).map((language) => (
                <Pressable key={language} accessibilityRole="tab" accessibilityState={{ selected: locale === language, disabled: pending }}
                  disabled={pending} onPress={() => setLocale(language)} style={[styles.language, locale === language && styles.selectedLanguage]}>
                  <Text style={styles.small}>{language === 'en' ? 'English' : '中文'}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.monthRow}>
            <Pressable disabled={pending || month <= '1900-01'} accessibilityRole="button" accessibilityLabel={copy('Previous month', '上个月')}
              accessibilityHint={copy('Show the previous month', '查看上个月的记录')}
              onPress={() => setMonth(shiftMonth(month, -1))} style={styles.arrowButton}>
              <Text style={styles.arrow}>‹</Text>
            </Pressable>
            <Text accessibilityRole="header" style={styles.month}>{monthLabel}</Text>
            <Pressable disabled={pending || month >= currentMonth()} accessibilityRole="button" accessibilityLabel={copy('Next month', '下个月')}
              accessibilityState={{ disabled: pending || month >= currentMonth() }}
              onPress={() => setMonth(shiftMonth(month, 1))} style={[styles.arrowButton, month >= currentMonth() && styles.disabled]}>
              <Text style={styles.arrow}>›</Text>
            </Pressable>
          </View>
          {month !== currentMonth() && <Pressable accessibilityRole="button" disabled={pending} onPress={() => setMonth(currentMonth())} style={styles.currentMonth}>
            <Text style={styles.link}>{copy('Current month', '回到本月')}</Text>
          </Pressable>}
          <Image source={getHeroAssetForMonth(Number(month.slice(5)) - 1)} style={styles.artwork} resizeMode="cover" accessibilityIgnoresInvertColors />

          {loadError ? <Text accessibilityRole="alert" style={styles.error}>{errorCopy('storage_error', locale)}</Text> : !loaded ?
            <ActivityIndicator style={styles.loader} accessibilityLabel={copy('Loading meals', '正在加载用餐记录')} color={colors.primary} /> : <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{copy('Your month in meals', '本月用餐记录')}</Text>
              <View style={styles.metrics}>
                {[
                  [metrics.mealCount, copy('Meals', '用餐')], [metrics.daysLogged, copy('Days logged', '记录天数')],
                  [metrics.photoCount, copy('With photos', '附有照片')], [metrics.noteCount, copy('With notes', '附有笔记')],
                ].map(([count, label]) => <View key={label} style={styles.metric}><Text style={styles.count}>{count}</Text><Text style={styles.small}>{label}</Text></View>)}
              </View>
              <Text style={styles.caption}>{cached && !stale ? copy('Calculated from the meals in this report.', '根据本报告中的用餐记录计算。') : copy('Calculated from your current saved meals on this device.', '根据此设备当前保存的用餐记录计算。')}</Text>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{copy('A reflection from your table', '来自餐桌的月度回顾')}</Text>
              <Text style={styles.disclosure}>{copy(
                'Generating sends your meal text, notes and tags to Cloudflare AI. Photos, GPS coordinates and contact profiles stay on this device.',
                '生成时会将用餐文字、笔记和标签发送给 Cloudflare AI。照片、GPS 坐标和联系人资料会留在此设备上。',
              )}</Text>
              <Pressable accessibilityRole="button" disabled={pending || !input.meals.length || Boolean(inputError) || Platform.OS !== 'web'}
                accessibilityState={{ disabled: pending || !input.meals.length || Boolean(inputError) || Platform.OS !== 'web', busy: pending }}
                onPress={generate} style={[styles.generate, (pending || !input.meals.length || Boolean(inputError) || Platform.OS !== 'web') && styles.disabled]}>
                {pending ? <ActivityIndicator color={colors.primary} /> : <TabIcon name="insights" focused />}
                <Text style={styles.generateLabel}>{pending ? copy('Generating...', '正在生成…') : report ? copy('Generate again', '重新生成') : copy('Generate reflection', '生成月度回顾')}</Text>
              </Pressable>
              {Platform.OS !== 'web' && <Text style={styles.caption}>{copy('AI generation is available in the hosted web app.', 'AI 生成可在网页版中使用。')}</Text>}
              {!input.meals.length && <Text style={styles.body}>{copy('No meals saved for this month.', '本月还没有保存用餐记录。')}</Text>}
              {inputError && <Text accessibilityRole="alert" style={styles.error}>{errorCopy(inputError, locale)}</Text>}
              {displayedNotice && <View accessibilityRole="alert"><Text style={styles.error}>{errorCopy(displayedNotice.code, locale)}</Text>
                {displayedNotice.retryAfter && <Text style={styles.caption}>{copy(`Retry after at least ${Math.ceil(displayedNotice.retryAfter / 60)} minutes.`, `请至少等待 ${Math.ceil(displayedNotice.retryAfter / 60)} 分钟后重试。`)}</Text>}
              </View>}
              {report && <View style={styles.report}>
                {stale && <Text style={styles.stale}>{copy('Saved report is out of date. Meal details have changed.', '已保存的报告已过期，用餐记录发生了变化。')}</Text>}
                <Text style={styles.reportTitle}>{report.narrative.title}</Text>
                {report.narrative.observations.map((observation, index) => <View key={index} style={styles.observation}>
                  <Text selectable style={styles.reportText}>{observation.text}</Text>
                  <View style={styles.references}>{observation.mealIds.map((id) => {
                    const meal = mealById.get(id);
                    return meal ? <Pressable key={id} accessibilityRole="link" onPress={() => router.push({ pathname: '/meal/[id]', params: { id } })} style={styles.reference}>
                      <Text style={styles.referenceText}>{meal.date.slice(5)} · {meal.title}</Text>
                    </Pressable> : <Text key={id} style={styles.caption}>{copy('Referenced meal was deleted', '引用的用餐记录已删除')}</Text>;
                  })}</View>
                </View>)}
                <Text style={styles.caption}>{copy('AI generated · Cloudflare Workers AI · Llama 3.1 8B Instruct Fast', 'AI 生成 · Cloudflare Workers AI · Llama 3.1 8B Instruct Fast')}</Text>
                <Text style={styles.caption}>{new Date(report.generatedAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')}</Text>
                <Text style={styles.caption}>{copy('Based on a sample of saved meals. AI interpretations may be mistaken.', '基于部分已保存的用餐记录，AI 解读可能有误。')}</Text>
              </View>}
            </View>
            {input.meals.length > 0 && <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{copy('Who shared your table', '谁与你共餐')}</Text>
                {peopleOverview.map(({ person, count }) => <Pressable key={person.id} accessibilityRole="link" style={styles.personRow}
                  onPress={() => router.push({ pathname: '/people/[id]', params: { id: person.id } })}>
                  <Text style={[styles.link, styles.personName]}>{person.nickname || person.name}</Text>
                  <Text style={styles.small}>{copy(`${count} ${count === 1 ? 'meal' : 'meals'}`, `${count} 次用餐`)}</Text>
                </Pressable>)}
                {Object.values(metrics.byCompany).some(Boolean) ? distribution(metrics.byCompany, companyLabels) : peopleOverview.length === 0 && <Text style={styles.body}>{copy('No companions recorded this month.', '本月还没有记录共餐伙伴。')}</Text>}
              </View>
              <View style={styles.section}><Text style={styles.sectionTitle}>{copy('Meals at a glance', '用餐类型')}</Text>{distribution(metrics.byType, typeLabels)}</View>
              <View style={styles.section}><Text style={styles.sectionTitle}>{copy('Feelings you recorded', '记录下的心情')}</Text>
                {Object.values(metrics.byMood).some(Boolean) ? distribution(metrics.byMood, moodLabels) : <Text style={styles.body}>{copy('No mood tags this month.', '本月没有心情标签。')}</Text>}
              </View>
            </>}
          </>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 118 },
  content: { width: '100%', maxWidth: 780, alignSelf: 'center' },
  topLine: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  kicker: { fontSize: 14, color: colors.secondary, fontWeight: '600' },
  languages: { flexDirection: 'row', padding: 3, backgroundColor: colors.accentSoft, borderRadius: 8 },
  language: { paddingHorizontal: 12, minHeight: 38, justifyContent: 'center', borderRadius: 6 },
  selectedLanguage: { backgroundColor: colors.surface },
  monthRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 8 },
  month: { flex: 1, flexShrink: 1, textAlign: 'center', color: colors.primary, fontSize: 27, lineHeight: 36 },
  arrowButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrow: { fontSize: 32, lineHeight: 38, color: colors.primary },
  currentMonth: { alignSelf: 'center', padding: 10, marginTop: -10, marginBottom: 8 },
  link: { fontSize: 14, color: '#43645B', textDecorationLine: 'underline' },
  artwork: { width: '100%', height: 168, marginBottom: 6 },
  section: { paddingVertical: 25, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sectionTitle: { fontSize: 21, lineHeight: 28, color: colors.primary, marginBottom: 15 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, marginBottom: 14 },
  metric: { width: '25%', minWidth: 66, paddingRight: 8 },
  count: { fontSize: 28, lineHeight: 36, color: '#43645B' },
  small: { fontSize: 12, lineHeight: 18, color: colors.text },
  body: { fontSize: 15, lineHeight: 23, color: colors.text },
  caption: { fontSize: 12, lineHeight: 18, color: colors.mutedText, marginTop: 5 },
  disclosure: { fontSize: 13, lineHeight: 20, color: colors.text },
  generate: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 48, padding: 12, backgroundColor: '#E0EADF', borderRadius: 8, marginVertical: 16 },
  generateLabel: { flexShrink: 1, fontSize: 15, lineHeight: 22, color: colors.primary, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  error: { color: '#A14335', fontSize: 14, lineHeight: 21, marginVertical: 10 },
  loader: { padding: 32 },
  report: { marginTop: 12 },
  stale: { color: '#886021', backgroundColor: '#FCF0D6', padding: 12, fontSize: 13, lineHeight: 20, marginBottom: 18 },
  reportTitle: { fontSize: 23, lineHeight: 31, color: colors.primary, marginBottom: 16 },
  observation: { marginBottom: 22 },
  reportText: { fontSize: 17, lineHeight: 27, color: colors.text },
  references: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  reference: { minHeight: 36, justifyContent: 'center', maxWidth: '100%', paddingVertical: 6 },
  referenceText: { fontSize: 13, lineHeight: 20, color: '#43645B', textDecorationLine: 'underline', flexShrink: 1 },
  barRow: { marginBottom: 16 },
  personRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 8 },
  personName: { flex: 1, flexShrink: 1 },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 7 },
  barTrack: { height: 5, backgroundColor: colors.accentSoft, borderRadius: 3 },
  barFill: { height: 5, backgroundColor: '#8EA497', borderRadius: 3 },
});
