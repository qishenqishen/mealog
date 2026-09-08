import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  AchievementMigrationSummary,
  AchievementProgress,
  CollectionItem,
  MealEntry,
  MealCompanion,
  MealLocation,
  MealType,
  MediaMigrationReport,
  MoodTag,
  PeopleTag,
  PersonMealSummary,
  PersonProfile,
  PersonTag,
  SharedMealPhoto,
} from '../types';
import { generateId } from '../utils/id';
import { getCurrentUserId } from '../auth';
import {
  assertManagedMediaReadable,
  deleteManagedMedia,
  getManagedMediaById,
  getManagedMediaRecords,
  importImageToManagedStore,
  isManagedMediaUri,
  resolveManagedMediaThumbnailUri,
  resolveManagedMediaUri,
} from '../media/managedMedia';
import { evaluateAchievementProgress } from '../achievements/rules';

// ── Storage keys ────────────────────────────────────────────

export const STORAGE_KEYS = {
  meals: '@mealogue/meals',
  peopleTags: '@mealogue/people',
  peopleProfiles: '@mealogue/peopleProfiles',
  mealCompanions: '@mealogue/mealCompanions',
  sharedMealPhotos: '@mealogue/sharedMealPhotos',
  collectionItems: '@mealogue/collection',
  achievementProgress: '@mealogue/achievementProgress',
  achievementMigrationSummary: '@mealogue/achievementMigrationSummary',
  onboardingComplete: '@mealogue/onboardingComplete',
  mediaMigrationReport: '@mealogue/mediaMigrationReport',
  insightsCache: '@mealogue/insightsCache/v1',
  monthlyReflections: '@mealogue/monthlyReflections/v1',
} as const;

export const KEYS = STORAGE_KEYS;

export interface MonthlyReflection {
  month: string;
  scope: 'personal' | 'sample';
  text: string;
  updatedAt: string;
}

export async function getMonthlyReflections(): Promise<MonthlyReflection[]> {
  const notes = await getList<MonthlyReflection>(STORAGE_KEYS.monthlyReflections);
  if (notes.some((note) => !note || !/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(note.month) ||
    !['personal', 'sample'].includes(note.scope) || typeof note.text !== 'string' || note.text.length > 1200 ||
    typeof note.updatedAt !== 'string' || !Number.isFinite(Date.parse(note.updatedAt)))) {
    throw new Error('Saved monthly reflections could not be read.');
  }
  return notes;
}

export async function saveMonthlyReflection(month: string, scope: MonthlyReflection['scope'], text: string): Promise<void> {
  if (!/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(month) || !['personal', 'sample'].includes(scope) || text.length > 1200) {
    throw new Error('Invalid monthly reflection.');
  }
  await withStorageKeys([STORAGE_KEYS.monthlyReflections], async () => {
    const current = await getMonthlyReflections();
    const remaining = current.filter((entry) => entry.month !== month || entry.scope !== scope);
    await writeLists([[STORAGE_KEYS.monthlyReflections, text.trim()
      ? [...remaining, { month, scope, text: text.trim(), updatedAt: new Date().toISOString() }]
      : remaining]]);
  });
}

const MEMORY_KEYS = [
  STORAGE_KEYS.meals,
  STORAGE_KEYS.peopleProfiles,
  STORAGE_KEYS.peopleTags,
  STORAGE_KEYS.mealCompanions,
  STORAGE_KEYS.sharedMealPhotos,
];
const pendingWrites = new Map<string, Promise<unknown>>();

// Reserve overlapping keys before awaiting, including legacy read-time migrations.
function withStorageKeys<T>(keys: string[], operation: () => Promise<T>): Promise<T> {
  const previous = keys.map((key) => pendingWrites.get(key));
  const result = Promise.all(previous).then(operation);
  const tail = result.catch(() => undefined);
  keys.forEach((key) => pendingWrites.set(key, tail));
  void tail.then(() => keys.forEach((key) => {
    if (pendingWrites.get(key) === tail) pendingWrites.delete(key);
  }));
  return result.catch((error) => {
    throw new Error(`Mealog could not complete the storage operation. ${errorMessage(error)}`);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// AsyncStorage has no transaction: restore every attempted key, even a failed write.
async function writeLists(changes: [string, unknown[]][]): Promise<void> {
  const before = await Promise.all(changes.map(([key]) => AsyncStorage.getItem(key)));
  let attempted = 0;
  try {
    for (const [key, items] of changes) {
      attempted += 1;
      await setList(key, items);
    }
  } catch (error) {
    const failures: string[] = [];
    for (let index = attempted - 1; index >= 0; index -= 1) {
      try {
        const value = before[index];
        if (value === null) await AsyncStorage.removeItem(changes[index][0]);
        else await AsyncStorage.setItem(changes[index][0], value);
      } catch (rollbackError) { failures.push(errorMessage(rollbackError)); }
    }
    throw new Error(`Saving the data failed. ${errorMessage(error)}${failures.length
      ? ` Restoring the previous data also failed; please retry with the same entry ID. ${failures.join(' ')}`
      : ' The previous data was restored.'}`);
  }
}

async function discardFailedImport(mediaId: string | undefined, error: unknown): Promise<never> {
  try { await deleteManagedMediaIfUnreferenced(mediaId); }
  catch (cleanupError) {
    throw new Error(`${errorMessage(error)} The unused image copy could not be removed. ${errorMessage(cleanupError)}`);
  }
  throw error;
}

// ── Generic helpers ─────────────────────────────────────────

async function getList<T>(key: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Expected a saved list.');
    return parsed as T[];
  } catch {
    throw new Error(`The saved data at ${key} could not be read.`);
  }
}

async function setList<T>(key: string, items: T[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(items));
}

// ── Meal normalization ──────────────────────────────────────

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
  treat: 'Treat',
};

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

type StoredMeal = Partial<MealEntry> & {
  mealType?: string;
  moodTag?: string;
  moodTags?: string[];
  userId?: string;
  photoMediaId?: string;
  photoStorageStatus?: string;
  eatenAt?: string;
  locationDetails?: MealLocation;
};

function isMealType(value: unknown): value is MealType {
  return typeof value === 'string' && MEAL_TYPES.includes(value as MealType);
}

function isMoodTag(value: unknown): value is MoodTag {
  return typeof value === 'string' && MOOD_TAGS.includes(value as MoodTag);
}

function normalizeMoodTags(meal: StoredMeal): MoodTag[] {
  const next = new Set<MoodTag>();

  if (Array.isArray(meal.moodTags)) {
    meal.moodTags.forEach((tag) => {
      if (isMoodTag(tag)) next.add(tag);
    });
  }

  if (isMoodTag(meal.moodTag)) {
    next.add(meal.moodTag);
  }

  return [...next];
}

function normalizeMeal(meal: StoredMeal): MealEntry | null {
  if (!meal.id || !isMealType(meal.mealType) || !meal.date || !meal.time) {
    return null;
  }

  const now = new Date().toISOString();
  const moodTags = normalizeMoodTags(meal);
  const fallbackTitle = MEAL_TYPE_LABELS[meal.mealType];

  return {
    id: meal.id,
    origin: meal.origin,
    userId: meal.userId,
    title: meal.title?.trim() || meal.note?.trim() || fallbackTitle,
    mealType: meal.mealType,
    date: meal.date,
    time: meal.time,
    eatenAt: meal.eatenAt,
    photoMediaId: meal.photoMediaId,
    photoUri: meal.photoUri,
    photoThumbnailUri: meal.photoThumbnailUri,
    photoStorageStatus: meal.photoStorageStatus as MealEntry['photoStorageStatus'],
    location: meal.location ?? meal.locationText,
    locationDetails: meal.locationDetails,
    moodTags,
    peopleTags: Array.isArray(meal.peopleTags) ? meal.peopleTags : [],
    personIds: Array.isArray(meal.personIds) ? meal.personIds : [],
    note: meal.note,
    createdAt: meal.createdAt ?? now,
    updatedAt: meal.updatedAt ?? meal.createdAt ?? now,
    locationText: meal.locationText ?? meal.location,
    moodTag: meal.moodTag && isMoodTag(meal.moodTag)
      ? meal.moodTag
      : moodTags[0],
  };
}

function sortMealsNewestFirst(meals: MealEntry[]): MealEntry[] {
  return [...meals].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    return dateCompare !== 0 ? dateCompare : b.time.localeCompare(a.time);
  });
}

// ── Meal storage ────────────────────────────────────────────

async function getStoredMeals(): Promise<MealEntry[]> {
  const stored = await getList<StoredMeal>(STORAGE_KEYS.meals);
  return stored
    .map(normalizeMeal)
    .filter((meal): meal is MealEntry => meal !== null);
}

async function hydrateMealMedia(meal: MealEntry): Promise<MealEntry> {
  if (!meal.photoMediaId) return meal;
  return {
    ...meal,
    photoUri: await resolveManagedMediaUri(meal.photoMediaId, meal.photoUri),
    photoThumbnailUri: await resolveManagedMediaThumbnailUri(
      meal.photoMediaId,
      meal.photoThumbnailUri ?? meal.photoUri,
    ),
  };
}

export async function getMeals(): Promise<MealEntry[]> {
  const stored = await withStorageKeys([STORAGE_KEYS.meals], getStoredMeals);
  const meals = await Promise.all(stored.map(hydrateMealMedia));
  return sortMealsNewestFirst(meals);
}

export async function getMealById(id: string): Promise<MealEntry | undefined> {
  const meals = await getMeals();
  return meals.find((meal) => meal.id === id);
}

async function prepareMeal(meal: MealEntry, existing?: MealEntry): Promise<MealEntry> {
  const now = new Date().toISOString();
  const currentUserId = meal.userId ?? await getCurrentUserId();
  const normalized = normalizeMeal({
    ...meal,
    origin: meal.origin ?? existing?.origin,
    userId: currentUserId,
    createdAt: meal.createdAt ?? now,
    updatedAt: now,
    moodTag: meal.moodTag ?? meal.moodTags?.[0],
    locationText: meal.locationText ?? meal.location,
  });

  if (!normalized) {
    throw new Error('Mealog could not save an incomplete meal entry.');
  }

  if (normalized.photoMediaId || normalized.photoUri) {
    const media = normalized.photoMediaId
      ? await assertManagedMediaReadable(normalized.photoMediaId)
      : await importImageToManagedStore({
        sourceUri: normalized.photoUri!,
        ownerType: 'meal',
        ownerId: normalized.id,
        userId: normalized.userId,
      });
    normalized.photoMediaId = media.id;
    normalized.photoUri = media.localManagedUri;
    normalized.photoThumbnailUri = isManagedMediaUri(media.thumbnailUri) ? media.thumbnailUri : media.localManagedUri;
    normalized.photoStorageStatus = media.storageStatus;
  } else {
    normalized.photoMediaId = undefined;
    normalized.photoThumbnailUri = undefined;
    normalized.photoStorageStatus = undefined;
  }

  return normalized;
}

function upsertMeal(meals: MealEntry[], normalized: MealEntry): MealEntry[] {
  const index = meals.findIndex((existing) => existing.id === normalized.id);
  if (index >= 0) {
    meals[index] = normalized;
  } else {
    meals.push(normalized);
  }

  return sortMealsNewestFirst(meals);
}

export async function saveMeal(meal: MealEntry): Promise<void> {
  return withStorageKeys(MEMORY_KEYS, async () => {
    const meals = await getStoredMeals();
    const normalized = await prepareMeal(meal, meals.find((item) => item.id === meal.id));
    try {
      await writeLists([[STORAGE_KEYS.meals, upsertMeal(meals, normalized)]]);
    } catch (error) {
      await discardFailedImport(meal.photoMediaId ? undefined : normalized.photoMediaId, error);
    }
  });
}

/** The caller keeps meal.id stable across retries. Resolves only after both lists are saved. */
export async function saveMealMemory(meal: MealEntry, personIds: string[]): Promise<void> {
  return withStorageKeys(MEMORY_KEYS, async () => {
    const meals = await getStoredMeals();
    const companions = await getStoredMealCompanions();
    const people = await getStoredPeopleProfiles();
    const ids = [...new Set(personIds.filter(Boolean))];
    const nextCompanions = await companionsForMeal(meal.id, ids, companions, people);
    const normalized = await prepareMeal({ ...meal, personIds: ids }, meals.find((item) => item.id === meal.id));
    try {
      await writeLists([
        [STORAGE_KEYS.meals, upsertMeal(meals, normalized)],
        [STORAGE_KEYS.mealCompanions, [
          ...companions.filter((item) => item.mealId !== meal.id), ...nextCompanions,
        ]],
      ]);
    } catch (error) {
      await discardFailedImport(meal.photoMediaId ? undefined : normalized.photoMediaId, error);
    }
  });
}

export async function deleteMeal(id: string): Promise<void> {
  return withStorageKeys(MEMORY_KEYS, async () => {
    const meals = await getStoredMeals();
    const mealToDelete = meals.find((meal) => meal.id === id);
    const companions = await getStoredMealCompanions();
    const sharedPhotos = await getStoredSharedMealPhotos();
    const photosToDelete = sharedPhotos.filter((photo) => photo.mealId === id);
    await writeLists([
      [STORAGE_KEYS.meals, meals.filter((meal) => meal.id !== id)],
      [STORAGE_KEYS.mealCompanions, companions.filter((companion) => companion.mealId !== id)],
      [STORAGE_KEYS.sharedMealPhotos, sharedPhotos.filter((photo) => photo.mealId !== id)],
    ]);

    await deleteManagedMediaIfUnreferenced(mealToDelete?.photoMediaId);
    await Promise.all(photosToDelete.map((photo) => deleteManagedMediaIfUnreferenced(photo.mediaId)));
    await Promise.all(companions.filter((item) => item.mealId === id)
      .map((item) => deleteManagedMediaIfUnreferenced(item.personAvatarMediaIdSnapshot)));
  });
}

// ── People / companionship storage ──────────────────────────

export async function getPeopleTags(): Promise<PeopleTag[]> {
  return getList<PeopleTag>(STORAGE_KEYS.peopleTags);
}

export async function savePeopleTag(tag: PeopleTag): Promise<void> {
  return withStorageKeys([STORAGE_KEYS.peopleTags], async () => {
    const tags = await getPeopleTags();
    const index = tags.findIndex((existing) => existing.id === tag.id);
    if (index >= 0) {
      tags[index] = tag;
    } else {
      tags.push(tag);
    }
    await setList(STORAGE_KEYS.peopleTags, tags);
  });
}

export async function deletePeopleTag(id: string): Promise<void> {
  return withStorageKeys([STORAGE_KEYS.peopleTags], async () => {
    const tags = await getPeopleTags();
    await setList(
      STORAGE_KEYS.peopleTags,
      tags.filter((tag) => tag.id !== id),
    );
  });
}

// ── Person profile storage ─────────────────────────────────

type StoredPersonProfile = Partial<PersonProfile> & {
  displayName?: string;
  avatarUri?: string;
  avatarMediaId?: string;
  avatarStorageStatus?: string;
};

function normalizePersonProfile(person: StoredPersonProfile): PersonProfile | null {
  if (!person.id) return null;

  const name = (person.name ?? person.displayName ?? '').trim();
  if (!name) return null;

  const now = new Date().toISOString();
  return {
    id: person.id,
    origin: person.origin,
    userId: person.userId,
    name,
    nickname: person.nickname?.trim() || undefined,
    avatarMediaId: person.avatarMediaId,
    avatarUrl: person.avatarUrl ?? person.avatarUri,
    avatarStorageStatus: person.avatarStorageStatus as PersonProfile['avatarStorageStatus'],
    relationship: person.relationship,
    note: person.note?.trim() || undefined,
    createdAt: person.createdAt ?? now,
    updatedAt: person.updatedAt ?? person.createdAt ?? now,
    deletedAt: person.deletedAt,
  };
}

async function getRawPeopleProfiles(): Promise<PersonProfile[]> {
  const stored = await getList<StoredPersonProfile>(STORAGE_KEYS.peopleProfiles);
  return stored
    .map(normalizePersonProfile)
    .filter((person): person is PersonProfile => person !== null);
}

async function migrateLegacyPersonTags(profiles: PersonProfile[]): Promise<PersonProfile[]> {
  const tags = await getPeopleTags();
  const legacyPeople = tags.filter((tag): tag is PersonTag => 'name' in tag);
  if (legacyPeople.length === 0) return profiles;

  const profileById = new Map(profiles.map((person) => [person.id, person]));
  let changed = false;

  for (const legacy of legacyPeople) {
    if (profileById.has(legacy.id)) continue;

    const migrated = normalizePersonProfile({
      id: legacy.id,
      name: legacy.name,
      nickname: legacy.displayName && legacy.displayName !== legacy.name
        ? legacy.displayName
        : undefined,
      createdAt: legacy.createdAt,
      updatedAt: legacy.updatedAt ?? legacy.createdAt,
    });

    if (migrated) {
      profileById.set(migrated.id, migrated);
      changed = true;
    }
  }

  const next = [...profileById.values()];
  if (changed) {
    await setList(STORAGE_KEYS.peopleProfiles, next);
  }

  return next;
}

async function hydratePersonMedia(person: PersonProfile): Promise<PersonProfile> {
  if (!person.avatarMediaId) return person;
  return {
    ...person,
    avatarUrl: await resolveManagedMediaUri(person.avatarMediaId, person.avatarUrl),
  };
}

async function getStoredPeopleProfiles(): Promise<PersonProfile[]> {
  return migrateLegacyPersonTags(await getRawPeopleProfiles());
}

export async function getPeopleProfiles(options?: {
  includeDeleted?: boolean;
}): Promise<PersonProfile[]> {
  const profiles = await withStorageKeys(
    [STORAGE_KEYS.peopleProfiles, STORAGE_KEYS.peopleTags], getStoredPeopleProfiles,
  );
  const filtered = options?.includeDeleted
    ? profiles
    : profiles.filter((person) => !person.deletedAt);
  const hydrated = await Promise.all(filtered.map(hydratePersonMedia));

  return [...hydrated].sort((a, b) => {
    const dateCompare = (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt);
    return dateCompare !== 0 ? dateCompare : a.name.localeCompare(b.name);
  });
}

export async function getPersonById(
  id: string,
  options?: { includeDeleted?: boolean },
): Promise<PersonProfile | undefined> {
  const people = await getPeopleProfiles({ includeDeleted: true });
  const person = people.find((candidate) => candidate.id === id);
  if (!person || (!options?.includeDeleted && person.deletedAt)) return undefined;
  return person;
}

export async function savePersonProfile(person: PersonProfile): Promise<PersonProfile> {
  return withStorageKeys(MEMORY_KEYS, async () => {
    const people = await getStoredPeopleProfiles();
    const existing = people.find((item) => item.id === person.id);
    const now = new Date().toISOString();
    const currentUserId = person.userId ?? await getCurrentUserId();
    const normalized = normalizePersonProfile({
      ...person,
      origin: person.origin ?? existing?.origin,
      userId: currentUserId,
      createdAt: person.createdAt ?? now,
      updatedAt: now,
    });

    if (!normalized) {
      throw new Error('Mealog could not save a person without a name.');
    }

    if (normalized.avatarMediaId || normalized.avatarUrl) {
      const media = normalized.avatarMediaId
        ? await assertManagedMediaReadable(normalized.avatarMediaId)
        : await importImageToManagedStore({
          sourceUri: normalized.avatarUrl!,
          ownerType: 'person',
          ownerId: normalized.id,
          userId: normalized.userId,
        });
      normalized.avatarMediaId = media.id;
      normalized.avatarUrl = media.localManagedUri;
      normalized.avatarStorageStatus = media.storageStatus;
    } else {
      normalized.avatarMediaId = undefined;
      normalized.avatarStorageStatus = undefined;
    }

    const index = people.findIndex((existing) => existing.id === normalized.id);
    if (index >= 0) {
      people[index] = normalized;
    } else {
      people.push(normalized);
    }

    try {
      await writeLists([[STORAGE_KEYS.peopleProfiles, people]]);
    } catch (error) {
      await discardFailedImport(person.avatarMediaId ? undefined : normalized.avatarMediaId, error);
    }
    return normalized;
  });
}

export async function softDeletePersonProfile(id: string): Promise<void> {
  return withStorageKeys(MEMORY_KEYS, async () => {
    const people = await getStoredPeopleProfiles();
    const now = new Date().toISOString();
    await setList(
      STORAGE_KEYS.peopleProfiles,
      people.map((person) => (
        person.id === id
          ? { ...person, origin: 'user' as const, deletedAt: person.deletedAt ?? now, updatedAt: now }
          : person
      )),
    );
  });
}

export async function mergePersonProfiles(sourcePersonId: string, targetPersonId: string): Promise<void> {
  if (sourcePersonId === targetPersonId) return;
  return withStorageKeys(MEMORY_KEYS, async () => {
    const people = await getStoredPeopleProfiles();
    if (!people.some((person) => person.id === targetPersonId && !person.deletedAt)) {
      throw new Error('The person to merge into could not be found.');
    }
    const companions = await getStoredMealCompanions();
    const remapped = companions.map((companion) => (
      companion.personId === sourcePersonId
        ? { ...companion, personId: targetPersonId }
        : companion
    ));
    const unique = new Map<string, MealCompanion>();

    for (const companion of remapped) {
      const key = `${companion.mealId}:${companion.personId}`;
      if (!unique.has(key)) unique.set(key, companion);
    }

    const meals = await getStoredMeals();
    const photos = await getStoredSharedMealPhotos();
    const now = new Date().toISOString();
    const remap = (ids: string[]) => [...new Set(ids.map((id) => id === sourcePersonId ? targetPersonId : id))];
    await writeLists([
      [STORAGE_KEYS.mealCompanions, [...unique.values()]],
      [STORAGE_KEYS.meals, meals.map((meal) => meal.personIds?.includes(sourcePersonId)
        ? { ...meal, origin: 'user', personIds: remap(meal.personIds), updatedAt: now } : meal)],
      [STORAGE_KEYS.sharedMealPhotos, photos.map((photo) => photo.taggedPersonIds.includes(sourcePersonId)
        ? { ...photo, origin: 'user', taggedPersonIds: remap(photo.taggedPersonIds) } : photo)],
      [STORAGE_KEYS.peopleProfiles, people.map((person) => person.id === sourcePersonId
        ? { ...person, origin: 'user', deletedAt: person.deletedAt ?? now, updatedAt: now } : person)],
    ]);
  });
}

// Backward-compatible aliases for current early screens.
export async function getPeople(): Promise<PersonTag[]> {
  const people = await getPeopleProfiles();
  return people.map((person) => ({
    id: person.id,
    name: person.name,
    kind: 'person',
    displayName: person.nickname ?? person.name,
    createdAt: person.createdAt,
    updatedAt: person.updatedAt,
  }));
}

export async function savePerson(person: PersonTag): Promise<void> {
  await savePersonProfile({
    id: person.id,
    name: person.name,
    nickname: person.displayName && person.displayName !== person.name
      ? person.displayName
      : undefined,
    createdAt: person.createdAt,
    updatedAt: person.updatedAt ?? new Date().toISOString(),
  });
}

export async function deletePerson(id: string): Promise<void> {
  await softDeletePersonProfile(id);
}

// ── Meal companions storage ────────────────────────────────

type StoredMealCompanion = Partial<MealCompanion>;

function normalizeMealCompanion(companion: StoredMealCompanion): MealCompanion | null {
  if (!companion.id || !companion.mealId || !companion.personId) return null;

  return {
    id: companion.id,
    mealId: companion.mealId,
    personId: companion.personId,
    addedAt: companion.addedAt ?? new Date().toISOString(),
    mealSpecificNote: companion.mealSpecificNote?.trim() || undefined,
    personNameSnapshot: companion.personNameSnapshot,
    personAvatarSnapshot: isManagedMediaUri(companion.personAvatarSnapshot)
      ? companion.personAvatarSnapshot : undefined,
    personAvatarMediaIdSnapshot: companion.personAvatarMediaIdSnapshot,
  };
}

async function companionAvatar(mediaId?: string, uri?: string) {
  const media = await getManagedMediaById(mediaId);
  return {
    personAvatarMediaIdSnapshot: mediaId,
    personAvatarSnapshot: isManagedMediaUri(media?.localManagedUri)
      ? media!.localManagedUri : isManagedMediaUri(uri) ? uri : undefined,
  };
}

async function migrateMealPersonIds(companions: MealCompanion[]): Promise<MealCompanion[]> {
  const meals = await getStoredMeals();
  const people = await getStoredPeopleProfiles();
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const relationKeys = new Set(companions.map((item) => `${item.mealId}:${item.personId}`));
  const next = [...companions];
  let changed = false;

  for (const meal of meals) {
    for (const personId of meal.personIds ?? []) {
      const key = `${meal.id}:${personId}`;
      if (relationKeys.has(key)) continue;

      const person = peopleById.get(personId);
      next.push({
        id: generateId(),
        mealId: meal.id,
        personId,
        addedAt: meal.updatedAt ?? meal.createdAt,
        personNameSnapshot: person?.name,
        ...await companionAvatar(person?.avatarMediaId, person?.avatarUrl),
      });
      relationKeys.add(key);
      changed = true;
    }
  }

  if (changed) {
    await setList(STORAGE_KEYS.mealCompanions, next);
  }

  return next;
}

async function getStoredMealCompanions(): Promise<MealCompanion[]> {
  const stored = await getList<StoredMealCompanion>(STORAGE_KEYS.mealCompanions);
  const normalized = stored.map(normalizeMealCompanion)
    .filter((companion): companion is MealCompanion => companion !== null);
  const companions = await Promise.all(normalized.map(async (companion) => ({
    ...companion,
    ...await companionAvatar(companion.personAvatarMediaIdSnapshot, companion.personAvatarSnapshot),
  })));
  if (stored.some((item, index) => item.personAvatarSnapshot !== companions[index]?.personAvatarSnapshot)) {
    await setList(STORAGE_KEYS.mealCompanions, companions);
  }
  return migrateMealPersonIds(companions);
}

export async function getMealCompanions(mealId?: string): Promise<MealCompanion[]> {
  const companions = await withStorageKeys(MEMORY_KEYS, getStoredMealCompanions);
  const filtered = mealId
    ? companions.filter((companion) => companion.mealId === mealId)
    : companions;

  return filtered.sort((a, b) => a.addedAt.localeCompare(b.addedAt));
}

async function companionsForMeal(
  mealId: string,
  personIds: string[],
  allCompanions: MealCompanion[],
  people: PersonProfile[],
  notes?: Record<string, string | undefined>,
): Promise<MealCompanion[]> {
  const uniquePersonIds = [...new Set(personIds.filter(Boolean))];
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const existingForMeal = allCompanions.filter((companion) => companion.mealId === mealId);
  const now = new Date().toISOString();

  return Promise.all(uniquePersonIds.map(async (personId) => {
    const existing = existingForMeal.find((companion) => companion.personId === personId);
    const person = peopleById.get(personId);
    if (!person && !existing) throw new Error('A selected person could not be found.');
    return {
      id: existing?.id ?? generateId(),
      mealId,
      personId,
      addedAt: existing?.addedAt ?? now,
      mealSpecificNote: notes?.[personId]?.trim() || existing?.mealSpecificNote,
      personNameSnapshot: person?.name ?? existing?.personNameSnapshot,
      ...await companionAvatar(
        person?.avatarMediaId ?? existing?.personAvatarMediaIdSnapshot,
        person?.avatarUrl ?? existing?.personAvatarSnapshot,
      ),
    };
  }));
}

async function setMealCompanionsStored(
  mealId: string,
  personIds: string[],
  notes?: Record<string, string | undefined>,
): Promise<MealCompanion[]> {
  const meals = await getStoredMeals();
  const meal = meals.find((item) => item.id === mealId);
  if (!meal) throw new Error('The meal could not be found.');
  const companions = await getStoredMealCompanions();
  const ids = [...new Set(personIds.filter(Boolean))];
  const nextForMeal = await companionsForMeal(mealId, ids, companions, await getStoredPeopleProfiles(), notes);
  await writeLists([
    [STORAGE_KEYS.meals, meals.map((item) => item.id === mealId
      ? { ...item, origin: 'user', personIds: ids, updatedAt: new Date().toISOString() } : item)],
    [STORAGE_KEYS.mealCompanions, [...companions.filter((item) => item.mealId !== mealId), ...nextForMeal]],
  ]);
  return nextForMeal;
}

export async function setMealCompanions(
  mealId: string,
  personIds: string[],
  notes?: Record<string, string | undefined>,
): Promise<MealCompanion[]> {
  return withStorageKeys(MEMORY_KEYS, () => setMealCompanionsStored(mealId, personIds, notes));
}

export async function addMealCompanion(
  mealId: string,
  personId: string,
  mealSpecificNote?: string,
): Promise<MealCompanion[]> {
  return withStorageKeys(MEMORY_KEYS, async () => {
    const companions = (await getStoredMealCompanions()).filter((item) => item.mealId === mealId);
    const personIds = new Set(companions.map((companion) => companion.personId));
    personIds.add(personId);
    return setMealCompanionsStored(mealId, [...personIds], {
      [personId]: mealSpecificNote,
    });
  });
}

export async function removeMealCompanion(mealId: string, personId: string): Promise<void> {
  return withStorageKeys(MEMORY_KEYS, async () => {
    const companions = (await getStoredMealCompanions()).filter((item) => item.mealId === mealId);
    await setMealCompanionsStored(
      mealId,
      companions
        .filter((companion) => companion.personId !== personId)
        .map((companion) => companion.personId),
    );
  });
}

export async function getPeopleForMeal(mealId: string): Promise<PersonProfile[]> {
  const companions = await getMealCompanions(mealId);
  const people = await getPeopleProfiles({ includeDeleted: true });
  const peopleById = new Map(people.map((person) => [person.id, person]));

  return companions
    .map((companion) => peopleById.get(companion.personId))
    .filter((person): person is PersonProfile => Boolean(person));
}

export async function getPersonMealSummaries(): Promise<PersonMealSummary[]> {
  const people = await getPeopleProfiles();
  const meals = await getMeals();
  const companions = await getMealCompanions();
  const photos = await getSharedMealPhotos();
  const mealsById = new Map(meals.map((meal) => [meal.id, meal]));

  return people.map((person) => {
    const personCompanions = companions.filter((item) => item.personId === person.id);
    const dates = personCompanions
      .map((item) => mealsById.get(item.mealId)?.date)
      .filter((date): date is string => Boolean(date))
      .sort();

    return {
      person,
      sharedMealCount: new Set(personCompanions.map((item) => item.mealId)).size,
      firstSharedMealDate: dates[0],
      lastSharedMealDate: dates[dates.length - 1],
      sharedPhotoCount: photos.filter((photo) => photo.taggedPersonIds.includes(person.id)).length,
    };
  });
}

// ── Shared meal photos storage ─────────────────────────────

type StoredSharedMealPhoto = Partial<SharedMealPhoto>;

function normalizeSharedMealPhoto(photo: StoredSharedMealPhoto): SharedMealPhoto | null {
  if (!photo.id || !photo.mealId || !photo.imageUrl) return null;

  return {
    id: photo.id,
    origin: photo.origin,
    userId: photo.userId,
    mealId: photo.mealId,
    mediaId: photo.mediaId,
    imageUrl: photo.imageUrl,
    thumbnailUri: photo.thumbnailUri,
    storageStatus: photo.storageStatus as SharedMealPhoto['storageStatus'],
    caption: photo.caption?.trim() || undefined,
    takenAt: photo.takenAt,
    taggedPersonIds: Array.isArray(photo.taggedPersonIds) ? photo.taggedPersonIds : [],
    isCover: Boolean(photo.isCover),
    createdAt: photo.createdAt ?? new Date().toISOString(),
  };
}

async function getStoredSharedMealPhotos(): Promise<SharedMealPhoto[]> {
  const stored = await getList<StoredSharedMealPhoto>(STORAGE_KEYS.sharedMealPhotos);
  return stored
    .map(normalizeSharedMealPhoto)
    .filter((photo): photo is SharedMealPhoto => photo !== null);
}

async function hydrateSharedMealPhotoMedia(photo: SharedMealPhoto): Promise<SharedMealPhoto> {
  if (!photo.mediaId) return photo;
  return {
    ...photo,
    imageUrl: await resolveManagedMediaUri(photo.mediaId, photo.imageUrl) ?? photo.imageUrl,
    thumbnailUri: await resolveManagedMediaThumbnailUri(
      photo.mediaId,
      photo.thumbnailUri ?? photo.imageUrl,
    ),
  };
}

export async function getSharedMealPhotos(mealId?: string): Promise<SharedMealPhoto[]> {
  const storedPhotos = await withStorageKeys([STORAGE_KEYS.sharedMealPhotos], getStoredSharedMealPhotos);
  const filtered = mealId ? storedPhotos.filter((photo) => photo.mealId === mealId) : storedPhotos;
  const photos = await Promise.all(filtered.map(hydrateSharedMealPhotoMedia));
  return photos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveSharedMealPhoto(photo: SharedMealPhoto): Promise<SharedMealPhoto> {
  return withStorageKeys(MEMORY_KEYS, async () => {
    const photos = await getStoredSharedMealPhotos();
    const existing = photos.find((item) => item.id === photo.id);
    const currentUserId = photo.userId ?? await getCurrentUserId();
    const normalized = normalizeSharedMealPhoto({
      ...photo,
      origin: photo.origin ?? existing?.origin,
      userId: currentUserId,
      createdAt: photo.createdAt ?? new Date().toISOString(),
    });

    if (!normalized) {
      throw new Error('Mealog could not save this shared photograph.');
    }

    const meals = await getStoredMeals();
    const media = normalized.mediaId
      ? await assertManagedMediaReadable(normalized.mediaId)
      : await importImageToManagedStore({
        sourceUri: normalized.imageUrl,
        ownerType: 'sharedMeal',
        ownerId: normalized.mealId,
        userId: normalized.userId,
      });
    normalized.mediaId = media.id;
    normalized.imageUrl = media.localManagedUri!;
    normalized.thumbnailUri = isManagedMediaUri(media.thumbnailUri) ? media.thumbnailUri : media.localManagedUri;
    normalized.storageStatus = media.storageStatus;

    const nextPhotos = normalized.isCover
      ? photos.map((existing) => (
        existing.mealId === normalized.mealId
          ? { ...existing, isCover: false }
          : existing
      ))
      : photos;

    const index = nextPhotos.findIndex((existing) => existing.id === normalized.id);
    if (index >= 0) {
      nextPhotos[index] = normalized;
    } else {
      nextPhotos.push(normalized);
    }

    const changes: [string, unknown[]][] = [[STORAGE_KEYS.sharedMealPhotos, nextPhotos]];
    if (normalized.isCover || normalized.origin === 'user') {
      changes.push([STORAGE_KEYS.meals, meals.map((meal) => meal.id === normalized.mealId ? {
        ...meal,
        origin: normalized.origin === 'user' ? 'user' : meal.origin,
        updatedAt: new Date().toISOString(),
        ...(normalized.isCover ? {
          photoMediaId: normalized.mediaId,
          photoUri: normalized.imageUrl,
          photoThumbnailUri: normalized.thumbnailUri,
          photoStorageStatus: normalized.storageStatus,
        } : {}),
      } : meal)]);
    }
    try {
      await writeLists(changes);
    } catch (error) {
      await discardFailedImport(photo.mediaId ? undefined : normalized.mediaId, error);
    }

    return normalized;
  });
}

export async function deleteSharedMealPhoto(id: string): Promise<void> {
  return withStorageKeys(MEMORY_KEYS, async () => {
    const photos = await getStoredSharedMealPhotos();
    const photoToDelete = photos.find((photo) => photo.id === id);
    await writeLists([[
      STORAGE_KEYS.sharedMealPhotos,
      photos.filter((photo) => photo.id !== id),
    ]]);
    await deleteManagedMediaIfUnreferenced(photoToDelete?.mediaId);
  });
}

// ── Collection storage ──────────────────────────────────────

export async function getCollectionItems(): Promise<CollectionItem[]> {
  return getList<CollectionItem>(STORAGE_KEYS.collectionItems);
}

export async function saveCollectionItem(item: CollectionItem): Promise<void> {
  return withStorageKeys([STORAGE_KEYS.collectionItems], async () => {
    const items = await getCollectionItems();
    const index = items.findIndex((existing) => existing.id === item.id);
    if (index >= 0) {
      items[index] = item;
    } else {
      items.push(item);
    }
    await setList(STORAGE_KEYS.collectionItems, items);
  });
}

// Backward-compatible alias.
export async function getCollection(): Promise<CollectionItem[]> {
  return getCollectionItems();
}

// ── Achievement progress storage ───────────────────────────

type StoredAchievementProgress = Partial<AchievementProgress>;

function normalizeAchievementProgress(
  progress: StoredAchievementProgress,
): AchievementProgress | null {
  if (!progress.achievementId) return null;

  return {
    achievementId: progress.achievementId,
    currentValue: Number(progress.currentValue ?? 0),
    targetValue: Number(progress.targetValue ?? 0),
    status: progress.status ?? 'locked',
    unlockedAt: progress.unlockedAt,
    firstSourceMealId: progress.firstSourceMealId,
    lastEvaluatedAt: progress.lastEvaluatedAt ?? new Date().toISOString(),
    seenAt: progress.seenAt,
  };
}

export async function getAchievementProgress(): Promise<AchievementProgress[]> {
  const stored = await getList<StoredAchievementProgress>(STORAGE_KEYS.achievementProgress);
  return stored
    .map(normalizeAchievementProgress)
    .filter((progress): progress is AchievementProgress => progress !== null);
}

export async function saveAchievementProgress(
  progress: AchievementProgress[],
): Promise<void> {
  await withStorageKeys([STORAGE_KEYS.achievementProgress], () => setList(STORAGE_KEYS.achievementProgress, progress));
}

export async function markAchievementSeen(achievementId: string): Promise<void> {
  return withStorageKeys([STORAGE_KEYS.achievementProgress], async () => {
    const progress = await getAchievementProgress();
    const now = new Date().toISOString();
    await setList(STORAGE_KEYS.achievementProgress,
      progress.map((item) => (
        item.achievementId === achievementId
          ? {
            ...item,
            status: item.status === 'newly_unlocked' ? 'unlocked' : item.status,
            seenAt: item.seenAt ?? now,
          }
          : item
      )),
    );
  });
}

export async function getAchievementMigrationSummary(): Promise<AchievementMigrationSummary> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.achievementMigrationSummary);
  if (!raw) {
    return {
      completed: false,
      foundCount: 0,
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AchievementMigrationSummary>;
    return {
      completed: Boolean(parsed.completed),
      foundCount: Number(parsed.foundCount ?? 0),
      completedAt: parsed.completedAt,
      seenAt: parsed.seenAt,
    };
  } catch {
    return {
      completed: false,
      foundCount: 0,
    };
  }
}

export async function saveAchievementMigrationSummary(
  summary: AchievementMigrationSummary,
): Promise<void> {
  await AsyncStorage.setItem(
    STORAGE_KEYS.achievementMigrationSummary,
    JSON.stringify(summary),
  );
}

// ── First launch onboarding ─────────────────────────────────

export async function hasCompletedOnboarding(): Promise<boolean> {
  const value = await AsyncStorage.getItem(STORAGE_KEYS.onboardingComplete);
  return value === 'true';
}

export async function completeOnboarding(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.onboardingComplete, 'true');
}


// ── Managed media migration ─────────────────────────────────

const EMPTY_MEDIA_MIGRATION_REPORT: MediaMigrationReport = {
  totalLegacyMediaRecords: 0,
  successfullyMigrated: 0,
  alreadyManaged: 0,
  sourceFilesMissing: 0,
  migrationFailed: 0,
  databaseRecordsUpdated: 0,
  completedAt: '',
};

function isLegacyExternalMedia(uri?: string, mediaId?: string): boolean {
  if (!uri) return false;
  if (mediaId || isManagedMediaUri(uri)) return false;
  return true;
}

async function deleteManagedMediaIfUnreferenced(mediaId?: string): Promise<void> {
  if (!mediaId) return;

  const [meals, people, photos, companions, media] = await Promise.all([
    getList<StoredMeal>(STORAGE_KEYS.meals),
    getList<StoredPersonProfile>(STORAGE_KEYS.peopleProfiles),
    getList<StoredSharedMealPhoto>(STORAGE_KEYS.sharedMealPhotos),
    getList<MealCompanion>(STORAGE_KEYS.mealCompanions),
    getManagedMediaById(mediaId),
  ]);

  const matchesUri = (uri?: string) => Boolean(uri && (uri === media?.localManagedUri || uri === media?.thumbnailUri));
  const stillReferenced = meals.some((meal) => meal.photoMediaId === mediaId
    || matchesUri(meal.photoUri) || matchesUri(meal.photoThumbnailUri))
    || people.some((person) => person.avatarMediaId === mediaId || matchesUri(person.avatarUrl) || matchesUri(person.avatarUri))
    || photos.some((photo) => photo.mediaId === mediaId || matchesUri(photo.imageUrl) || matchesUri(photo.thumbnailUri))
    || companions.some((item) => item.personAvatarMediaIdSnapshot === mediaId || matchesUri(item.personAvatarSnapshot));

  if (!stillReferenced) {
    await deleteManagedMedia(mediaId);
  }
}

async function saveMediaMigrationReport(report: MediaMigrationReport): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.mediaMigrationReport, JSON.stringify(report));
}

export async function getMediaMigrationReport(): Promise<MediaMigrationReport> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.mediaMigrationReport);
  if (!raw) return EMPTY_MEDIA_MIGRATION_REPORT;

  try {
    return {
      ...EMPTY_MEDIA_MIGRATION_REPORT,
      ...(JSON.parse(raw) as Partial<MediaMigrationReport>),
    };
  } catch {
    return EMPTY_MEDIA_MIGRATION_REPORT;
  }
}

export async function migrateLegacyMediaToManagedStore(): Promise<MediaMigrationReport> {
  return withStorageKeys(MEMORY_KEYS, async () => {
    const report: MediaMigrationReport = {
      ...EMPTY_MEDIA_MIGRATION_REPORT,
      completedAt: new Date().toISOString(),
    };

    const meals = await getStoredMeals();
    const people = await getRawPeopleProfiles();
    const sharedPhotos = await getStoredSharedMealPhotos();
    let mealsChanged = false;
    let peopleChanged = false;
    let sharedPhotosChanged = false;

    for (const meal of meals) {
      if (!meal.photoUri) continue;

      report.totalLegacyMediaRecords += 1;
      if (!isLegacyExternalMedia(meal.photoUri, meal.photoMediaId)) {
        report.alreadyManaged += 1;
        continue;
      }

      try {
        const media = await importImageToManagedStore({
          sourceUri: meal.photoUri,
          ownerType: 'meal',
          ownerId: meal.id,
          userId: meal.userId,
        });
        meal.photoMediaId = media.id;
        meal.photoUri = media.localManagedUri ?? media.remoteUrl;
        meal.photoThumbnailUri = media.thumbnailUri ?? meal.photoUri;
        meal.photoStorageStatus = media.storageStatus;
        mealsChanged = true;
        report.successfullyMigrated += 1;
        report.databaseRecordsUpdated += 1;
      } catch {
        meal.photoStorageStatus = 'source_missing';
        mealsChanged = true;
        report.sourceFilesMissing += 1;
        report.databaseRecordsUpdated += 1;
      }
    }

    for (const person of people) {
      if (!person.avatarUrl) continue;

      report.totalLegacyMediaRecords += 1;
      if (!isLegacyExternalMedia(person.avatarUrl, person.avatarMediaId)) {
        report.alreadyManaged += 1;
        continue;
      }

      try {
        const media = await importImageToManagedStore({
          sourceUri: person.avatarUrl,
          ownerType: 'person',
          ownerId: person.id,
          userId: person.userId,
        });
        person.avatarMediaId = media.id;
        person.avatarUrl = media.localManagedUri ?? media.remoteUrl;
        person.avatarStorageStatus = media.storageStatus;
        peopleChanged = true;
        report.successfullyMigrated += 1;
        report.databaseRecordsUpdated += 1;
      } catch {
        person.avatarStorageStatus = 'source_missing';
        peopleChanged = true;
        report.sourceFilesMissing += 1;
        report.databaseRecordsUpdated += 1;
      }
    }

    for (const photo of sharedPhotos) {
      if (!photo.imageUrl) continue;

      report.totalLegacyMediaRecords += 1;
      if (!isLegacyExternalMedia(photo.imageUrl, photo.mediaId)) {
        report.alreadyManaged += 1;
        continue;
      }

      try {
        const media = await importImageToManagedStore({
          sourceUri: photo.imageUrl,
          ownerType: 'sharedMeal',
          ownerId: photo.mealId,
          userId: photo.userId,
        });
        photo.mediaId = media.id;
        photo.imageUrl = media.localManagedUri ?? media.remoteUrl ?? photo.imageUrl;
        photo.thumbnailUri = media.thumbnailUri ?? photo.imageUrl;
        photo.storageStatus = media.storageStatus;
        sharedPhotosChanged = true;
        report.successfullyMigrated += 1;
        report.databaseRecordsUpdated += 1;
      } catch {
        photo.storageStatus = 'source_missing';
        sharedPhotosChanged = true;
        report.sourceFilesMissing += 1;
        report.databaseRecordsUpdated += 1;
      }
    }

    if (mealsChanged) await setList(STORAGE_KEYS.meals, sortMealsNewestFirst(meals));
    if (peopleChanged) await setList(STORAGE_KEYS.peopleProfiles, people);
    if (sharedPhotosChanged) await setList(STORAGE_KEYS.sharedMealPhotos, sharedPhotos);

    await saveMediaMigrationReport(report);
    return report;
  });
}

let mediaMigrationPromise: Promise<MediaMigrationReport> | null = null;

export function runMediaMigrationOnce(): Promise<MediaMigrationReport> {
  if (!mediaMigrationPromise) {
    mediaMigrationPromise = migrateLegacyMediaToManagedStore().catch((error) => {
      mediaMigrationPromise = null;
      throw error;
    });
  }
  return mediaMigrationPromise;
}

/** Missing origin is legacy/user data and is never treated as a sample. */
export async function removeSampleData(): Promise<void> {
  return withStorageKeys([...MEMORY_KEYS, STORAGE_KEYS.achievementProgress], async () => {
    const [meals, people, companions, photos, previousProgress] = await Promise.all([
      getList<StoredMeal>(STORAGE_KEYS.meals),
      getList<StoredPersonProfile>(STORAGE_KEYS.peopleProfiles),
      getList<StoredMealCompanion>(STORAGE_KEYS.mealCompanions),
      getList<StoredSharedMealPhoto>(STORAGE_KEYS.sharedMealPhotos),
      getAchievementProgress(),
    ]);
    const removedMeals = meals.filter((meal) => meal.origin === 'sample');
    const removedMealIds = new Set(removedMeals.map((meal) => meal.id));
    const retainedMeals = meals.filter((meal) => meal.origin !== 'sample');
    const retainedMealIds = new Set(retainedMeals.map((meal) => meal.id));
    const retainedCompanions = companions.filter((item) => !removedMealIds.has(item.mealId));
    const removedPhotos = photos.filter((photo) => photo.origin === 'sample' && !retainedMealIds.has(photo.mealId));
    const removedPhotoIds = new Set(removedPhotos.map((photo) => photo.id));
    const retainedPhotos = photos.filter((photo) => !removedPhotoIds.has(photo.id));
    const usedPersonIds = new Set([
      ...retainedMeals.flatMap((meal) => [...(meal.personIds ?? []), ...(meal.peopleTags ?? [])]),
      ...retainedCompanions.map((item) => item.personId),
      ...retainedPhotos.flatMap((photo) => photo.taggedPersonIds ?? []),
    ]);
    const removedPeople = people.filter((person) => person.origin === 'sample' && !usedPersonIds.has(person.id));
    const removedPersonIds = new Set(removedPeople.map((person) => person.id));
    const retainedPeople = people.filter((person) => !removedPersonIds.has(person.id));
    if (!removedMeals.length && !removedPeople.length && !removedPhotos.length) return;

    const evaluationData = {
      meals: retainedMeals.map(normalizeMeal).filter((meal): meal is MealEntry => meal !== null),
      companions: retainedCompanions.filter((item) => retainedMealIds.has(item.mealId))
        .map(normalizeMealCompanion).filter((item): item is MealCompanion => item !== null),
      sharedPhotos: retainedPhotos.filter((photo) => retainedMealIds.has(photo.mealId))
        .map(normalizeSharedMealPhoto).filter((photo): photo is SharedMealPhoto => photo !== null),
      suppressNewUnlocks: true,
    };
    const fresh = evaluateAchievementProgress(evaluationData);
    const freshById = new Map(fresh.map((item) => [item.progress.achievementId, item.progress]));
    // Only revoke an unlock with explicit sample provenance and no retained evidence.
    const safePrevious = previousProgress.filter((progress) => {
      const recalculated = freshById.get(progress.achievementId);
      return !progress.firstSourceMealId || !removedMealIds.has(progress.firstSourceMealId)
        || !recalculated || Boolean(recalculated.unlockedAt);
    }).map((progress) => ({
      ...progress,
      currentValue: freshById.get(progress.achievementId)?.currentValue ?? progress.currentValue,
      firstSourceMealId: removedMealIds.has(progress.firstSourceMealId)
        ? freshById.get(progress.achievementId)?.firstSourceMealId : progress.firstSourceMealId,
    }));
    const progress = evaluateAchievementProgress({ ...evaluationData, previousProgress: safePrevious })
      .map((item) => item.progress);
    progress.push(...safePrevious.filter((item) => !freshById.has(item.achievementId)));

    const changes: [string, unknown[]][] = [[STORAGE_KEYS.achievementProgress, progress]];
    if (removedMeals.length) changes.push(
      [STORAGE_KEYS.meals, retainedMeals], [STORAGE_KEYS.mealCompanions, retainedCompanions],
    );
    if (removedPeople.length) changes.push([STORAGE_KEYS.peopleProfiles, retainedPeople]);
    if (removedPhotos.length) changes.push([STORAGE_KEYS.sharedMealPhotos, retainedPhotos]);

    const removedCompanions = companions.filter((item) => removedMealIds.has(item.mealId));
    const mediaIds = new Set([
      ...removedMeals.map((meal) => meal.photoMediaId),
      ...removedPeople.map((person) => person.avatarMediaId),
      ...removedPhotos.map((photo) => photo.mediaId),
      ...removedCompanions.map((item) => item.personAvatarMediaIdSnapshot),
    ].filter((id): id is string => Boolean(id)));
    const removedUris = new Set([
      ...removedMeals.flatMap((meal) => [meal.photoUri, meal.photoThumbnailUri]),
      ...removedPeople.map((person) => person.avatarUrl),
      ...removedPhotos.flatMap((photo) => [photo.imageUrl, photo.thumbnailUri]),
      ...removedCompanions.map((item) => item.personAvatarSnapshot),
    ].filter((uri): uri is string => Boolean(uri)));
    for (const media of await getManagedMediaRecords()) {
      if ((media.localManagedUri && removedUris.has(media.localManagedUri))
        || (media.thumbnailUri && removedUris.has(media.thumbnailUri))) mediaIds.add(media.id);
    }

    await writeLists(changes);
    const deleted = await Promise.allSettled([...mediaIds].map(deleteManagedMediaIfUnreferenced));
    const failures = deleted.filter((result) => result.status === 'rejected');
    if (failures.length) {
      throw new Error(`Sample records were removed, but some unused images could not be deleted. ${failures
        .map((result) => result.status === 'rejected' ? errorMessage(result.reason) : '').join(' ')}`);
    }
  });
}

// ── Utility ─────────────────────────────────────────────────

export async function clearAll(): Promise<void> {
  await withStorageKeys(Object.values(STORAGE_KEYS), () => AsyncStorage.multiRemove(Object.values(STORAGE_KEYS)));
}
