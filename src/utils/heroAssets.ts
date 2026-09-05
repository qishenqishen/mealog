import type { ImageSourcePropType } from 'react-native';

import type { MonthKey, Season } from './season';
import { getMonthKey, getMonthKeyForDate } from './season';

export const HERO_IMAGE_ASPECT_RATIO = 2 / 3;

export const MONTH_HERO_ASSETS: Record<MonthKey, ImageSourcePropType> = {
  january: require('../../assets/illustrations/months/table-hero-january.png'),
  february: require('../../assets/illustrations/months/table-hero-february.png'),
  march: require('../../assets/illustrations/months/table-hero-march.png'),
  april: require('../../assets/illustrations/months/table-hero-april.png'),
  may: require('../../assets/illustrations/months/table-hero-may.png'),
  june: require('../../assets/illustrations/months/table-hero-june.png'),
  july: require('../../assets/illustrations/months/table-hero-july.png'),
  august: require('../../assets/illustrations/months/table-hero-august.png'),
  september: require('../../assets/illustrations/months/table-hero-september.png'),
  october: require('../../assets/illustrations/months/table-hero-october.png'),
  november: require('../../assets/illustrations/months/table-hero-november.png'),
  december: require('../../assets/illustrations/months/table-hero-december.png'),
};

export const MONTH_HERO_ASPECT_RATIOS: Record<MonthKey, number> = {
  january: 1086 / 1448,
  february: 1098 / 1433,
  march: 1120 / 1404,
  april: 1086 / 1448,
  may: 1086 / 1448,
  june: 1085 / 1449,
  july: 1024 / 1535,
  august: 1085 / 1449,
  september: 1127 / 1395,
  october: 1096 / 1436,
  november: 1122 / 1402,
  december: 1086 / 1448,
};

// Compatibility mapping for older season-based calls. Home now uses
// MONTH_HERO_ASSETS through getHeroAsset(monthKey).
export const HERO_ASSETS: Record<Season, ImageSourcePropType> = {
  spring: require('../../assets/illustrations/table-hero-spring.png'),
  summer: require('../../assets/illustrations/table-hero-summer.png'),
  autumn: require('../../assets/illustrations/table-hero-autumn.png'),
  winter: require('../../assets/illustrations/table-hero-winter.png'),
};

export function getHeroAsset(month: MonthKey): ImageSourcePropType {
  return MONTH_HERO_ASSETS[month];
}

export function getHeroAspectRatio(month: MonthKey): number {
  return MONTH_HERO_ASPECT_RATIOS[month] ?? HERO_IMAGE_ASPECT_RATIO;
}

export function getHeroAssetForMonth(monthIndex: number): ImageSourcePropType {
  return getHeroAsset(getMonthKey(monthIndex));
}

export function getHeroAssetForDate(date: Date): ImageSourcePropType {
  return getHeroAsset(getMonthKeyForDate(date));
}

export function getSeasonHeroAsset(season: Season): ImageSourcePropType {
  return HERO_ASSETS[season];
}
