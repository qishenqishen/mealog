import type { ImageSourcePropType } from 'react-native';

export const KEEPSAKE_ART = {
  'plate-small': require('../../assets/keepsakes/final/starter/first-plate.png'),
  'feeling-candle': require('../../assets/keepsakes/final/starter/feeling-candle.png'),
  'people-pulled-chair': require('../../assets/keepsakes/final/starter/pulled-chair.png'),
  'photo-single': require('../../assets/keepsakes/final/starter/little-photograph.png'),
  'note-corner': require('../../assets/keepsakes/final/starter/written-corner.png'),
  'meal-tablecloth-small': require('../../assets/keepsakes/final/meals/small-tablecloth.png'),
  'meal-set-table': require('../../assets/keepsakes/final/meals/set-table.png'),
  'meal-well-loved': require('../../assets/keepsakes/final/meals/well-loved-table.png'),
  'meal-long-table': require('../../assets/keepsakes/final/meals/long-table.png'),
  'meal-seasons-table': require('../../assets/keepsakes/final/meals/table-of-seasons.png'),
  'meal-life-table': require('../../assets/keepsakes/final/meals/life-at-the-table.png'),
  'rhythm-three-days': require('../../assets/keepsakes/final/rhythm/three-quiet-days.png'),
  'rhythm-seven-days': require('../../assets/keepsakes/final/rhythm/seven-quiet-days.png'),
  'rhythm-month-page': require('../../assets/keepsakes/final/rhythm/month-remembered.png'),
  'rhythm-three-months': require('../../assets/keepsakes/final/rhythm/gentle-rhythm.png'),
  'rhythm-four-seasons': require('../../assets/keepsakes/final/rhythm/four-seasons.png'),
  'rhythm-year-table': require('../../assets/keepsakes/final/rhythm/year-at-the-table.png'),
  'photo-strip': require('../../assets/keepsakes/final/photographs/photo-strip.png'),
  'photo-album': require('../../assets/keepsakes/final/photographs/table-album.png'),
  'photo-memory-box': require('../../assets/keepsakes/final/photographs/memory-box.png'),
  'photo-family-album': require('../../assets/keepsakes/final/photographs/family-album.png'),
  'note-margins': require('../../assets/keepsakes/final/notes/margin-notes.png'),
  'note-journal': require('../../assets/keepsakes/final/notes/table-journal.png'),
  'note-worn-book': require('../../assets/keepsakes/final/notes/worn-notebook.png'),
  'note-book-meals': require('../../assets/keepsakes/final/notes/book-of-meals.png'),
  'feeling-vase': require('../../assets/keepsakes/final/feelings/mood-vase.png'),
  'feeling-bouquet': require('../../assets/keepsakes/final/feelings/full-bouquet.png'),
  'feeling-lantern': require('../../assets/keepsakes/final/feelings/mood-lantern.png'),
  'feeling-almanac': require('../../assets/keepsakes/final/feelings/emotional-almanac.png'),
  'people-cushion-chair': require('../../assets/keepsakes/final/people/familiar-seat.png'),
  'people-regular-seat': require('../../assets/keepsakes/final/people/regular-at-my-table.png'),
  'people-old-friend-seat': require('../../assets/keepsakes/final/people/old-friends-place.png'),
  'people-two-seats': require('../../assets/keepsakes/final/people/table-company.png'),
  'people-open-table': require('../../assets/keepsakes/final/people/open-table.png'),
  'people-many-seats': require('../../assets/keepsakes/final/people/many-seats.png'),
  'people-full-table': require('../../assets/keepsakes/final/people/full-table.png'),
  'people-house-full': require('../../assets/keepsakes/final/people/house-full.png'),
  'people-polaroid-two': require('../../assets/keepsakes/final/people/shared-photograph.png'),
  'people-photo-together': require('../../assets/keepsakes/final/people/photo-together.png'),
  'people-reunion-ring': require('../../assets/keepsakes/final/people/table-reunion.png'),
  'people-season-seats': require('../../assets/keepsakes/final/people/same-table-new-season.png'),
  'rare-midnight-plate': require('../../assets/keepsakes/final/rare/midnight-plate.png'),
  'rare-sunday-table': require('../../assets/keepsakes/final/rare/sunday-table.png'),
  'rare-breakfast-sun': require('../../assets/keepsakes/final/rare/breakfast-sun.png'),
  'rare-sweet-corner': require('../../assets/keepsakes/final/rare/sweet-corner.png'),
  'rare-complete-memory': require('../../assets/keepsakes/final/rare/complete-memory.png'),
  'rare-candle-dinner': require('../../assets/keepsakes/final/rare/dinner-by-candlelight.png'),
  'rare-first-year': require('../../assets/keepsakes/final/rare/first-of-the-year.png'),
  'rare-last-year': require('../../assets/keepsakes/final/rare/last-plate-of-the-year.png'),
  'rare-birthday-table': require('../../assets/keepsakes/final/rare/birthday-table.png'),
  'monthly-letter': require('../../assets/keepsakes/final/monthly/monthly-letter.png'),
  'seasonal-table-stamp': require('../../assets/keepsakes/final/seasonal/seasonal-table-stamp.png'),
  'rare-secret': require('../../assets/keepsakes/final/rare/rare-secret.png'),
  'rare-secret-1': require('../../assets/keepsakes/final/rare/rare-secret-1.png'),
  'rare-secret-2': require('../../assets/keepsakes/final/rare/rare-secret-2.png'),
  'rare-secret-3': require('../../assets/keepsakes/final/rare/rare-secret-3.png'),
  'rare-secret-4': require('../../assets/keepsakes/final/rare/rare-secret-4.png'),
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
