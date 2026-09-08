import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MealEntry } from '../types';
import {
  COMPANY, InsightError, MAX_BODY_BYTES, MOODS, object, readBoundedJson, validateInput, validateReport,
  type MonthlyInput, type MonthlyReport, type ReportLocale,
} from './contract';

export const INSIGHTS_CACHE_KEY = '@mealogue/insightsCache/v1';
export type ReportScope = 'personal' | 'sample';
export interface CachedReport { snapshot: string; report: MonthlyReport; scope?: ReportScope }

export function mealsForScope(meals: MealEntry[], scope: ReportScope): MealEntry[] {
  return meals.filter((meal) => scope === 'sample' ? meal.origin === 'sample' : meal.origin !== 'sample');
}

function clip(value: string | undefined, max: number) {
  return (value ?? '').trim().slice(0, max).replace(/[\uD800-\uDBFF]$/, '');
}

export function makeMonthlyInput(meals: MealEntry[], month: string, locale: ReportLocale, includeNotes = true): MonthlyInput {
  return {
    version: 1, month, locale,
    meals: meals.filter((meal) => meal.date.slice(0, 7) === month).map((meal) => ({
      id: meal.id, date: meal.date, title: clip(meal.title, 80), mealType: meal.mealType,
      moodTags: [...new Set((meal.moodTags.length ? meal.moodTags : meal.moodTag ? [meal.moodTag] : []).filter((tag) => MOODS.includes(tag)))].sort(),
      companyTags: [...new Set(meal.peopleTags.filter((tag) => COMPANY.includes(tag)))].sort(),
      note: includeNotes ? clip(meal.note, 240) : '', hasPhoto: Boolean(meal.photoMediaId || meal.photoUri),
    })).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
  };
}

// Exact canonical input avoids hash collisions and never contains photos or coordinates.
export function inputSnapshot(input: MonthlyInput): string {
  return JSON.stringify(input);
}

export function checkInput(input: MonthlyInput) {
  validateInput(input);
  if (new TextEncoder().encode(inputSnapshot(input)).byteLength > MAX_BODY_BYTES) throw new InsightError('body_too_large', 413);
}

export function parseCache(raw: string | null): CachedReport[] {
  if (!raw || raw.length > 1_500_000) return [];
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values) || values.length > 12) return [];
    return values.flatMap((value): CachedReport[] => {
      try {
        const entry = object(value);
        if (typeof entry.snapshot !== 'string' || entry.snapshot.length > MAX_BODY_BYTES) return [];
        const input = validateInput(JSON.parse(entry.snapshot));
        if (entry.scope !== undefined && entry.scope !== 'personal' && entry.scope !== 'sample') return [];
        return [{ snapshot: inputSnapshot(input), report: validateReport(entry.report, input), scope: entry.scope }];
      } catch { return []; }
    });
  } catch { return []; }
}

export async function readReportCache() {
  return parseCache(await AsyncStorage.getItem(INSIGHTS_CACHE_KEY));
}

export function selectCachedReport(cache: CachedReport[], input: MonthlyInput, scope?: ReportScope): CachedReport | undefined {
  const snapshot = inputSnapshot(input);
  const matching = cache.filter((entry) => entry.scope === scope && entry.report.month === input.month && entry.report.locale === input.locale);
  return matching.find((entry) => entry.snapshot === snapshot) ?? matching[0];
}

export async function saveReportCache(entry: CachedReport) {
  const current = await readReportCache();
  await AsyncStorage.setItem(INSIGHTS_CACHE_KEY, JSON.stringify([entry, ...current.filter((item) => item.snapshot !== entry.snapshot || item.scope !== entry.scope)].slice(0, 12)));
}

export async function clearInsightsCache() {
  await AsyncStorage.removeItem(INSIGHTS_CACHE_KEY);
}

export async function generateMonthlyReport(input: MonthlyInput): Promise<MonthlyReport> {
  checkInput(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch('/api/insights/monthly', {
      method: 'POST', credentials: 'omit', redirect: 'error', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: inputSnapshot(input),
    });
    if (!response.headers.get('Content-Type')?.includes('application/json')) throw new InsightError('service_unavailable', 503);
    const data = await readBoundedJson(response.body, 16_384);
    if (!response.ok) {
      const error = object(object(data).error);
      throw new InsightError(typeof error.code === 'string' ? error.code : 'ai_unavailable', response.status,
        typeof error.retryAfter === 'number' && error.retryAfter > 0 ? error.retryAfter : undefined);
    }
    return validateReport(data, input);
  } catch (error) {
    if (error instanceof InsightError) throw error;
    throw new InsightError(controller.signal.aborted ? 'request_timeout' : 'network_error', 503);
  } finally { clearTimeout(timeout); }
}
