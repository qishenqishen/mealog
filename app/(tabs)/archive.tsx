import { useI18n, translate } from '../../src/i18n';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import {
  getMealCompanions,
  getMeals,
  getPeopleProfiles,
  getSharedMealPhotos,
} from '../../src/storage';
import type {
  MealCompanion,
  MealEntry,
  MealType,
  MoodTag,
  PersonProfile,
  SharedMealPhoto,
} from '../../src/types';
import { colors, shadow, fonts } from '../../src/theme';
import FoodSticker from '../../src/components/FoodSticker';
import LoadState from '../../src/components/LoadState';
import MonthlyBookshelf from '../../src/components/MonthlyBookshelf';
import { scopeMeals, type BookScope } from '../../src/utils/monthlyBooks';

// ── Labels ──────────────────────────────────────────────────

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

// ── Helpers ─────────────────────────────────────────────────

type MonthGroup = {
  key: string;
  label: string;
  meals: MealEntry[];
};

type ArchiveView = 'books' | 'calendar' | 'memories';

function parseDateKey(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

function toDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function toMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthKey(dateStr: string): string {
  const { year, month } = parseDateKey(dateStr);
  return `${year}-${String(month).padStart(2, '0')}`;
}

function parseMonthKey(key: string): { year: number; month: number } {
  const [year, month] = key.split('-').map(Number);
  return { year, month };
}

function getMonthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return translate('{month} {year}', { month: translate(MONTH_NAMES[month - 1]), year });
}

function getDayLabel(dateStr: string): string {
  return String(parseDateKey(dateStr).day);
}

function getMoodLabel(meal: MealEntry): string | undefined {
  const mood = meal.moodTags[0] ?? meal.moodTag;
  return mood ? translate(MOOD_LABELS[mood] ?? mood) : undefined;
}

function getPersonDisplayName(person?: PersonProfile, companion?: MealCompanion): string {
  return (person?.deletedAt
    ? companion?.personNameSnapshot
    : person?.nickname ?? person?.name ?? companion?.personNameSnapshot) ?? translate('Deleted person');
}

function formatSharedWith(names: string[]): string | undefined {
  const clean = names.map((name) => name.trim()).filter(Boolean);
  if (!clean.length) return undefined;
  if (clean.length === 1) return translate('Shared with {name}', { name: clean[0] });
  if (clean.length === 2) return translate('Shared with {first} and {second}', { first: clean[0], second: clean[1] });
  return translate('Shared with {first}, {second}, and {count} others', { first: clean[0], second: clean[1], count: clean.length - 2 });
}

function groupMealsByMonth(meals: MealEntry[]): MonthGroup[] {
  const sorted = [...meals].sort((a, b) => {
    const monthCompare = getMonthKey(b.date).localeCompare(getMonthKey(a.date));
    if (monthCompare !== 0) return monthCompare;

    const dayCompare = a.date.localeCompare(b.date);
    return dayCompare !== 0 ? dayCompare : a.time.localeCompare(b.time);
  });

  const groups = new Map<string, MealEntry[]>();

  for (const meal of sorted) {
    const key = getMonthKey(meal.date);
    const monthMeals = groups.get(key) ?? [];
    monthMeals.push(meal);
    groups.set(key, monthMeals);
  }

  return [...groups.entries()].map(([key, monthMeals]) => ({
    key,
    label: getMonthLabel(key),
    meals: monthMeals,
  }));
}

function buildMonthGroup(key: string, meals: MealEntry[]): MonthGroup {
  return {
    key,
    label: getMonthLabel(key),
    meals: meals
      .filter((meal) => getMonthKey(meal.date) === key)
      .sort((a, b) => {
        const dayCompare = a.date.localeCompare(b.date);
        return dayCompare !== 0 ? dayCompare : a.time.localeCompare(b.time);
      }),
  };
}

function mergeMonthOptions(
  groups: MonthGroup[],
  selectedMonthKey: string,
  currentMonthKey: string,
): MonthGroup[] {
  const options = new Map<string, MonthGroup>();

  for (const key of [selectedMonthKey, currentMonthKey]) {
    options.set(key, {
      key,
      label: getMonthLabel(key),
      meals: [],
    });
  }

  for (const group of groups) {
    options.set(group.key, group);
  }

  return [...options.values()].sort((a, b) => b.key.localeCompare(a.key));
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getCalendarCells(monthKey: string): Array<string | null> {
  const { year, month } = parseMonthKey(monthKey);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const days = getDaysInMonth(year, month);
  const cells: Array<string | null> = [];

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= days; day += 1) {
    cells.push(`${monthKey}-${String(day).padStart(2, '0')}`);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

// ── Components ──────────────────────────────────────────────

function TileFallback({ meal }: { meal: MealEntry }) {
  const { t } = useI18n();
  return (
    <View style={styles.tileFallback}>
      <View style={styles.fallbackPlate} />
      <Text style={styles.fallbackInitial}>{t(MEAL_TYPE_INITIALS[meal.mealType])}</Text>
    </View>
  );
}

function MemoryTile({
  meal,
  companions,
  peopleById,
  sharedPhotos,
  variant = 'small',
  onPress,
}: {
  meal: MealEntry;
  companions: MealCompanion[];
  peopleById: Map<string, PersonProfile>;
  sharedPhotos: SharedMealPhoto[];
  variant?: 'feature' | 'small' | 'wide';
  onPress: () => void;
}) {
  const mood = getMoodLabel(meal);
  const mealCompanions = companions.filter((companion) => companion.mealId === meal.id);
  const sharedLine = formatSharedWith(
    mealCompanions.map((companion) => (
      getPersonDisplayName(peopleById.get(companion.personId), companion)
    )),
  );
  const primaryPhotoUri = meal.photoThumbnailUri
    ?? meal.photoUri
    ?? sharedPhotos.find((photo) => photo.mealId === meal.id)?.thumbnailUri
    ?? sharedPhotos.find((photo) => photo.mealId === meal.id)?.imageUrl;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        variant === 'feature' && styles.tileFeature,
        variant === 'wide' && styles.tileWide,
        pressed && styles.tilePressed,
      ]}
    >
      <View
        style={[
          styles.tileImageWrap,
          variant === 'feature' && styles.tileImageFeature,
          variant === 'wide' && styles.tileImageWide,
        ]}
      >
        {primaryPhotoUri ? (
          <Image source={{ uri: primaryPhotoUri }} style={styles.tileImage} />
        ) : (
          <TileFallback meal={meal} />
        )}
        <View style={styles.dayBadge}>
          <Text style={styles.dayBadgeText}>{getDayLabel(meal.date)}</Text>
        </View>
      </View>
      <Text style={styles.tileTitle} numberOfLines={1}>
        {meal.title}
      </Text>
      <Text style={styles.tileMeta} numberOfLines={1}>
        {meal.note ?? mood ?? meal.time}
      </Text>
      {sharedLine ? (
        <Text style={styles.tileShared} numberOfLines={1}>
          {sharedLine}
        </Text>
      ) : null}
    </Pressable>
  );
}

function MemoryCollage({
  meals,
  companions,
  peopleById,
  sharedPhotos,
  onMealPress,
}: {
  meals: MealEntry[];
  companions: MealCompanion[];
  peopleById: Map<string, PersonProfile>;
  sharedPhotos: SharedMealPhoto[];
  onMealPress: (meal: MealEntry) => void;
}) {
  const [featured, ...rest] = meals;

  if (!featured) return null;

  return (
    <View style={styles.collage}>
      <MemoryTile
        meal={featured}
        companions={companions}
        peopleById={peopleById}
        sharedPhotos={sharedPhotos}
        variant="feature"
        onPress={() => onMealPress(featured)}
      />
      <View style={styles.collageGrid}>
        {rest.map((meal, index) => (
          <MemoryTile
            key={meal.id}
            meal={meal}
            companions={companions}
            peopleById={peopleById}
            sharedPhotos={sharedPhotos}
            variant={index % 5 === 3 ? 'wide' : 'small'}
            onPress={() => onMealPress(meal)}
          />
        ))}
      </View>
    </View>
  );
}

function MonthWall({
  group,
  selectedDateKey,
  companions,
  peopleById,
  sharedPhotos,
  onMealPress,
}: {
  group: MonthGroup;
  selectedDateKey: string;
  companions: MealCompanion[];
  peopleById: Map<string, PersonProfile>;
  sharedPhotos: SharedMealPhoto[];
  onMealPress: (meal: MealEntry) => void;
}) {
  const { t } = useI18n();
  const selectedDateMeals = group.meals.filter((meal) => meal.date === selectedDateKey);
  const otherMeals = group.meals.filter((meal) => meal.date !== selectedDateKey);
  const displayMeals =
    selectedDateMeals.length > 0 ? [...selectedDateMeals, ...otherMeals] : group.meals;
  return (
    <View style={styles.monthWall}>
      {displayMeals.length > 0 ? (
        <MemoryCollage
          meals={displayMeals}
          companions={companions}
          peopleById={peopleById}
          sharedPhotos={sharedPhotos}
          onMealPress={onMealPress}
        />
      ) : (
        <View style={styles.monthEmptyPanel}>
          <Text style={styles.monthEmptyTitle}>{t("This month is still quiet.")}</Text>
          <Text style={styles.monthEmptyBody}>
            {t("The calendar is ready, and meal memories will gather here when they arrive.")}</Text>
        </View>
      )}
    </View>
  );
}

function ViewToggle({
  activeView,
  onChange,
}: {
  activeView: ArchiveView;
  onChange: (view: ArchiveView) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <View style={styles.viewToggle} accessibilityRole="tablist">
      {(['books', 'calendar', 'memories'] as const).map((view) => {
        const active = activeView === view;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            aria-selected={active}
            key={view}
            style={[styles.viewToggleItem, active && styles.viewToggleItemActive]}
            onPress={() => onChange(view)}
          >
            <Text style={[styles.viewToggleText, active && styles.viewToggleTextActive]}>
              {view === 'books' ? (locale === 'zh' ? '月度相册' : 'Photobooks') : view === 'calendar' ? t('Calendar') : (locale === 'zh' ? '照片' : 'Photos')}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MonthCalendar({
  group,
  selectedDateKey,
  onDayPress,
}: {
  group: MonthGroup;
  selectedDateKey: string;
  onDayPress: (dateKey: string, meals: MealEntry[]) => void;
}) {
  const { t, locale } = useI18n();
  const todayKey = toDateKey(new Date());
  const mealsByDate = new Map<string, MealEntry[]>();
  for (const meal of group.meals) {
    const dateMeals = mealsByDate.get(meal.date) ?? [];
    dateMeals.push(meal);
    mealsByDate.set(meal.date, dateMeals);
  }

  return (
    <View style={styles.calendarPaper}>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((weekday) => (
          <Text key={weekday} style={styles.weekdayText}>{t(weekday)}</Text>
        ))}
      </View>
      <View style={styles.calendarGrid}>
        {getCalendarCells(group.key).map((dateKey, index) => {
          if (!dateKey) return <View key={`blank-${index}`} style={styles.calendarBlankCell} />;
          const dateMeals = mealsByDate.get(dateKey) ?? [];
          const sticker = dateMeals.find((meal) => meal.stickerUri);
          const isToday = dateKey === todayKey;
          const isSelected = dateKey === selectedDateKey;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${new Date(`${dateKey}T12:00:00`).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' })}, ${t('{count} meals', { count: dateMeals.length })}`}
              accessibilityState={{ selected: isSelected }}
              testID={`calendar-day-${dateKey}`}
              key={dateKey}
              style={({ pressed }) => [
                styles.calendarDayCell,
                isToday && styles.calendarDayToday,
                isSelected && styles.calendarDaySelected,
                pressed && styles.calendarDayPressed,
              ]}
              onPress={() => onDayPress(dateKey, dateMeals)}
            >
              {sticker?.stickerUri ? (
                <View style={styles.calendarSticker}>
                  <FoodSticker uri={sticker.stickerUri} style={[styles.calendarStickerImage, { transform: [{ rotate: `${[-8, 5, -3, 7][index % 4]}deg` }] }]} accessibilityLabel={sticker.title} />
                </View>
              ) : null}
              <Text style={[styles.calendarDayNumber, sticker && styles.calendarStickerDate, isToday && styles.calendarDayNumberSelected]}>
                {parseDateKey(dateKey).day}
              </Text>
              {dateMeals.length > 1 ? (
                <View style={styles.calendarCount}><Text style={styles.calendarCountText}>{dateMeals.length}</Text></View>
              ) : dateMeals.length === 1 && !sticker ? <View style={styles.mealDot} /> : null}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.calendarHint}>{t('Tap a day to open its table')}</Text>
    </View>
  );
}

// ── Archive Screen ──────────────────────────────────────────

export default function ArchiveScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const { height: screenHeight } = useWindowDimensions();
  const compact = screenHeight < 700;
  const initialDateKey = toDateKey(new Date());
  const initialMonthKey = toMonthKey(new Date());
  const [allMeals, setAllMeals] = useState<MealEntry[]>([]);
  const [scope, setScope] = useState<BookScope>();
  const activeScope = scope ?? 'personal';
  const [lastBook, setLastBook] = useState<string>();
  const [shelfYear, setShelfYear] = useState(new Date().getFullYear());
  const [companions, setCompanions] = useState<MealCompanion[]>([]);
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [sharedPhotos, setSharedPhotos] = useState<SharedMealPhoto[]>([]);
  const [selectedMonthKey, setSelectedMonthKey] = useState(initialMonthKey);
  const [selectedDateKey, setSelectedDateKey] = useState(initialDateKey);
  const [activeView, setActiveView] = useState<ArchiveView>('books');
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [daySheetDateKey, setDaySheetDateKey] = useState<string | undefined>();
  const [daySheetMeals, setDaySheetMeals] = useState<MealEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [reloadToken, setReloadToken] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setError(undefined);
      Promise.all([
        getMeals(),
        getMealCompanions(),
        getPeopleProfiles({ includeDeleted: true }),
        getSharedMealPhotos(),
      ]).then(([all, nextCompanions, nextPeople, nextPhotos]) => {
        if (!active) return;
        setAllMeals(all);
        setScope(previous => previous ?? (all.some(meal => meal.origin !== 'sample') ? 'personal' : 'sample'));
        setCompanions(nextCompanions);
        setPeople(nextPeople);
        setSharedPhotos(nextPhotos);
      }).catch(() => {
        if (active) setError('Could not load your meals.');
      }).finally(() => {
        if (active) setLoading(false);
      });
      return () => {
        active = false;
      };
    }, [reloadToken]),
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || loading || activeView !== 'books' || !lastBook) return;
    const frame = requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="monthly-book-${lastBook}"]`)?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [loading, activeView, lastBook]);

  const handleMealPress = useCallback(
    (meal: MealEntry) => {
      router.push(`/meal/${meal.id}`);
    },
    [router],
  );

  const scopedMeals = useMemo(() => scopeMeals(allMeals, activeScope), [allMeals, activeScope]);
  const monthGroups = useMemo(() => groupMealsByMonth(scopedMeals), [scopedMeals, locale]);
  const selectedMonth = useMemo(
    () => buildMonthGroup(selectedMonthKey, scopedMeals),
    [scopedMeals, selectedMonthKey, locale],
  );
  const monthOptions = useMemo(
    () => mergeMonthOptions(monthGroups, selectedMonthKey, initialMonthKey),
    [initialMonthKey, monthGroups, selectedMonthKey, locale],
  );
  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people],
  );

  const handleMonthSelect = useCallback((group: MonthGroup) => {
    setSelectedMonthKey(group.key);
    setSelectedDateKey((current) => {
      if (current.startsWith(`${group.key}-`)) return current;
      return group.meals[0]?.date ?? `${group.key}-01`;
    });
    setMonthPickerOpen(false);
  }, []);

  const handleCalendarDayPress = useCallback((dateKey: string, meals: MealEntry[]) => {
    setSelectedDateKey(dateKey);
    setSelectedMonthKey(getMonthKey(dateKey));
    setDaySheetDateKey(dateKey);
    setDaySheetMeals(meals);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={[styles.scroll, compact && { paddingTop: 4 }, activeView !== 'books' && { maxWidth: 550, width: '100%', alignSelf: 'center' }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, compact && { marginBottom: 6 }]}>
          {!compact ? <Text style={styles.eyebrow}>MEALOG / LIBRARY</Text> : null}
          <Text accessibilityRole="header" style={[styles.title, compact && { fontSize: 20, lineHeight: 30 }]}>{locale === 'zh' ? '把日子，翻成一册。' : 'Life, bound in little books.'}</Text>
          {activeView !== 'books' ? <Text style={styles.intro}>{locale === 'zh' ? '一月一册，收藏那些吃过、记得的日常。' : 'A book for each month. The meals you want to remember.'}</Text> : null}
          <Pressable accessibilityRole="button" style={[styles.peopleLibraryLink, compact && { top: -6 }]} onPress={() => router.push('/people')}>
            <Text style={styles.peopleLibraryLinkText}>{locale === 'zh' ? '同桌伙伴 ↗' : 'People ↗'}</Text>
          </Pressable>
        </View>

        {activeView !== 'books' ? <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Choose a month')}
          style={({ pressed }) => [
            styles.monthSwitch,
            pressed && styles.monthSwitchPressed,
          ]}
          onPress={() => setMonthPickerOpen(true)}
        >
          <View>
            <Text style={styles.monthSwitchMonth}>{selectedMonth.label}</Text>
          </View>
          <Text style={styles.monthSwitchChevron}>⌄</Text>
        </Pressable> : null}

        <LoadState loading={loading} error={error} onRetry={() => setReloadToken((value) => value + 1)} />
        <ViewToggle activeView={activeView} onChange={setActiveView} />
        <View style={styles.scopeRow} accessibilityRole="tablist">
          {(['personal', 'sample'] as const).map(value => <Pressable key={value} accessibilityRole="tab"
            accessibilityState={{ selected: activeScope === value }} aria-selected={activeScope === value} style={[styles.scopeButton, activeScope === value && styles.scopeActive]}
            onPress={() => setScope(value)}><Text style={styles.scopeText}>{value === 'personal' ? (locale === 'zh' ? '我的相册' : 'My books') : (locale === 'zh' ? '示例相册' : 'Sample books')}</Text></Pressable>)}
        </View>
        {activeScope === 'sample' && !compact ? <Text style={styles.sampleNote}>{locale === 'zh' ? '示例相册，与你的餐食分开保存。' : 'Sample books, separate from your meals.'}</Text> : null}

        {loading || error ? null : activeView === 'books' ? (
          <MonthlyBookshelf meals={scopedMeals} locale={locale} year={shelfYear} onYearChange={setShelfYear}
            onOpen={month => { setLastBook(month); router.push(`/photobook?month=${month}&scope=${activeScope}`); }} onAdd={() => router.push('/add')} />
        ) : activeView === 'calendar' ? (
          <>
          <MonthCalendar
            group={selectedMonth}
            selectedDateKey={selectedDateKey}
            onDayPress={handleCalendarDayPress}
          />
          {selectedMonth.meals.some(meal => meal.photoUri && !meal.stickerUri) ? <Pressable accessibilityRole="button"
            style={styles.stickerPrompt} onPress={() => router.push(`/food-album?month=${selectedMonth.key}&scope=${activeScope}`)}>
            <Text style={styles.stickerPromptText}>{locale === 'zh' ? '把照片变成可爱贴纸 ↗' : 'Turn your photos into little stickers ↗'}</Text>
          </Pressable> : null}
          </>
        ) : (
          <>
            <MonthWall
              group={selectedMonth}
              selectedDateKey={selectedDateKey}
              companions={companions}
              peopleById={peopleById}
              sharedPhotos={sharedPhotos}
              onMealPress={handleMealPress}
            />
          </>
        )}
        {!loading && !error ? (
          <Pressable accessibilityRole="button" accessibilityLabel={locale === 'zh' ? '打开饮食图册' : 'Open food album'}
            style={styles.albumLink} onPress={() => router.push(`/food-album?month=${selectedMonth.key}&scope=${activeScope}`)}>
            <View style={styles.albumLinkHeading}>
              <Text style={styles.albumLinkTitle}>{locale === 'zh' ? '食物 Archive' : 'Food archive'}</Text>
              <Text style={styles.albumLinkArrow}>↗</Text>
            </View>
            <Text style={styles.albumLinkCaption}>{selectedMonth.meals.some((meal) => meal.photoUri && !meal.stickerUri)
              ? (locale === 'zh' ? '收好餐食贴纸，也可以为已有照片制作贴纸。' : 'Collect your stickers and make more from saved photos.')
              : (locale === 'zh' ? '把吃过的好味道，一张张贴在这里。' : 'A little collection of things you have tasted.')}</Text>
            {selectedMonth.meals.some((meal) => meal.stickerUri) ? (
              <View style={styles.albumPreview}>
                {selectedMonth.meals.filter((meal) => meal.stickerUri).slice(0, 5).map((meal, index) => (
                  <FoodSticker key={meal.id} uri={meal.stickerUri!} size={58}
                    style={{ width: '20%', transform: [{ rotate: `${[-9, 6, -3, 9, -6][index]}deg` }] }} />
                ))}
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal
        visible={Boolean(daySheetDateKey)}
        transparent
        animationType="fade"
        onRequestClose={() => setDaySheetDateKey(undefined)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Close')}
          style={styles.pickerOverlay}
          onPress={() => setDaySheetDateKey(undefined)}
        >
          <Pressable style={styles.daySheet} onPress={(event) => event.stopPropagation()}>
            <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.pickerTitle}>
              {daySheetDateKey
                ? new Date(`${daySheetDateKey}T12:00:00`).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                : t('This day')}
            </Text>
            <Text style={styles.daySheetSubtitle}>{t("Meal memories at this table")}</Text>
            {daySheetMeals.length === 0 ? (
              <View>
                <Text style={styles.daySheetSubtitle}>{t('No meals on this day yet.')}</Text>
              </View>
            ) : null}
            {daySheetMeals.map((meal) => {
              const mealCompanions = companions.filter((companion) => companion.mealId === meal.id);
              const sharedLine = formatSharedWith(
                mealCompanions.map((companion) => (
                  getPersonDisplayName(peopleById.get(companion.personId), companion)
                )),
              );
              const sharedPhoto = sharedPhotos.find((photo) => photo.mealId === meal.id);
              const imageUri = meal.photoThumbnailUri
                ?? meal.photoUri
                ?? sharedPhoto?.thumbnailUri
                ?? sharedPhoto?.imageUrl;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={meal.id}
                  style={styles.dayMealRow}
                  onPress={() => {
                    setDaySheetDateKey(undefined);
                    handleMealPress(meal);
                  }}
                >
                  <View style={styles.dayMealThumb}>
                    {imageUri ? (
                      <Image source={{ uri: imageUri }} style={styles.dayMealImage} />
                    ) : (
                      <TileFallback meal={meal} />
                    )}
                  </View>
                  <View style={styles.dayMealTextWrap}>
                    <Text style={styles.dayMealTitle} numberOfLines={1}>{meal.title}</Text>
                    <Text style={styles.dayMealMeta} numberOfLines={1}>
                      {meal.time}{meal.location ? ` · ${meal.location}` : ''}
                    </Text>
                    {sharedLine ? (
                      <Text style={styles.dayMealShared} numberOfLines={1}>{sharedLine}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.dayMealChevron}>›</Text>
                </Pressable>
              );
            })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={monthPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMonthPickerOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Close')}
          style={styles.pickerOverlay}
          onPress={() => setMonthPickerOpen(false)}
        >
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>{t("Choose a month")}</Text>
            {monthOptions.map((group) => {
              const active = group.key === selectedMonth.key;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
            aria-selected={active}
                  key={group.key}
                  style={[styles.pickerMonth, active && styles.pickerMonthActive]}
                  onPress={() => handleMonthSelect(group)}
                >
                  <View>
                    <Text
                      style={[
                        styles.pickerMonthLabel,
                        active && styles.pickerMonthLabelActive,
                      ]}
                    >
                      {group.label}
                    </Text>
                    <Text style={styles.pickerMonthMeta}>
                      {t(group.meals.length === 1 ? '{count} memory' : '{count} memories', { count: group.meals.length })}
                    </Text>
                  </View>
                  {active ? <Text style={styles.pickerActiveMark}>•</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  eyebrow: { fontSize: 9, letterSpacing: 1.4, color: '#737361', marginTop: 4, marginBottom: 12 },
  intro: { fontSize: 12, lineHeight: 20, color: '#736e61', marginTop: 6 },
  scopeRow: { flexDirection: 'row', gap: 22, marginBottom: 0 },
  scopeButton: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: 'transparent' },
  scopeActive: { borderBottomColor: '#59624c' },
  scopeText: { color: '#545b49', fontSize: 13 },
  sampleNote: { color: '#736e61', fontSize: 11, lineHeight: 18, marginBottom: 8 },
  safe: {
    flex: 1,
    backgroundColor: '#f8f6ef',
  },
  scroll: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 38,
    maxWidth: 980,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    marginBottom: 16,
  },
  title: { fontFamily: fonts.editorial,
    fontSize: 21,
    lineHeight: 29,
    color: colors.primary,
  },
  peopleLibraryLink: {
    alignSelf: 'flex-start',
    borderRadius: 17,
    paddingHorizontal: 13,
    paddingVertical: 8,
    marginTop: 0,
    position: 'absolute',
    top: -3,
    right: 0,
    backgroundColor: 'transparent',
  },
  peopleLibraryLinkText: {
    fontSize: 12,
    color: colors.secondary,
  },
  monthSwitch: {
    borderRadius: 2,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 18,
    backgroundColor: 'rgba(255, 253, 248, 0.58)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.26)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthSwitchPressed: {
    opacity: 0.76,
  },
  monthSwitchMonth: {
    fontSize: 18,
    lineHeight: 24,
    color: colors.primary,
  },
  monthSwitchChevron: {
    fontSize: 21,
    color: colors.mutedText,
    marginRight: 2,
  },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 2,
    padding: 4,
    marginBottom: 0,
    backgroundColor: 'rgba(255, 253, 248, 0.5)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.24)',
  },
  viewToggleItem: {
    flex: 1,
    minHeight: 44,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggleItemActive: {
    backgroundColor: 'rgba(180, 145, 88, 0.16)',
  },
  viewToggleText: {
    fontSize: 14,
    color: colors.mutedText,
  },
  viewToggleTextActive: {
    color: colors.primary,
  },
  calendarPaper: {
    borderRadius: 2,
    backgroundColor: colors.surface,
    paddingHorizontal: 9,
    paddingTop: 20,
    paddingBottom: 16,
    marginBottom: 16,
  },
  calendarHint: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 11,
    color: colors.mutedText,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  weekdayText: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 11,
    color: colors.mutedText,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarBlankCell: {
    width: `${100 / 7 - 1.5}%`,
    marginHorizontal: '0.75%',
    minHeight: 66,
    marginBottom: 8,
  },
  calendarDayCell: {
    width: `${100 / 7 - 1.5}%`,
    marginHorizontal: '0.75%',
    minHeight: 66,
    marginBottom: 8,
    borderRadius: 13,
    backgroundColor: '#F1EFE8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  calendarDayToday: {
    borderColor: colors.secondary,
  },
  calendarDaySelected: {
    backgroundColor: '#E9DFCF',
    borderColor: colors.secondary,
  },
  calendarDayPressed: {
    opacity: 0.72,
  },
  calendarDayNumber: {
    fontSize: 15,
    color: colors.primary,
  },
  calendarStickerDate: {
    position: 'absolute',
    top: 3,
    left: 5,
    fontSize: 10,
    lineHeight: 12,
  },
  calendarDayNumberSelected: {
    fontWeight: '700',
  },
  calendarSticker: {
    position: 'absolute',
    top: 15,
    bottom: 2,
    left: 1,
    right: 1,
  },
  calendarStickerImage: {
    width: '100%',
    height: '100%',
  },
  stickerPrompt: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  stickerPromptText: {
    color: colors.primary,
    fontSize: 12,
  },
  calendarCount: {
    position: 'absolute',
    right: -2,
    top: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarCountText: {
    fontSize: 10,
    color: colors.surface,
  },
  mealDot: {
    position: 'absolute',
    bottom: 10,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.secondary,
  },
  albumLink: {
    borderRadius: 2,
    backgroundColor: colors.surface,
    padding: 20,
    marginBottom: 18,
  },
  albumLinkHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  albumLinkTitle: {
    fontSize: 18,
    color: colors.primary,
    fontWeight: '600',
  },
  albumLinkArrow: {
    fontSize: 22,
    color: colors.secondary,
  },
  albumLinkCaption: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 19,
    color: colors.mutedText,
  },
  albumPreview: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 16,
  },
  monthWall: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 28,
    backgroundColor: 'rgba(255, 253, 248, 0.78)',
    paddingHorizontal: 19,
    paddingTop: 23,
    paddingBottom: 24,
    marginBottom: 24,
    ...shadow.soft,
  },
  monthEmptyPanel: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 20,
    backgroundColor: 'rgba(255, 248, 238, 0.5)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(185, 165, 138, 0.28)',
  },
  monthEmptyTitle: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.primary,
    marginBottom: 7,
  },
  monthEmptyBody: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.mutedText,
  },
  collage: {
    gap: 16,
  },
  collageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  tile: {
    width: '31.25%',
    marginBottom: 12,
  },
  tileFeature: {
    width: '100%',
    marginBottom: 4,
  },
  tileWide: {
    width: '64.2%',
  },
  tilePressed: {
    opacity: 0.78,
  },
  tileImageWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(248, 232, 212, 0.34)',
  },
  tileImageFeature: {
    aspectRatio: 1.34,
    borderRadius: 2,
  },
  tileImageWide: {
    aspectRatio: 1.9,
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 248, 238, 0.82)',
  },
  fallbackPlate: {
    width: '66%',
    height: '42%',
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(92, 64, 51, 0.16)',
  },
  fallbackInitial: {
    position: 'absolute',
    fontSize: 18,
    color: 'rgba(180, 145, 88, 0.72)',
  },
  dayBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    minWidth: 21,
    height: 21,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 253, 248, 0.82)',
  },
  dayBadgeText: {
    fontSize: 11,
    color: colors.secondary,
  },
  tileTitle: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 16,
    color: colors.primary,
  },
  tileMeta: {
    fontSize: 10,
    lineHeight: 14,
    color: colors.mutedText,
  },
  tileShared: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 14,
    color: colors.secondary,
  },
  daySheet: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '85%',
    alignSelf: 'center',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: colors.background,
    ...shadow.card,
  },
  daySheetSubtitle: {
    marginTop: -7,
    marginBottom: 14,
    fontSize: 12,
    color: colors.mutedText,
  },
  dayMealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 9,
    backgroundColor: 'rgba(255, 253, 248, 0.56)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.22)',
  },
  dayMealThumb: {
    width: 52,
    height: 58,
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: 'rgba(248, 232, 212, 0.32)',
  },
  dayMealImage: {
    width: '100%',
    height: '100%',
  },
  dayMealTextWrap: {
    flex: 1,
  },
  dayMealTitle: {
    fontSize: 15,
    color: colors.primary,
    marginBottom: 4,
  },
  dayMealMeta: {
    fontSize: 12,
    color: colors.mutedText,
    marginBottom: 3,
  },
  dayMealShared: {
    fontSize: 11,
    color: colors.mutedText,
  },
  dayMealChevron: {
    fontSize: 18,
    color: colors.mutedText,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(62, 43, 33, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  pickerSheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: colors.background,
    ...shadow.card,
  },
  pickerTitle: {
    fontSize: 18,
    lineHeight: 24,
    color: colors.primary,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  pickerMonth: {
    borderRadius: 2,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    backgroundColor: 'rgba(255, 253, 248, 0.52)',
  },
  pickerMonthActive: {
    backgroundColor: 'rgba(180, 145, 88, 0.16)',
  },
  pickerMonthLabel: {
    fontSize: 16,
    color: colors.primary,
  },
  pickerMonthLabelActive: {
    color: '#8E6D35',
  },
  pickerMonthMeta: {
    marginTop: 3,
    fontSize: 11,
    color: colors.mutedText,
  },
  pickerActiveMark: {
    fontSize: 24,
    color: colors.secondary,
    lineHeight: 24,
  },
});
