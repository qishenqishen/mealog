import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import FoodSticker from '../src/components/FoodSticker';
import { useI18n } from '../src/i18n';
import { createMealSticker } from '../src/services/foodStickers';
import { getMeals } from '../src/storage';
import { colors } from '../src/theme';
import type { MealEntry } from '../src/types';

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month: string, delta: number) {
  const [year, index] = month.split('-').map(Number);
  const date = new Date(year, index - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export default function FoodAlbumScreen() {
  const { locale } = useI18n();
  const zh = locale === 'zh';
  const router = useRouter();
  const params = useLocalSearchParams<{ month?: string; scope?: string }>();
  const [month, setMonth] = useState(() => typeof params.month === 'string'
    && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) && params.month >= '1900-01'
    ? params.month : currentMonth());
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [scope, setScope] = useState<'personal' | 'sample' | undefined>(() =>
    params.scope === 'sample' || params.scope === 'personal' ? params.scope : undefined);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [gridWidth, setGridWidth] = useState(360);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const generating = useRef(false);
  const cancelRequested = useRef(false);
  const activeScope = scope ?? 'personal';
  const canMakeStickers = Platform.OS === 'web' && typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    getMeals().then((all) => {
      if (!active) return;
      setMeals(all);
      setScope((previous) => previous ?? (all.some((meal) => meal.origin !== 'sample') ? 'personal' : 'sample'));
    }).catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; cancelRequested.current = true; };
  }, [reloadToken]));

  const monthMeals = meals.filter((meal) => meal.date.slice(0, 7) === month
    && (activeScope === 'sample' ? meal.origin === 'sample' : meal.origin !== 'sample'))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const stickers = monthMeals.filter((meal) => meal.stickerUri);
  const pendingMeals = monthMeals.filter((meal) => meal.photoUri && !meal.stickerUri);
  const lastMonth = meals.reduce((latest, meal) => meal.date.slice(0, 7) > latest ? meal.date.slice(0, 7) : latest, currentMonth());
  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString(zh ? 'zh-CN' : 'en-US', { month: 'long', year: 'numeric' });
  const columns = gridWidth < 320 ? 3 : 4;
  const stickerSize = Math.floor(gridWidth / columns) - 12;

  function selectMonth(next: string) {
    setMonth(next);
    setError('');
    setProgress('');
  }

  async function makeStickers() {
    if (generating.current || !pendingMeals.length || !canMakeStickers) return;
    generating.current = true;
    cancelRequested.current = false;
    setBusy(true);
    setStopping(false);
    setError('');
    let completed = 0;
    const failedTitles: string[] = [];
    try {
      for (const [index, meal] of pendingMeals.entries()) {
        if (cancelRequested.current) break;
        setProgress(zh ? `正在制作第 ${index + 1} / ${pendingMeals.length} 张：${meal.title}`
          : `Making ${index + 1} of ${pendingMeals.length}: ${meal.title}`);
        try {
          await createMealSticker(meal);
        } catch {
          failedTitles.push(meal.title);
          continue;
        }
        completed += 1;
        setMeals(await getMeals());
      }
      setProgress(zh ? `已收好 ${completed} 张餐食贴纸。` : `${completed} food stickers saved.`);
      if (failedTitles.length) setError(zh
        ? `${failedTitles.length} 张未能完成：${failedTitles.join('、')}。原始餐食记录已保留，可以重试剩余照片；较难抠图的照片可在餐食详情中导入透明 PNG 贴纸。`
        : `${failedTitles.length} could not be made: ${failedTitles.join(', ')}. Original meals are saved. Retry the remaining photos, or import a transparent PNG sticker from the meal’s details for difficult photos.`);
    } catch {
      setProgress(zh ? `已有 ${completed} 张贴纸保存成功。` : `${completed} stickers have been saved.`);
      setError(zh ? '图册暂时无法刷新，请重新进入图册。原始餐食记录已保留。'
        : 'The album could not refresh. Reopen it to see saved stickers. Original meals are saved.');
    } finally {
      generating.current = false;
      setBusy(false);
      setStopping(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" accessibilityLabel={zh ? '返回回忆' : 'Back to memories'}
          style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/archive')}>
          <Text style={styles.backText}>‹ {zh ? '餐桌回忆' : 'Table memories'}</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{zh ? '饮食图册' : 'Food album'}</Text>
        <Text style={styles.subtitle}>{zh ? '吃过的好味道，一张张留在这里。' : 'Little reminders of things you have tasted.'}</Text>
        <View style={styles.monthRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={zh ? '上个月' : 'Previous month'}
            disabled={busy || month <= '1900-01'} style={styles.arrowButton} onPress={() => selectMonth(shiftMonth(month, -1))}>
            <Text style={[styles.arrow, (busy || month <= '1900-01') && styles.disabled]}>‹</Text>
          </Pressable>
          <Text style={styles.month}>{monthLabel}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={zh ? '下个月' : 'Next month'}
            disabled={busy || month >= lastMonth} style={styles.arrowButton} onPress={() => selectMonth(shiftMonth(month, 1))}>
            <Text style={[styles.arrow, (busy || month >= lastMonth) && styles.disabled]}>›</Text>
          </Pressable>
        </View>
        <View style={styles.scopes} accessibilityRole="tablist">
          {(['personal', 'sample'] as const).map((value) => (
            <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: activeScope === value, disabled: busy }}
              disabled={busy} style={[styles.scope, activeScope === value && styles.scopeActive]}
              onPress={() => { setScope(value); setProgress(''); setError(''); }}>
              <Text style={styles.scopeText}>{value === 'personal' ? (zh ? '我的餐食' : 'My meals') : (zh ? '示例餐食' : 'Sample meals')}</Text>
            </Pressable>
          ))}
        </View>
        {activeScope === 'sample' ? <Text style={styles.caption}>{zh ? '这里是示例图册，不代表你的个人生活。' : 'Sample memories, separate from your own meals.'}</Text> : null}

        {loading ? <ActivityIndicator accessibilityLabel={zh ? '正在加载图册' : 'Loading album'} style={styles.loader} color={colors.primary} />
          : loadError ? <View style={styles.notice}>
            <Text accessibilityRole="alert" style={styles.body}>{zh ? '暂时无法读取图册。' : 'Could not load your album.'}</Text>
            <Pressable accessibilityRole="button" style={styles.action} onPress={() => setReloadToken((value) => value + 1)}>
              <Text style={styles.actionText}>{zh ? '重试' : 'Try again'}</Text>
            </Pressable>
          </View> : <>
            <Text style={styles.count}>{zh ? `${stickers.length} 张餐食贴纸` : `${stickers.length} food stickers`}</Text>
            {stickers.length ? <View style={styles.grid} onLayout={(event) => setGridWidth(event.nativeEvent.layout.width)}>
              {stickers.map((meal, index) => (
                <Pressable key={meal.id} accessibilityRole="button" testID={`food-sticker-${meal.id}`}
                  accessibilityLabel={`${meal.title}, ${meal.date}`} onPress={() => router.push(`/meal/${meal.id}`)}
                  style={({ pressed }) => [styles.stickerCell, { width: `${100 / columns}%` }, pressed && styles.disabled]}>
                  <FoodSticker uri={meal.stickerUri!} size={stickerSize}
                    style={{ transform: [{ rotate: `${[-7, 4, -2, 8, 3, -5][index % 6]}deg` }] }} />
                  <Text numberOfLines={1} style={styles.stickerTitle}>{meal.title}</Text>
                  <Text style={styles.stickerDate}>{meal.date.slice(5).replace('-', ' / ')}</Text>
                </Pressable>
              ))}
            </View> : <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{zh ? '第一张，会是什么味道？' : 'What will your first sticker be?'}</Text>
              <Text style={styles.body}>{pendingMeals.length
                ? (zh ? '把这个月的餐食照片做成贴纸，收进图册，也贴进日历。' : 'Turn this month’s food photos into stickers for your album and calendar.')
                : (zh ? '留下一张餐食照片，就可以开始收集。' : 'Save a food photo to start your collection.')}</Text>
              {!pendingMeals.length ? <Pressable accessibilityRole="button" style={styles.action} onPress={() => router.push('/add')}>
                <Text style={styles.actionText}>{zh ? '记录一餐' : 'Save a meal'}</Text>
              </Pressable> : null}
            </View>}

            {pendingMeals.length || busy || progress || error ? <View style={styles.making}>
              {busy ? <View style={styles.progressRow}>
                <ActivityIndicator color={colors.primary} />
                <Text accessibilityLiveRegion="polite" style={[styles.body, styles.progressText]}>{progress}</Text>
              </View> : progress ? <Text accessibilityLiveRegion="polite" style={styles.body}>{progress}</Text> : null}
              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
              {!busy && pendingMeals.length ? <>
                <Text style={styles.caption}>{zh ? `${pendingMeals.length} 张照片还可以制作成贴纸。原始照片仍保留在记录中。`
                  : `${pendingMeals.length} photos are ready to become stickers. Original photos stay with your meals.`}</Text>
                <Text style={styles.caption}>{canMakeStickers
                  ? (zh ? '首次制作需联网准备。照片只在当前设备处理，不会上传。' : 'First use needs a connection to prepare the tools. Photos stay on this device.')
                  : (zh ? '请在新版 Safari 或 Chrome 中打开 Mealog 制作贴纸，已有贴纸仍可查看。' : 'Open Mealog in a recent Safari or Chrome browser to make stickers. Saved stickers are still available.')}</Text>
                <Pressable accessibilityRole="button" disabled={!canMakeStickers} accessibilityState={{ disabled: !canMakeStickers }}
                  style={[styles.action, !canMakeStickers && styles.disabled]} onPress={() => void makeStickers()}>
                  <Text style={styles.actionText}>{zh ? (error ? '重试制作贴纸' : '制作本月餐食贴纸') : (error ? 'Try making stickers again' : 'Make this month’s stickers')}</Text>
                </Pressable>
              </> : null}
              {busy ? <Pressable accessibilityRole="button" disabled={stopping} style={styles.stop}
                onPress={() => { cancelRequested.current = true; setStopping(true); }}>
                <Text style={styles.caption}>{stopping ? (zh ? '这张完成后就会停止' : 'Stopping after this sticker') : (zh ? '完成这张后停止' : 'Stop after this sticker')}</Text>
              </Pressable> : null}
            </View> : null}
          </>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 22, paddingBottom: 44 },
  back: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', marginBottom: 14 },
  backText: { color: colors.secondary, fontSize: 14 },
  title: { color: colors.primary, fontSize: 26, fontWeight: '600', lineHeight: 32 },
  subtitle: { color: colors.mutedText, fontSize: 13, lineHeight: 20, marginTop: 5, marginBottom: 20 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  month: { color: colors.primary, fontSize: 18, fontWeight: '500' },
  arrowButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrow: { color: colors.primary, fontSize: 30 },
  scopes: { flexDirection: 'row', backgroundColor: '#EEEDE3', borderRadius: 22, padding: 4, marginBottom: 10 },
  scope: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  scopeActive: { backgroundColor: colors.surface },
  scopeText: { color: colors.primary, fontSize: 14 },
  caption: { color: colors.mutedText, fontSize: 12, lineHeight: 19 },
  count: { color: colors.secondary, fontSize: 12, marginTop: 20, marginBottom: 18 },
  loader: { marginVertical: 50 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', paddingTop: 8 },
  stickerCell: { alignItems: 'center', paddingHorizontal: 4, paddingBottom: 30 },
  stickerTitle: { fontSize: 10, color: colors.primary, marginTop: 10, maxWidth: '100%' },
  stickerDate: { fontSize: 10, color: colors.mutedText, marginTop: 4 },
  empty: { alignItems: 'center', paddingVertical: 35, paddingHorizontal: 20, gap: 14 },
  emptyTitle: { fontSize: 18, color: colors.primary, lineHeight: 25, textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 22, color: colors.primary },
  action: { backgroundColor: colors.primary, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 20, marginTop: 12, alignItems: 'center' },
  actionText: { color: colors.surface, fontSize: 14, fontWeight: '500' },
  notice: { paddingVertical: 30 },
  making: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 20, marginTop: 10, gap: 8 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressText: { flex: 1 },
  stop: { paddingVertical: 12, alignItems: 'center' },
  error: { color: colors.destructive, fontSize: 13, lineHeight: 20 },
  disabled: { opacity: 0.4 },
});
