import type { MealType, MoodTag } from '../types';

export const MODEL = '@cf/meta/llama-3.1-8b-instruct-fast' as const;
export const PROVIDER = 'cloudflare_workers_ai' as const;
export const MAX_BODY_BYTES = 65_536;
export const MAX_MEALS = 200;
export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack', 'treat'];
export const MOODS: MoodTag[] = ['peaceful', 'everyday', 'nostalgic', 'healing', 'heartfelt', 'overwhelming', 'celebratory'];
export const COMPANY = ['just-me', 'family-table', 'shared-with-friend', 'work-lunch', 'celebration-gathering', 'new-encounter'];
export type ReportLocale = 'en' | 'zh';

export interface InsightMeal {
  id: string;
  date: string;
  title: string;
  mealType: MealType;
  moodTags: MoodTag[];
  companyTags: string[];
  note: string;
  hasPhoto: boolean;
}

export interface MonthlyInput {
  version: 1;
  month: string;
  locale: ReportLocale;
  meals: InsightMeal[];
}

export interface MonthlyMetrics {
  mealCount: number;
  daysLogged: number;
  photoCount: number;
  noteCount: number;
  byType: Record<MealType, number>;
  byMood: Record<MoodTag, number>;
  byCompany: Record<string, number>;
}

export interface Narrative {
  title: string;
  observations: { text: string; mealIds: string[] }[];
}

export interface MonthlyReport {
  version: 1;
  month: string;
  locale: ReportLocale;
  provider: typeof PROVIDER;
  model: typeof MODEL;
  generatedAt: string;
  metrics: MonthlyMetrics;
  narrative: Narrative;
  evidenceMealIds: string[];
}

export class InsightError extends Error {
  constructor(public code: string, public status = 400, public retryAfter?: number) {
    super(code);
  }
}

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InsightError('invalid_input');
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).length !== allowed.length || Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new InsightError('invalid_input');
  }
}

function boundedText(value: unknown, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) throw new InsightError('invalid_input');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new InsightError('invalid_input');
  return value.trim();
}

function tags<T extends string>(value: unknown, allowed: T[]): T[] {
  if (!Array.isArray(value) || value.length > allowed.length || value.some((item) => !allowed.includes(item))) {
    throw new InsightError('invalid_input');
  }
  return [...new Set<T>(value)].sort();
}

export function validateInput(value: unknown): MonthlyInput {
  const root = object(value);
  keys(root, ['version', 'month', 'locale', 'meals']);
  if (root.version !== 1 || (root.locale !== 'en' && root.locale !== 'zh') ||
      typeof root.month !== 'string' || !/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(root.month)) {
    throw new InsightError('invalid_input');
  }
  if (!Array.isArray(root.meals) || root.meals.length > MAX_MEALS) throw new InsightError('too_many_meals');
  const month = root.month;
  const ids = new Set<string>();
  const meals = root.meals.map((entry): InsightMeal => {
    const meal = object(entry);
    keys(meal, ['id', 'date', 'title', 'mealType', 'moodTags', 'companyTags', 'note', 'hasPhoto']);
    const id = boundedText(meal.id, 100);
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) throw new InsightError('invalid_input');
    ids.add(id);
    const date = boundedText(meal.date, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 7) !== month || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) ||
        new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new InsightError('invalid_input');
    if (!MEAL_TYPES.includes(meal.mealType as MealType) || typeof meal.hasPhoto !== 'boolean') throw new InsightError('invalid_input');
    return {
      id, date, title: boundedText(meal.title, 80), mealType: meal.mealType as MealType,
      moodTags: tags(meal.moodTags, MOODS), companyTags: tags(meal.companyTags, COMPANY),
      note: boundedText(meal.note, 240, true), hasPhoto: meal.hasPhoto,
    };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return { version: 1, month, locale: root.locale, meals };
}

export function calculateMetrics(meals: InsightMeal[]): MonthlyMetrics {
  const byType = Object.fromEntries(MEAL_TYPES.map((key) => [key, 0])) as Record<MealType, number>;
  const byMood = Object.fromEntries(MOODS.map((key) => [key, 0])) as Record<MoodTag, number>;
  const byCompany = Object.fromEntries(COMPANY.map((key) => [key, 0]));
  for (const meal of meals) {
    byType[meal.mealType]++;
    for (const mood of new Set(meal.moodTags)) byMood[mood]++;
    for (const tag of new Set(meal.companyTags)) byCompany[tag]++;
  }
  return {
    mealCount: meals.length, daysLogged: new Set(meals.map((meal) => meal.date)).size,
    photoCount: meals.filter((meal) => meal.hasPhoto).length,
    noteCount: meals.filter((meal) => meal.note.trim()).length, byType, byMood, byCompany,
  };
}

export function validateNarrative(value: unknown, allowedIds: string[]): Narrative {
  const root = object(value);
  keys(root, ['title', 'observations']);
  const title = boundedText(root.title, 80);
  if (!Array.isArray(root.observations) || root.observations.length < 1 || root.observations.length > 3) {
    throw new InsightError('invalid_output', 502);
  }
  const observations = root.observations.map((item) => {
    const row = object(item);
    keys(row, ['text', 'mealIds']);
    const text = boundedText(row.text, 300);
    if (!Array.isArray(row.mealIds) || row.mealIds.length < 1 || row.mealIds.length > 3 ||
        row.mealIds.some((id) => typeof id !== 'string' || !allowedIds.includes(id))) throw new InsightError('invalid_output', 502);
    return { text, mealIds: [...new Set<string>(row.mealIds)] };
  });
  return { title, observations };
}

export function validateReport(value: unknown, input: MonthlyInput): MonthlyReport {
  const report = object(value);
  keys(report, ['version', 'month', 'locale', 'provider', 'model', 'generatedAt', 'metrics', 'narrative', 'evidenceMealIds']);
  const ids = input.meals.map((meal) => meal.id);
  if (report.version !== 1 || report.month !== input.month || report.locale !== input.locale ||
      report.provider !== PROVIDER || report.model !== MODEL || typeof report.generatedAt !== 'string' ||
      !Number.isFinite(Date.parse(report.generatedAt)) || !Array.isArray(report.evidenceMealIds) ||
      report.evidenceMealIds.length < 1 || report.evidenceMealIds.length > 12 ||
      report.evidenceMealIds.some((id) => typeof id !== 'string' || !ids.includes(id)) ||
      JSON.stringify(report.metrics) !== JSON.stringify(calculateMetrics(input.meals))) {
    throw new InsightError('invalid_output', 502);
  }
  return {
    version: 1, month: input.month, locale: input.locale, provider: PROVIDER, model: MODEL,
    generatedAt: report.generatedAt, metrics: calculateMetrics(input.meals),
    narrative: validateNarrative(report.narrative, report.evidenceMealIds), evidenceMealIds: report.evidenceMealIds,
  };
}

export async function readBoundedJson(stream: ReadableStream<Uint8Array> | null, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  if (!stream) throw new InsightError('invalid_input');
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new InsightError('body_too_large', 413);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)); }
  catch { throw new InsightError('invalid_input'); }
}
