import { useCallback, useMemo, useRef, useState } from 'react';
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
import { useRouter, useFocusEffect } from 'expo-router';
import {
  getMealCompanions,
  getMeals,
  getPeopleProfiles,
  saveMeal,
  setMealCompanions,
} from '../../src/storage';
import {
  DEFAULT_COMPANIONSHIP_TAGS,
  type MealCompanion,
  type MealEntry,
  type MealType,
  type PersonProfile,
} from '../../src/types';
import { colors, spacing, radii, type as T, shadow } from '../../src/theme';
import HeroIllustration from '../../src/components/HeroIllustration';
import DateStrip from '../../src/components/DateStrip';
import { MONTH_KEYS, getMonthLabel } from '../../src/utils/season';
import PeoplePickerSheet from '../../src/components/PeoplePickerSheet';
import PersonAvatar from '../../src/components/PersonAvatar';

// ── Helpers ─────────────────────────────────────────────────

/** YYYY-MM-DD from a Date. */
function toDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ── Category system ─────────────────────────────────────────

type Category = 'breakfast' | 'lunch' | 'dinner' | 'treats';

const CATEGORIES: { key: Category; label: string; types: MealType[] }[] = [
  { key: 'breakfast', label: 'Breakfast', types: ['breakfast'] },
  { key: 'lunch', label: 'Lunch', types: ['lunch'] },
  { key: 'dinner', label: 'Dinner', types: ['dinner'] },
  { key: 'treats', label: 'Treats', types: ['snack', 'treat'] },
];

const MOOD_LABELS: Record<string, string> = {
  peaceful: 'Peaceful',
  everyday: 'Everyday',
  nostalgic: 'Nostalgic',
  healing: 'Healing',
  heartfelt: 'Heartfelt',
  overwhelming: 'Overwhelming',
  celebratory: 'Celebratory',
};

const MEAL_TYPE_META: Record<MealType, { label: string; initial: string }> = {
  breakfast: { label: 'Breakfast', initial: 'B' },
  lunch: { label: 'Lunch', initial: 'L' },
  dinner: { label: 'Dinner', initial: 'D' },
  snack: { label: 'Treats', initial: 'T' },
  treat: { label: 'Treats', initial: 'T' },
};

const PEOPLE_TAG_LABELS = Object.fromEntries(
  DEFAULT_COMPANIONSHIP_TAGS.map((tag) => [tag.id, tag.label]),
) as Record<string, string>;

function getMealMoodLabel(meal: MealEntry): string | undefined {
  const moodTags = meal.moodTags.length > 0
    ? meal.moodTags
    : meal.moodTag
      ? [meal.moodTag]
      : [];

  if (moodTags.length === 0) return undefined;
  return moodTags.map((tag) => MOOD_LABELS[tag] ?? tag).join(' · ');
}

function getMealSubtitle(meal: MealEntry): string {
  return getMealMoodLabel(meal) ?? meal.location ?? meal.locationText ?? meal.time;
}

function getPeopleTagCounts(meals: MealEntry[]): { id: string; label: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const meal of meals) {
    for (const tag of meal.peopleTags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      count,
      label: PEOPLE_TAG_LABELS[id] ?? id,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// ── Meal Row ────────────────────────────────────────────────

function MealRow({ meal, onPress }: { meal: MealEntry; onPress: () => void }) {
  const subtitle = getMealSubtitle(meal);
  const title = meal.title || meal.note || MEAL_TYPE_META[meal.mealType].label;

  return (
    <Pressable
      style={({ pressed }) => [styles.mealRow, pressed && { opacity: 0.8 }]}
      onPress={onPress}
    >
      {meal.photoUri ? (
        <Image source={{ uri: meal.photoUri }} style={styles.mealThumb} />
      ) : (
        <View style={[styles.mealThumb, styles.mealThumbPlaceholder]}>
          <View style={styles.mealThumbPlate} />
          <Text style={styles.mealThumbInitial}>
            {MEAL_TYPE_META[meal.mealType].initial}
          </Text>
        </View>
      )}

      <View style={styles.mealTextWrap}>
        <Text style={styles.mealTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.mealSubtitle} numberOfLines={1}>{subtitle}</Text>
      </View>

      <Text style={styles.mealChevron}>›</Text>
    </Pressable>
  );
}

function EmptyMemoryState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <View style={styles.emptyMemory}>
      <Text style={styles.emptyMemoryTitle}>{title}</Text>
      <Text style={styles.emptyMemoryBody}>{body}</Text>
    </View>
  );
}

// ── Section switcher labels ─────────────────────────────────

const SWITCHER = ['Catering', 'People'] as const;

// ── Home Screen ─────────────────────────────────────────────

export default function HomeScreen() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [allMeals, setAllMeals] = useState<MealEntry[]>([]);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category>('breakfast');
  const [activeSwitcher, setActiveSwitcher] = useState(0);
  const [lowerY, setLowerY] = useState(0);
  const [updatingPeople, setUpdatingPeople] = useState<string | null>(null);
  const [mealCompanions, setMealCompanionsState] = useState<MealCompanion[]>([]);
  const [peopleProfiles, setPeopleProfiles] = useState<PersonProfile[]>([]);
  const [peoplePickerOpen, setPeoplePickerOpen] = useState(false);
  const [peoplePickerMealId, setPeoplePickerMealId] = useState<string | undefined>();

  const selectedKey = toDateKey(selectedDate);
  const monthIndex = selectedDate.getMonth();
  const monthLabel = getMonthLabel(monthIndex);
  const yearLabel = selectedDate.getFullYear();

  // Load all meals when screen focuses.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([getMeals(), getMealCompanions(), getPeopleProfiles()]).then(
        ([all, companions, profiles]) => {
          if (!active) return;
          setAllMeals(all);
          setMealCompanionsState(companions);
          setPeopleProfiles(profiles);
        },
      );
      return () => { active = false; };
    }, [])
  );

  // All meals for the day (for category counts).
  const dayMeals = useMemo(
    () => allMeals.filter((m) => m.date === selectedKey),
    [allMeals, selectedKey],
  );

  const mealGroups = useMemo(() => {
    const groups = CATEGORIES.map((cat) => ({
      ...cat,
      meals: dayMeals
        .filter((m) => cat.types.includes(m.mealType))
        .sort((a, b) => a.time.localeCompare(b.time)),
    }));
    const active = groups.find((group) => group.key === activeCategory);
    const rest = groups.filter((group) => group.key !== activeCategory);
    return active ? [active, ...rest] : groups;
  }, [activeCategory, dayMeals]);

  const peopleCounts = useMemo(
    () => getPeopleTagCounts(dayMeals),
    [dayMeals],
  );

  const peopleById = useMemo(
    () => new Map(peopleProfiles.map((person) => [person.id, person])),
    [peopleProfiles],
  );

  const companionMeal = dayMeals[0];
  const companionMealIds = useMemo(
    () => new Set(dayMeals.map((meal) => meal.id)),
    [dayMeals],
  );

  const dayCompanionIds = useMemo(
    () => [...new Set(
      mealCompanions
        .filter((companion) => companionMealIds.has(companion.mealId))
        .map((companion) => companion.personId),
    )],
    [companionMealIds, mealCompanions],
  );

  const dayCompanionPeople = useMemo(
    () => dayCompanionIds
      .map((personId) => peopleById.get(personId))
      .filter((person): person is PersonProfile => Boolean(person)),
    [dayCompanionIds, peopleById],
  );

  const selectedPickerPersonIds = useMemo(() => (
    peoplePickerMealId
      ? mealCompanions
        .filter((companion) => companion.mealId === peoplePickerMealId)
        .map((companion) => companion.personId)
      : []
  ), [mealCompanions, peoplePickerMealId]);

  const activePeopleTagIds = useMemo(
    () => new Set(peopleCounts.map((tag) => tag.id)),
    [peopleCounts],
  );

  const handleTodayPress = useCallback(() => {
    setSelectedDate(new Date());
  }, []);

  const handleMonthSelect = useCallback((monthIndex: number) => {
    const d = new Date(selectedDate);
    d.setMonth(monthIndex, 1);
    setSelectedDate(d);
    setMonthPickerOpen(false);
  }, [selectedDate]);

  const handlePlatePress = useCallback(() => {
    router.push('/add');
  }, [router]);

  const refreshPeopleData = useCallback(async () => {
    const [all, companions, profiles] = await Promise.all([
      getMeals(),
      getMealCompanions(),
      getPeopleProfiles(),
    ]);
    setAllMeals(all);
    setMealCompanionsState(companions);
    setPeopleProfiles(profiles);
  }, []);

  const handleChairPress = useCallback(() => {
    setPeoplePickerMealId(companionMeal?.id);
    setPeoplePickerOpen(true);
    setActiveSwitcher(1);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(lowerY - 22, 0),
        animated: true,
      });
    });
  }, [companionMeal?.id, lowerY]);

  const handleTogglePeopleTag = useCallback(async (tagId: string) => {
    if (dayMeals.length === 0 || updatingPeople) return;

    setUpdatingPeople(tagId);
    try {
      const nextIsActive = !activePeopleTagIds.has(tagId);
      const updatedMeals = dayMeals.map((meal) => {
        const current = new Set(meal.peopleTags);
        if (nextIsActive) {
          current.add(tagId);
        } else {
          current.delete(tagId);
        }

        return {
          ...meal,
          peopleTags: [...current],
        };
      });

      await Promise.all(updatedMeals.map((meal) => saveMeal(meal)));

      setAllMeals((currentMeals) => currentMeals.map((meal) => {
        const updated = updatedMeals.find((candidate) => candidate.id === meal.id);
        return updated ?? meal;
      }));
    } finally {
      setUpdatingPeople(null);
    }
  }, [activePeopleTagIds, dayMeals, updatingPeople]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Editorial top section ── */}
        <View style={styles.topSection}>
          <Text style={styles.introLine}>
            Keep a record of your meals every day
          </Text>
        </View>

        {/* ── Scrollable date strip ── */}
        <DateStrip
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onTodayPress={handleTodayPress}
        />

        {/* ── Month label ── */}
        <Pressable
          style={styles.monthRow}
          onPress={() => setMonthPickerOpen(true)}
          hitSlop={8}
        >
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <Text style={styles.monthChevron}> ▾</Text>
        </Pressable>

        {/* ── Hero illustration — month-aware, interactive ── */}
        <HeroIllustration
          monthIndex={monthIndex}
          onPlatePress={handlePlatePress}
          onChairPress={handleChairPress}
        />

        {/* ══════════════════════════════════════════════════════
            LOWER CONTENT — Below the hero
           ══════════════════════════════════════════════════════ */}
        <View
          style={styles.lower}
          onLayout={(event) => setLowerY(event.nativeEvent.layout.y)}
        >
          <View style={styles.sceneBridge}>
            <View style={styles.sceneBridgeLine} />
          </View>

          <View style={styles.editorialShell}>
            <View style={styles.categoryRail}>
              {CATEGORIES.map((cat) => {
                const isActive = cat.key === activeCategory;
                const count = dayMeals.filter((m) => cat.types.includes(m.mealType)).length;
                return (
                  <Pressable
                    key={cat.key}
                    style={styles.categoryTab}
                    onPress={() => setActiveCategory(cat.key)}
                  >
                    <Text style={[styles.categoryLabel, isActive && styles.categoryLabelActive]}>
                      {cat.label}
                    </Text>
                    <View style={styles.categoryTrack}>
                      <View
                        style={[
                          styles.categoryUnderline,
                          isActive && styles.categoryUnderlineActive,
                          count > 0 && !isActive && styles.categoryUnderlineHasMeals,
                        ]}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.switcherFrame}>
              {SWITCHER.map((label, i) => {
                const isActive = i === activeSwitcher;
                return (
                  <Pressable
                    key={label}
                    style={[styles.switcherPill, isActive && styles.switcherPillActive]}
                    onPress={() => setActiveSwitcher(i)}
                  >
                    <Text style={[styles.switcherIcon, isActive && styles.switcherIconActive]}>
                      {label === 'Catering' ? '◎' : '⌑'}
                    </Text>
                    <Text style={[styles.switcherText, isActive && styles.switcherTextActive]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.memoryPaper}>
            {activeSwitcher === 0 ? (
              dayMeals.length > 0 ? (
                mealGroups.map((group) => {
                  const showGroup = group.meals.length > 0 || group.key === activeCategory;
                  if (!showGroup) return null;

                  return (
                    <View key={group.key} style={styles.mealGroup}>
                      <Text style={styles.groupTitle}>{group.label}</Text>
                      {group.meals.length > 0 ? (
                        group.meals.map((meal, idx) => (
                          <View key={meal.id}>
                            {idx > 0 && <View style={styles.divider} />}
                            <MealRow
                              meal={meal}
                              onPress={() => router.push(`/meal/${meal.id}`)}
                            />
                          </View>
                        ))
                      ) : (
                        <Text style={styles.groupEmptyText}>
                          This part of the table is still quiet.
                        </Text>
                      )}
                    </View>
                  );
                })
              ) : (
                <EmptyMemoryState
                  title="No meals at this table yet"
                  body="When you save a meal for this date, it will settle here by breakfast, lunch, dinner, or treats."
                />
              )
            ) : (
              <View style={styles.peopleSection}>
                <View style={styles.peopleHeader}>
                  <Text style={styles.peopleEyebrow}>Today's table</Text>
                  <Text style={styles.peopleTitle}>Seats Around the Table</Text>
                  <Text style={styles.peopleIntro}>
                    A softer record of who shared the meal, and what kind of table it became.
                  </Text>
                </View>

                <View style={styles.realCompanionPanel}>
                  <View style={styles.realCompanionHeader}>
                    <View>
                      <Text style={styles.realCompanionTitle}>Meal companions</Text>
                      <Text style={styles.realCompanionMeta}>
                        {dayMeals.length > 0
                          ? 'Saved as reusable people profiles.'
                          : 'Save a meal first, then add people to its table.'}
                      </Text>
                    </View>
                    <Pressable
                      style={[
                        styles.realCompanionButton,
                        dayMeals.length === 0 && styles.realCompanionButtonDisabled,
                      ]}
                      onPress={() => {
                        setPeoplePickerMealId(companionMeal?.id);
                        setPeoplePickerOpen(true);
                      }}
                    >
                      <Text style={styles.realCompanionButtonText}>+ People</Text>
                    </Pressable>
                  </View>

                  {dayCompanionPeople.length > 0 ? (
                    <View style={styles.realCompanionList}>
                      {dayCompanionPeople.map((person) => (
                        <View key={person.id} style={styles.realCompanionItem}>
                          <PersonAvatar person={person} size={36} />
                          <View style={styles.realCompanionTextWrap}>
                            <Text style={styles.realCompanionName}>
                              {person.nickname ?? person.name}
                            </Text>
                            <Text style={styles.realCompanionRelationship}>
                              {person.relationship ?? 'At this table'}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.peoplePlaceholder}>
                      <Text style={styles.peoplePlaceholderTitle}>
                        No one has taken a seat yet.
                      </Text>
                      <Text style={styles.peoplePlaceholderBody}>
                        Add someone the next time you share a meal.
                      </Text>
                    </View>
                  )}
                </View>

                {peopleCounts.length > 0 ? (
                  <View style={styles.peopleTagList}>
                    {peopleCounts.map((tag) => (
                      <View key={tag.id} style={styles.peopleTagRow}>
                        <View style={styles.seatMark}>
                          <View style={styles.seatMarkBack} />
                          <View style={styles.seatMarkBase} />
                        </View>
                        <View style={styles.peopleTagTextWrap}>
                          <Text style={styles.peopleTagLabel}>{tag.label}</Text>
                          <Text style={styles.peopleTagMeta}>
                            {tag.count === 1 ? '1 meal remembered' : `${tag.count} meals remembered`}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.peoplePlaceholder}>
                    <Text style={styles.peoplePlaceholderTitle}>
                      This table has not named its seats yet.
                    </Text>
                    <Text style={styles.peoplePlaceholderBody}>
                      {dayMeals.length > 0
                        ? 'Choose the companionship that best fits this date.'
                        : 'Log a meal first, then return here to remember who was around the table.'}
                    </Text>
                  </View>
                )}

                <Text style={styles.companionshipLabel}>Companionship</Text>
                <View style={styles.companionshipGrid}>
                  {DEFAULT_COMPANIONSHIP_TAGS.map((tag) => {
                    const active = activePeopleTagIds.has(tag.id);
                    const disabled = dayMeals.length === 0 || updatingPeople !== null;
                    return (
                      <Pressable
                        key={tag.id}
                        disabled={disabled}
                        onPress={() => handleTogglePeopleTag(tag.id)}
                        style={({ pressed }) => [
                          styles.companionshipChip,
                          active && styles.companionshipChipActive,
                          disabled && styles.companionshipChipDisabled,
                          pressed && styles.companionshipChipPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.companionshipChipText,
                            active && styles.companionshipChipTextActive,
                          ]}
                        >
                          {tag.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* ── Month picker modal ── */}
      <Modal
        visible={monthPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMonthPickerOpen(false)}
      >
        <Pressable
          style={styles.pickerOverlay}
          onPress={() => setMonthPickerOpen(false)}
        >
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>{yearLabel}</Text>
            <View style={styles.pickerGrid}>
              {MONTH_KEYS.map((monthKey, i) => {
                const name = getMonthLabel(monthKey);
                const isCurrent = i === selectedDate.getMonth();
                return (
                  <Pressable
                    key={name}
                    style={[styles.pickerItem, isCurrent && styles.pickerItemActive]}
                    onPress={() => handleMonthSelect(i)}
                  >
                    <Text
                      style={[
                        styles.pickerItemText,
                        isCurrent && styles.pickerItemTextActive,
                      ]}
                    >
                      {name.slice(0, 3)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>

      <PeoplePickerSheet
        visible={peoplePickerOpen}
        mealId={peoplePickerMealId}
        selectedPersonIds={selectedPickerPersonIds}
        onClose={() => setPeoplePickerOpen(false)}
        onSave={async (ids) => {
          if (!peoplePickerMealId) return;
          await setMealCompanions(peoplePickerMealId, ids);
          await refreshPeopleData();
        }}
        onChanged={refreshPeopleData}
      />

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
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },

  /* ── Editorial top section ── */
  topSection: {
    paddingHorizontal: 20,
    paddingTop: 34,
    paddingBottom: 8,
  },
  introLine: {
    fontSize: 12,
    color: colors.muted,
    letterSpacing: 0.4,
  },

  /* ── Month label — atmospheric scene context ── */
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 24,
    paddingTop: 14,
    paddingBottom: 4,
  },
  monthLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.secondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  monthChevron: {
    fontSize: 9,
    color: colors.muted,
  },

  /* ── Month picker modal ── */
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerSheet: {
    backgroundColor: colors.background,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    width: 280,
    ...shadow.card,
  },
  pickerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  pickerItem: {
    width: 72,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  pickerItemActive: {
    backgroundColor: colors.accent,
  },
  pickerItemText: {
    fontSize: 13,
    color: colors.secondary,
    letterSpacing: 0.2,
  },
  pickerItemTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },

  /* ── Lower content area ── */
  lower: {
    paddingHorizontal: 22,
    paddingBottom: 38,
    marginTop: -28,
  },
  sceneBridge: {
    height: 34,
    alignItems: 'center',
    justifyContent: 'flex-end',
    opacity: 0.72,
  },
  sceneBridgeLine: {
    width: 86,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(185, 165, 138, 0.34)',
    marginBottom: 12,
  },
  editorialShell: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(185, 165, 138, 0.36)',
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 25,
    paddingBottom: 27,
    backgroundColor: 'rgba(255, 253, 248, 0.26)',
  },
  categoryRail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 14,
  },
  categoryTab: {
    flex: 1,
    minWidth: 0,
  },
  categoryLabel: {
    fontSize: 15.5,
    fontStyle: 'italic',
    color: colors.muted,
    marginBottom: 9,
  },
  categoryLabelActive: {
    color: colors.secondary,
  },
  categoryTrack: {
    height: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(234, 223, 204, 0.24)',
    overflow: 'hidden',
  },
  categoryUnderline: {
    height: '100%',
    width: '28%',
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  categoryUnderlineActive: {
    width: '100%',
    backgroundColor: 'rgba(180, 145, 88, 0.9)',
  },
  categoryUnderlineHasMeals: {
    backgroundColor: 'rgba(180, 145, 88, 0.28)',
  },

  /* ── Catering / People switcher ── */
  switcherFrame: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 31,
  },
  switcherPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    minHeight: 45,
    borderRadius: 23,
    backgroundColor: 'rgba(234, 223, 204, 0.42)',
  },
  switcherPillActive: {
    backgroundColor: 'rgba(176, 163, 145, 0.92)',
    ...shadow.soft,
  },
  switcherIcon: {
    fontSize: 17,
    color: colors.muted,
    marginTop: -1,
  },
  switcherIconActive: {
    color: colors.surface,
  },
  switcherText: {
    fontSize: 19,
    fontStyle: 'italic',
    color: colors.muted,
  },
  switcherTextActive: {
    color: colors.surface,
  },

  /* ── Memory paper ── */
  memoryPaper: {
    marginTop: 23,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(185, 165, 138, 0.32)',
    borderRadius: 18,
    paddingHorizontal: 21,
    paddingTop: 25,
    paddingBottom: 22,
    backgroundColor: 'rgba(255, 253, 248, 0.3)',
    minHeight: 278,
  },
  mealGroup: {
    paddingBottom: 22,
  },
  groupTitle: {
    fontSize: 21.5,
    lineHeight: 28,
    fontStyle: 'italic',
    color: colors.primary,
    marginBottom: 11,
  },
  groupEmptyText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    paddingBottom: 4,
  },

  /* ── Meal row ── */
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  mealThumb: {
    width: 56,
    height: 56,
    borderRadius: 9,
  },
  mealThumbPlaceholder: {
    backgroundColor: 'rgba(248, 232, 212, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(185, 165, 138, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealThumbPlate: {
    position: 'absolute',
    width: 32,
    height: 21,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(92, 64, 51, 0.22)',
  },
  mealThumbInitial: {
    fontSize: 12,
    fontStyle: 'italic',
    color: colors.secondary,
  },
  mealTextWrap: {
    flex: 1,
    marginLeft: 15,
    minWidth: 0,
  },
  mealTitle: {
    fontSize: 19.5,
    lineHeight: 25,
    fontStyle: 'italic',
    color: '#B49158',
  },
  mealSubtitle: {
    fontSize: 15.5,
    lineHeight: 21,
    color: colors.mutedText,
  },
  mealChevron: {
    fontSize: 28,
    fontWeight: '200',
    color: 'rgba(185, 165, 138, 0.34)',
    marginLeft: 12,
    marginRight: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(185, 165, 138, 0.22)',
    marginLeft: 72,
    marginVertical: 7,
  },

  /* ── People section ── */
  peopleSection: {
    paddingBottom: 2,
  },
  peopleHeader: {
    marginBottom: 18,
  },
  peopleEyebrow: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 7,
  },
  peopleTitle: {
    fontSize: 23,
    lineHeight: 30,
    fontStyle: 'italic',
    color: colors.primary,
    marginBottom: 6,
  },
  peopleIntro: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    maxWidth: 280,
  },
  realCompanionPanel: {
    borderRadius: 17,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 20,
    backgroundColor: 'rgba(255, 253, 248, 0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.2)',
  },
  realCompanionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  realCompanionTitle: {
    fontSize: 17,
    lineHeight: 22,
    color: colors.primary,
    fontStyle: 'italic',
  },
  realCompanionMeta: {
    marginTop: 3,
    fontSize: 12,
    color: colors.mutedText,
  },
  realCompanionButton: {
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: 'rgba(180, 145, 88, 0.16)',
  },
  realCompanionButtonDisabled: {
    opacity: 0.54,
  },
  realCompanionButtonText: {
    fontSize: 12,
    color: colors.secondary,
    fontStyle: 'italic',
  },
  realCompanionList: {
    gap: 8,
  },
  realCompanionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.32)',
  },
  realCompanionTextWrap: {
    flex: 1,
  },
  realCompanionName: {
    fontSize: 15,
    color: colors.primary,
    fontStyle: 'italic',
  },
  realCompanionRelationship: {
    marginTop: 2,
    fontSize: 11,
    color: colors.muted,
  },
  peopleTagList: {
    gap: 11,
    marginBottom: 24,
  },
  peopleTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.34)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.18)',
  },
  seatMark: {
    width: 38,
    height: 38,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatMarkBack: {
    width: 22,
    height: 20,
    borderWidth: 1.2,
    borderColor: colors.secondary,
    borderRadius: 7,
    transform: [{ rotate: '-4deg' }],
  },
  seatMarkBase: {
    width: 26,
    height: 9,
    borderBottomWidth: 1.2,
    borderLeftWidth: 1.2,
    borderRightWidth: 1.2,
    borderColor: colors.secondary,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    marginTop: -2,
  },
  peopleTagTextWrap: {
    flex: 1,
  },
  peopleTagLabel: {
    fontSize: 16.5,
    fontStyle: 'italic',
    color: colors.primary,
  },
  peopleTagMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  peoplePlaceholder: {
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.18)',
  },
  peoplePlaceholderTitle: {
    fontSize: 16,
    fontStyle: 'italic',
    color: colors.primary,
    marginBottom: 6,
  },
  peoplePlaceholderBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  companionshipLabel: {
    fontSize: 13,
    color: colors.secondary,
    marginBottom: 10,
  },
  companionshipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  companionshipChip: {
    borderRadius: 14,
    backgroundColor: 'rgba(248, 232, 212, 0.34)',
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.18)',
  },
  companionshipChipActive: {
    backgroundColor: 'rgba(180, 145, 88, 0.2)',
    borderColor: 'rgba(180, 145, 88, 0.42)',
  },
  companionshipChipDisabled: {
    opacity: 0.52,
  },
  companionshipChipPressed: {
    opacity: 0.7,
  },
  companionshipChipText: {
    fontSize: 12,
    color: colors.muted,
  },
  companionshipChipTextActive: {
    color: colors.secondary,
  },

  /* ── Empty state ── */
  emptyMemory: {
    alignItems: 'flex-start',
    paddingVertical: 22,
    paddingRight: 12,
  },
  emptyMemoryTitle: {
    fontSize: 19,
    lineHeight: 25,
    fontStyle: 'italic',
    color: colors.primary,
    marginBottom: 8,
  },
  emptyMemoryBody: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
  },
});
