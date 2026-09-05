import type { MonthKey, Season } from './season';
import { getMonthKey, getMonthKeyForDate } from './season';

export type HeroHotspotType = 'meal' | 'people';

export interface HeroHotspot {
  type: HeroHotspotType;
  x: number;
  y: number;
  radius: number;
  target: 'plate' | 'cup' | 'meal-object' | 'chair';
  accessibilityLabel: string;
}

export type HeroHotspotSet = Record<HeroHotspotType, HeroHotspot>;

function makeHotspotSet({
  monthLabel,
  mealX,
  mealY,
  peopleX,
  peopleY,
  target,
  radius = 14,
}: {
  monthLabel: string;
  mealX: number;
  mealY: number;
  peopleX: number;
  peopleY: number;
  target: HeroHotspot['target'];
  radius?: number;
}): HeroHotspotSet {
  const lower = monthLabel.toLowerCase();
  return {
    meal: {
      type: 'meal',
      x: mealX,
      y: mealY,
      radius,
      target,
      accessibilityLabel: `Add a meal from the ${lower} table`,
    },
    people: {
      type: 'people',
      x: peopleX,
      y: peopleY,
      radius,
      target: 'chair',
      accessibilityLabel: `Remember who was around the ${lower} table`,
    },
  };
}

export const MONTH_HERO_HOTSPOTS: Record<MonthKey, HeroHotspotSet> = {
  january: makeHotspotSet({
    monthLabel: 'January',
    mealX: 0.35,
    mealY: 0.64,
    peopleX: 0.86,
    peopleY: 0.61,
    target: 'plate',
  }),
  february: makeHotspotSet({
    monthLabel: 'February',
    mealX: 0.50,
    mealY: 0.67,
    peopleX: 0.68,
    peopleY: 0.74,
    target: 'plate',
  }),
  march: makeHotspotSet({
    monthLabel: 'March',
    mealX: 0.50,
    mealY: 0.62,
    peopleX: 0.83,
    peopleY: 0.55,
    target: 'meal-object',
  }),
  april: makeHotspotSet({
    monthLabel: 'April',
    mealX: 0.50,
    mealY: 0.42,
    peopleX: 0.75,
    peopleY: 0.24,
    target: 'cup',
  }),
  may: makeHotspotSet({
    monthLabel: 'May',
    mealX: 0.43,
    mealY: 0.79,
    peopleX: 0.11,
    peopleY: 0.78,
    target: 'plate',
  }),
  june: makeHotspotSet({
    monthLabel: 'June',
    mealX: 0.60,
    mealY: 0.85,
    peopleX: 0.29,
    peopleY: 0.55,
    target: 'plate',
  }),
  july: makeHotspotSet({
    monthLabel: 'July',
    mealX: 0.50,
    mealY: 0.52,
    peopleX: 0.82,
    peopleY: 0.59,
    target: 'meal-object',
  }),
  august: makeHotspotSet({
    monthLabel: 'August',
    mealX: 0.52,
    mealY: 0.54,
    peopleX: 0.15,
    peopleY: 0.78,
    target: 'plate',
  }),
  september: makeHotspotSet({
    monthLabel: 'September',
    mealX: 0.46,
    mealY: 0.48,
    peopleX: 0.72,
    peopleY: 0.58,
    target: 'plate',
  }),
  october: makeHotspotSet({
    monthLabel: 'October',
    mealX: 0.41,
    mealY: 0.53,
    peopleX: 0.72,
    peopleY: 0.76,
    target: 'meal-object',
  }),
  november: makeHotspotSet({
    monthLabel: 'November',
    mealX: 0.49,
    mealY: 0.70,
    peopleX: 0.50,
    peopleY: 0.84,
    target: 'meal-object',
  }),
  december: makeHotspotSet({
    monthLabel: 'December',
    mealX: 0.66,
    mealY: 0.56,
    peopleX: 0.15,
    peopleY: 0.64,
    target: 'plate',
  }),
};

// Compatibility mapping for older season-based calls. Home now uses
// MONTH_HERO_HOTSPOTS through getHeroHotspots(monthKey).
export const HERO_HOTSPOTS: Record<Season, HeroHotspotSet> = {
  spring: MONTH_HERO_HOTSPOTS.may,
  summer: MONTH_HERO_HOTSPOTS.june,
  autumn: MONTH_HERO_HOTSPOTS.october,
  winter: MONTH_HERO_HOTSPOTS.january,
};

export function getHeroHotspots(month: MonthKey): HeroHotspotSet {
  return MONTH_HERO_HOTSPOTS[month];
}

export function getHeroHotspotsForMonth(monthIndex: number): HeroHotspotSet {
  return getHeroHotspots(getMonthKey(monthIndex));
}

export function getHeroHotspotsForDate(date: Date): HeroHotspotSet {
  return getHeroHotspots(getMonthKeyForDate(date));
}

export function getHeroHotspot(
  month: MonthKey,
  type: HeroHotspotType,
): HeroHotspot {
  return MONTH_HERO_HOTSPOTS[month][type];
}
