import type { MealEntry } from '../types';

export type BookScope = 'personal' | 'sample';
export const BOOK_MONTHS = [
  { en: 'January', zh: '一月', color: '#677781', ink: '#faf7ee' },
  { en: 'February', zh: '二月', color: '#8e5552', ink: '#faf7ee' },
  { en: 'March', zh: '三月', color: '#79826a', ink: '#faf7ee' },
  { en: 'April', zh: '四月', color: '#d8ccb4', ink: '#3e4136' },
  { en: 'May', zh: '五月', color: '#516654', ink: '#faf7ee' },
  { en: 'June', zh: '六月', color: '#b59156', ink: '#282b22' },
  { en: 'July', zh: '七月', color: '#806252', ink: '#faf7ee' },
  { en: 'August', zh: '八月', color: '#b47a43', ink: '#211d17' },
  { en: 'September', zh: '九月', color: '#606a52', ink: '#faf7ee' },
  { en: 'October', zh: '十月', color: '#9c5946', ink: '#faf7ee' },
  { en: 'November', zh: '十一月', color: '#777267', ink: '#faf7ee' },
  { en: 'December', zh: '十二月', color: '#4e5a62', ink: '#faf7ee' },
] as const;

export function isBookMonth(value: unknown): value is string {
  return typeof value === 'string' && /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(value);
}

export function scopeMeals(meals: MealEntry[], scope: BookScope): MealEntry[] {
  return meals.filter(meal => scope === 'sample' ? meal.origin === 'sample' : meal.origin !== 'sample');
}

export function monthMeals(meals: MealEntry[], month: string): MealEntry[] {
  return meals.filter(meal => meal.date.slice(0, 7) === month)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
}

/** Calendar covers are a browsing aid; empty months never borrow example memories. */
export function shelfMonths(year: number, now = new Date()): string[] {
  const count = year === now.getFullYear() ? now.getMonth() + 1 : year < now.getFullYear() ? 12 : 0;
  return Array.from({ length: count }, (_, index) => `${year}-${String(count - index).padStart(2, '0')}`);
}
