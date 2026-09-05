import { useCallback, useMemo, useState } from 'react';
import {
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { getMealCompanions, getMeals, getPeopleProfiles } from '../../src/storage';
import { generateWarmMonthlyReport } from '../../src/insights/monthlyReport';
import {
  DEFAULT_COMPANIONSHIP_TAGS,
  type MealCompanion,
  type MealEntry,
  type MealType,
  type MoodTag,
  type PersonProfile,
} from '../../src/types';
import { colors, shadow } from '../../src/theme';
import { getHeroAssetForMonth } from '../../src/utils/heroAssets';

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

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack', 'treat'];

const TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Treats',
  treat: 'Treats',
};

const MOOD_TAGS: MoodTag[] = [
  'peaceful',
  'everyday',
  'nostalgic',
  'healing',
  'heartfelt',
  'overwhelming',
  'celebratory',
];

const MOOD_LABELS: Record<MoodTag, string> = {
  peaceful: 'Peaceful',
  everyday: 'Everyday',
  nostalgic: 'Nostalgic',
  healing: 'Healing',
  heartfelt: 'Heartfelt',
  overwhelming: 'Overwhelming',
  celebratory: 'Celebratory',
};

const PEOPLE_LABELS = Object.fromEntries(
  DEFAULT_COMPANIONSHIP_TAGS.map((tag) => [tag.id, tag.label]),
) as Record<string, string>;

// ── Monthly summary ─────────────────────────────────────────

type CountRow = {
  id: string;
  label: string;
  count: number;
};

type MonthlyReflection = {
  monthKey: string;
  monthIndex: number;
  monthLabel: string;
  meals: MealEntry[];
  totalMeals: number;
  daysWithMeals: number;
  mealsByType: CountRow[];
  moods: CountRow[];
  companionship: CountRow[];
  namedPeople: CountRow[];
  noteFragments: string[];
  reflection: string;
};

function formatMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function getMonthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function getMonthIndexFromKey(key: string): number {
  return Math.max(0, Math.min(11, Number(key.slice(5, 7)) - 1));
}

function getMoodTags(meal: MealEntry): MoodTag[] {
  if (meal.moodTags.length > 0) return meal.moodTags;
  return meal.moodTag ? [meal.moodTag] : [];
}

function countRows<T extends string>(
  ids: T[],
  labels: Record<T, string>,
  values: T[],
): CountRow[] {
  const counts = Object.fromEntries(ids.map((id) => [id, 0])) as Record<T, number>;

  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }

  return ids
    .map((id) => ({
      id,
      label: labels[id],
      count: counts[id] ?? 0,
    }))
    .filter((row) => row.count > 0);
}

function getRecentMonthKey(meals: MealEntry[]): string {
  const current = formatMonthKey(new Date());
  if (meals.some((meal) => getMonthKey(meal.date) === current)) return current;

  const sortedKeys = [...new Set(meals.map((meal) => getMonthKey(meal.date)))]
    .sort((a, b) => b.localeCompare(a));
  return sortedKeys[0] ?? current;
}

function countNamedPeople(
  mealIds: Set<string>,
  companions: MealCompanion[],
  people: PersonProfile[],
): CountRow[] {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const counts = new Map<string, { label: string; count: number }>();

  for (const companion of companions) {
    if (!mealIds.has(companion.mealId)) continue;
    const person = peopleById.get(companion.personId);
    const label = person?.nickname ?? person?.name ?? companion.personNameSnapshot;
    if (!label) continue;
    const current = counts.get(companion.personId);
    counts.set(companion.personId, {
      label,
      count: (current?.count ?? 0) + 1,
    });
  }

  return [...counts.entries()]
    .map(([id, value]) => ({ id, label: value.label, count: value.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function makeReflection(summary: Omit<MonthlyReflection, 'reflection'>): string {
  if (summary.totalMeals === 0) {
    return 'This month is still a quiet table, waiting for its first meal memory.';
  }

  const topMood = summary.moods[0]?.label.toLowerCase();
  const topPerson = summary.namedPeople[0]?.label;
  const topCompanion = summary.companionship[0]?.label.toLowerCase();

  if (topMood && topPerson) {
    return `This month leaned ${topMood}, and ${topPerson} became part of the table's rhythm.`;
  }

  if (topMood && topCompanion) {
    return `This month leaned ${topMood}, with meals often held by ${topCompanion}.`;
  }

  if (topMood) {
    return `This month carried a ${topMood} feeling through the meals you kept.`;
  }

  if (topPerson) {
    return `${topPerson} had a remembered seat at the table this month.`;
  }

  if (topCompanion) {
    return 'This month remembered not only what was served, but who the table made room for.';
  }

  return `This month kept ${summary.totalMeals} meal ${summary.totalMeals === 1 ? 'memory' : 'memories'} across ${summary.daysWithMeals} ${summary.daysWithMeals === 1 ? 'day' : 'days'}.`;
}

function buildMonthlyReflection(
  meals: MealEntry[],
  companions: MealCompanion[],
  people: PersonProfile[],
): MonthlyReflection {
  const monthKey = getRecentMonthKey(meals);
  const monthMeals = meals
    .filter((meal) => getMonthKey(meal.date) === monthKey)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const monthMealIds = new Set(monthMeals.map((meal) => meal.id));
  const daysWithMeals = new Set(monthMeals.map((meal) => meal.date)).size;
  const mealsByType = countRows(
    MEAL_TYPES,
    TYPE_LABELS,
    monthMeals.map((meal) => meal.mealType),
  );
  const moods = countRows(
    MOOD_TAGS,
    MOOD_LABELS,
    monthMeals.flatMap(getMoodTags),
  ).sort((a, b) => b.count - a.count);

  const peopleIds = DEFAULT_COMPANIONSHIP_TAGS.map((tag) => tag.id);
  const companionship = countRows(
    peopleIds,
    PEOPLE_LABELS,
    monthMeals.flatMap((meal) => meal.peopleTags),
  ).sort((a, b) => b.count - a.count);
  const namedPeople = countNamedPeople(monthMealIds, companions, people);

  const noteFragments = monthMeals
    .map((meal) => meal.note?.trim())
    .filter((note): note is string => Boolean(note))
    .slice(-3);

  const base = {
    monthKey,
    monthIndex: getMonthIndexFromKey(monthKey),
    monthLabel: getMonthLabel(monthKey),
    meals: monthMeals,
    totalMeals: monthMeals.length,
    daysWithMeals,
    mealsByType,
    moods,
    companionship,
    namedPeople,
    noteFragments,
  };

  return {
    ...base,
    reflection: makeReflection(base),
  };
}

// ── Components ──────────────────────────────────────────────

function ReflectionSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SoftBar({
  row,
  max,
}: {
  row: CountRow;
  max: number;
}) {
  const width: DimensionValue =
    max > 0 ? `${Math.max(12, (row.count / max) * 100)}%` : '12%';

  return (
    <View style={styles.barRow}>
      <View style={styles.barLabelWrap}>
        <Text style={styles.barLabel}>{row.label}</Text>
        <Text style={styles.barCount}>{row.count}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width }]} />
      </View>
    </View>
  );
}

function ChairRow({ row }: { row: CountRow }) {
  return (
    <View style={styles.chairRow}>
      <View style={styles.chairGlyph}>
        <View style={styles.chairBack} />
        <View style={styles.chairSeat} />
      </View>
      <View style={styles.chairTextWrap}>
        <Text style={styles.chairLabel}>{row.label}</Text>
        <Text style={styles.chairMeta}>
          {row.count === 1 ? '1 meal remembered' : `${row.count} meals remembered`}
        </Text>
      </View>
    </View>
  );
}

function EmptyReflection() {
  return (
    <View style={styles.emptyPaper}>
      <Text style={styles.emptyTitle}>The table is quiet this month.</Text>
      <Text style={styles.emptyBody}>
        Once a few meals are saved, this page will gather the month into soft patterns.
      </Text>
    </View>
  );
}

// ── Insights Screen ─────────────────────────────────────────

export default function InsightsScreen() {
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [companions, setCompanions] = useState<MealCompanion[]>([]);
  const [people, setPeople] = useState<PersonProfile[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([getMeals(), getMealCompanions(), getPeopleProfiles({ includeDeleted: true })])
        .then(([allMeals, allCompanions, allPeople]) => {
          if (!active) return;
          setMeals(allMeals);
          setCompanions(allCompanions);
          setPeople(allPeople);
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const reflection = useMemo(
    () => buildMonthlyReflection(meals, companions, people),
    [companions, meals, people],
  );
  const warmReport = useMemo(
    () => generateWarmMonthlyReport({
      monthKey: reflection.monthKey,
      monthLabel: reflection.monthLabel,
      meals: reflection.meals,
      companions,
      people,
    }),
    [companions, people, reflection.meals, reflection.monthKey, reflection.monthLabel],
  );
  const heroImage = useMemo(
    () => getHeroAssetForMonth(reflection.monthIndex),
    [reflection.monthIndex],
  );
  const maxType = Math.max(...reflection.mealsByType.map((row) => row.count), 0);
  const maxMood = Math.max(...reflection.moods.map((row) => row.count), 0);
  const hasMeals = reflection.totalMeals > 0;
  const seatingRows = reflection.namedPeople.length > 0
    ? reflection.namedPeople
    : reflection.companionship;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.kicker}>Monthly reflection</Text>
          <Text style={styles.title}>{reflection.monthLabel}</Text>
          <Text style={styles.subtitle}>
            A gentle reading of what gathered around your table.
          </Text>
        </View>

        <ImageBackground
          source={heroImage}
          style={styles.reportCard}
          imageStyle={styles.reportArtwork}
          resizeMode="cover"
        >
          <View style={styles.reportTint} />
          <View style={styles.reportContent}>
            <Text style={styles.reportKicker}>Mealog gently noticed</Text>
            <Text style={styles.reportTitle}>{warmReport.title}</Text>
            <Text style={styles.reportSubtitle}>{warmReport.subtitle}</Text>
            <View style={styles.reportLines}>
              {warmReport.lines.map((line, index) => (
                <Text key={`${index}-${line}`} style={styles.reportLine}>
                  "{line}"
                </Text>
              ))}
            </View>
            <Text style={styles.reportClosing}>{warmReport.closing}</Text>
            <View style={styles.signalRow}>
              <Text style={styles.signalPill}>{warmReport.sourceSignals.mealCount} meals</Text>
              <Text style={styles.signalPill}>{warmReport.sourceSignals.photoCount} photos</Text>
              <Text style={styles.signalPill}>{warmReport.sourceSignals.noteCount} notes</Text>
            </View>
          </View>
        </ImageBackground>

        {hasMeals ? (
          <>
            <View style={styles.heroPaper}>
              <Text style={styles.heroQuote}>"{reflection.reflection}"</Text>
              <View style={styles.heroCounts}>
                <View style={styles.heroCountItem}>
                  <Text style={styles.heroCountNumber}>{reflection.totalMeals}</Text>
                  <Text style={styles.heroCountLabel}>
                    {reflection.totalMeals === 1 ? 'meal memory' : 'meal memories'}
                  </Text>
                </View>
                <View style={styles.heroDivider} />
                <View style={styles.heroCountItem}>
                  <Text style={styles.heroCountNumber}>{reflection.daysWithMeals}</Text>
                  <Text style={styles.heroCountLabel}>
                    {reflection.daysWithMeals === 1 ? 'day with meals' : 'days with meals'}
                  </Text>
                </View>
              </View>
            </View>

            <ReflectionSection title="How the table was set">
              <View style={styles.paper}>
                {reflection.mealsByType.map((row) => (
                  <SoftBar key={row.id} row={row} max={maxType} />
                ))}
              </View>
            </ReflectionSection>

            <ReflectionSection title="How meals felt">
              {reflection.moods.length > 0 ? (
                <View style={styles.paper}>
                  {reflection.moods.map((row) => (
                    <SoftBar key={row.id} row={row} max={maxMood} />
                  ))}
                </View>
              ) : (
                <View style={styles.paper}>
                  <Text style={styles.softEmpty}>
                    No emotion tags yet, but the month still has its own quiet weather.
                  </Text>
                </View>
              )}
            </ReflectionSection>

            <ReflectionSection title="Who the table made room for">
              {seatingRows.length > 0 ? (
                <View style={styles.peoplePaper}>
                  {seatingRows.map((row) => (
                    <ChairRow key={row.id} row={row} />
                  ))}
                </View>
              ) : (
                <View style={styles.peoplePaper}>
                  <Text style={styles.softEmpty}>
                    No seats were named this month yet.
                  </Text>
                </View>
              )}
            </ReflectionSection>

            <ReflectionSection title="Small notes that stayed">
              <View style={styles.notesPaper}>
                {reflection.noteFragments.length > 0 ? (
                  reflection.noteFragments.map((note, index) => (
                    <Text key={`${index}-${note}`} style={styles.noteLine}>
                      "{note}"
                    </Text>
                  ))
                ) : (
                  <Text style={styles.softEmpty}>
                    No written notes this month, just the meals themselves.
                  </Text>
                )}
              </View>
            </ReflectionSection>
          </>
        ) : (
          <EmptyReflection />
        )}
      </ScrollView>
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
    marginBottom: 20,
  },
  kicker: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 7,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    color: colors.primary,
    fontStyle: 'italic',
  },
  subtitle: {
    marginTop: 8,
    maxWidth: 310,
    fontSize: 14,
    lineHeight: 21,
    color: colors.mutedText,
  },
  reportCard: {
    minHeight: 390,
    overflow: 'hidden',
    borderRadius: 30,
    marginBottom: 24,
    backgroundColor: 'rgba(255, 253, 248, 0.86)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.28)',
    ...shadow.soft,
  },
  reportArtwork: {
    opacity: 0.14,
    transform: [{ scale: 1.22 }],
  },
  reportTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 248, 240, 0.74)',
  },
  reportContent: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
  },
  reportKicker: {
    fontSize: 11,
    color: colors.muted,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  reportTitle: {
    fontSize: 25,
    lineHeight: 31,
    color: colors.primary,
    fontStyle: 'italic',
  },
  reportSubtitle: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 18,
    color: colors.mutedText,
  },
  reportLines: {
    marginTop: 18,
    gap: 12,
  },
  reportLine: {
    fontSize: 17,
    lineHeight: 25,
    color: 'rgba(92, 64, 51, 0.86)',
    fontStyle: 'italic',
  },
  reportClosing: {
    marginTop: 18,
    fontSize: 13,
    lineHeight: 20,
    color: colors.secondary,
    fontStyle: 'italic',
  },
  signalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 17,
  },
  signalPill: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    fontSize: 11,
    color: colors.secondary,
    backgroundColor: 'rgba(255, 253, 248, 0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.28)',
  },
  heroPaper: {
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
    marginBottom: 28,
    backgroundColor: 'rgba(255, 253, 248, 0.72)',
    ...shadow.soft,
  },
  heroQuote: {
    fontSize: 22,
    lineHeight: 31,
    color: colors.primary,
    fontStyle: 'italic',
    marginBottom: 22,
  },
  heroCounts: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(185, 165, 138, 0.24)',
    paddingTop: 16,
  },
  heroCountItem: {
    flex: 1,
  },
  heroCountNumber: {
    fontSize: 27,
    lineHeight: 32,
    color: colors.secondary,
    fontStyle: 'italic',
  },
  heroCountLabel: {
    marginTop: 2,
    fontSize: 12,
    color: colors.mutedText,
  },
  heroDivider: {
    width: StyleSheet.hairlineWidth,
    height: 42,
    backgroundColor: 'rgba(185, 165, 138, 0.26)',
    marginHorizontal: 18,
  },
  section: {
    marginBottom: 27,
  },
  sectionTitle: {
    fontSize: 21,
    lineHeight: 28,
    color: colors.primary,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  paper: {
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 17,
    backgroundColor: 'rgba(255, 253, 248, 0.48)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(185, 165, 138, 0.28)',
  },
  barRow: {
    marginBottom: 15,
  },
  barLabelWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  barLabel: {
    fontSize: 14,
    color: colors.primary,
    fontStyle: 'italic',
  },
  barCount: {
    fontSize: 12,
    color: colors.muted,
  },
  barTrack: {
    height: 13,
    borderRadius: 13,
    overflow: 'hidden',
    backgroundColor: 'rgba(234, 223, 204, 0.32)',
  },
  barFill: {
    height: '100%',
    borderRadius: 13,
    backgroundColor: 'rgba(180, 145, 88, 0.74)',
  },
  peoplePaper: {
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: 'rgba(255, 253, 248, 0.48)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(185, 165, 138, 0.28)',
    gap: 10,
  },
  chairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: 'rgba(255, 255, 255, 0.34)',
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
  chairTextWrap: {
    flex: 1,
  },
  chairLabel: {
    fontSize: 15,
    color: colors.primary,
    fontStyle: 'italic',
  },
  chairMeta: {
    marginTop: 3,
    fontSize: 11,
    color: colors.muted,
  },
  notesPaper: {
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: 'rgba(255, 253, 248, 0.48)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(185, 165, 138, 0.28)',
  },
  noteLine: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.mutedText,
    fontStyle: 'italic',
    marginBottom: 10,
  },
  softEmpty: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    fontStyle: 'italic',
  },
  emptyPaper: {
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 30,
    backgroundColor: 'rgba(255, 253, 248, 0.62)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(185, 165, 138, 0.3)',
  },
  emptyTitle: {
    fontSize: 23,
    lineHeight: 30,
    color: colors.primary,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.mutedText,
  },
});
