import type { MealCompanion, MealEntry, PersonProfile, SharedMealPhoto } from '../types';

export function peopleForScope(
  people: PersonProfile[],
  meals: MealEntry[],
  companions: MealCompanion[],
  scope: 'personal' | 'sample',
  photos: SharedMealPhoto[] = [],
): PersonProfile[] {
  const inScope = (origin?: 'user' | 'sample') => scope === 'sample' ? origin === 'sample' : origin !== 'sample';
  const scopedMeals = meals.filter(meal => inScope(meal.origin));
  const mealIds = new Set(scopedMeals.map(meal => meal.id));
  const personIds = new Set(scopedMeals.flatMap(meal => meal.personIds ?? []));
  for (const companion of companions) {
    if (mealIds.has(companion.mealId)) personIds.add(companion.personId);
  }
  for (const photo of photos) {
    if (photo.mealId ? mealIds.has(photo.mealId) : inScope(photo.origin)) {
      photo.taggedPersonIds.forEach(id => personIds.add(id));
    }
  }
  return people.filter(person => !person.deletedAt && (inScope(person.origin) || personIds.has(person.id)));
}

/** Missing companionship is unknown; only an explicit choice marks a solo meal. */
export function companionTags(tags: string[], personIds: string[], alone?: boolean): string[] {
  if (personIds.length > 0 || alone === false) return tags.filter(tag => tag !== 'just-me');
  return alone === true ? ['just-me'] : [...tags];
}

export function mealWithPersonAction(personId: string, personRequest = String(Date.now())) {
  return {
    type: 'POP_TO',
    payload: {
      name: '(tabs)', merge: true,
      params: { screen: 'add', merge: true, params: { personId, personRequest } },
    },
  };
}

export function getPersonInitials(name?: string): string {
  const trimmed = name?.trim();
  if (!trimmed) return '?';

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function getPersonDisplayName(
  person?: PersonProfile,
  companion?: MealCompanion,
): string {
  if (person?.deletedAt) {
    return companion?.personNameSnapshot ?? 'Deleted person';
  }
  return person?.nickname ?? person?.name ?? companion?.personNameSnapshot ?? 'Deleted person';
}

export function formatSharedWith(names: string[]): string | undefined {
  const cleanNames = names.map((name) => name.trim()).filter(Boolean);
  if (cleanNames.length === 0) return undefined;
  if (cleanNames.length === 1) return `Shared with ${cleanNames[0]}`;
  if (cleanNames.length === 2) return `Shared with ${cleanNames[0]} and ${cleanNames[1]}`;
  return `Shared with ${cleanNames[0]}, ${cleanNames[1]}, and ${cleanNames.length - 2} others`;
}
