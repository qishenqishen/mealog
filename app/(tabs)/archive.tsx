import { useI18n, translate } from '../../src/i18n';
import { useCallback, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
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
import { colors, shadow } from '../../src/theme';
import PersonAvatar from '../../src/components/PersonAvatar';
import LoadState from '../../src/components/LoadState';

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

type ArchiveView = 'calendar' | 'memories';

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

function distinctDays(meals: MealEntry[]): number {
  return new Set(meals.map((meal) => meal.date)).size;
}

function monthWhisper(group: MonthGroup): string {
  const photoCount = group.meals.filter((meal) => meal.photoUri).length;
  if (photoCount >= 6) return translate('A month with photographs at the table.');
  if (group.meals.some((meal) => meal.peopleTags.length > 0)) {
    return translate('A table with company remembered.');
  }
  if (group.meals.some((meal) => meal.moodTags.length > 0 || meal.moodTag)) {
    return translate('A month held by small feelings.');
  }
  return translate('Each month, a new table is set.');
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
        {mood ?? meal.note ?? meal.time}
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
  const { t, locale } = useI18n();
  const selectedDateMeals = group.meals.filter((meal) => meal.date === selectedDateKey);
  const otherMeals = group.meals.filter((meal) => meal.date !== selectedDateKey);
  const displayMeals =
    selectedDateMeals.length > 0 ? [...selectedDateMeals, ...otherMeals] : group.meals;
  const daysWithMeals = distinctDays(group.meals);
  const mealIds = new Set(group.meals.map((meal) => meal.id));
  const monthCompanions = companions.filter((companion) => mealIds.has(companion.mealId));
  const monthSharedPhotos = sharedPhotos.filter((photo) => mealIds.has(photo.mealId));
  const sharedMealsCount = new Set(monthCompanions.map((companion) => companion.mealId)).size;
  const uniquePeopleCount = new Set(monthCompanions.map((companion) => companion.personId)).size;
  const photoCount = group.meals.filter((meal) => meal.photoUri).length + monthSharedPhotos.length;

  return (
    <View style={styles.monthWall}>
      <View style={styles.monthPaperWash} />
      <View style={styles.monthHeader}>
        <View>
          <Text style={styles.monthLabel}>{group.label}</Text>
          <Text style={styles.monthQuote}>"{monthWhisper(group)}"</Text>
        </View>
        <View style={styles.monthStamp}>
          <Text style={styles.monthStampNumber}>{group.meals.length}</Text>
          <Text style={styles.monthStampText}>
            {group.meals.length === 1 ? t('memory') : t('memories')}
          </Text>
        </View>
      </View>

      <View style={styles.monthStatsLine}>
        <Text style={styles.monthStatsText}>
          {t('{count} meals logged', { count: group.meals.length })}</Text>
        <View style={styles.monthStatsDot} />
        <Text style={styles.monthStatsText}>
          {t('{count} shared meals', { count: sharedMealsCount })}</Text>
      </View>

      <View style={styles.monthStatsLine}>
        <Text style={styles.monthStatsText}>
          {t(daysWithMeals === 1 ? '{count} day with meals' : '{count} days with meals', { count: daysWithMeals })}</Text>
        <View style={styles.monthStatsDot} />
        <Text style={styles.monthStatsText}>
          {t('{count} people at the table', { count: uniquePeopleCount })}</Text>
        <View style={styles.monthStatsDot} />
        <Text style={styles.monthStatsText}>
          {t('{count} photographs', { count: photoCount })}</Text>
      </View>

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
    <View style={styles.viewToggle}>
      {(['calendar', 'memories'] as const).map((view) => {
        const active = activeView === view;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={view}
            style={[styles.viewToggleItem, active && styles.viewToggleItemActive]}
            onPress={() => onChange(view)}
          >
            <Text style={[styles.viewToggleText, active && styles.viewToggleTextActive]}>
              {view === 'calendar' ? t('Calendar') : t('Memories')}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CalendarStatusDot({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <View style={[styles.calendarStatusDot, active && styles.calendarStatusDotActive]}>
      <Text style={[styles.calendarStatusText, active && styles.calendarStatusTextActive]}>
        {label}
      </Text>
    </View>
  );
}

function MonthCalendar({
  group,
  selectedDateKey,
  companions,
  peopleById,
  sharedPhotos,
  onDayPress,
}: {
  group: MonthGroup;
  selectedDateKey: string;
  companions: MealCompanion[];
  peopleById: Map<string, PersonProfile>;
  sharedPhotos: SharedMealPhoto[];
  onDayPress: (dateKey: string, meals: MealEntry[]) => void;
}) {
  const { t, locale } = useI18n();
  const cells = getCalendarCells(group.key);
  const todayKey = toDateKey(new Date());
  const mealsByDate = new Map<string, MealEntry[]>();

  for (const meal of group.meals) {
    const dateMeals = mealsByDate.get(meal.date) ?? [];
    dateMeals.push(meal);
    mealsByDate.set(meal.date, dateMeals);
  }

  return (
    <View style={styles.calendarPaper}>
      <View style={styles.calendarHeader}>
        <View>
          <Text style={styles.calendarEyebrow}>{t("Month table")}</Text>
          <Text style={styles.calendarTitle}>{group.label}</Text>
        </View>
        <Text style={styles.calendarHint}>{t("Tap a day to open its table")}</Text>
      </View>

      <View style={styles.calendarLegend}>
        {[t('Meal'), t('People'), t('Photo')].map((label) => (
          <View key={label} style={styles.calendarLegendItem}>
            <View style={styles.calendarLegendMark} />
            <Text style={styles.calendarLegendText}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((weekday) => (
          <Text key={weekday} style={styles.weekdayText}>
            {t(weekday)}
          </Text>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {cells.map((dateKey, index) => {
          if (!dateKey) {
            return <View key={`blank-${index}`} style={styles.calendarBlankCell} />;
          }

          const { day } = parseDateKey(dateKey);
          const dateMeals = mealsByDate.get(dateKey) ?? [];
          const dateMealIds = new Set(dateMeals.map((meal) => meal.id));
          const dateCompanions = companions.filter((companion) => dateMealIds.has(companion.mealId));
          const datePeople = [...new Set(dateCompanions.map((companion) => companion.personId))]
            .map((personId) => peopleById.get(personId))
            .filter((person): person is PersonProfile => Boolean(person));
          const primaryMealPhoto = dateMeals.find((meal) => meal.photoThumbnailUri || meal.photoUri);
          const primarySharedPhoto = sharedPhotos.find((photo) => (
            dateMealIds.has(photo.mealId) && (photo.thumbnailUri || photo.imageUrl)
          ));
          const primaryPhotoUri = primaryMealPhoto?.photoThumbnailUri
            ?? primaryMealPhoto?.photoUri
            ?? primarySharedPhoto?.thumbnailUri
            ?? primarySharedPhoto?.imageUrl;
          const firstMealType = dateMeals[0]?.mealType;
          const hasMeals = dateMeals.length > 0;
          const hasPeople = datePeople.length > 0 || dateMeals.some((meal) => meal.peopleTags.length > 0);
          const hasPhoto = Boolean(primaryPhotoUri);
          const isToday = dateKey === todayKey;
          const isSelected = dateKey === selectedDateKey;

          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${new Date(`${dateKey}T12:00:00`).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' })}, ${t('{count} meals', { count: dateMeals.length })}`}
              accessibilityState={{ selected: isSelected }}
              key={dateKey}
              style={({ pressed }) => [
                styles.calendarDayCell,
                hasMeals && styles.calendarDayWithMeal,
                isToday && styles.calendarDayToday,
                isSelected && styles.calendarDaySelected,
                pressed && styles.calendarDayPressed,
              ]}
              onPress={() => onDayPress(dateKey, dateMeals)}
            >
              <View style={styles.calendarDayTop}>
                <Text
                  style={[
                    styles.calendarDayNumber,
                    hasMeals && styles.calendarDayNumberActive,
                    isSelected && styles.calendarDayNumberSelected,
                  ]}
                >
                  {day}
                </Text>
                {isToday ? <View style={styles.todayPin} /> : null}
              </View>
              <View style={styles.calendarDayVisual}>
                {primaryPhotoUri ? (
                  <Image source={{ uri: primaryPhotoUri }} style={styles.calendarDayImage} />
                ) : hasMeals && firstMealType ? (
                  <View style={styles.calendarMealFallback}>
                    <Text style={styles.calendarMealFallbackText}>
                      {t(MEAL_TYPE_INITIALS[firstMealType])}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.calendarStatuses}>
                {datePeople.length > 0 ? (
                  <View style={styles.calendarAvatarRow}>
                    {datePeople.slice(0, 2).map((person, avatarIndex) => (
                      <View
                        key={person.id}
                        style={[
                          styles.calendarAvatarWrap,
                          avatarIndex > 0 && styles.calendarAvatarOverlap,
                        ]}
                      >
                        <PersonAvatar person={person} size={16} />
                      </View>
                    ))}
                    {datePeople.length > 2 ? (
                      <View style={styles.calendarAvatarMore}>
                        <Text style={styles.calendarAvatarMoreText}>+{datePeople.length - 2}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : hasPeople ? (
                  <CalendarStatusDot label={t("Pe")} active={true} />
                ) : null}
                {hasMeals || hasPhoto ? (
                  <View style={styles.calendarMiniMarks}>
                    {hasMeals ? <CalendarStatusDot label={t("M")} active={true} /> : null}
                    {hasPhoto ? <CalendarStatusDot label={t("Ph")} active={true} /> : null}
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── Archive Screen ──────────────────────────────────────────

export default function ArchiveScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const initialDateKey = toDateKey(new Date());
  const initialMonthKey = toMonthKey(new Date());
  const [allMeals, setAllMeals] = useState<MealEntry[]>([]);
  const [companions, setCompanions] = useState<MealCompanion[]>([]);
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [sharedPhotos, setSharedPhotos] = useState<SharedMealPhoto[]>([]);
  const [selectedMonthKey, setSelectedMonthKey] = useState(initialMonthKey);
  const [selectedDateKey, setSelectedDateKey] = useState(initialDateKey);
  const [activeView, setActiveView] = useState<ArchiveView>('calendar');
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

  const handleMealPress = useCallback(
    (meal: MealEntry) => {
      router.push(`/meal/${meal.id}`);
    },
    [router],
  );

  const monthGroups = useMemo(() => groupMealsByMonth(allMeals), [allMeals, locale]);
  const selectedMonth = useMemo(
    () => buildMonthGroup(selectedMonthKey, allMeals),
    [allMeals, selectedMonthKey, locale],
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
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.kicker}>{t("Mealog archive")}</Text>
          <Text style={styles.title}>{t("Month memories")}</Text>
          <Text style={styles.subtitle}>
            {t("A wall of tables, photographs, and small things that stayed.")}</Text>
          <Pressable accessibilityRole="button" style={styles.peopleLibraryLink} onPress={() => router.push('/people')}>
            <Text style={styles.peopleLibraryLinkText}>{t("People at my table")}</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.monthSwitch,
            pressed && styles.monthSwitchPressed,
          ]}
          onPress={() => setMonthPickerOpen(true)}
        >
          <View>
            <Text style={styles.monthSwitchLabel}>{t("Current table")}</Text>
            <Text style={styles.monthSwitchMonth}>{selectedMonth.label}</Text>
          </View>
          <Text style={styles.monthSwitchChevron}>⌄</Text>
        </Pressable>

        <LoadState loading={loading} error={error} onRetry={() => setReloadToken((value) => value + 1)} />
        <ViewToggle activeView={activeView} onChange={setActiveView} />

        {loading || error ? null : activeView === 'calendar' ? (
          <MonthCalendar
            group={selectedMonth}
            selectedDateKey={selectedDateKey}
            companions={companions}
            peopleById={peopleById}
            sharedPhotos={sharedPhotos}
            onDayPress={handleCalendarDayPress}
          />
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
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 118,
  },
  header: {
    marginBottom: 24,
  },
  kicker: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 7,
  },
  title: {
    fontSize: 33,
    lineHeight: 39,
    fontStyle: 'italic',
    color: colors.primary,
  },
  subtitle: {
    marginTop: 8,
    maxWidth: 310,
    fontSize: 14,
    lineHeight: 21,
    color: colors.mutedText,
  },
  peopleLibraryLink: {
    alignSelf: 'flex-start',
    borderRadius: 17,
    paddingHorizontal: 13,
    paddingVertical: 8,
    marginTop: 14,
    backgroundColor: 'rgba(248, 232, 212, 0.36)',
  },
  peopleLibraryLinkText: {
    fontSize: 12,
    color: colors.secondary,
    fontStyle: 'italic',
  },
  monthSwitch: {
    borderRadius: 24,
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
  monthSwitchLabel: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 4,
  },
  monthSwitchMonth: {
    fontSize: 21,
    lineHeight: 26,
    fontStyle: 'italic',
    color: colors.primary,
  },
  monthSwitchChevron: {
    fontSize: 24,
    color: colors.muted,
    marginRight: 2,
  },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 22,
    padding: 4,
    marginBottom: 18,
    backgroundColor: 'rgba(255, 253, 248, 0.5)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.24)',
  },
  viewToggleItem: {
    flex: 1,
    minHeight: 38,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggleItemActive: {
    backgroundColor: 'rgba(180, 145, 88, 0.16)',
  },
  viewToggleText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: colors.mutedText,
  },
  viewToggleTextActive: {
    color: colors.primary,
  },
  calendarPaper: {
    borderRadius: 28,
    backgroundColor: 'rgba(255, 253, 248, 0.78)',
    paddingHorizontal: 15,
    paddingTop: 20,
    paddingBottom: 22,
    marginBottom: 24,
    ...shadow.soft,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 18,
  },
  calendarEyebrow: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 5,
  },
  calendarTitle: {
    fontSize: 26,
    lineHeight: 31,
    color: colors.primary,
    fontStyle: 'italic',
  },
  calendarHint: {
    flex: 1,
    alignSelf: 'flex-end',
    textAlign: 'right',
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
  },
  calendarLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 13,
  },
  calendarLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: 'rgba(248, 232, 212, 0.3)',
  },
  calendarLegendMark: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(92, 64, 51, 0.68)',
  },
  calendarLegendText: {
    fontSize: 10,
    color: colors.mutedText,
    fontStyle: 'italic',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayText: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 10,
    color: colors.muted,
    fontStyle: 'italic',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.18)',
    overflow: 'hidden',
    borderRadius: 16,
  },
  calendarBlankCell: {
    width: `${100 / 7}%`,
    minHeight: 92,
    backgroundColor: 'rgba(255, 248, 238, 0.28)',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.14)',
  },
  calendarDayCell: {
    width: `${100 / 7}%`,
    minHeight: 92,
    paddingHorizontal: 4,
    paddingTop: 7,
    paddingBottom: 5,
    backgroundColor: 'rgba(255, 253, 248, 0.5)',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.18)',
  },
  calendarDayWithMeal: {
    backgroundColor: 'rgba(248, 232, 212, 0.35)',
  },
  calendarDayToday: {
    backgroundColor: 'rgba(255, 241, 225, 0.62)',
  },
  calendarDaySelected: {
    backgroundColor: 'rgba(180, 145, 88, 0.18)',
  },
  calendarDayPressed: {
    opacity: 0.76,
  },
  calendarDayTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  calendarDayNumber: {
    fontSize: 13,
    color: colors.mutedText,
    fontStyle: 'italic',
  },
  calendarDayNumberActive: {
    color: colors.primary,
  },
  calendarDayNumberSelected: {
    color: '#8E6D35',
  },
  calendarDayVisual: {
    height: 30,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 5,
    backgroundColor: 'rgba(255, 248, 238, 0.42)',
  },
  calendarDayImage: {
    width: '100%',
    height: '100%',
  },
  calendarMealFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180, 145, 88, 0.12)',
  },
  calendarMealFallbackText: {
    fontSize: 11,
    color: colors.secondary,
    fontStyle: 'italic',
  },
  todayPin: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.secondary,
  },
  calendarStatuses: {
    gap: 3,
  },
  calendarMiniMarks: {
    flexDirection: 'row',
    gap: 3,
  },
  calendarStatusDot: {
    flex: 1,
    height: 13,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(185, 165, 138, 0.12)',
  },
  calendarStatusDotActive: {
    backgroundColor: 'rgba(92, 64, 51, 0.72)',
  },
  calendarStatusText: {
    fontSize: 7,
    color: 'rgba(141, 123, 102, 0.58)',
  },
  calendarStatusTextActive: {
    color: colors.background,
  },
  calendarAvatarRow: {
    height: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarAvatarWrap: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 253, 248, 0.9)',
  },
  calendarAvatarOverlap: {
    marginLeft: -5,
  },
  calendarAvatarMore: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -5,
    backgroundColor: 'rgba(92, 64, 51, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 253, 248, 0.9)',
  },
  calendarAvatarMoreText: {
    fontSize: 7,
    color: colors.background,
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
  monthPaperWash: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 16,
    height: 150,
    borderRadius: 80,
    backgroundColor: 'rgba(248, 232, 212, 0.2)',
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 13,
  },
  monthLabel: {
    fontSize: 30,
    lineHeight: 36,
    fontStyle: 'italic',
    color: colors.primary,
  },
  monthQuote: {
    marginTop: 5,
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedText,
  },
  monthStamp: {
    minWidth: 58,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
    backgroundColor: 'rgba(248, 232, 212, 0.5)',
  },
  monthStampNumber: {
    fontSize: 20,
    lineHeight: 23,
    color: colors.secondary,
    fontStyle: 'italic',
  },
  monthStampText: {
    fontSize: 10,
    color: colors.mutedText,
  },
  monthStatsLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  monthStatsText: {
    fontSize: 12,
    color: colors.muted,
  },
  monthStatsDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.muted,
    marginHorizontal: 8,
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
    fontSize: 18,
    lineHeight: 24,
    color: colors.primary,
    fontStyle: 'italic',
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
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(248, 232, 212, 0.34)',
  },
  tileImageFeature: {
    aspectRatio: 1.34,
    borderRadius: 18,
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
    fontSize: 20,
    fontStyle: 'italic',
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
    fontStyle: 'italic',
  },
  tileTitle: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 16,
    color: colors.primary,
    fontStyle: 'italic',
  },
  tileMeta: {
    fontSize: 10,
    lineHeight: 14,
    color: colors.muted,
  },
  tileShared: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 14,
    color: colors.secondary,
    fontStyle: 'italic',
  },
  emptyWall: {
    paddingTop: 22,
  },
  emptyPaper: {
    borderRadius: 26,
    paddingHorizontal: 22,
    paddingVertical: 28,
    backgroundColor: 'rgba(255, 253, 248, 0.62)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(185, 165, 138, 0.32)',
  },
  emptyTitle: {
    fontSize: 22,
    lineHeight: 29,
    fontStyle: 'italic',
    color: colors.primary,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.mutedText,
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
    color: colors.muted,
    fontStyle: 'italic',
  },
  dayMealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
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
    fontStyle: 'italic',
    marginBottom: 4,
  },
  dayMealMeta: {
    fontSize: 12,
    color: colors.mutedText,
    marginBottom: 3,
  },
  dayMealShared: {
    fontSize: 11,
    color: colors.muted,
  },
  dayMealChevron: {
    fontSize: 22,
    color: colors.muted,
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
    fontSize: 20,
    lineHeight: 26,
    color: colors.primary,
    fontStyle: 'italic',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  pickerMonth: {
    borderRadius: 18,
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
    fontStyle: 'italic',
  },
  pickerMonthLabelActive: {
    color: '#8E6D35',
  },
  pickerMonthMeta: {
    marginTop: 3,
    fontSize: 11,
    color: colors.muted,
  },
  pickerActiveMark: {
    fontSize: 24,
    color: colors.secondary,
    lineHeight: 24,
  },
});
