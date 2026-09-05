import {
  getAchievementMigrationSummary,
  getAchievementProgress,
  getMealCompanions,
  getMeals,
  getSharedMealPhotos,
  saveAchievementMigrationSummary,
  saveAchievementProgress,
} from '../storage';
import type { AchievementEventType, AchievementMigrationSummary } from '../types';
import {
  type EvaluatedAchievement,
  evaluateAchievementProgress,
  getClosestAchievements,
} from './rules';

export type AchievementEngineResult = {
  achievements: EvaluatedAchievement[];
  newlyUnlocked: EvaluatedAchievement[];
  closest: EvaluatedAchievement[];
  migrationSummary: AchievementMigrationSummary;
};

export async function evaluateAndPersistAchievements(
  eventType: AchievementEventType = 'HISTORICAL_RECALCULATION',
): Promise<AchievementEngineResult> {
  const [
    meals,
    companions,
    sharedPhotos,
    previousProgress,
    previousMigration,
  ] = await Promise.all([
    getMeals(),
    getMealCompanions(),
    getSharedMealPhotos(),
    getAchievementProgress(),
    getAchievementMigrationSummary(),
  ]);

  const now = new Date().toISOString();
  const suppressNewUnlocks = !previousMigration.completed
    || eventType === 'HISTORICAL_RECALCULATION';
  const achievements = evaluateAchievementProgress({
    meals,
    companions,
    sharedPhotos,
    previousProgress,
    now,
    suppressNewUnlocks,
  });
  const progress = achievements.map((achievement) => achievement.progress);

  await saveAchievementProgress(progress);

  const unlockedCount = achievements.filter((achievement) => achievement.progress.unlockedAt).length;
  const migrationSummary: AchievementMigrationSummary = previousMigration.completed
    ? previousMigration
    : {
      completed: true,
      foundCount: unlockedCount,
      completedAt: now,
    };

  if (!previousMigration.completed) {
    await saveAchievementMigrationSummary(migrationSummary);
  }

  return {
    achievements,
    newlyUnlocked: achievements.filter((achievement) => (
      achievement.progress.status === 'newly_unlocked'
    )),
    closest: getClosestAchievements(achievements),
    migrationSummary,
  };
}
