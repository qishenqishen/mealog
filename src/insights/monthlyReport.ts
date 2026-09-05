import {
  DEFAULT_COMPANIONSHIP_TAGS,
  type MealCompanion,
  type MealEntry,
  type MoodTag,
  type PersonProfile,
} from '../types';

export type WarmMonthlyReportProvider = 'local_narrative_demo';

export interface WarmMonthlyReport {
  provider: WarmMonthlyReportProvider;
  title: string;
  subtitle: string;
  lines: string[];
  closing: string;
  sourceSignals: {
    mealCount: number;
    dayCount: number;
    photoCount: number;
    noteCount: number;
    namedPeopleCount: number;
    topMood?: string;
    topPerson?: string;
  };
  generatedAt: string;
}

type CountRow = {
  id: string;
  label: string;
  count: number;
};

const MOOD_COPY: Record<MoodTag, { adjective: string; object: string; sentence: string }> = {
  peaceful: {
    adjective: 'peaceful',
    object: 'quiet steadiness',
    sentence: 'Your saved meals kept returning to quieter, steadier moments.',
  },
  everyday: {
    adjective: 'everyday',
    object: 'ordinary rhythm',
    sentence: 'The month was held by ordinary meals, the kind that make a life feel lived-in.',
  },
  nostalgic: {
    adjective: 'nostalgic',
    object: 'remembered warmth',
    sentence: 'A nostalgic thread ran through the table, as if some meals were carrying older rooms with them.',
  },
  healing: {
    adjective: 'healing',
    object: 'comfort and repair',
    sentence: 'You seemed to reach for meals that made the day softer around the edges.',
  },
  heartfelt: {
    adjective: 'heartfelt',
    object: 'tender attention',
    sentence: 'The meals you kept this month felt tender, less like data and more like small proof of care.',
  },
  overwhelming: {
    adjective: 'heavy',
    object: 'comfort',
    sentence: 'Some meals arrived on heavier days; Mealog kept the comfort without asking it to explain itself.',
  },
  celebratory: {
    adjective: 'celebratory',
    object: 'small ceremony',
    sentence: 'There was a little ceremony at the table this month, even when the meals were simple.',
  },
};

const PEOPLE_LABELS = Object.fromEntries(
  DEFAULT_COMPANIONSHIP_TAGS.map((tag) => [tag.id, tag.label]),
) as Record<string, string>;

function getMoodTags(meal: MealEntry): MoodTag[] {
  if (meal.moodTags.length > 0) return meal.moodTags;
  return meal.moodTag ? [meal.moodTag] : [];
}

function topRow(rows: CountRow[]): CountRow | undefined {
  return [...rows].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))[0];
}

function countRows(values: string[], labels?: Record<string, string>): CountRow[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([id, count]) => ({
      id,
      label: labels?.[id] ?? id,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function cleanNote(note: string): string {
  const normalized = note.replace(/\s+/g, ' ').trim();
  return normalized.length > 92 ? `${normalized.slice(0, 89).trim()}...` : normalized;
}

function bucketLocation(meal: MealEntry): 'home' | 'work' | 'out' | 'unknown' {
  const value = `${meal.location ?? ''} ${meal.locationText ?? ''}`.toLowerCase();
  if (!value.trim()) return 'unknown';
  if (/home|kitchen|apartment|house|dining room|家|厨房/.test(value)) return 'home';
  if (/work|office|studio|courtyard|school|campus|公司|学校/.test(value)) return 'work';
  if (/restaurant|cafe|coffee|bakery|market|bar|bistro|diner|餐厅|咖啡|店/.test(value)) return 'out';
  return 'unknown';
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

export function generateWarmMonthlyReport({
  monthLabel,
  meals,
  companions,
  people,
}: {
  monthKey: string;
  monthLabel: string;
  meals: MealEntry[];
  companions: MealCompanion[];
  people: PersonProfile[];
}): WarmMonthlyReport {
  const generatedAt = new Date().toISOString();
  const mealIds = new Set(meals.map((meal) => meal.id));
  const dayCount = new Set(meals.map((meal) => meal.date)).size;
  const moodRows = countRows(meals.flatMap(getMoodTags), Object.fromEntries(
    Object.entries(MOOD_COPY).map(([id, value]) => [id, value.adjective]),
  ));
  const companionRows = countRows(meals.flatMap((meal) => meal.peopleTags), PEOPLE_LABELS);
  const namedPeopleRows = countNamedPeople(mealIds, companions, people);
  const topMood = topRow(moodRows);
  const topPerson = topRow(namedPeopleRows);
  const topCompanion = topRow(companionRows);
  const photoCount = meals.filter((meal) => Boolean(meal.photoMediaId || meal.photoUri)).length;
  const notes = meals
    .map((meal) => meal.note?.trim())
    .filter((note): note is string => Boolean(note));

  if (meals.length === 0) {
    return {
      provider: 'local_narrative_demo',
      title: 'A table waiting to be read',
      subtitle: 'Once meals are saved, Mealog turns them into a warm monthly report.',
      lines: [
        'No meal memories are stored for this month yet.',
        'When the first few meals arrive, this page will notice patterns in photos, notes, moods, places, and people.',
        'The report is designed as the AI voice of Mealog: gentle, specific, and never colder than the meal itself.',
      ],
      closing: 'The first plate will give this page something to hold.',
      sourceSignals: {
        mealCount: 0,
        dayCount: 0,
        photoCount: 0,
        noteCount: 0,
        namedPeopleCount: 0,
      },
      generatedAt,
    };
  }

  const locationBuckets = meals.reduce(
    (acc, meal) => {
      acc[bucketLocation(meal)] += 1;
      return acc;
    },
    { home: 0, work: 0, out: 0, unknown: 0 },
  );

  const lines: string[] = [];
  lines.push(
    `${monthLabel} kept ${meals.length} meal ${meals.length === 1 ? 'memory' : 'memories'} across ${dayCount} ${dayCount === 1 ? 'day' : 'days'}.`,
  );

  if (topMood) {
    const mood = MOOD_COPY[topMood.id as MoodTag];
    lines.push(mood?.sentence ?? `The strongest feeling this month was ${topMood.label}.`);
  }

  if (locationBuckets.home >= 2 && locationBuckets.home >= locationBuckets.out) {
    lines.push('You came back to home tables more than once, as if the month wanted food to happen somewhere familiar.');
  } else if (locationBuckets.work >= 2) {
    lines.push('Workday meals kept showing up, softening the edges of the calendar one lunch at a time.');
  } else if (locationBuckets.out >= 2) {
    lines.push('Several meals happened out in the world, but saving them here made them feel close again.');
  }

  if (topPerson) {
    lines.push(
      `${topPerson.label} had a steady seat here, sharing ${topPerson.count} ${topPerson.count === 1 ? 'meal' : 'meals'} with you this month.`,
    );
  } else if (topCompanion && topCompanion.id !== 'just-me') {
    lines.push(`The table often made room for ${topCompanion.label.toLowerCase()}, not just food.`);
  } else if (topCompanion?.id === 'just-me') {
    lines.push('A lot of the table was yours alone this month, in the calm way a private ritual can be.');
  }

  if (photoCount > 0) {
    lines.push(
      `${photoCount} ${photoCount === 1 ? 'photo was' : 'photos were'} saved with the meals, so the month is not only remembered in words.`,
    );
  }

  const eventNote = notes.find((note) => /midterm|exam|deadline|anxious|cry|cried|tired|birthday|reunion/i.test(note));
  const recentNote = eventNote ?? notes[notes.length - 1];
  if (recentNote) {
    lines.push(`One note stayed close: "${cleanNote(recentNote)}"`);
  }

  const closing = topMood
    ? `The month reads as ${MOOD_COPY[topMood.id as MoodTag]?.object ?? 'a table worth keeping'}.`
    : 'The month reads less like a log and more like a table that quietly stayed.';

  return {
    provider: 'local_narrative_demo',
    title: 'A letter from your table',
    subtitle: 'Generated from meals, notes, photos, moods, places, and people.',
    lines: lines.slice(0, 6),
    closing,
    sourceSignals: {
      mealCount: meals.length,
      dayCount,
      photoCount,
      noteCount: notes.length,
      namedPeopleCount: namedPeopleRows.length,
      topMood: topMood?.label,
      topPerson: topPerson?.label,
    },
    generatedAt,
  };
}
