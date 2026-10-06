import type { ImageSourcePropType } from 'react-native';

export const KEEPSAKE_ART = {
  'plate-small': require('../../assets/keepsakes/pastel-v1/plate-small.png'),
  'feeling-candle': require('../../assets/keepsakes/pastel-v1/feeling-candle.png'),
  'people-pulled-chair': require('../../assets/keepsakes/pastel-v1/people-pulled-chair.png'),
  'photo-single': require('../../assets/keepsakes/pastel-v1/photo-single.png'),
  'note-corner': require('../../assets/keepsakes/pastel-v1/note-corner.png'),
  'meal-tablecloth-small': require('../../assets/keepsakes/pastel-v1/meal-tablecloth-small.png'),
  'meal-set-table': require('../../assets/keepsakes/pastel-v1/meal-set-table.png'),
  'meal-well-loved': require('../../assets/keepsakes/pastel-v1/meal-well-loved.png'),
  'meal-long-table': require('../../assets/keepsakes/pastel-v1/meal-long-table.png'),
  'meal-seasons-table': require('../../assets/keepsakes/pastel-v1/meal-seasons-table.png'),
  'meal-life-table': require('../../assets/keepsakes/pastel-v1/meal-life-table.png'),
  'rhythm-three-days': require('../../assets/keepsakes/pastel-v1/rhythm-three-days.png'),
  'rhythm-seven-days': require('../../assets/keepsakes/pastel-v1/rhythm-seven-days.png'),
  'rhythm-month-page': require('../../assets/keepsakes/pastel-v1/rhythm-month-page.png'),
  'rhythm-three-months': require('../../assets/keepsakes/pastel-v1/rhythm-three-months.png'),
  'rhythm-four-seasons': require('../../assets/keepsakes/pastel-v1/rhythm-four-seasons.png'),
  'rhythm-year-table': require('../../assets/keepsakes/pastel-v1/rhythm-year-table.png'),
  'photo-strip': require('../../assets/keepsakes/pastel-v1/photo-strip.png'),
  'photo-album': require('../../assets/keepsakes/pastel-v1/photo-album.png'),
  'photo-memory-box': require('../../assets/keepsakes/pastel-v1/photo-memory-box.png'),
  'photo-family-album': require('../../assets/keepsakes/pastel-v1/photo-family-album.png'),
  'note-margins': require('../../assets/keepsakes/pastel-v1/note-margins.png'),
  'note-journal': require('../../assets/keepsakes/pastel-v1/note-journal.png'),
  'note-worn-book': require('../../assets/keepsakes/pastel-v1/note-worn-book.png'),
  'note-book-meals': require('../../assets/keepsakes/pastel-v1/note-book-meals.png'),
  'feeling-vase': require('../../assets/keepsakes/pastel-v1/feeling-vase.png'),
  'feeling-bouquet': require('../../assets/keepsakes/pastel-v1/feeling-bouquet.png'),
  'feeling-lantern': require('../../assets/keepsakes/pastel-v1/feeling-lantern.png'),
  'feeling-almanac': require('../../assets/keepsakes/pastel-v1/feeling-almanac.png'),
  'people-cushion-chair': require('../../assets/keepsakes/pastel-v1/people-cushion-chair.png'),
  'people-regular-seat': require('../../assets/keepsakes/pastel-v1/people-regular-seat.png'),
  'people-old-friend-seat': require('../../assets/keepsakes/pastel-v1/people-old-friend-seat.png'),
  'people-two-seats': require('../../assets/keepsakes/pastel-v1/people-two-seats.png'),
  'people-open-table': require('../../assets/keepsakes/pastel-v1/people-open-table.png'),
  'people-many-seats': require('../../assets/keepsakes/pastel-v1/people-many-seats.png'),
  'people-full-table': require('../../assets/keepsakes/pastel-v1/people-full-table.png'),
  'people-house-full': require('../../assets/keepsakes/pastel-v1/people-house-full.png'),
  'people-polaroid-two': require('../../assets/keepsakes/pastel-v1/people-polaroid-two.png'),
  'people-photo-together': require('../../assets/keepsakes/pastel-v1/people-photo-together.png'),
  'people-reunion-ring': require('../../assets/keepsakes/pastel-v1/people-reunion-ring.png'),
  'people-season-seats': require('../../assets/keepsakes/pastel-v1/people-season-seats.png'),
  'rare-midnight-plate': require('../../assets/keepsakes/pastel-v1/rare-midnight-plate.png'),
  'rare-sunday-table': require('../../assets/keepsakes/pastel-v1/rare-sunday-table.png'),
  'rare-breakfast-sun': require('../../assets/keepsakes/pastel-v1/rare-breakfast-sun.png'),
  'rare-sweet-corner': require('../../assets/keepsakes/pastel-v1/rare-sweet-corner.png'),
  'rare-complete-memory': require('../../assets/keepsakes/pastel-v1/rare-complete-memory.png'),
  'rare-candle-dinner': require('../../assets/keepsakes/pastel-v1/rare-candle-dinner.png'),
  'rare-first-year': require('../../assets/keepsakes/pastel-v1/rare-first-year.png'),
  'rare-last-year': require('../../assets/keepsakes/pastel-v1/rare-last-year.png'),
  'rare-birthday-table': require('../../assets/keepsakes/pastel-v1/rare-birthday-table.png'),
  'monthly-letter': require('../../assets/keepsakes/pastel-v1/monthly-letter.png'),
  'seasonal-table-stamp': require('../../assets/keepsakes/pastel-v1/seasonal-table-stamp.png'),
  'rare-secret': require('../../assets/keepsakes/pastel-v1/rare-secret.png'),
  'rare-secret-1': require('../../assets/keepsakes/pastel-v1/rare-secret-1.png'),
  'rare-secret-2': require('../../assets/keepsakes/pastel-v1/rare-secret-2.png'),
  'rare-secret-3': require('../../assets/keepsakes/pastel-v1/rare-secret-3.png'),
  'rare-secret-4': require('../../assets/keepsakes/pastel-v1/rare-secret-4.png'),
} as const satisfies Record<string, ImageSourcePropType>;

export type KeepsakeArtKey = keyof typeof KEEPSAKE_ART;

export const KEEPSAKE_ART_KEYS = Object.keys(KEEPSAKE_ART);

export function getKeepsakeArt(iconKey: string): ImageSourcePropType {
  const source = KEEPSAKE_ART[iconKey as KeepsakeArtKey];
  if (source) return source;

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    throw new Error(`Missing keepsake art asset for iconKey: ${iconKey}`);
  }

  return KEEPSAKE_ART['rare-secret'];
}

export function assertKeepsakeArtCoverage(iconKeys: string[]): void {
  const missing = iconKeys.filter((iconKey) => !KEEPSAKE_ART_HAS(iconKey));
  if (missing.length > 0 && typeof __DEV__ !== 'undefined' && __DEV__) {
    throw new Error(`Missing keepsake art assets: ${missing.join(', ')}`);
  }
}

function KEEPSAKE_ART_HAS(iconKey: string): boolean {
  return Boolean(KEEPSAKE_ART[iconKey as KeepsakeArtKey]);
}
