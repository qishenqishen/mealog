import { useI18n, translate, type Locale } from '../../src/i18n';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { trashMeal, getMealById } from '../../src/storage';
import {
  DEFAULT_COMPANIONSHIP_TAGS,
  type MealEntry,
  type MealType,
  type MoodTag,
} from '../../src/types';
import { colors, shadow, fonts } from '../../src/theme';
import MealCompanySection from '../../src/components/MealCompanySection';
import LoadState from '../../src/components/LoadState';
import FoodSticker from '../../src/components/FoodSticker';
import { createMealSticker } from '../../src/services/foodStickers';
import * as ImagePicker from 'expo-image-picker';
import { requestPhotosPermission } from '../../src/services/permissions';

// ── Helpers ─────────────────────────────────────────────────

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Treat',
  treat: 'Treat',
};

const MEAL_TYPE_INITIALS: Record<MealType, string> = {
  breakfast: 'B',
  lunch: 'L',
  dinner: 'D',
  snack: 'T',
  treat: 'T',
};

const MOOD_LABELS: Record<MoodTag, string> = {
  peaceful: 'Peaceful',
  everyday: 'Everyday',
  nostalgic: 'Nostalgic',
  healing: 'Healing',
  heartfelt: 'Heartfelt',
  overwhelming: 'Overwhelming',
  celebratory: 'Celebratory',
};

const PEOPLE_TAG_LABELS = Object.fromEntries(
  DEFAULT_COMPANIONSHIP_TAGS.map((tag) => [tag.id, tag.label]),
) as Record<string, string>;

function formatDate(dateStr: string, locale: Locale): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function getMoodTags(meal: MealEntry): MoodTag[] {
  if (meal.moodTags.length > 0) return meal.moodTags;
  return meal.moodTag ? [meal.moodTag] : [];
}

function getPeopleLabels(meal: MealEntry): string[] {
  return meal.peopleTags.map((tag) => PEOPLE_TAG_LABELS[tag] ? translate(PEOPLE_TAG_LABELS[tag]) : tag);
}

/** Cross-platform confirm dialog (Alert.alert doesn't work on web). */
function confirmDelete(onConfirm: () => void) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-restricted-globals
    const yes = confirm(translate('Move this memory to the recovery area? You can restore it from Settings.'));
    if (yes) onConfirm();
  } else {
    Alert.alert(
      translate('Delete this meal?'),
      translate('The memory and photos can be restored from Settings.'),
      [
        { text: translate('Cancel'), style: 'cancel' },
        { text: translate('Delete'), style: 'destructive', onPress: onConfirm },
      ],
    );
  }
}

// ── Small components ────────────────────────────────────────

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

function PhotoFallback({ mealType }: { mealType: MealType }) {
  const { t, locale } = useI18n();
  return (
    <View style={styles.photoFallback}>
      <View style={styles.fallbackPlate}>
        <View style={styles.fallbackPlateInner} />
      </View>
      <Text style={styles.fallbackInitial}>{t(MEAL_TYPE_INITIALS[mealType])}</Text>
      <Text style={styles.fallbackCaption}>
        {t('{meal} memory', { meal: t(MEAL_TYPE_LABELS[mealType]) })}</Text>
    </View>
  );
}

function SeatMark({ label }: { label: string }) {
  const initial = label.trim().charAt(0).toUpperCase();
  return (
    <View style={styles.seatItem}>
      <View style={styles.seatCircle}>
        <Text style={styles.seatInitial}>{initial}</Text>
      </View>
      <Text style={styles.seatLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ── Meal Detail Screen ──────────────────────────────────────

export default function MealDetailScreen() {
  const { t, locale } = useI18n();
  const { id, stickerNotice } = useLocalSearchParams<{ id: string; stickerNotice?: string }>();
  const router = useRouter();
  const goBack = () => router.canGoBack() ? router.back() : router.replace('/');
  const [meal, setMeal] = useState<MealEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [makingSticker, setMakingSticker] = useState(false);
  const [stickerError, setStickerError] = useState<string>();
  const zh = locale === 'zh';

  const loadMeal = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    setError(undefined);
    try {
      setMeal((await getMealById(id)) ?? null);
    } catch {
      setError('Could not load this memory.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    void loadMeal();
  }, [loadMeal]));

  const handleDelete = () => {
    if (!meal) return;
    confirmDelete(async () => {
      try {
        await trashMeal(meal.id);
        goBack();
      } catch {
        setError('Could not delete this memory. Please try again.');
      }
    });
  };

  const handleEdit = () => {
    if (!meal) return;
    router.push(`/add?editMealId=${encodeURIComponent(meal.id)}`);
  };

  const handleSticker = async (importCutout = false) => {
    if (!meal || makingSticker) return;
    setMakingSticker(true); setStickerError(undefined);
    try {
      let uri: string | undefined;
      if (importCutout) {
        const permission = await requestPhotosPermission();
        if (!permission.granted) throw new Error(zh ? '请允许选择照片后重试。' : 'Allow photo access and try again.');
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
        if (result.canceled) return;
        uri = result.assets[0]?.uri;
        if (!uri) return;
      }
      await createMealSticker(meal, undefined, uri);
      setMeal((await getMealById(meal.id)) ?? null);
    } catch (error) {
      setStickerError(zh
        ? '贴纸暂时未完成。请重试，或导入背景透明的 PNG；原图和餐食已经保留。'
        : (error instanceof Error ? error.message : 'The sticker could not be made. Your memory is kept.'));
    } finally { setMakingSticker(false); }
  };

  const moodTags = useMemo(() => (meal ? getMoodTags(meal) : []), [meal]);
  const peopleLabels = useMemo(() => (meal ? getPeopleLabels(meal) : []), [meal, locale]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>{t("Opening this memory...")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!meal) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          {error ? <LoadState error={error} onRetry={loadMeal} /> : <Text style={styles.loadingText}>{t("This meal could not be found.")}</Text>}
          <Pressable accessibilityRole="button" style={styles.notFoundBack} onPress={goBack}>
            <Text style={styles.notFoundBackText}>{t("Back to the table")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const location = meal.location ?? meal.locationText;
  const title = meal.title || t(MEAL_TYPE_LABELS[meal.mealType]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" style={styles.navButton} onPress={goBack}>
            <Text style={styles.navButtonText}>{t("Back")}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.navButton} onPress={handleEdit}>
            <Text style={styles.navButtonText}>{t("Edit")}</Text>
          </Pressable>
        </View>

        <LoadState error={error} onRetry={loadMeal} />
        <View style={styles.memoryPage}>
          <View style={styles.photoCard}>
            {meal.photoUri ? (
              <Image
                source={{ uri: meal.photoUri }}
                style={styles.photo}
                resizeMode="cover"
                accessibilityLabel={title}
              />
            ) : (
              <PhotoFallback mealType={meal.mealType} />
            )}

            {peopleLabels.length > 0 ? (
              <View style={styles.photoSeatStrip}>
                {peopleLabels.slice(0, 4).map((label) => (
                  <SeatMark key={label} label={label} />
                ))}
                {peopleLabels.length > 4 ? (
                  <Text style={styles.moreSeats}>+{peopleLabels.length - 4}</Text>
                ) : null}
              </View>
            ) : null}
          </View>

          <View style={styles.titleBlock}>
            <Text style={styles.mealType}>{t(MEAL_TYPE_LABELS[meal.mealType])}</Text>
            {meal.origin === 'sample' ? <Text style={styles.mealType}>{t('Sample memory')}</Text> : null}
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.date}>{formatDate(meal.date, locale)}</Text>
          </View>

          {meal.note ? <Text style={[styles.noteText, { marginBottom: 24 }]}>{meal.note}</Text> : null}
          {meal.photoUri ? <View style={styles.stickerPanel}>
            <View style={styles.stickerHeader}>
              {meal.stickerUri ? <FoodSticker uri={meal.stickerUri} size={94} accessibilityLabel={zh ? `${title}的餐食贴纸` : `${title} food sticker`} /> : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>{zh ? '这一餐的贴纸' : 'A sticker from this meal'}</Text>
                <Text style={styles.emptyLine}>{zh ? '留在日历里，也收进饮食图册。' : 'For your calendar and food album.'}</Text>
              </View>
            </View>
            {Platform.OS === 'web' ? <>
              <Text style={styles.emptyLine}>{zh ? '在设备上抠图，原照片保留。首次使用需加载工具。' : 'Cut out on this device. Your original stays. Tools load on first use.'}</Text>
              <View style={styles.chipRow}>
                <Pressable accessibilityRole="button" disabled={makingSticker} style={styles.navButton} onPress={() => handleSticker()}>
                  <Text style={styles.navButtonText}>{makingSticker ? (zh ? '正在制作贴纸…' : 'Making your sticker…') : meal.stickerUri ? (zh ? '重新抠图' : 'Remake sticker') : (zh ? '制作餐食贴纸' : 'Make food sticker')}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={makingSticker} style={styles.navButton} onPress={() => handleSticker(true)}>
                  <Text style={styles.navButtonText}>{zh ? '导入透明 PNG' : 'Import transparent PNG'}</Text>
                </Pressable>
              </View>
            </> : <Text style={styles.emptyLine}>{zh ? '在网页版 Mealog 中制作贴纸。' : 'Open Mealog on the web to make a sticker.'}</Text>}
            {(stickerError || (stickerNotice && !meal.stickerUri)) ? <Text accessibilityLiveRegion="polite" style={{ color: '#924F3E', fontSize: 13, lineHeight: 20 }}>
              {stickerError ?? (zh ? '餐食已保存，贴纸尚未完成，可以在这里重试。' : 'Meal saved. You can retry the sticker here.')}
            </Text> : null}
            <Pressable accessibilityRole="button" style={styles.albumLink} onPress={() => router.push(`/food-album?month=${meal.date.slice(0, 7)}&scope=${meal.origin === 'sample' ? 'sample' : 'personal'}`)}>
              <Text style={styles.navButtonText}>{zh ? '打开饮食图册 →' : 'Open food album →'}</Text>
            </Pressable>
          </View> : null}

          <View style={styles.metaCluster}>
            <View style={styles.metaLine}>
              <Text style={styles.metaIcon}>◷</Text>
              <Text style={styles.metaText}>{meal.time}</Text>
            </View>
            {location ? (
              <View style={styles.metaLine}>
                <Text style={styles.metaIcon}>⌖</Text>
                <Text style={styles.metaText}>{location}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("Emotion Tag")}</Text>
            {moodTags.length > 0 ? (
              <View style={styles.chipRow}>
                {moodTags.map((tag) => (
                  <Chip key={tag} label={t(MOOD_LABELS[tag] ?? tag)} />
                ))}
              </View>
            ) : (
              <Text style={styles.emptyLine}>{t("No emotion tag was added.")}</Text>
            )}
          </View>

          <MealCompanySection mealId={meal.id} onChanged={loadMeal} />

          {peopleLabels.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("Table Context")}</Text>
              <View style={styles.chipRow}>
                {peopleLabels.map((label) => (
                  <Chip key={label} label={label} />
                ))}
              </View>
            </View>
          ) : null}

        </View>

        <View style={styles.actionArea}>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.deleteButton,
              pressed && styles.deleteButtonPressed,
            ]}
            onPress={handleDelete}
          >
            <Text style={styles.deleteButtonText}>{t("Delete this memory")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  stickerPanel: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingVertical: 20, marginBottom: 24, gap: 12 },
  stickerHeader: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  albumLink: { paddingVertical: 12, alignSelf: 'flex-start' },
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  loadingText: {
    fontSize: 15,
    color: colors.secondary,
  },
  notFoundBack: {
    marginTop: 18,
    borderRadius: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.34)',
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  notFoundBackText: {
    fontSize: 14,
    color: colors.primary,
  },
  scroll: {
    paddingHorizontal: 18,
    paddingBottom: 34,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingTop: 8,
    paddingBottom: 14,
  },
  navButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(92, 64, 51, 0.28)',
    borderRadius: 2,
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 253, 248, 0.46)',
  },
  navButtonText: {
    fontSize: 13,
    fontStyle: 'normal',
    color: colors.primary,
  },
  memoryPage: {
    borderRadius: 30,
    backgroundColor: 'rgba(255, 253, 248, 0.72)',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    ...shadow.soft,
  },
  photoCard: {
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(248, 232, 212, 0.34)',
    marginBottom: 24,
  },
  photo: {
    width: '100%',
    aspectRatio: 0.92,
    borderRadius: 2,
  },
  photoFallback: {
    width: '100%',
    aspectRatio: 0.92,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 248, 238, 0.82)',
  },
  fallbackPlate: {
    width: 142,
    height: 92,
    borderRadius: 70,
    borderWidth: 1.2,
    borderColor: 'rgba(92, 64, 51, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackPlateInner: {
    width: 86,
    height: 44,
    borderRadius: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(92, 64, 51, 0.14)',
  },
  fallbackInitial: {
    position: 'absolute',
    fontSize: 26,
    fontStyle: 'normal',
    color: 'rgba(180, 145, 88, 0.72)',
  },
  fallbackCaption: {
    position: 'absolute',
    bottom: 28,
    fontSize: 13,
    color: colors.muted,
    fontStyle: 'normal',
  },
  photoSeatStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: 'rgba(255, 253, 248, 0.76)',
  },
  seatItem: {
    width: 42,
    alignItems: 'center',
  },
  seatCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180, 145, 88, 0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(180, 145, 88, 0.3)',
  },
  seatInitial: {
    fontSize: 12,
    color: colors.secondary,
    fontStyle: 'normal',
  },
  seatLabel: {
    marginTop: 4,
    fontSize: 10,
    color: colors.mutedText,
    fontStyle: 'normal',
    maxWidth: 48,
  },
  moreSeats: {
    fontSize: 16,
    color: colors.secondary,
    fontStyle: 'normal',
    marginLeft: 2,
  },
  titleBlock: {
    marginBottom: 18,
  },
  mealType: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 6,
  },
  title: { fontFamily: fonts.editorial,
    fontSize: 26,
    lineHeight: 32,
    fontStyle: 'normal',
    color: colors.primary,
  },
  date: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedText,
  },
  metaCluster: {
    gap: 10,
    marginBottom: 26,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaIcon: {
    width: 25,
    fontSize: 17,
    color: colors.secondary,
  },
  metaText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    color: colors.mutedText,
    fontStyle: 'normal',
  },
  section: {
    marginTop: 3,
    marginBottom: 25,
  },
  sectionTitle: { fontFamily: fonts.editorial,
    fontSize: 17,
    lineHeight: 23,
    color: colors.primary,
    fontStyle: 'normal',
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  chip: {
    borderRadius: 2,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(248, 232, 212, 0.5)',
  },
  chipText: {
    fontSize: 13,
    color: colors.mutedText,
    fontStyle: 'normal',
  },
  seatList: {
    gap: 10,
  },
  seatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.36)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.18)',
  },
  chairGlyph: {
    width: 34,
    height: 34,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chairBack: {
    width: 20,
    height: 19,
    borderWidth: 1.1,
    borderColor: colors.secondary,
    borderRadius: 7,
    transform: [{ rotate: '-4deg' }],
  },
  chairSeat: {
    width: 24,
    height: 8,
    marginTop: -1,
    borderBottomWidth: 1.1,
    borderLeftWidth: 1.1,
    borderRightWidth: 1.1,
    borderBottomLeftRadius: 9,
    borderBottomRightRadius: 9,
    borderColor: colors.secondary,
  },
  seatRowText: {
    flex: 1,
    fontSize: 15,
    color: colors.primary,
    fontStyle: 'normal',
  },
  seatsEmpty: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.18)',
  },
  seatsEmptyTitle: {
    fontSize: 15,
    color: colors.primary,
    fontStyle: 'normal',
    marginBottom: 5,
  },
  seatsEmptyBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  noteText: {
    fontSize: 16,
    lineHeight: 25,
    color: colors.primary,
  },
  emptyLine: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    fontStyle: 'normal',
  },
  actionArea: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  deleteButton: {
    alignSelf: 'center',
    borderRadius: 2,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(201, 120, 98, 0.38)',
    backgroundColor: 'rgba(248, 228, 221, 0.32)',
  },
  deleteButtonPressed: {
    opacity: 0.7,
  },
  deleteButtonText: {
    fontSize: 13,
    color: colors.destructive,
    fontStyle: 'normal',
  },
});
