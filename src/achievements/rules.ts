import type {
  AchievementDefinition,
  AchievementProgress,
  MealCompanion,
  MealEntry,
  SharedMealPhoto,
} from '../types';
import { ACHIEVEMENT_DEFINITIONS } from './definitions';

export type EvaluatedAchievement = {
  definition: AchievementDefinition;
  progress: AchievementProgress;
  progressRatio: number;
  remaining: number;
  remainingText: string;
};

export type AchievementEvaluationData = {
  meals: MealEntry[];
  companions: MealCompanion[];
  sharedPhotos: SharedMealPhoto[];
  previousProgress?: AchievementProgress[];
  now?: string;
  suppressNewUnlocks?: boolean;
};

type RuleValue = {
  currentValue: number;
  firstSourceMealId?: string;
};

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function getMonthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function getSeasonKey(dateKey: string): 'spring' | 'summer' | 'autumn' | 'winter' {
  const month = Number(dateKey.slice(5, 7));
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

function getMonthIndex(monthKey: string): number {
  const [year, month] = monthKey.split('-').map(Number);
  return year * 12 + month;
}

function longestConsecutiveMonthStreak(monthKeys: string[]): number {
  const sorted = [...new Set(monthKeys)].sort((a, b) => getMonthIndex(a) - getMonthIndex(b));
  let best = 0;
  let current = 0;
  let previous: number | undefined;

  sorted.forEach((monthKey) => {
    const index = getMonthIndex(monthKey);
    current = previous !== undefined && index === previous + 1 ? current + 1 : 1;
    best = Math.max(best, current);
    previous = index;
  });

  return best;
}

function hasFeeling(meal: MealEntry): boolean {
  return meal.moodTags.length > 0 || Boolean(meal.moodTag);
}

function hasNote(meal: MealEntry): boolean {
  return Boolean(meal.note?.trim());
}

function hourOfMeal(meal: MealEntry): number {
  return Number(meal.time.slice(0, 2));
}

function companionsByMeal(companions: MealCompanion[]): Map<string, MealCompanion[]> {
  const map = new Map<string, MealCompanion[]>();
  companions.forEach((companion) => {
    map.set(companion.mealId, [...(map.get(companion.mealId) ?? []), companion]);
  });
  return map;
}

function photosByMeal(sharedPhotos: SharedMealPhoto[]): Map<string, SharedMealPhoto[]> {
  const map = new Map<string, SharedMealPhoto[]>();
  sharedPhotos.forEach((photo) => {
    map.set(photo.mealId, [...(map.get(photo.mealId) ?? []), photo]);
  });
  return map;
}

function getSamePersonMealCounts(companions: MealCompanion[]): Map<string, Set<string>> {
  const counts = new Map<string, Set<string>>();
  companions.forEach((companion) => {
    const meals = counts.get(companion.personId) ?? new Set<string>();
    meals.add(companion.mealId);
    counts.set(companion.personId, meals);
  });
  return counts;
}

function getTableReunionGap(
  meals: MealEntry[],
  companions: MealCompanion[],
): RuleValue {
  const mealsById = new Map(meals.map((meal) => [meal.id, meal]));
  const datesByPerson = new Map<string, { date: string; mealId: string }[]>();

  companions.forEach((companion) => {
    const meal = mealsById.get(companion.mealId);
    if (!meal) return;
    datesByPerson.set(companion.personId, [
      ...(datesByPerson.get(companion.personId) ?? []),
      { date: meal.date, mealId: meal.id },
    ]);
  });

  let bestGap = 0;
  let sourceMealId: string | undefined;

  datesByPerson.forEach((dates) => {
    const sorted = [...dates].sort((a, b) => a.date.localeCompare(b.date));
    sorted.forEach((item, index) => {
      if (index === 0) return;
      const previous = parseDateKey(sorted[index - 1].date);
      const current = parseDateKey(item.date);
      const gap = Math.floor((current.getTime() - previous.getTime()) / 86400000);
      if (gap > bestGap) {
        bestGap = gap;
        sourceMealId = item.mealId;
      }
    });
  });

  return {
    currentValue: bestGap,
    firstSourceMealId: sourceMealId,
  };
}

function getSamePersonSeasonCount(
  meals: MealEntry[],
  companions: MealCompanion[],
): RuleValue {
  const mealsById = new Map(meals.map((meal) => [meal.id, meal]));
  const seasonsByPerson = new Map<string, Set<string>>();
  let sourceMealId: string | undefined;

  companions.forEach((companion) => {
    const meal = mealsById.get(companion.mealId);
    if (!meal) return;
    const seasons = seasonsByPerson.get(companion.personId) ?? new Set<string>();
    seasons.add(getSeasonKey(meal.date));
    seasonsByPerson.set(companion.personId, seasons);
    if (!sourceMealId && seasons.size >= 2) sourceMealId = meal.id;
  });

  return {
    currentValue: Math.max(0, ...[...seasonsByPerson.values()].map((set) => set.size)),
    firstSourceMealId: sourceMealId,
  };
}

function getRuleValue(
  definition: AchievementDefinition,
  meals: MealEntry[],
  companions: MealCompanion[],
  sharedPhotos: SharedMealPhoto[],
): RuleValue {
  const mealCompanions = companionsByMeal(companions);
  const mealPhotos = photosByMeal(sharedPhotos);
  const mealPhotoCount = meals.filter((meal) => meal.photoUri).length;
  const distinctMealIdsWithCompanions = new Set(companions.map((companion) => companion.mealId));
  const sourceMeal = meals[0];

  switch (definition.ruleType) {
    case 'meal_count':
      return { currentValue: meals.length, firstSourceMealId: sourceMeal?.id };
    case 'distinct_days':
      return { currentValue: new Set(meals.map((meal) => meal.date)).size, firstSourceMealId: sourceMeal?.id };
    case 'monthly_distinct_days': {
      const datesByMonth = new Map<string, Set<string>>();
      meals.forEach((meal) => {
        const monthKey = getMonthKey(meal.date);
        const dates = datesByMonth.get(monthKey) ?? new Set<string>();
        dates.add(meal.date);
        datesByMonth.set(monthKey, dates);
      });
      return {
        currentValue: Math.max(0, ...[...datesByMonth.values()].map((dates) => dates.size)),
        firstSourceMealId: sourceMeal?.id,
      };
    }
    case 'monthly_presence_streak':
      return {
        currentValue: longestConsecutiveMonthStreak(meals.map((meal) => getMonthKey(meal.date))),
        firstSourceMealId: sourceMeal?.id,
      };
    case 'season_coverage':
      return {
        currentValue: new Set(meals.map((meal) => getSeasonKey(meal.date))).size,
        firstSourceMealId: sourceMeal?.id,
      };
    case 'photo_count':
      return {
        currentValue: mealPhotoCount + sharedPhotos.length,
        firstSourceMealId: meals.find((meal) => meal.photoUri)?.id ?? sharedPhotos[0]?.mealId,
      };
    case 'meal_photo_count':
      return {
        currentValue: mealPhotoCount,
        firstSourceMealId: meals.find((meal) => meal.photoUri)?.id,
      };
    case 'shared_photo_count':
      return {
        currentValue: sharedPhotos.length,
        firstSourceMealId: sharedPhotos[0]?.mealId,
      };
    case 'note_count':
      return {
        currentValue: meals.filter(hasNote).length,
        firstSourceMealId: meals.find(hasNote)?.id,
      };
    case 'feeling_count':
      return {
        currentValue: meals.filter(hasFeeling).length,
        firstSourceMealId: meals.find(hasFeeling)?.id,
      };
    case 'same_person_meals': {
      const counts = getSamePersonMealCounts(companions);
      return {
        currentValue: Math.max(0, ...[...counts.values()].map((mealIds) => mealIds.size)),
      };
    }
    case 'shared_meal_count':
      return {
        currentValue: distinctMealIdsWithCompanions.size,
        firstSourceMealId: companions[0]?.mealId,
      };
    case 'unique_people_count':
      return {
        currentValue: new Set(companions.map((companion) => companion.personId)).size,
        firstSourceMealId: companions[0]?.mealId,
      };
    case 'single_meal_people_count': {
      const counts = [...mealCompanions.entries()].map(([mealId, items]) => ({
        mealId,
        count: new Set(items.map((item) => item.personId)).size,
      }));
      const best = counts.sort((a, b) => b.count - a.count)[0];
      return {
        currentValue: best?.count ?? 0,
        firstSourceMealId: best?.mealId,
      };
    }
    case 'table_reunion':
      return getTableReunionGap(meals, companions);
    case 'same_person_season_count':
      return getSamePersonSeasonCount(meals, companions);
    case 'late_meal_count':
      return {
        currentValue: meals.filter((meal) => hourOfMeal(meal) >= 23).length,
        firstSourceMealId: meals.find((meal) => hourOfMeal(meal) >= 23)?.id,
      };
    case 'weekday_meal_days': {
      const sundayDates = new Set(
        meals
          .filter((meal) => parseDateKey(meal.date).getDay() === 0)
          .map((meal) => meal.date),
      );
      return {
        currentValue: sundayDates.size,
        firstSourceMealId: meals.find((meal) => parseDateKey(meal.date).getDay() === 0)?.id,
      };
    }
    case 'meal_type_count': {
      const type = definition.id === 'sweet-corner' ? 'treat' : 'breakfast';
      const matches = meals.filter((meal) => (
        type === 'treat'
          ? meal.mealType === 'treat' || meal.mealType === 'snack'
          : meal.mealType === type
      ));
      return {
        currentValue: matches.length,
        firstSourceMealId: matches[0]?.id,
      };
    }
    case 'complete_memory': {
      const matches = meals.filter((meal) => (
        hasFeeling(meal)
        && hasNote(meal)
        && (Boolean(meal.photoUri) || (mealPhotos.get(meal.id)?.length ?? 0) > 0)
        && (mealCompanions.get(meal.id)?.length ?? 0) > 0
      ));
      return { currentValue: matches.length, firstSourceMealId: matches[0]?.id };
    }
    case 'dinner_complete': {
      const matches = meals.filter((meal) => (
        meal.mealType === 'dinner'
        && hasFeeling(meal)
        && (Boolean(meal.photoUri) || (mealPhotos.get(meal.id)?.length ?? 0) > 0)
        && (mealCompanions.get(meal.id)?.length ?? 0) > 0
      ));
      return { currentValue: matches.length, firstSourceMealId: matches[0]?.id };
    }
    case 'year_boundary': {
      const monthDay = definition.id === 'last-plate-of-the-year' ? '-12-31' : '-01-01';
      const matches = meals.filter((meal) => meal.date.endsWith(monthDay));
      return { currentValue: matches.length, firstSourceMealId: matches[0]?.id };
    }
    case 'celebration_shared_meal': {
      const matches = meals.filter((meal) => {
        const text = `${meal.title} ${meal.note ?? ''} ${meal.peopleTags.join(' ')}`.toLowerCase();
        const celebration = hasFeeling(meal) && meal.moodTags.includes('celebratory')
          || meal.moodTag === 'celebratory'
          || text.includes('birthday')
          || text.includes('celebration')
          || meal.peopleTags.includes('celebration-gathering');
        return celebration && (mealCompanions.get(meal.id)?.length ?? 0) > 0;
      });
      return { currentValue: matches.length, firstSourceMealId: matches[0]?.id };
    }
    case 'manual':
    default:
      return { currentValue: 0 };
  }
}

function remainingText(definition: AchievementDefinition, currentValue: number): string {
  const remaining = Math.max(definition.threshold - currentValue, 0);
  if (remaining === 0) return 'Ready to place on the shelf.';

  const unitByRule: Partial<Record<AchievementDefinition['ruleType'], string>> = {
    meal_count: 'meals',
    distinct_days: 'days',
    monthly_distinct_days: 'meal days in one month',
    monthly_presence_streak: 'months',
    season_coverage: 'seasons',
    photo_count: 'photographs',
    meal_photo_count: 'meal photographs',
    shared_photo_count: 'shared photographs',
    note_count: 'notes',
    feeling_count: 'feelings',
    same_person_meals: 'shared meals with one person',
    shared_meal_count: 'shared meals',
    unique_people_count: 'people',
    single_meal_people_count: 'people at one meal',
    table_reunion: 'days between shared meals',
    same_person_season_count: 'seasons with one person',
    late_meal_count: 'late meals',
    weekday_meal_days: 'Sundays',
    meal_type_count: definition.id === 'sweet-corner' ? 'treats' : 'breakfasts',
  };

  const unit = unitByRule[definition.ruleType] ?? 'moments';
  return `${remaining} more ${unit} to find this keepsake.`;
}

export function evaluateAchievementProgress({
  meals,
  companions,
  sharedPhotos,
  previousProgress = [],
  now = new Date().toISOString(),
  suppressNewUnlocks = false,
}: AchievementEvaluationData): EvaluatedAchievement[] {
  const previousById = new Map(previousProgress.map((item) => [item.achievementId, item]));

  return ACHIEVEMENT_DEFINITIONS
    .filter((definition) => definition.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((definition) => {
      const ruleValue = getRuleValue(definition, meals, companions, sharedPhotos);
      const previous = previousById.get(definition.id);
      const hadUnlocked = Boolean(previous?.unlockedAt);
      const reached = ruleValue.currentValue >= definition.threshold;
      const unlockedAt = hadUnlocked
        ? previous?.unlockedAt
        : reached
          ? now
          : undefined;
      const status: AchievementProgress['status'] = unlockedAt
        ? hadUnlocked
          ? previous?.status === 'newly_unlocked'
            ? 'newly_unlocked'
            : 'unlocked'
          : suppressNewUnlocks
            ? 'unlocked'
            : 'newly_unlocked'
        : ruleValue.currentValue > 0
          ? 'in_progress'
          : 'locked';
      const currentValue = Math.max(ruleValue.currentValue, hadUnlocked ? previous?.currentValue ?? 0 : 0);
      const progress: AchievementProgress = {
        achievementId: definition.id,
        currentValue,
        targetValue: definition.threshold,
        status,
        unlockedAt,
        firstSourceMealId: previous?.firstSourceMealId ?? ruleValue.firstSourceMealId,
        lastEvaluatedAt: now,
        seenAt: previous?.seenAt,
      };

      return {
        definition,
        progress,
        progressRatio: definition.threshold > 0
          ? Math.min(currentValue / definition.threshold, 1)
          : 0,
        remaining: Math.max(definition.threshold - currentValue, 0),
        remainingText: remainingText(definition, currentValue),
      };
    });
}

export function getClosestAchievements(
  achievements: EvaluatedAchievement[],
  count = 3,
): EvaluatedAchievement[] {
  return achievements
    .filter((achievement) => (
      !achievement.definition.hidden
      && !achievement.progress.unlockedAt
      && achievement.progress.currentValue > 0
      && achievement.progress.targetValue > 0
    ))
    .sort((a, b) => (
      a.remaining - b.remaining
      || b.progressRatio - a.progressRatio
      || a.definition.sortOrder - b.definition.sortOrder
    ))
    .slice(0, count);
}
