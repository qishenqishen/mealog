import type { MealEntry, MealType, MoodTag } from '../types';

// ── Types ───────────────────────────────────────────────────

export interface WeeklyInsights {
  totalMeals: number;
  byType: Record<MealType, number>;
  byMood: Record<MoodTag, number>;
  /** Number of distinct days with at least one meal this week. */
  daysLogged: number;
}

// ── Helpers ─────────────────────────────────────────────────

/** Return YYYY-MM-DD for the Monday of the week containing `date`. */
function startOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? 6 : day - 1; // shift so Monday=0
  d.setDate(d.getDate() - diff);
  return formatYMD(d);
}

function formatYMD(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack', 'treat'];
const MOOD_TAGS: MoodTag[] = [
  'peaceful',
  'everyday',
  'nostalgic',
  'healing',
  'heartfelt',
  'overwhelming',
  'celebratory',
];

function getMoodTags(meal: MealEntry): MoodTag[] {
  if (meal.moodTags.length > 0) return meal.moodTags;
  return meal.moodTag ? [meal.moodTag] : [];
}

// ── Generator ───────────────────────────────────────────────

export function generateWeeklyInsights(meals: MealEntry[]): WeeklyInsights {
  const weekStart = startOfWeek(new Date());

  const thisWeek = meals.filter((m) => m.date >= weekStart);

  const byType = Object.fromEntries(MEAL_TYPES.map((t) => [t, 0])) as Record<MealType, number>;
  const byMood = Object.fromEntries(MOOD_TAGS.map((m) => [m, 0])) as Record<MoodTag, number>;
  const days = new Set<string>();

  for (const m of thisWeek) {
    byType[m.mealType] = (byType[m.mealType] ?? 0) + 1;
    for (const mood of getMoodTags(m)) {
      byMood[mood] = (byMood[mood] ?? 0) + 1;
    }
    days.add(m.date);
  }

  return {
    totalMeals: thisWeek.length,
    byType,
    byMood,
    daysLogged: days.size,
  };
}
