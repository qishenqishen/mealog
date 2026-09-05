import type { AchievementProgress, MealCompanion, MealEntry, SharedMealPhoto } from '../types';
import {
  evaluateAchievementProgress,
  getClosestAchievements,
} from './rules';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function meal(
  index: number,
  overrides: Partial<MealEntry> = {},
): MealEntry {
  const day = String(index).padStart(2, '0');
  return {
    id: `meal-${index}`,
    title: `Meal ${index}`,
    mealType: 'lunch',
    date: `2026-01-${day}`,
    time: '12:00',
    moodTags: [],
    peopleTags: [],
    createdAt: `2026-01-${day}T12:00:00.000Z`,
    updatedAt: `2026-01-${day}T12:00:00.000Z`,
    ...overrides,
  };
}

function companion(mealId: string, personId: string): MealCompanion {
  return {
    id: `${mealId}-${personId}`,
    mealId,
    personId,
    addedAt: '2026-01-01T12:00:00.000Z',
  };
}

function sharedPhoto(mealId: string, index: number): SharedMealPhoto {
  return {
    id: `shared-photo-${index}`,
    mealId,
    imageUrl: `file://shared-${index}.jpg`,
    caption: 'Together',
    taggedPersonIds: ['amy'],
    createdAt: '2026-01-01T12:00:00.000Z',
  };
}

function byId(progress: ReturnType<typeof evaluateAchievementProgress>, id: string) {
  const achievement = progress.find((item) => item.definition.id === id);
  if (!achievement) throw new Error(`Missing achievement ${id}`);
  return achievement;
}

const tenMeals = Array.from({ length: 10 }, (_, index) => meal(index + 1));
const fivePhotoMeals = tenMeals.map((item, index) => (
  index < 5 ? { ...item, photoUri: `file://meal-${index}.jpg` } : item
));
const fiveNoteMeals = tenMeals.map((item, index) => (
  index < 5 ? { ...item, note: 'A small note.' } : item
));
const fiveFeelingMeals = tenMeals.map((item, index) => (
  index < 5 ? { ...item, moodTags: ['peaceful' as const] } : item
));
const reunionMeals = [
  meal(1, { id: 'meal-a', date: '2026-01-01' }),
  meal(2, { id: 'meal-b', date: '2026-03-05' }),
];
const completeMeal = meal(11, {
  id: 'meal-complete',
  date: '2026-05-10',
  mealType: 'dinner',
  moodTags: ['celebratory' as const],
  photoUri: 'file://complete.jpg',
  note: 'birthday dinner',
  peopleTags: ['celebration-gathering'],
});

function run() {
  const firstMealProgress = evaluateAchievementProgress({
    meals: [meal(1)],
    companions: [],
    sharedPhotos: [],
    now: '2026-07-01T00:00:00.000Z',
  });
  assert(byId(firstMealProgress, 'first-plate').progress.status === 'newly_unlocked', 'First Plate should unlock on first meal');
  assert(byId(firstMealProgress, 'small-tablecloth').progress.currentValue === 1, 'Small Tablecloth should show 1 / 3');

  const threeMeals = evaluateAchievementProgress({
    meals: tenMeals.slice(0, 3),
    companions: [],
    sharedPhotos: [],
  });
  assert(byId(threeMeals, 'small-tablecloth').progress.status === 'newly_unlocked', 'Third meal should unlock Small Tablecloth');

  const tenMealProgress = evaluateAchievementProgress({
    meals: tenMeals,
    companions: [],
    sharedPhotos: [],
  });
  assert(byId(tenMealProgress, 'set-table').progress.status === 'newly_unlocked', 'Tenth meal should unlock Set Table');
  assert(byId(tenMealProgress, 'seven-quiet-days').progress.status === 'newly_unlocked', 'Seven distinct days should unlock Seven Quiet Days');

  const photos = evaluateAchievementProgress({
    meals: fivePhotoMeals,
    companions: [],
    sharedPhotos: [],
  });
  assert(byId(photos, 'little-photograph').progress.status === 'newly_unlocked', 'First meal photo should unlock Little Photograph');
  assert(byId(photos, 'photo-strip').progress.status === 'newly_unlocked', 'Five photos should unlock Photo Strip');

  const notes = evaluateAchievementProgress({
    meals: fiveNoteMeals,
    companions: [],
    sharedPhotos: [],
  });
  assert(byId(notes, 'written-corner').progress.status === 'newly_unlocked', 'First note should unlock Written Corner');
  assert(byId(notes, 'margin-notes').progress.status === 'newly_unlocked', 'Five notes should unlock Margin Notes');

  const feelings = evaluateAchievementProgress({
    meals: fiveFeelingMeals,
    companions: [],
    sharedPhotos: [],
  });
  assert(byId(feelings, 'feeling-candle').progress.status === 'newly_unlocked', 'First feeling should unlock Feeling Candle');
  assert(byId(feelings, 'mood-vase').progress.status === 'newly_unlocked', 'Five feelings should unlock Mood Vase');

  const peopleProgress = evaluateAchievementProgress({
    meals: [completeMeal, ...reunionMeals],
    companions: [
      companion('meal-a', 'amy'),
      companion('meal-b', 'amy'),
      companion('meal-complete', 'amy'),
      companion('meal-complete', 'mom'),
      companion('meal-complete', 'dad'),
      companion('meal-complete', 'lee'),
      companion('meal-complete', 'q'),
    ],
    sharedPhotos: [sharedPhoto('meal-complete', 1)],
  });
  assert(byId(peopleProgress, 'pulled-chair').progress.status === 'newly_unlocked', 'First companion should unlock Pulled Chair');
  assert(byId(peopleProgress, 'familiar-seat').progress.status === 'newly_unlocked', 'Three meals with same person should unlock Familiar Seat');
  assert(byId(peopleProgress, 'open-table').progress.status === 'newly_unlocked', 'Five unique people should unlock Open Table');
  assert(byId(peopleProgress, 'full-table').progress.status === 'newly_unlocked', 'Three people in one meal should unlock Full Table');
  assert(byId(peopleProgress, 'house-full').progress.status === 'newly_unlocked', 'Five people in one meal should unlock House Full');
  assert(byId(peopleProgress, 'table-reunion').progress.status === 'newly_unlocked', '60 day gap should unlock Table Reunion');
  assert(byId(peopleProgress, 'complete-memory').progress.status === 'newly_unlocked', 'Complete Memory should unlock with all fields');
  assert(byId(peopleProgress, 'dinner-by-candlelight').progress.status === 'newly_unlocked', 'Dinner by Candlelight should unlock');
  assert(byId(peopleProgress, 'birthday-table').progress.status === 'newly_unlocked', 'Birthday Table should unlock');

  const historical = evaluateAchievementProgress({
    meals: tenMeals,
    companions: [],
    sharedPhotos: [],
    suppressNewUnlocks: true,
  });
  assert(byId(historical, 'set-table').progress.status === 'unlocked', 'Historical recalculation should not mark individual newly_unlocked');

  const previous: AchievementProgress[] = historical.map((item) => item.progress);
  const afterDeletion = evaluateAchievementProgress({
    meals: tenMeals.slice(0, 2),
    companions: [],
    sharedPhotos: [],
    previousProgress: previous,
  });
  assert(byId(afterDeletion, 'set-table').progress.unlockedAt !== undefined, 'Unlocked achievements should not be reclaimed after deletion');
  assert(byId(afterDeletion, 'small-tablecloth').progress.currentValue >= 3, 'Unlocked progress should preserve its highest value');

  const repeated = evaluateAchievementProgress({
    meals: tenMeals,
    companions: [],
    sharedPhotos: [],
    previousProgress: previous,
  });
  const uniqueIds = new Set(repeated.map((item) => item.definition.id));
  assert(uniqueIds.size === repeated.length, 'Repeated engine runs should not duplicate achievement records');

  const hiddenClosest = getClosestAchievements(peopleProgress);
  assert(!hiddenClosest.some((item) => item.definition.hidden), 'Hidden achievements should not appear in closest keepsakes');

  const remappedCompanions = [
    companion('meal-a', 'amy'),
    companion('meal-b', 'amy'),
    companion('meal-complete', 'amy'),
  ];
  const merged = evaluateAchievementProgress({
    meals: [completeMeal, ...reunionMeals],
    companions: remappedCompanions,
    sharedPhotos: [],
  });
  assert(byId(merged, 'familiar-seat').progress.currentValue === 3, 'Merged person relations should count once per meal');

  console.log('Achievement rule tests passed');
}

run();
