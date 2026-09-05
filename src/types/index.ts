// ── Core meal vocabulary ────────────────────────────────────

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'treat';

export type MoodTag =
  | 'peaceful'
  | 'everyday'
  | 'nostalgic'
  | 'healing'
  | 'heartfelt'
  | 'overwhelming'
  | 'celebratory';

export type CompanionshipTagId =
  | 'just-me'
  | 'family-table'
  | 'shared-with-friend'
  | 'work-lunch'
  | 'celebration-gathering'
  | 'new-encounter';

// ── Managed media ───────────────────────────────────────────

export type MediaOwnerType = 'meal' | 'person' | 'sharedMeal' | 'profile';

export type MediaStorageStatus =
  | 'importing'
  | 'stored_local'
  | 'uploaded'
  | 'failed'
  | 'source_missing';

export interface ManagedMedia {
  id: string;
  userId?: string;
  ownerType: MediaOwnerType;
  ownerId: string;
  originalFileName?: string;
  mimeType: string;
  width?: number;
  height?: number;
  localManagedUri?: string;
  remoteUrl?: string;
  thumbnailUri?: string;
  createdAt: string;
  storageStatus: MediaStorageStatus;
}

export interface MediaMigrationReport {
  totalLegacyMediaRecords: number;
  successfullyMigrated: number;
  alreadyManaged: number;
  sourceFilesMissing: number;
  migrationFailed: number;
  databaseRecordsUpdated: number;
  completedAt: string;
}

// ── Meal entries ────────────────────────────────────────────

export interface MealLocation {
  source: 'gps' | 'manual';
  label?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
  capturedAt?: string;
}

export interface MealEntry {
  id: string;
  userId?: string;
  title: string;
  mealType: MealType;
  date: string;       // YYYY-MM-DD
  time: string;       // HH:mm
  eatenAt?: string;   // ISO 8601 moment derived from the editable date/time
  photoMediaId?: string;
  photoUri?: string;
  photoThumbnailUri?: string;
  photoStorageStatus?: MediaStorageStatus;
  location?: string;
  locationDetails?: MealLocation;
  moodTags: MoodTag[];
  peopleTags: string[];
  /**
   * Denormalized list of Person Profile ids used for fast rendering.
   * The source of truth for reusable people is MealCompanion.
   */
  personIds?: string[];
  note?: string;
  createdAt: string;  // ISO 8601
  updatedAt: string;  // ISO 8601

  /**
   * Backward-compatible fields used by the current early screens.
   * New code should prefer location and moodTags.
   */
  locationText?: string;
  moodTag?: MoodTag;
}

// ── People / companionship ──────────────────────────────────

export interface CompanionshipTag {
  id: CompanionshipTagId | string;
  label: string;
  kind: 'companionship';
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PersonTag {
  id: string;
  name: string;
  kind?: 'person';
  displayName?: string;
  iconStyle?: string;
  createdAt: string;  // ISO 8601
  updatedAt?: string; // ISO 8601
}

export type PeopleTag = CompanionshipTag | PersonTag;

export type PersonRelationship =
  | 'Friend'
  | 'Partner'
  | 'Family'
  | 'Parent'
  | 'Child'
  | 'Colleague'
  | 'Classmate'
  | 'Guest'
  | 'Other';

export interface PersonProfile {
  id: string;
  userId?: string;
  name: string;
  nickname?: string;
  avatarMediaId?: string;
  avatarUrl?: string;
  avatarStorageStatus?: MediaStorageStatus;
  relationship?: PersonRelationship;
  note?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface MealCompanion {
  id: string;
  mealId: string;
  personId: string;
  addedAt: string;
  mealSpecificNote?: string;
  personNameSnapshot?: string;
  personAvatarSnapshot?: string;
  personAvatarMediaIdSnapshot?: string;
}

export interface SharedMealPhoto {
  id: string;
  userId?: string;
  mealId: string;
  mediaId?: string;
  imageUrl: string;
  thumbnailUri?: string;
  storageStatus?: MediaStorageStatus;
  caption?: string;
  takenAt?: string;
  taggedPersonIds: string[];
  isCover?: boolean;
  createdAt: string;
}

export interface PersonMealSummary {
  person: PersonProfile;
  sharedMealCount: number;
  lastSharedMealDate?: string;
  firstSharedMealDate?: string;
  sharedPhotoCount: number;
}

export const DEFAULT_COMPANIONSHIP_TAGS: CompanionshipTag[] = [
  {
    id: 'just-me',
    label: 'Just me today',
    kind: 'companionship',
    description: 'A quiet meal kept for yourself.',
  },
  {
    id: 'family-table',
    label: 'Family table',
    kind: 'companionship',
    description: 'A meal held by familiar closeness.',
  },
  {
    id: 'shared-with-friend',
    label: 'Shared with a friend',
    kind: 'companionship',
    description: 'Conversation, ease, and something shared.',
  },
  {
    id: 'work-lunch',
    label: 'Work lunch',
    kind: 'companionship',
    description: 'A table folded into the workday.',
  },
  {
    id: 'celebration-gathering',
    label: 'Celebration gathering',
    kind: 'companionship',
    description: 'A meal with a little ceremony around it.',
  },
  {
    id: 'new-encounter',
    label: 'New encounter',
    kind: 'companionship',
    description: 'Someone new found a seat at the table.',
  },
];

// ── Collection ──────────────────────────────────────────────

export type CollectionType =
  | 'tablecloth'
  | 'table_item'
  | 'chair_style'
  | 'archive_card'
  | 'room_detail'
  | 'keepsake';

export interface CollectionItem {
  id: string;
  type: CollectionType;
  name: string;
  description: string;
  unlockedAt?: string; // ISO 8601, undefined = locked
  unlockCondition: string;
  season?: 'spring' | 'summer' | 'autumn' | 'winter';
}

export interface Milestone {
  id: string;
  name: string;
  description: string;
  collectionItemId?: string;
  unlockedAt?: string;
  unlockCondition: string;
}

// ── Achievements / keepsakes ───────────────────────────────

export type AchievementFamily =
  | 'starter'
  | 'meals'
  | 'rhythm'
  | 'photographs'
  | 'notes'
  | 'feelings'
  | 'people'
  | 'rare'
  | 'monthly'
  | 'seasonal';

export type AchievementRuleType =
  | 'meal_count'
  | 'distinct_days'
  | 'monthly_distinct_days'
  | 'monthly_presence_streak'
  | 'season_coverage'
  | 'photo_count'
  | 'meal_photo_count'
  | 'shared_photo_count'
  | 'note_count'
  | 'feeling_count'
  | 'same_person_meals'
  | 'shared_meal_count'
  | 'unique_people_count'
  | 'single_meal_people_count'
  | 'table_reunion'
  | 'same_person_season_count'
  | 'late_meal_count'
  | 'weekday_meal_days'
  | 'meal_type_count'
  | 'complete_memory'
  | 'dinner_complete'
  | 'year_boundary'
  | 'celebration_shared_meal'
  | 'manual';

export type AchievementStatus =
  | 'locked'
  | 'in_progress'
  | 'unlocked'
  | 'newly_unlocked';

export type AchievementCelebrationLevel = 'quiet' | 'standard' | 'major';

export interface AchievementDefinition {
  id: string;
  family: AchievementFamily;
  tier: number;
  title: string;
  description: string;
  iconKey: string;
  ruleType: AchievementRuleType;
  threshold: number;
  hidden?: boolean;
  active: boolean;
  seasonal?: boolean;
  celebrationLevel: AchievementCelebrationLevel;
  sortOrder: number;
}

export interface AchievementProgress {
  achievementId: string;
  currentValue: number;
  targetValue: number;
  status: AchievementStatus;
  unlockedAt?: string;
  firstSourceMealId?: string;
  lastEvaluatedAt: string;
  seenAt?: string;
}

export type AchievementEventType =
  | 'MEAL_CREATED'
  | 'MEAL_UPDATED'
  | 'FEELING_ADDED'
  | 'COMPANION_ADDED'
  | 'SHARED_PHOTO_ADDED'
  | 'MEAL_PHOTO_ADDED'
  | 'NOTE_ADDED'
  | 'MEAL_DELETED'
  | 'PERSON_MERGED'
  | 'HISTORICAL_RECALCULATION';

export interface AchievementMigrationSummary {
  completed: boolean;
  foundCount: number;
  completedAt?: string;
  seenAt?: string;
}

// ── Insights ────────────────────────────────────────────────

export type PeriodType = 'week' | 'month';

export type MetricType =
  | 'meal_type_count'
  | 'mood_count'
  | 'social_context_count'
  | 'meal_time_pattern'
  | 'summary';

export interface InsightSummary {
  id: string;
  periodType: PeriodType;
  generatedAt: string; // ISO 8601
  title: string;
  description: string;
  metricType: MetricType;
  totalMeals?: number;
  daysWithMeals?: number;
  mealsByType?: Partial<Record<MealType, number>>;
  moodsTagged?: Partial<Record<MoodTag, number>>;
  companionship?: Partial<Record<string, number>>;
}
