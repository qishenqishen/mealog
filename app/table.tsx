import { useI18n, translate } from '../src/i18n';
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
import { useRouter, useFocusEffect } from 'expo-router';
import {
  getMealCompanions,
  getMeals,
  getPeopleProfiles,
} from '../src/storage';
import {
  DEFAULT_COMPANIONSHIP_TAGS,
  type MealCompanion,
  type MealEntry,
  type MealType,
  type PersonProfile,
} from '../src/types';
import { colors, shadow } from '../src/theme';
import HeroIllustration from '../src/components/HeroIllustration';
import DateStrip from '../src/components/DateStrip';
import { MONTH_KEYS, getMonthLabel } from '../src/utils/season';
import { getHeroAssetForMonth } from '../src/utils/heroAssets';
import { peopleForScope } from '../src/utils/people';
import CreatePersonModal from '../src/components/CreatePersonModal';
import PersonAvatar from '../src/components/PersonAvatar';
import LoadState from '../src/components/LoadState';
import { TabIcon } from '../src/components/TabIcon';

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
  return moodTags.map((tag) => translate(MOOD_LABELS[tag] ?? tag)).join(' · ');
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
  const { t } = useI18n();
  const subtitle = getMealSubtitle(meal);
  const title = meal.title || meal.note || t(MEAL_TYPE_META[meal.mealType].label);

  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [styles.mealRow, pressed && { opacity: 0.8 }]}
      onPress={onPress}
    >
      {meal.photoUri ? (
        <Image source={{ uri: meal.photoUri }} style={styles.mealThumb} />
      ) : (
        <View style={[styles.mealThumb, styles.mealThumbPlaceholder]}>
          <View style={styles.mealThumbPlate} />
          <Text style={styles.mealThumbInitial}>
            {t(MEAL_TYPE_META[meal.mealType].initial)}
          </Text>
        </View>
      )}

      <View style={styles.mealTextWrap}>
        <Text style={styles.mealTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.mealSubtitle} numberOfLines={1}>
          {meal.origin === 'sample' ? `${t('Sample memory')} · ` : ''}{subtitle}
        </Text>
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
  const { t, locale } = useI18n();
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [allMeals, setAllMeals] = useState<MealEntry[]>([]);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [sceneExpanded, setSceneExpanded] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category>('breakfast');
  const [activeSwitcher, setActiveSwitcher] = useState(0);
  const [mealCompanions, setMealCompanionsState] = useState<MealCompanion[]>([]);
  const [peopleProfiles, setPeopleProfiles] = useState<PersonProfile[]>([]);
  const [createPersonOpen, setCreatePersonOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [reloadToken, setReloadToken] = useState(0);

  const selectedKey = toDateKey(selectedDate);
  const monthIndex = selectedDate.getMonth();
  const monthLabel = t(getMonthLabel(monthIndex));
  const yearLabel = selectedDate.getFullYear();

  // Load all meals when screen focuses.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setError(undefined);
      Promise.all([getMeals(), getMealCompanions(), getPeopleProfiles()]).then(
        ([all, companions, profiles]) => {
          if (!active) return;
          setAllMeals(all);
          setMealCompanionsState(companions);
          setPeopleProfiles(profiles);
        },
      ).catch(() => {
        if (active) setError('Could not load your meals.');
      }).finally(() => {
        if (active) setLoading(false);
      });
      return () => { active = false; };
    }, [reloadToken])
  );

  // All meals for the day (for category counts).
  const dayMeals = useMemo(
    () => allMeals.filter((m) => m.date === selectedKey),
    [allMeals, selectedKey],
  );

  const latestMeal = useMemo(() => {
    const personalMeals = allMeals.filter((meal) => meal.origin !== 'sample');
    return [...(personalMeals.length > 0 ? personalMeals : allMeals)]
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))[0];
  }, [allMeals]);

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
    () => getPeopleTagCounts(dayMeals.filter((meal) => meal.origin !== 'sample')),
    [dayMeals],
  );

  const peopleById = useMemo(
    () => new Map(peopleProfiles.map((person) => [person.id, person])),
    [peopleProfiles],
  );

  const personalPeople = useMemo(
    () => peopleForScope(peopleProfiles, allMeals, mealCompanions, 'personal'),
    [allMeals, mealCompanions, peopleProfiles],
  );

  const companionMealIds = useMemo(
    () => new Set(dayMeals.filter((meal) => meal.origin !== 'sample').map((meal) => meal.id)),
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

  const handleChairPress = useCallback(() => {
    setCreatePersonOpen(true);
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Editorial top section ── */}
        <View style={styles.topSection}>
          <View style={styles.headerRow}>
            <Text style={styles.wordmark}>Mealog</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Your table & settings')}
              onPress={() => router.push('/profile')}
              style={({ pressed }) => [styles.profileButton, pressed && { opacity: 0.65 }]}
            >
              <TabIcon name="profile" focused />
            </Pressable>
          </View>
          <Text style={styles.introLine}>
            {locale === 'zh' ? '留住食物，也留住同桌的人。' : 'Remember the meal, and the people around it.'}
          </Text>
        </View>

        <LoadState loading={loading} error={error} onRetry={() => setReloadToken((value) => value + 1)} />

        <View style={styles.seasonPreview}>
          <View style={styles.seasonCopy}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Choose a month')}
              style={styles.monthRow}
              onPress={() => setMonthPickerOpen(true)}
            >
              <Text style={styles.monthLabel}>{yearLabel} · {monthLabel}</Text>
              <Text style={styles.monthChevron}> ▾</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: sceneExpanded }}
              onPress={() => setSceneExpanded((expanded) => !expanded)}
              style={styles.sceneToggle}
            >
              <Text style={styles.sceneToggleText}>
                {locale === 'zh' ? (sceneExpanded ? '收起餐桌插画 ↑' : '展开本月餐桌 ↓') : (sceneExpanded ? 'Fold away the table ↑' : 'Open this month’s table ↓')}
              </Text>
            </Pressable>
          </View>
          <Image source={getHeroAssetForMonth(monthIndex)} style={styles.seasonImage} resizeMode="contain" />
        </View>

        <View style={styles.tableActions}>
          <Pressable accessibilityRole="button" onPress={handlePlatePress} style={({ pressed }) => [styles.tableAction, styles.recordButton, pressed && { opacity: 0.8 }]}>
            <View style={styles.recordPlate}><View style={styles.recordPlateInner}><Text style={styles.recordPlus}>＋</Text></View></View>
            <View style={styles.actionCopy}>
              <Text style={styles.recordButtonText}>{locale === 'zh' ? '记下一餐' : 'Save a meal'}</Text>
              <Text style={styles.recordButtonHint}>{locale === 'zh' ? '食物与当下' : 'A moment to keep'}</Text>
            </View>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={locale === 'zh' ? '加一把椅子，添加同桌人' : 'Add a chair, save a person'} onPress={handleChairPress} style={({ pressed }) => [styles.tableAction, styles.chairButton, pressed && { opacity: 0.8 }]}>
            <Image source={require('../assets/keepsakes/pastel-v1/people-pulled-chair.png')} style={styles.chairArt} resizeMode="contain" />
            <View style={styles.actionCopy}>
              <Text style={styles.chairButtonText}>{locale === 'zh' ? '加一把椅子' : 'Add a chair'}</Text>
              <Text style={styles.chairButtonHint}>{locale === 'zh' ? '添加同桌人' : 'Save a person'}</Text>
            </View>
          </Pressable>
        </View>

        {sceneExpanded ? (
          <HeroIllustration
            monthIndex={monthIndex}
            onPlatePress={handlePlatePress}
            onChairPress={handleChairPress}
          />
        ) : null}

        {!loading && !error ? (
          <View style={styles.savedPeople}>
            <View style={styles.savedPeopleHeader}>
              <Text style={styles.savedPeopleTitle}>{locale === 'zh' ? '同桌的人' : 'People at your table'}</Text>
              <Pressable accessibilityRole="button" onPress={() => router.push('/people')} style={styles.peopleAllButton}>
                <Text style={styles.peopleAllText}>{locale === 'zh' ? '查看全部 ›' : 'View all ›'}</Text>
              </Pressable>
            </View>
            {personalPeople.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedPeopleStrip}>
                {personalPeople.slice(0, 6).map((person) => (
                  <Pressable key={person.id} accessibilityRole="button" accessibilityLabel={locale === 'zh' ? `我和${person.nickname ?? person.name}的餐桌` : `Your table with ${person.nickname ?? person.name}`} onPress={() => router.push(`/people/${person.id}`)} style={styles.savedPerson}>
                    <PersonAvatar person={person} size={44} />
                    <Text numberOfLines={1} style={styles.savedPersonName}>{person.nickname ?? person.name}</Text>
                  </Pressable>
                ))}
                <Pressable accessibilityRole="button" accessibilityLabel={locale === 'zh' ? '添加同桌人' : 'Save a person'} onPress={handleChairPress} style={styles.savedPerson}>
                  <View style={styles.emptySeat}><Text style={styles.emptySeatPlus}>＋</Text></View>
                  <Text style={styles.savedPersonName}>{locale === 'zh' ? '留个位置' : 'Add a seat'}</Text>
                </Pressable>
              </ScrollView>
            ) : (
              <Pressable accessibilityRole="button" onPress={handleChairPress} style={styles.firstSeat}>
                <Text style={styles.firstSeatText}>{locale === 'zh' ? '给想记住的人留个位置，写下称呼就好。' : 'Give someone a seat. A name is enough.'}</Text>
                <Text style={styles.peopleAllText}>＋</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {!loading && !error && latestMeal ? (
          <View style={styles.recentMemory}>
            <View style={styles.recentHeading}>
              <Text style={styles.recentLabel}>
                {latestMeal.origin === 'sample' ? t('Sample memory') : locale === 'zh' ? '最近留住的一餐' : 'Your latest meal'}
              </Text>
              <Text style={styles.recentDate}>{latestMeal.date}</Text>
            </View>
            <MealRow meal={latestMeal} onPress={() => router.push(`/meal/${latestMeal.id}`)} />
            {latestMeal.note ? <Text numberOfLines={2} style={styles.recentNote}>{latestMeal.note}</Text> : null}
          </View>
        ) : null}

        <DateStrip
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onTodayPress={handleTodayPress}
        />

        {/* ══════════════════════════════════════════════════════
            LOWER CONTENT — Below the hero
           ══════════════════════════════════════════════════════ */}
        <View style={styles.lower}>
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
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                    key={cat.key}
                    style={[styles.categoryTab, cat.key === 'breakfast' && { flex: 1.3 }]}
                    onPress={() => setActiveCategory(cat.key)}
                  >
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.categoryLabel, isActive && styles.categoryLabelActive]}>
                      {t(cat.label)}
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
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isActive }}
                    key={label}
                    style={[styles.switcherPill, isActive && styles.switcherPillActive]}
                    onPress={() => setActiveSwitcher(i)}
                  >
                    <Text style={[styles.switcherIcon, isActive && styles.switcherIconActive]}>
                      {label === 'Catering' ? '◎' : '⌑'}
                    </Text>
                    <Text style={[styles.switcherText, isActive && styles.switcherTextActive]}>
                      {t(label)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.memoryPaper}>
            {loading || error ? null : activeSwitcher === 0 ? (
              dayMeals.length > 0 ? (
                mealGroups.map((group) => {
                  const showGroup = group.meals.length > 0 || group.key === activeCategory;
                  if (!showGroup) return null;

                  return (
                    <View key={group.key} style={styles.mealGroup}>
                      <Text style={styles.groupTitle}>{t(group.label)}</Text>
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
                          {t("This part of the table is still quiet.")}</Text>
                      )}
                    </View>
                  );
                })
              ) : (
                <EmptyMemoryState
                  title={t("No meals at this table yet")}
                  body={t("When you save a meal for this date, it will settle here by breakfast, lunch, dinner, or treats.")}
                />
              )
            ) : (
              <View style={styles.peopleSection}>
                <View style={styles.peopleHeader}>
                  <Text style={styles.peopleEyebrow}>{selectedKey}</Text>
                  <Text style={styles.peopleTitle}>{locale === 'zh' ? '这天，同桌的人' : 'People at this day’s table'}</Text>
                  <Text style={styles.peopleIntro}>
                    {locale === 'zh' ? '从个人餐食里，找回一起留下的片段。' : 'Find shared moments in your own meal memories.'}
                  </Text>
                </View>

                <View style={styles.realCompanionPanel}>
                  <View style={styles.realCompanionHeader}>
                    <Text style={styles.realCompanionTitle}>{t("Meal companions")}</Text>
                    <Pressable accessibilityRole="button" style={styles.realCompanionButton} onPress={() => router.push('/people')}>
                      <Text style={styles.realCompanionButtonText}>{locale === 'zh' ? '所有同桌人 ›' : 'All people ›'}</Text>
                    </Pressable>
                  </View>
                  {dayCompanionPeople.length > 0 ? (
                    <View style={styles.realCompanionList}>
                      {dayCompanionPeople.map((person) => (
                        <Pressable key={person.id} accessibilityRole="button" onPress={() => router.push(`/people/${person.id}`)} style={styles.realCompanionItem}>
                          <PersonAvatar person={person} size={36} />
                          <View style={styles.realCompanionTextWrap}>
                            <Text style={styles.realCompanionName}>{person.nickname ?? person.name}</Text>
                            <Text style={styles.realCompanionRelationship}>{t(person.relationship ?? 'At this table')}</Text>
                          </View>
                          <Text style={styles.peopleAllText}>›</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.peoplePlaceholderBody}>
                      {locale === 'zh' ? '这天还没有填写同桌人。独自的一餐，也可以好好留下。' : 'No companions recorded for this date. A meal on your own belongs here too.'}
                    </Text>
                  )}
                  <Pressable accessibilityRole="button" onPress={() => setActiveSwitcher(0)} style={styles.dayMealsLink}>
                    <Text style={styles.peopleAllText}>{locale === 'zh' ? '打开具体餐食，查看或修改同桌人 ›' : 'Open a meal to view or edit its people ›'}</Text>
                  </Pressable>
                  {dayMeals.some((meal) => meal.origin === 'sample') ? (
                    <Text style={styles.realCompanionMeta}>{locale === 'zh' ? '这天也有示例餐食，与个人同桌人分开显示。' : 'Sample meals on this date are separate from your own people.'}</Text>
                  ) : null}
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
                          <Text style={styles.peopleTagLabel}>{PEOPLE_TAG_LABELS[tag.id] ? t(tag.label) : tag.label}</Text>
                          <Text style={styles.peopleTagMeta}>
                            {t(tag.count === 1 ? '{count} meal remembered' : '{count} meals remembered', { count: tag.count })}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
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
          accessibilityRole="button"
          accessibilityLabel={t('Close')}
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
                    accessibilityRole="button"
                    accessibilityState={{ selected: isCurrent }}
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
                      {t(name.slice(0, 3))}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Modal>

      <CreatePersonModal
        visible={createPersonOpen}
        onClose={() => setCreatePersonOpen(false)}
        onSaved={(person) => {
          setPeopleProfiles((current) => [person, ...current.filter((item) => item.id !== person.id)]);
          setCreatePersonOpen(false);
          router.push(`/people/${person.id}`);
        }}
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
    paddingTop: 10,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  wordmark: {
    fontStyle: 'italic',
    fontSize: 24,
    lineHeight: 30,
    color: colors.primary,
  },
  profileButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introLine: {
    fontSize: 12,
    lineHeight: 19,
    color: colors.mutedText,
  },

  seasonPreview: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginVertical: 4, gap: 14 },
  seasonCopy: { flex: 1 },
  seasonImage: { width: 100, height: 112 },
  tableActions: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginBottom: 12 },
  tableAction: { flex: 1, minWidth: 0, minHeight: 72, borderRadius: 19, paddingHorizontal: 10, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  actionCopy: { flex: 1, minWidth: 0 },
  recordButton: { backgroundColor: colors.primary },
  recordButtonText: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: colors.surface },
  recordButtonHint: { fontSize: 10, lineHeight: 15, color: 'rgba(255, 253, 248, 0.78)', marginTop: 3 },
  recordPlate: { width: 34, height: 34, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255, 253, 248, 0.66)', alignItems: 'center', justifyContent: 'center' },
  recordPlateInner: { width: 25, height: 25, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255, 253, 248, 0.42)', alignItems: 'center', justifyContent: 'center' },
  recordPlus: { color: colors.surface, fontSize: 18, lineHeight: 23 },
  chairButton: { backgroundColor: '#EFF1E8', borderWidth: StyleSheet.hairlineWidth, borderColor: '#CFD5BF' },
  chairArt: { width: 36, height: 45 },
  chairButtonText: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: colors.primary },
  chairButtonHint: { fontSize: 10, lineHeight: 15, color: colors.secondary, marginTop: 3 },
  savedPeople: { marginHorizontal: 20, marginBottom: 17 },
  savedPeopleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  savedPeopleTitle: { fontSize: 14, fontWeight: '600', color: colors.primary },
  peopleAllButton: { minHeight: 44, justifyContent: 'center' },
  peopleAllText: { fontSize: 12, lineHeight: 18, color: colors.secondary },
  savedPeopleStrip: { gap: 8, paddingTop: 4 },
  savedPerson: { width: 58, alignItems: 'center', gap: 6, paddingBottom: 3 },
  savedPersonName: { fontSize: 11, lineHeight: 16, color: colors.secondary, maxWidth: '100%' },
  emptySeat: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderStyle: 'dashed', borderColor: '#B8C0A8', backgroundColor: '#F2F3EB' },
  emptySeatPlus: { fontSize: 22, color: '#809070' },
  firstSeat: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(185, 165, 138, 0.26)' },
  firstSeatText: { flex: 1, fontSize: 12, lineHeight: 19, color: colors.mutedText },
  dayMealsLink: { minHeight: 44, justifyContent: 'center', marginTop: 8 },
  sceneToggle: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  sceneToggleText: { fontSize: 12, color: colors.secondary },
  recentMemory: { marginHorizontal: 20, marginBottom: 16, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 18, backgroundColor: colors.surface },
  recentHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  recentLabel: { fontSize: 12, fontWeight: '600', color: colors.primary },
  recentDate: { fontSize: 12, color: colors.mutedText },
  recentNote: { fontSize: 13, lineHeight: 20, color: colors.secondary, paddingTop: 2 },

  /* ── Month label — atmospheric scene context ── */
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
  },
  monthLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.secondary,
  },
  monthChevron: {
    fontSize: 9,
    color: colors.mutedText,
  },

  /* ── Month picker modal ── */
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerSheet: {
    maxWidth: '90%',
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
    marginTop: 0,
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
    paddingHorizontal: 4,
    paddingTop: 10,
    paddingBottom: 8,
  },
  categoryRail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  categoryTab: {
    flex: 1,
    minWidth: 0,
  },
  categoryLabel: {
    fontSize: 14,
    color: colors.mutedText,
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
    marginTop: 18,
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
    backgroundColor: colors.primary,
    ...shadow.soft,
  },
  switcherIcon: {
    fontSize: 17,
    color: colors.mutedText,
    marginTop: -1,
  },
  switcherIconActive: {
    color: colors.surface,
  },
  switcherText: {
    fontSize: 15,
    color: colors.mutedText,
  },
  switcherTextActive: {
    color: colors.surface,
  },

  /* ── Memory paper ── */
  memoryPaper: {
    marginTop: 12,
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 22,
    backgroundColor: 'rgba(255, 253, 248, 0.3)',
  },
  mealGroup: {
    paddingBottom: 22,
  },
  groupTitle: {
    fontSize: 18,
    lineHeight: 24,
    color: colors.primary,
    marginBottom: 11,
  },
  groupEmptyText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.mutedText,
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
    color: colors.secondary,
  },
  mealTextWrap: {
    flex: 1,
    marginLeft: 15,
    minWidth: 0,
  },
  mealTitle: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.primary,
  },
  mealSubtitle: {
    fontSize: 15.5,
    lineHeight: 21,
    color: colors.mutedText,
  },
  mealChevron: {
    fontSize: 26,
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
    color: colors.mutedText,
    marginBottom: 7,
  },
  peopleTitle: {
    fontSize: 21,
    lineHeight: 27,
    color: colors.primary,
    marginBottom: 6,
  },
  peopleIntro: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.mutedText,
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
  realCompanionButtonText: {
    fontSize: 12,
    color: colors.secondary,
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
  },
  realCompanionRelationship: {
    marginTop: 2,
    fontSize: 11,
    color: colors.mutedText,
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
    color: colors.primary,
  },
  peopleTagMeta: {
    fontSize: 12,
    color: colors.mutedText,
    marginTop: 2,
  },
  peoplePlaceholderBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.mutedText,
  },

  /* ── Empty state ── */
  emptyMemory: {
    alignItems: 'flex-start',
    paddingVertical: 22,
    paddingRight: 12,
  },
  emptyMemoryTitle: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.primary,
    marginBottom: 8,
  },
  emptyMemoryBody: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.mutedText,
  },
});
