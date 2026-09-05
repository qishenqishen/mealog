import AsyncStorage from '@react-native-async-storage/async-storage';

import { evaluateAndPersistAchievements } from '../achievements/engine';
import { getCurrentUserId } from '../auth';
import { buildMealEatenAt } from '../services/mealMetadata';
import {
  getMealById,
  getSharedMealPhotos,
  saveMeal,
  savePersonProfile,
  saveSharedMealPhoto,
  setMealCompanions,
} from '../storage';
import type {
  MealEntry,
  MealType,
  MoodTag,
  PersonProfile,
  PersonRelationship,
  SharedMealPhoto,
} from '../types';
import { resolveDemoImageAssetUri, type DemoImageAsset } from './demoImageResolver';
import { DEMO_MEAL_PHOTOS } from './mealPhotoAssets';

type DemoMealInput = {
  id: string;
  day: number | 'today';
  mealType: MealType;
  time: string;
  title: string;
  location: string;
  moodTags: MoodTag[];
  peopleTags: string[];
  personIds: string[];
  note: string;
  photoAsset: DemoImageAsset;
};

export type DemoSeedResult = {
  mealsPrepared: number;
  peoplePrepared: number;
  sharedPhotosPrepared: number;
  keepsakesFound: number;
  anchorMonth: string;
};

const PERSONS: Array<{
  id: string;
  name: string;
  nickname?: string;
  relationship?: PersonRelationship;
  note?: string;
}> = [
  {
    id: 'demo-person-amy',
    name: 'Amy',
    relationship: 'Friend',
    note: 'The friend who makes small weekday meals feel like an occasion.',
  },
  {
    id: 'demo-person-mom',
    name: 'Mom',
    relationship: 'Parent',
    note: 'Warm dinners, fruit after meals, and familiar seats.',
  },
  {
    id: 'demo-person-kai',
    name: 'Kai',
    relationship: 'Colleague',
    note: 'A steady lunch companion from workdays.',
  },
  {
    id: 'demo-person-lina',
    name: 'Lina',
    relationship: 'Family',
    note: 'Always notices the dessert first.',
  },
  {
    id: 'demo-person-jordan',
    name: 'Jordan',
    relationship: 'Guest',
    note: 'A new seat at the table.',
  },
];

const DEMO_FOOD_PHOTO_VERSION_KEY = '@mealogue/demoFoodPhotoVersion';
const DEMO_FOOD_PHOTO_VERSION = 'food-photos-v1';

const PHOTO_ASSETS = DEMO_MEAL_PHOTOS;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function makeDate(year: number, monthIndex: number, day: number): string {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return `${year}-${pad(monthIndex + 1)}-${pad(Math.min(day, lastDay))}`;
}

function currentMonthDate(day: number | 'today'): string {
  const now = new Date();
  if (day === 'today') {
    return makeDate(now.getFullYear(), now.getMonth(), now.getDate());
  }
  return makeDate(now.getFullYear(), now.getMonth(), day);
}

function monthLabel(dateKey: string): string {
  const [year, month] = dateKey.split('-');
  return `${year}-${month}`;
}

function assetUri(asset: DemoImageAsset): string {
  const uri = resolveDemoImageAssetUri(asset);
  if (!uri) {
    throw new Error('Showcase image asset could not be resolved.');
  }
  return uri;
}

function buildMeal(input: DemoMealInput, userId: string): MealEntry {
  const date = currentMonthDate(input.day);
  const now = new Date().toISOString();

  return {
    id: input.id,
    userId,
    title: input.title,
    mealType: input.mealType,
    date,
    time: input.time,
    eatenAt: buildMealEatenAt(date, input.time),
    photoUri: assetUri(input.photoAsset),
    location: input.location,
    locationDetails: {
      source: 'manual',
      label: input.location,
      address: input.location,
      capturedAt: now,
    },
    moodTags: input.moodTags,
    peopleTags: input.peopleTags,
    personIds: input.personIds,
    note: input.note,
    createdAt: `${date}T${input.time}:00.000Z`,
    updatedAt: now,
    locationText: input.location,
    moodTag: input.moodTags[0],
  };
}

function legacySeasonMeals(userId: string): MealEntry[] {
  const now = new Date();
  const year = now.getFullYear();
  const reunionYear = now.getMonth() >= 3 ? year : year - 1;

  const rows: Array<{
    id: string;
    date: string;
    time: string;
    mealType: MealType;
    title: string;
    moodTags: MoodTag[];
    peopleTags: string[];
    personIds: string[];
    note: string;
    photoAsset: DemoImageAsset;
  }> = [
    {
      id: 'demo-meal-winter-reunion',
      date: makeDate(reunionYear, 0, 12),
      time: '19:10',
      mealType: 'dinner',
      title: 'Stew when the windows went blue',
      moodTags: ['nostalgic'],
      peopleTags: ['shared-with-friend'],
      personIds: ['demo-person-amy'],
      note: 'Amy brought clementines. The pot stayed warm while the room went quiet.',
      photoAsset: PHOTO_ASSETS.homeStew,
    },
    {
      id: 'demo-meal-spring-note',
      date: makeDate(year, 3, 18),
      time: '12:20',
      mealType: 'lunch',
      title: 'Green lunch near the window',
      moodTags: ['healing'],
      peopleTags: ['just-me'],
      personIds: [],
      note: 'A quiet bowl with the window open and the first soft air of spring.',
      photoAsset: PHOTO_ASSETS.saladWindowTable,
    },
    {
      id: 'demo-meal-summer-table',
      date: makeDate(year, 6, 7),
      time: '18:45',
      mealType: 'dinner',
      title: 'A noisy hotpot table',
      moodTags: ['celebratory'],
      peopleTags: ['celebration-gathering'],
      personIds: ['demo-person-amy', 'demo-person-mom', 'demo-person-lina'],
      note: 'Someone kept adding dishes. Someone kept refilling the cups.',
      photoAsset: PHOTO_ASSETS.sharedHotpot,
    },
  ];

  return rows.map((row) => ({
    id: row.id,
    userId,
    title: row.title,
    mealType: row.mealType,
    date: row.date,
    time: row.time,
    eatenAt: buildMealEatenAt(row.date, row.time),
    photoUri: assetUri(row.photoAsset),
    location: 'A remembered table',
    locationDetails: {
      source: 'manual',
      label: 'A remembered table',
      address: 'A remembered table',
      capturedAt: new Date().toISOString(),
    },
    moodTags: row.moodTags,
    peopleTags: row.peopleTags,
    personIds: row.personIds,
    note: row.note,
    createdAt: `${row.date}T${row.time}:00.000Z`,
    updatedAt: new Date().toISOString(),
    locationText: 'A remembered table',
    moodTag: row.moodTags[0],
  }));
}

const CURRENT_MONTH_MEALS: DemoMealInput[] = [
  {
    id: 'demo-meal-current-01',
    day: 'today',
    mealType: 'breakfast',
    time: '08:20',
    title: 'Blueberry toast by the window',
    location: 'Kitchen table',
    moodTags: ['peaceful'],
    peopleTags: ['just-me'],
    personIds: [],
    note: 'A slow start. The toast looked almost too gentle to touch.',
    photoAsset: PHOTO_ASSETS.blueberryToast,
  },
  {
    id: 'demo-meal-current-03',
    day: 3,
    mealType: 'lunch',
    time: '12:35',
    title: 'Little rice bowl with Kai',
    location: 'Work courtyard',
    moodTags: ['everyday'],
    peopleTags: ['work-lunch'],
    personIds: ['demo-person-kai'],
    note: 'A workday bowl that felt softer than the calendar around it.',
    photoAsset: PHOTO_ASSETS.riceBowl,
  },
  {
    id: 'demo-meal-current-05',
    day: 5,
    mealType: 'dinner',
    time: '19:05',
    title: 'Pasta and borrowed stories',
    location: 'Small round table',
    moodTags: ['heartfelt'],
    peopleTags: ['family-table'],
    personIds: ['demo-person-mom', 'demo-person-lina'],
    note: 'The conversation lasted longer than the pasta.',
    photoAsset: PHOTO_ASSETS.pastaBowl,
  },
  {
    id: 'demo-meal-current-08',
    day: 8,
    mealType: 'treat',
    time: '15:10',
    title: 'Cake and coffee split in three',
    location: 'Corner bakery',
    moodTags: ['celebratory'],
    peopleTags: ['shared-with-friend'],
    personIds: ['demo-person-amy', 'demo-person-jordan'],
    note: 'We forgot to take a proper photo, which made the casual one better.',
    photoAsset: PHOTO_ASSETS.cafeTiramisuDrinks,
  },
  {
    id: 'demo-meal-current-11',
    day: 11,
    mealType: 'breakfast',
    time: '09:00',
    title: 'Berry toast and a warm cup',
    location: 'Desk by the window',
    moodTags: ['nostalgic'],
    peopleTags: ['just-me'],
    personIds: [],
    note: 'A breakfast that felt like keeping a small promise to myself.',
    photoAsset: PHOTO_ASSETS.berryToast,
  },
  {
    id: 'demo-meal-current-14',
    day: 14,
    mealType: 'lunch',
    time: '13:15',
    title: 'Salmon bowl with Amy again',
    location: 'Park table',
    moodTags: ['healing'],
    peopleTags: ['shared-with-friend'],
    personIds: ['demo-person-amy'],
    note: 'After months apart, it felt simple to sit across from her again.',
    photoAsset: PHOTO_ASSETS.salmonAvocadoBowl,
  },
  {
    id: 'demo-meal-current-17',
    day: 17,
    mealType: 'dinner',
    time: '20:40',
    title: 'Five seats squeezed around hotpot',
    location: 'Home table',
    moodTags: ['overwhelming', 'celebratory'],
    peopleTags: ['celebration-gathering'],
    personIds: [
      'demo-person-amy',
      'demo-person-mom',
      'demo-person-kai',
      'demo-person-lina',
      'demo-person-jordan',
    ],
    note: 'Too many elbows, many cups, and exactly the right amount of noise.',
    photoAsset: PHOTO_ASSETS.tableFeast,
  },
  {
    id: 'demo-meal-current-20',
    day: 20,
    mealType: 'treat',
    time: '23:18',
    title: 'Midnight plated bite',
    location: 'Kitchen counter',
    moodTags: ['everyday'],
    peopleTags: ['just-me'],
    personIds: [],
    note: 'A late bite under the quietest light.',
    photoAsset: PHOTO_ASSETS.smallPlatedBites,
  },
  {
    id: 'demo-meal-current-23',
    day: 23,
    mealType: 'lunch',
    time: '12:10',
    title: 'Salad before the rain',
    location: 'Window cafe',
    moodTags: ['peaceful'],
    peopleTags: ['shared-with-friend'],
    personIds: ['demo-person-kai', 'demo-person-amy'],
    note: 'The weather changed while the cups were still warm.',
    photoAsset: PHOTO_ASSETS.saladWindowTable,
  },
  {
    id: 'demo-meal-current-26',
    day: 26,
    mealType: 'dinner',
    time: '18:30',
    title: 'A complete little table',
    location: 'Dining room',
    moodTags: ['heartfelt', 'celebratory'],
    peopleTags: ['family-table'],
    personIds: ['demo-person-mom'],
    note: 'Plate, feeling, photo, person, note. Nothing grand. Everything there.',
    photoAsset: PHOTO_ASSETS.sharedTableSpread,
  },
];

async function shouldRefreshDemoFoodPhotos(): Promise<boolean> {
  return (await AsyncStorage.getItem(DEMO_FOOD_PHOTO_VERSION_KEY)) !== DEMO_FOOD_PHOTO_VERSION;
}

async function saveDemoMeal(meal: MealEntry, refreshPhoto: boolean): Promise<void> {
  const existing = await getMealById(meal.id);
  const keepExistingPhoto = Boolean(existing) && !refreshPhoto;
  await saveMeal({
    ...meal,
    photoMediaId: keepExistingPhoto ? existing?.photoMediaId : undefined,
    photoUri: keepExistingPhoto ? existing?.photoUri ?? meal.photoUri : meal.photoUri,
    photoThumbnailUri: keepExistingPhoto ? existing?.photoThumbnailUri : undefined,
    photoStorageStatus: keepExistingPhoto ? existing?.photoStorageStatus : undefined,
    createdAt: existing?.createdAt ?? meal.createdAt,
  });
}

async function saveDemoSharedPhoto(photo: SharedMealPhoto, refreshPhoto: boolean): Promise<SharedMealPhoto> {
  const existing = (await getSharedMealPhotos(photo.mealId)).find((item) => item.id === photo.id);
  const keepExistingPhoto = Boolean(existing) && !refreshPhoto;
  return saveSharedMealPhoto({
    ...photo,
    mediaId: keepExistingPhoto ? existing?.mediaId : undefined,
    imageUrl: keepExistingPhoto ? existing?.imageUrl ?? photo.imageUrl : photo.imageUrl,
    thumbnailUri: keepExistingPhoto ? existing?.thumbnailUri : undefined,
    storageStatus: keepExistingPhoto ? existing?.storageStatus : undefined,
    createdAt: existing?.createdAt ?? photo.createdAt,
  });
}

export async function seedDemoData(): Promise<DemoSeedResult> {
  const userId = await getCurrentUserId();
  const now = new Date().toISOString();
  const refreshDemoPhotos = await shouldRefreshDemoFoodPhotos();

  const people: PersonProfile[] = PERSONS.map((person) => ({
    id: person.id,
    userId,
    name: person.name,
    nickname: person.nickname,
    relationship: person.relationship,
    note: person.note,
    createdAt: now,
    updatedAt: now,
  }));

  await Promise.all(people.map(savePersonProfile));

  const meals = [
    ...legacySeasonMeals(userId),
    ...CURRENT_MONTH_MEALS.map((input) => buildMeal(input, userId)),
  ];

  for (const meal of meals) {
    await saveDemoMeal(meal, refreshDemoPhotos);
    await setMealCompanions(meal.id, meal.personIds ?? []);
  }

  const sharedPhotos: SharedMealPhoto[] = [
    {
      id: 'demo-shared-photo-complete-memory',
      userId,
      mealId: 'demo-meal-current-26',
      imageUrl: assetUri(PHOTO_ASSETS.sharedTableSpread),
      caption: 'Together at the small table.',
      takenAt: `${currentMonthDate(26)}T18:30:00.000Z`,
      taggedPersonIds: ['demo-person-mom'],
      isCover: true,
      createdAt: now,
    },
    {
      id: 'demo-shared-photo-full-table',
      userId,
      mealId: 'demo-meal-current-17',
      imageUrl: assetUri(PHOTO_ASSETS.tableFeast),
      caption: 'A crowded, kind table.',
      takenAt: `${currentMonthDate(17)}T20:40:00.000Z`,
      taggedPersonIds: [
        'demo-person-amy',
        'demo-person-mom',
        'demo-person-kai',
        'demo-person-lina',
        'demo-person-jordan',
      ],
      isCover: false,
      createdAt: now,
    },
  ];

  for (const photo of sharedPhotos) {
    await saveDemoSharedPhoto(photo, refreshDemoPhotos);
  }

  if (refreshDemoPhotos) {
    await AsyncStorage.setItem(DEMO_FOOD_PHOTO_VERSION_KEY, DEMO_FOOD_PHOTO_VERSION);
  }

  const result = await evaluateAndPersistAchievements('HISTORICAL_RECALCULATION');

  return {
    mealsPrepared: meals.length,
    peoplePrepared: people.length,
    sharedPhotosPrepared: sharedPhotos.length,
    keepsakesFound: result.achievements.filter((achievement) => achievement.progress.unlockedAt).length,
    anchorMonth: monthLabel(currentMonthDate(1)),
  };
}
