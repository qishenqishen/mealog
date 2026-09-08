import AsyncStorage from '@react-native-async-storage/async-storage';

import { evaluateAndPersistAchievements } from '../achievements/engine';
import { getCurrentUserId } from '../auth';
import { buildMealEatenAt } from '../services/mealMetadata';
import {
  getMealById,
  getMeals,
  getPeopleProfiles,
  getSharedMealPhotos,
  saveMealMemory,
  savePersonProfile,
  saveSharedMealPhoto,
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

const DEMO_SESSION_KEY = '@mealogue/standaloneDemoSession';

interface DemoSession {
  version: 1;
  anchorDate: string;
  complete: boolean;
  result?: DemoSeedResult;
}

const PHOTO_ASSETS = DEMO_MEAL_PHOTOS;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function makeDate(year: number, monthIndex: number, day: number): string {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return `${year}-${pad(monthIndex + 1)}-${pad(Math.min(day, lastDay))}`;
}

function assetUri(asset: DemoImageAsset): string {
  const uri = resolveDemoImageAssetUri(asset);
  if (!uri) {
    throw new Error('Showcase image asset could not be resolved.');
  }
  return uri;
}

function buildMeal(input: DemoMealInput, userId: string, anchor: Date, previousMonth = false): MealEntry {
  const month = anchor.getMonth() - (previousMonth ? 1 : 0);
  const monthStart = new Date(anchor.getFullYear(), month, 1);
  const date = makeDate(monthStart.getFullYear(), monthStart.getMonth(), input.day === 'today' ? anchor.getDate() : input.day);
  const anchorKey = makeDate(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const currentTime = `${pad(anchor.getHours())}:${pad(anchor.getMinutes())}`;
  const time = date === anchorKey && input.time > currentTime ? currentTime : input.time;
  const now = new Date().toISOString();

  return {
    id: previousMonth ? input.id.replace('-current-', '-previous-') : input.id,
    origin: 'sample',
    userId,
    title: input.title,
    mealType: input.mealType,
    date,
    time,
    eatenAt: buildMealEatenAt(date, time),
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
    createdAt: buildMealEatenAt(date, time) ?? now,
    updatedAt: now,
    locationText: input.location,
    moodTag: input.moodTags[0],
  };
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
    note: 'A slow breakfast. I ate my toast while writing a little list of things I wanted to do.',
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
    note: 'Kai and I traded a bite of our lunches and talked about our weekend plans.',
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
    note: 'Mom, Lina and I were still sharing stories after our pasta plates were empty.',
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
    note: 'Amy, Jordan and I split a piece of cake. We kept passing the plate around for another bite.',
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
    note: 'I made berry toast and a warm drink. It reminded me of the breakfasts I used to make.',
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
    note: "We kept reaching across the hotpot to pass vegetables and refill each other's cups.",
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
    note: 'I saved a small plate for a late snack and took a photograph before eating it.',
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
    note: 'Kai, Amy and I were finishing our salads when it started raining. We stayed for another warm drink.',
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
    note: 'Mom told me how she used to make this dish. I wrote down her tip before I forgot.',
    photoAsset: PHOTO_ASSETS.sharedTableSpread,
  },
];

async function prepareDemoData(): Promise<DemoSeedResult> {
  const userId = await getCurrentUserId();
  const raw = await AsyncStorage.getItem(DEMO_SESSION_KEY);
  const session: DemoSession = raw
    ? JSON.parse(raw) as DemoSession
    : { version: 1, anchorDate: new Date().toISOString(), complete: false };
  const anchor = new Date(session.anchorDate);
  const anchorMonth = makeDate(anchor.getFullYear(), anchor.getMonth(), 1).slice(0, 7);
  const emptyResult = { mealsPrepared: 0, peoplePrepared: 0, sharedPhotosPrepared: 0, keepsakesFound: 0, anchorMonth };
  if (session.complete) return session.result ?? emptyResult;

  // Existing installations keep their own table. A persisted session makes new imports resumable.
  if (!raw && ((await getMeals()).length || (await getPeopleProfiles()).length)) {
    await AsyncStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({ ...session, complete: true, result: emptyResult }));
    return emptyResult;
  }
  await AsyncStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
  const now = session.anchorDate;

  const people: PersonProfile[] = PERSONS.map((person) => ({
    id: person.id,
    origin: 'sample',
    userId,
    name: person.name,
    nickname: person.nickname,
    relationship: person.relationship,
    note: person.note,
    createdAt: now,
    updatedAt: now,
  }));

  const existingPeople = await getPeopleProfiles({ includeDeleted: true });
  for (const person of people) {
    if (!existingPeople.some((existing) => existing.id === person.id)) await savePersonProfile(person);
  }

  const meals = [
    ...CURRENT_MONTH_MEALS.map((input) => buildMeal(input, userId, anchor, true)),
    ...CURRENT_MONTH_MEALS
      .filter((input) => input.day === 'today' || input.day <= anchor.getDate())
      .map((input) => buildMeal(input, userId, anchor)),
  ];

  for (const meal of meals) {
    if (!(await getMealById(meal.id))) await saveMealMemory(meal, meal.personIds ?? []);
  }

  const sharedPhotos: SharedMealPhoto[] = [
    {
      id: 'demo-shared-photo-complete-memory',
      origin: 'sample',
      userId,
      mealId: 'demo-meal-previous-26',
      imageUrl: assetUri(PHOTO_ASSETS.sharedTableSpread),
      caption: 'Together at the small table.',
      takenAt: meals.find((meal) => meal.id === 'demo-meal-previous-26')!.eatenAt,
      taggedPersonIds: ['demo-person-mom'],
      isCover: true,
      createdAt: now,
    },
    {
      id: 'demo-shared-photo-full-table',
      origin: 'sample',
      userId,
      mealId: 'demo-meal-previous-17',
      imageUrl: assetUri(PHOTO_ASSETS.tableFeast),
      caption: 'A crowded, kind table.',
      takenAt: meals.find((meal) => meal.id === 'demo-meal-previous-17')!.eatenAt,
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
    const existing = await getSharedMealPhotos(photo.mealId);
    if (!existing.some((item) => item.id === photo.id)) await saveSharedMealPhoto(photo);
  }

  const result = await evaluateAndPersistAchievements('HISTORICAL_RECALCULATION');

  const summary: DemoSeedResult = {
    mealsPrepared: meals.length,
    peoplePrepared: people.length,
    sharedPhotosPrepared: sharedPhotos.length,
    keepsakesFound: result.achievements.filter((achievement) => achievement.progress.unlockedAt).length,
    anchorMonth,
  };
  await AsyncStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({ ...session, complete: true, result: summary }));
  return summary;
}

let preparation: Promise<DemoSeedResult> | undefined;

export function seedDemoData(): Promise<DemoSeedResult> {
  if (!preparation) preparation = prepareDemoData().finally(() => { preparation = undefined; });
  return preparation;
}
