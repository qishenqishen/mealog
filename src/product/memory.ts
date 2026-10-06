import type { MealEntry, MealType } from '../types';

export function effectiveMemory(meal: MealEntry): boolean {
  return Boolean((meal.photoMediaId || meal.photoUri) && /^\d{4}-\d{2}-\d{2}$/.test(meal.date) &&
    ((meal.personIds?.length ?? 0) || meal.peopleTags.includes('just-me') || meal.location?.trim() || meal.note?.trim() || meal.moodTags.length));
}
export function memoryState(meal: MealEntry): 'minimal' | 'incomplete' | 'complete' | 'archived' {
  if (meal.archivedAt) return 'archived';
  if (effectiveMemory(meal)) return 'complete';
  return !meal.note?.trim() && !meal.location?.trim() && !meal.moodTags.length && !meal.personIds?.length && !meal.peopleTags.length ? 'minimal' : 'incomplete';
}
export function inferMealType(time: string): MealType {
  const hour = Number(time.split(':')[0]);
  return hour >= 7 && hour <= 10 ? 'breakfast' : hour >= 11 && hour <= 14 ? 'lunch' : hour >= 17 && hour <= 21 ? 'dinner' : 'snack';
}
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export type ReflectionPeriod = 'week' | 'month' | 'year';
export function periodRange(anchor: string, period: ReflectionPeriod): { start: string; end: string } {
  const date = new Date(`${anchor}T12:00:00`);
  if (!Number.isFinite(date.getTime()) || localDate(date) !== anchor) throw new Error('Invalid period date');
  if (period === 'year') return { start: `${anchor.slice(0, 4)}-01-01`, end: `${anchor.slice(0, 4)}-12-31` };
  if (period === 'month') return { start: `${anchor.slice(0, 7)}-01`, end: localDate(new Date(date.getFullYear(), date.getMonth() + 1, 0)) };
  const start = new Date(date); start.setDate(date.getDate() - (date.getDay() + 6) % 7);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  return { start: localDate(start), end: localDate(end) };
}
export function filterPeriod(meals: MealEntry[], anchor: string, period: ReflectionPeriod, personId = '') {
  const { start, end } = periodRange(anchor, period);
  return meals.filter(meal => meal.date >= start && meal.date <= end && (!personId || meal.personIds?.includes(personId)));
}
export function recordedComparison(current: MealEntry[], previous: MealEntry[]) {
  const counts = (items: MealEntry[]) => ({ total: items.length, effective: items.filter(effectiveMemory).length,
    solo: items.filter(item => item.peopleTags.includes('just-me')).length,
    knownCompany: items.filter(item => item.peopleTags.includes('just-me') || item.personIds?.length).length });
  const now = counts(current), before = counts(previous);
  return { now, before, soloShare: now.knownCompany ? now.solo / now.knownCompany : null,
    previousSoloShare: before.knownCompany ? before.solo / before.knownCompany : null,
    newPersonIds: [...new Set(current.flatMap(item => item.personIds ?? []))].filter(id => !previous.some(item => item.personIds?.includes(id))) };
}
export function normalizedName(name: string) { return name.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, ''); }
