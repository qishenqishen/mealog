// ── Season types ────────────────────────────────────────────

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

export type MonthKey =
  | 'january'
  | 'february'
  | 'march'
  | 'april'
  | 'may'
  | 'june'
  | 'july'
  | 'august'
  | 'september'
  | 'october'
  | 'november'
  | 'december';

export const MONTH_KEYS: MonthKey[] = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

export const MONTH_LABELS: Record<MonthKey, string> = {
  january: 'January',
  february: 'February',
  march: 'March',
  april: 'April',
  may: 'May',
  june: 'June',
  july: 'July',
  august: 'August',
  september: 'September',
  october: 'October',
  november: 'November',
  december: 'December',
};

// Meteorological seasons:
// Mar-May = spring, Jun-Aug = summer, Sep-Nov = autumn, Dec-Feb = winter.
const MONTH_TO_SEASON: Record<MonthKey, Season> = {
  january: 'winter',
  february: 'winter',
  march: 'spring',
  april: 'spring',
  may: 'spring',
  june: 'summer',
  july: 'summer',
  august: 'summer',
  september: 'autumn',
  october: 'autumn',
  november: 'autumn',
  december: 'winter',
};

const SEASON_REPRESENTATIVE_MONTH: Record<Season, MonthKey> = {
  spring: 'may',
  summer: 'june',
  autumn: 'october',
  winter: 'january',
};

export function normalizeMonthIndex(monthIndex: number): number {
  const wholeMonth = Math.trunc(monthIndex);
  return ((wholeMonth % 12) + 12) % 12;
}

export function getMonthKey(monthIndex: number): MonthKey {
  return MONTH_KEYS[normalizeMonthIndex(monthIndex)];
}

export function getMonthKeyForDate(date: Date): MonthKey {
  return getMonthKey(date.getMonth());
}

export function getMonthLabel(month: MonthKey | number): string {
  const monthKey = typeof month === 'number' ? getMonthKey(month) : month;
  return MONTH_LABELS[monthKey];
}

export function getRepresentativeMonthForSeason(season: Season): MonthKey {
  return SEASON_REPRESENTATIVE_MONTH[season];
}

export function getSeasonForMonth(monthIndex: number): Season {
  return MONTH_TO_SEASON[getMonthKey(monthIndex)];
}

export function getSeasonForDate(date: Date): Season {
  return getSeasonForMonth(date.getMonth());
}

// ── Display labels ──────────────────────────────────────────

export const SEASON_LABELS: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};

export function getSeasonLabel(season: Season): string {
  return SEASON_LABELS[season];
}
