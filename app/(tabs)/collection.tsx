import { useI18n, translate, type Locale } from '../../src/i18n';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';

import { evaluateAndPersistAchievements } from '../../src/achievements/engine';
import {
  ACHIEVEMENT_DEFINITIONS,
  FAMILY_LABELS,
  FAMILY_ORDER,
} from '../../src/achievements/definitions';
import type { EvaluatedAchievement } from '../../src/achievements/rules';
import {
  markAchievementSeen,
  saveAchievementMigrationSummary,
} from '../../src/storage';
import type { AchievementFamily, AchievementMigrationSummary } from '../../src/types';
import AchievementStamp from '../../src/components/AchievementStamp';
import { assertKeepsakeArtCoverage } from '../../src/constants/keepsakeArt';
import { colors, shadow, fonts } from '../../src/theme';
import LoadState from '../../src/components/LoadState';

type CollectionState = {
  achievements: EvaluatedAchievement[];
  newlyUnlocked: EvaluatedAchievement[];
  closest: EvaluatedAchievement[];
  migrationSummary: AchievementMigrationSummary;
};

const DISPLAY_FAMILIES: AchievementFamily[] = [
  'starter',
  ...FAMILY_ORDER,
];

const SECRET_QUESTION_ICON_KEYS = [
  'rare-secret-1',
  'rare-secret-2',
  'rare-secret-3',
  'rare-secret-4',
] as const;

assertKeepsakeArtCoverage([
  ...ACHIEVEMENT_DEFINITIONS.map((definition) => definition.iconKey),
  'rare-secret',
  ...SECRET_QUESTION_ICON_KEYS,
]);

function formatDate(date: string | undefined, locale: Locale): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function romanTier(tier: number): string {
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  return numerals[tier - 1] ?? String(tier);
}

function isUnlocked(achievement: EvaluatedAchievement): boolean {
  return Boolean(achievement.progress.unlockedAt);
}

function isNew(achievement: EvaluatedAchievement): boolean {
  return achievement.progress.status === 'newly_unlocked';
}

function isHiddenLocked(achievement: EvaluatedAchievement): boolean {
  return achievement.definition.hidden === true && !isUnlocked(achievement);
}

function getSecretKeepsakeIconKey(achievement: EvaluatedAchievement): string {
  const hiddenDefinitions = ACHIEVEMENT_DEFINITIONS.filter((definition) => definition.hidden);
  const index = hiddenDefinitions.findIndex((definition) => (
    definition.id === achievement.definition.id
  ));
  const safeIndex = index >= 0 ? index % SECRET_QUESTION_ICON_KEYS.length : 0;
  return SECRET_QUESTION_ICON_KEYS[safeIndex];
}

function getStampState(achievement: EvaluatedAchievement) {
  if (isHiddenLocked(achievement)) return 'secret';
  if (isNew(achievement)) return 'newly_unlocked';
  if (isUnlocked(achievement)) return 'unlocked';
  if (achievement.progress.currentValue > 0) return 'in_progress';
  return 'locked';
}

function shortHint(achievement: EvaluatedAchievement, locale: Locale): string {
  if (isUnlocked(achievement)) return formatDate(achievement.progress.unlockedAt, locale);
  if (isHiddenLocked(achievement)) return translate('waiting');
  if (achievement.remaining <= 1) return translate('1 left');
  return translate('{count} left', { count: achievement.remaining });
}

function remainingHint(achievement: EvaluatedAchievement): string {
  const { definition, remaining } = achievement;
  if (remaining === 0) return translate('Ready to place on the shelf.');
  const units: Partial<Record<typeof definition.ruleType, string>> = {
    meal_count: 'meals', distinct_days: 'days', monthly_distinct_days: 'meal days in one month',
    monthly_presence_streak: 'months', season_coverage: 'seasons', photo_count: 'photographs',
    meal_photo_count: 'meal photographs', shared_photo_count: 'shared photographs',
    note_count: 'notes', feeling_count: 'feelings', same_person_meals: 'shared meals with one person',
    shared_meal_count: 'shared meals', unique_people_count: 'people', single_meal_people_count: 'people at one meal',
    table_reunion: 'days between shared meals', same_person_season_count: 'seasons with one person',
    late_meal_count: 'late meals', weekday_meal_days: 'Sundays',
    meal_type_count: definition.id === 'sweet-corner' ? 'treats' : 'breakfasts',
  };
  return translate('{count} more {unit} to find this keepsake.', { count: remaining, unit: translate(units[definition.ruleType] ?? 'moments') });
}

function getFamilyAchievementGroups(achievements: EvaluatedAchievement[]) {
  const map = new Map<AchievementFamily, EvaluatedAchievement[]>();

  achievements.forEach((achievement) => {
    if (isHiddenLocked(achievement)) return;
    const family = achievement.definition.family;
    map.set(family, [...(map.get(family) ?? []), achievement]);
  });

  return DISPLAY_FAMILIES.map((family) => ({
    family,
    achievements: map.get(family) ?? [],
  })).filter((group) => group.achievements.length > 0);
}

function StampCell({
  achievement,
  onPress,
}: {
  achievement: EvaluatedAchievement;
  onPress: (achievement: EvaluatedAchievement) => void;
}) {
  const { t, locale } = useI18n();
  const unlocked = isUnlocked(achievement);
  const hiddenLocked = isHiddenLocked(achievement);
  const title = hiddenLocked ? '???' : t(achievement.definition.title);
  const status = unlocked ? t('unlocked') : hiddenLocked ? t('secret') : t('in progress');
  const stampState = getStampState(achievement);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hiddenLocked
        ? t('???, secret keepsake, A small moment is still waiting.')
        : t('{title}, {status}, {current} of {total}', { title, status, current: achievement.progress.currentValue, total: achievement.progress.targetValue })}
      onPress={() => onPress(achievement)}
      style={({ pressed }) => [
        styles.stampCell,
        unlocked && styles.stampCellUnlocked,
        isNew(achievement) && styles.stampCellNew,
        pressed && styles.stampCellPressed,
      ]}
    >
      {isNew(achievement) ? <View style={styles.newHalo} /> : null}
      <View style={styles.stampFrame}>
        <AchievementStamp
          iconKey={hiddenLocked ? getSecretKeepsakeIconKey(achievement) : achievement.definition.iconKey}
          size={78}
          deferLoading
          state={stampState}
          progressRatio={achievement.progressRatio}
        />
        <View style={styles.tierBadge}>
          <Text style={styles.tierText}>{romanTier(achievement.definition.tier)}</Text>
        </View>
        {unlocked ? (
          <View style={styles.checkBadge}>
            <Text style={styles.checkText}>✓</Text>
          </View>
        ) : null}
        {isNew(achievement) ? (
          <View style={styles.newBadge}>
            <Text style={styles.newText}>{t("NEW")}</Text>
          </View>
        ) : null}
      </View>
      <Text
        style={[styles.stampTitle, hiddenLocked && styles.stampTitleHidden]}
        numberOfLines={2}
        ellipsizeMode="tail"
      >
        {title}
      </Text>
      <Text
        style={[styles.stampProgress, hiddenLocked && styles.hiddenProgress]}
        numberOfLines={hiddenLocked ? 2 : 1}
      >
        {hiddenLocked
          ? t('A small moment\nis still waiting.')
          : unlocked
            ? formatDate(achievement.progress.unlockedAt, locale)
            : `${achievement.progress.currentValue}/${achievement.progress.targetValue}`}
      </Text>
    </Pressable>
  );
}

function AlmostThereCard({
  achievement,
  onPress,
}: {
  achievement: EvaluatedAchievement;
  onPress: (achievement: EvaluatedAchievement) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('{title}, {current} of {total}', { title: t(achievement.definition.title), current: achievement.progress.currentValue, total: achievement.progress.targetValue })}
      onPress={() => onPress(achievement)}
      style={({ pressed }) => [
        styles.almostCard,
        pressed && styles.stampCellPressed,
      ]}
    >
      <AchievementStamp
        iconKey={achievement.definition.iconKey}
        size={54}
        state="in_progress"
        progressRatio={achievement.progressRatio}
      />
      <Text style={styles.almostTitle} numberOfLines={2}>
        {t(achievement.definition.title)}
      </Text>
      <Text style={styles.almostProgress}>
        {achievement.progress.currentValue}/{achievement.progress.targetValue}
      </Text>
      <Text style={styles.almostHint}>{shortHint(achievement, locale)}</Text>
    </Pressable>
  );
}

function FamilyStampGrid({
  family,
  achievements,
  onStampPress,
}: {
  family: AchievementFamily;
  achievements: EvaluatedAchievement[];
  onStampPress: (achievement: EvaluatedAchievement) => void;
}) {
  const { t, locale } = useI18n();

  return (
    <View style={styles.familySection}>
      <View style={styles.familyHeader}>
        <Text style={styles.familyTitle}>{t(FAMILY_LABELS[family])}</Text>
        <Text style={styles.familyCount}>{achievements.length}{locale === 'zh' ? ' 件' : ' keepsakes'}</Text>
      </View>
      <View style={styles.stampGrid}>
        {achievements.map((achievement) => (
          <StampCell
            key={achievement.definition.id}
            achievement={achievement}
            onPress={onStampPress}
          />
        ))}
      </View>
    </View>
  );
}

function KeepsakeDetailSheet({
  achievement,
  onClose,
  onViewSource,
}: {
  achievement?: EvaluatedAchievement;
  onClose: () => void;
  onViewSource: (achievement: EvaluatedAchievement) => void;
}) {
  const { t, locale } = useI18n();
  if (!achievement) return null;

  const unlocked = isUnlocked(achievement);
  const hiddenLocked = isHiddenLocked(achievement);
  const title = hiddenLocked ? '???' : t(achievement.definition.title);
  const stampState = getStampState(achievement);
  const displayedCurrentValue = Math.min(achievement.progress.currentValue, achievement.progress.targetValue);
  const description = hiddenLocked
    ? t('A small moment is still waiting.')
    : t(achievement.definition.description);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Close')} style={styles.sheetBackdrop} onPress={onClose} />
        <View style={styles.detailSheet}>
          <View style={styles.sheetHandle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.detailHero}>
              {isNew(achievement) ? <View style={styles.detailHalo} /> : null}
              <AchievementStamp
                iconKey={hiddenLocked ? getSecretKeepsakeIconKey(achievement) : achievement.definition.iconKey}
                size={116}
                state={stampState}
                progressRatio={achievement.progressRatio}
              />
            </View>
            <Text style={styles.detailTitle}>{title}</Text>
            <Text style={styles.detailMeta}>
              {hiddenLocked
                ? t('Secret keepsake')
                : t('{family} · Tier {tier}', { family: t(FAMILY_LABELS[achievement.definition.family]), tier: romanTier(achievement.definition.tier) })}
            </Text>
            <Text style={styles.detailDescription}>{description}</Text>

            {!hiddenLocked && !unlocked ? (
              <View style={styles.detailProgressBlock}>
                <View style={styles.detailProgressTop}>
                  <Text style={styles.detailProgressLabel}>{t("Progress")}</Text>
                  <Text style={styles.detailProgressValue}>
                    {displayedCurrentValue} / {achievement.progress.targetValue}
                  </Text>
                </View>
                <View style={styles.detailProgressTrack}>
                  <View
                    style={[
                      styles.detailProgressFill,
                      { width: `${Math.round(achievement.progressRatio * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.detailRemaining}>
                  {unlocked ? t('This keepsake is resting on your shelf.') : remainingHint(achievement)}
                </Text>
              </View>
            ) : null}

            {unlocked ? (
              <Text style={styles.detailUnlocked}>
                {t('Found {date}', { date: formatDate(achievement.progress.unlockedAt, locale) })}
              </Text>
            ) : null}

            <View style={styles.detailActions}>
              <Pressable
                accessibilityRole="button"
                disabled={!achievement.progress.firstSourceMealId}
                style={[
                  styles.detailPrimary,
                  !achievement.progress.firstSourceMealId && styles.detailPrimaryDisabled,
                ]}
                onPress={() => onViewSource(achievement)}
              >
                <Text style={styles.detailPrimaryText}>{t("View related record")}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.detailSecondary} onPress={onClose}>
                <Text style={styles.detailSecondaryText}>{t("Close")}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function QuietUnlockToast({
  achievement,
}: {
  achievement?: EvaluatedAchievement;
}) {
  const { t, locale } = useI18n();
  if (!achievement) return null;

  return (
    <View pointerEvents="none" style={styles.toastWrap}>
      <View style={styles.toast}>
        <AchievementStamp
          iconKey={achievement.definition.iconKey}
          size={44}
          state="newly_unlocked"
        />
        <View style={styles.toastTextWrap}>
          <Text style={styles.toastKicker}>{t("New keepsake found")}</Text>
          <Text style={styles.toastTitle} numberOfLines={1}>
            {t(achievement.definition.title)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function UnlockModal({
  achievement,
  onClose,
}: {
  achievement?: EvaluatedAchievement;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  if (!achievement) return null;

  const major = achievement.definition.celebrationLevel === 'major';

  if (!major) {
    return (
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.standardUnlockOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('Close')} style={styles.unlockBackdrop} onPress={onClose} />
          <View style={styles.standardUnlockSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.standardUnlockKicker}>{t("Unlocked")}</Text>
            <AchievementStamp
              iconKey={achievement.definition.iconKey}
              size={92}
              state="newly_unlocked"
            />
            <Text style={styles.unlockTitle}>{t(achievement.definition.title)}</Text>
            <Text style={styles.unlockBody}>{t(achievement.definition.description)}</Text>
            <View style={styles.unlockActions}>
              <Pressable accessibilityRole="button" style={styles.unlockPrimary} onPress={onClose}>
                <Text style={styles.unlockPrimaryText}>{t("Place on shelf")}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.unlockSecondary} onPress={onClose}>
                <Text style={styles.unlockSecondaryText}>{t("Continue")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.unlockOverlay}>
        <View style={[styles.unlockSheet, styles.unlockSheetMajor]}>
          <View style={styles.unlockHalo} />
          <View style={[styles.paperSparkle, styles.paperSparkleOne]} />
          <View style={[styles.paperSparkle, styles.paperSparkleTwo]} />
          <View style={[styles.paperSparkle, styles.paperSparkleThree]} />
          <AchievementStamp
            iconKey={achievement.definition.iconKey}
            size={118}
            state="newly_unlocked"
          />
          <Text style={styles.unlockKicker}>{t("A major keepsake was found")}</Text>
          <Text style={styles.unlockTitle}>{t(achievement.definition.title)}</Text>
          <Text style={styles.unlockBody}>{t(achievement.definition.description)}</Text>
          <Text style={styles.unlockDate}>{formatDate(achievement.progress.unlockedAt, locale)}</Text>
          <View style={styles.unlockActions}>
            <Pressable accessibilityRole="button" style={styles.unlockPrimary} onPress={onClose}>
              <Text style={styles.unlockPrimaryText}>{t("Place on shelf")}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.unlockSecondary} onPress={onClose}>
              <Text style={styles.unlockSecondaryText}>{t("See your journey")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function CollectionScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<CollectionState | null>(null);
  const [unlockModal, setUnlockModal] = useState<EvaluatedAchievement | undefined>();
  const [quietToast, setQuietToast] = useState<EvaluatedAchievement | undefined>();
  const [selectedAchievement, setSelectedAchievement] = useState<EvaluatedAchievement | undefined>();
  const [migrationDismissed, setMigrationDismissed] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [shelfPage, setShelfPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const loadAchievements = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await evaluateAndPersistAchievements('MEAL_UPDATED');
      setState(result);
      const firstQuietUnlock = result.newlyUnlocked.find((achievement) => (
        achievement.definition.celebrationLevel === 'quiet'
      ));
      const firstVisibleUnlock = result.newlyUnlocked.find((achievement) => (
        achievement.definition.celebrationLevel !== 'quiet'
      ));
      if (firstQuietUnlock) setQuietToast(firstQuietUnlock);
      if (firstVisibleUnlock) setUnlockModal(firstVisibleUnlock);
    } catch {
      setError('Could not load keepsakes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAchievements();
    }, [loadAchievements]),
  );

  const achievements = state?.achievements ?? [];
  const unlocked = achievements.filter(isUnlocked)
    .sort((a, b) => (b.progress.unlockedAt ?? '').localeCompare(a.progress.unlockedAt ?? ''));
  const familyGroups = useMemo(
    () => getFamilyAchievementGroups(achievements.filter((achievement) => !isUnlocked(achievement))),
    [achievements],
  );
  const pageCount = Math.max(1, Math.ceil(unlocked.length / 6));
  const currentPage = Math.min(shelfPage, pageCount - 1);
  const secretAchievements = achievements.filter(isHiddenLocked);
  const almostThere = state?.closest.slice(0, 3) ?? [];
  const migrationSummary = state?.migrationSummary;
  const showMigrationSummary = Boolean(
    migrationSummary?.completed
    && !migrationSummary.seenAt
    && migrationSummary.foundCount > 0
    && !migrationDismissed
  );

  const updateAchievementAsSeen = useCallback((achievementId: string) => {
    setState((current) => {
      if (!current) return current;
      const update = (achievement: EvaluatedAchievement): EvaluatedAchievement => (
        achievement.definition.id === achievementId
          ? {
            ...achievement,
            progress: {
              ...achievement.progress,
              status: achievement.progress.status === 'newly_unlocked'
                ? 'unlocked'
                : achievement.progress.status,
              seenAt: achievement.progress.seenAt ?? new Date().toISOString(),
            },
          }
          : achievement
      );
      return {
        ...current,
        achievements: current.achievements.map(update),
        newlyUnlocked: current.newlyUnlocked.filter((item) => item.definition.id !== achievementId),
        closest: current.closest.map(update),
      };
    });
  }, []);

  useEffect(() => {
    if (!quietToast) return undefined;

    const timer = setTimeout(async () => {
      try {
        await markAchievementSeen(quietToast.definition.id);
        updateAchievementAsSeen(quietToast.definition.id);
        setQuietToast(undefined);
      } catch {
        setQuietToast(undefined);
        setError('Could not save these changes. Please try again.');
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [quietToast, updateAchievementAsSeen]);

  const handleOpenStamp = async (achievement: EvaluatedAchievement) => {
    try {
      setSelectedAchievement(achievement);
      if (achievement.progress.status === 'newly_unlocked') {
        await markAchievementSeen(achievement.definition.id);
        updateAchievementAsSeen(achievement.definition.id);
      }
    } catch {
      setError('Could not save these changes. Please try again.');
    }
  };

  const handleDismissMigration = async () => {
    try {
      if (!migrationSummary) return;
      const next = {
        ...migrationSummary,
        seenAt: new Date().toISOString(),
      };
      await saveAchievementMigrationSummary(next);
      setState((current) => current ? { ...current, migrationSummary: next } : current);
      setMigrationDismissed(true);
    } catch {
      setError('Could not save these changes. Please try again.');
    }
  };

  const handleCloseUnlock = async () => {
    try {
      if (unlockModal) await markAchievementSeen(unlockModal.definition.id);
      setUnlockModal(undefined);
      await loadAchievements();
    } catch {
      setError('Could not save these changes. Please try again.');
    }
  };

  const handleViewSource = (achievement: EvaluatedAchievement) => {
    const mealId = achievement.progress.firstSourceMealId;
    if (!mealId) return;
    setSelectedAchievement(undefined);
    router.push(`/meal/${mealId}`);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.kicker}>{t("Mealog collection")}</Text>
          <Text style={styles.title}>{locale === 'zh' ? '日子的纪念。' : 'Little things, kept.'}</Text>
          <Text style={styles.subtitle}>
            {locale === 'zh' ? '日子慢慢过，总有一些值得留下。' : 'Small keepsakes that lead back to your table.'}</Text>
          <Pressable accessibilityRole="button" style={styles.profileLink} onPress={() => router.push('/profile')}>
            <Text style={styles.profileLinkText}>{t('Your table & settings')}</Text>
          </Pressable>
        </View>

        <LoadState loading={loading} error={error} onRetry={loadAchievements} />
        {state ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {locale === 'zh' ? `已经留下的纪念 · ${unlocked.length}` : `On your shelf · ${unlocked.length}`}
            </Text>
            {unlocked.length > 0 ? (
              <View style={styles.stampGrid}>
                {unlocked.slice(currentPage * 6, (currentPage + 1) * 6).map((achievement) => (
                  <StampCell key={achievement.definition.id} achievement={achievement} onPress={handleOpenStamp} />
                ))}
              </View>
            ) : (
              <View style={styles.emptyPanel}>
                <Text style={styles.emptyTitle}>{t('The shelf is waiting for its first small object.')}</Text>
                <Text style={styles.emptyBody}>
                  {locale === 'zh' ? '从一顿普通的饭开始，纪念会随记录慢慢留下。' : 'Begin with an everyday meal. Keepsakes will follow your memories.'}
                </Text>
                <Pressable accessibilityRole="button" style={styles.profileLink} onPress={() => router.push('/add')}>
                  <Text style={styles.profileLinkText}>{locale === 'zh' ? '记下一餐' : 'Save a meal'}</Text>
                </Pressable>
              </View>
            )}
            {pageCount > 1 && <View style={styles.shelfPager}>
              <Pressable accessibilityRole="button" accessibilityLabel={locale === 'zh' ? '上一页收藏' : 'Previous keepsakes'} disabled={currentPage === 0} onPress={() => setShelfPage(currentPage - 1)} style={[styles.pagerButton, currentPage === 0 && { opacity: 0.3 }]}><Text style={styles.profileLinkText}>←</Text></Pressable>
              <Text style={styles.profileLinkText}>{currentPage + 1} / {pageCount}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={locale === 'zh' ? '下一页收藏' : 'Next keepsakes'} disabled={currentPage === pageCount - 1} onPress={() => setShelfPage(currentPage + 1)} style={[styles.pagerButton, currentPage === pageCount - 1 && { opacity: 0.3 }]}><Text style={styles.profileLinkText}>→</Text></Pressable>
            </View>}
          </View>
        ) : null}

        {showMigrationSummary ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("View migrated keepsakes")}
            style={styles.migrationBanner}
            onPress={handleDismissMigration}
          >
            <Text style={styles.migrationTitle}>
              {t('You found {count} keepsakes from earlier meals.', { count: migrationSummary?.foundCount ?? 0 })}</Text>
            <Text style={styles.migrationButton}>{t("View keepsakes")}</Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showUpcoming }}
          onPress={() => setShowUpcoming((visible) => !visible)}
          style={styles.upcomingToggle}
        >
          <Text style={styles.upcomingToggleText}>
            {locale === 'zh' ? (showUpcoming ? '收起其他纪念' : '看看还有哪些纪念') : (showUpcoming ? 'Hide other keepsakes' : 'Explore other keepsakes')}
          </Text>
          <Text style={styles.upcomingToggleText}>{showUpcoming ? '−' : '＋'}</Text>
        </Pressable>

        {showUpcoming ? (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("Almost There")}</Text>
              {almostThere.length > 0 ? (
                <View style={styles.almostGrid}>
                  {almostThere.map((achievement) => (
                    <AlmostThereCard
                      key={achievement.definition.id}
                      achievement={achievement}
                      onPress={handleOpenStamp}
                    />
                  ))}
                </View>
              ) : loading || error ? null : (
                <View style={styles.emptyPanel}>
                  <Text style={styles.emptyTitle}>{t("Nothing close yet.")}</Text>
                  <Text style={styles.emptyBody}>
                    {t("A few more meal memories will bring the nearest keepsakes into view.")}</Text>
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("Keepsake Families")}</Text>
              {familyGroups.map((group) => (
                <FamilyStampGrid
                  key={group.family}
                  family={group.family}
                  achievements={group.achievements}
                  onStampPress={handleOpenStamp}
                />
              ))}
            </View>

            {secretAchievements.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t("Secret Keepsakes")}</Text>
                <View style={styles.stampGrid}>
                  {secretAchievements.slice(0, 6).map((achievement) => (
                    <StampCell
                      key={achievement.definition.id}
                      achievement={achievement}
                      onPress={handleOpenStamp}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <QuietUnlockToast achievement={quietToast} />
      <KeepsakeDetailSheet
        achievement={selectedAchievement}
        onClose={() => setSelectedAchievement(undefined)}
        onViewSource={handleViewSource}
      />
      <UnlockModal achievement={unlockModal} onClose={handleCloseUnlock} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shelfPager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, borderTopWidth: 1, borderColor: colors.primary },
  pagerButton: { minWidth: 48, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 30,
  },
  header: {
    marginBottom: 18,
  },
  kicker: { fontFamily: fonts.body,
    fontSize: 12,
    color: colors.mutedText,
    marginBottom: 7,
  },
  title: { fontFamily: fonts.editorial,
    fontSize: 26,
    lineHeight: 32,
    color: colors.primary,
  },
  subtitle: { fontFamily: fonts.body,
    marginTop: 8,
    maxWidth: 330,
    fontSize: 14,
    lineHeight: 21,
    color: colors.mutedText,
  },
  profileLink: {
    alignSelf: 'flex-start',
    borderRadius: 17,
    paddingHorizontal: 13,
    minHeight: 44,
    justifyContent: 'center',
    marginTop: 8,
    backgroundColor: 'rgba(248, 232, 212, 0.36)',
  },
  profileLinkText: { fontFamily: fonts.body,
    fontSize: 12,
    color: colors.secondary,
  },
  upcomingToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 52, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.primary, marginBottom: 20 },
  upcomingToggleText: { fontSize: 14, color: colors.secondary },
  migrationBanner: {
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 15,
    marginBottom: 24,
    backgroundColor: 'rgba(248, 232, 212, 0.48)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(180, 145, 88, 0.32)',
  },
  migrationTitle: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.primary,
    marginBottom: 6,
  },
  migrationButton: {
    fontSize: 12,
    color: colors.secondary,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: { fontFamily: fonts.editorial,
    fontSize: 17,
    lineHeight: 23,
    color: colors.primary,
    marginBottom: 14,
  },
  almostGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  almostCard: {
    flex: 1,
    minHeight: 138,
    borderRadius: 12,
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: 'rgba(255, 253, 248, 0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.16)',
    borderStyle: 'solid',
  },
  almostTitle: {
    marginTop: 7,
    minHeight: 34,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    color: colors.primary,
  },
  almostProgress: {
    marginTop: 3,
    fontSize: 11,
    color: colors.secondary,
  },
  almostHint: {
    marginTop: 2,
    fontSize: 10,
    color: colors.mutedText,
  },
  familySection: {
    marginBottom: 30,
  },
  familyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  familyTitle: {
    flex: 1,
    fontSize: 17,
    lineHeight: 23,
    color: colors.secondary,
  },
  familyCount: {
    fontSize: 13,
    color: colors.mutedText,
  },
  stampGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 10,
    rowGap: 14,
  },
  stampCell: {
    width: '31.2%',
    minHeight: 136,
    borderRadius: 12,
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 9,
    backgroundColor: 'rgba(255, 253, 248, 0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.16)',
    borderStyle: 'solid',
  },
  stampCellUnlocked: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderStyle: 'solid',
  },
  stampCellNew: {
    borderColor: 'rgba(180, 145, 88, 0.62)',
  },
  stampCellPressed: {
    opacity: 0.78,
  },
  stampFrame: {
    position: 'relative',
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newHalo: {
    position: 'absolute',
    top: 4,
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: 'rgba(248, 232, 212, 0.62)',
  },
  tierBadge: {
    position: 'absolute',
    left: 3,
    top: 3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 253, 248, 0.86)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.34)',
  },
  tierText: {
    fontSize: 9,
    color: colors.secondary,
  },
  checkBadge: {
    position: 'absolute',
    right: 1,
    bottom: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(92, 64, 51, 0.82)',
  },
  checkText: {
    fontSize: 12,
    color: colors.background,
  },
  newBadge: {
    position: 'absolute',
    right: 0,
    top: 2,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: 'rgba(180, 145, 88, 0.92)',
  },
  newText: {
    fontSize: 8,
    color: colors.background,
  },
  stampTitle: { fontFamily: fonts.body,
    marginTop: 5,
    minHeight: 34,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    color: colors.primary,
  },
  stampTitleHidden: {
    color: colors.secondary,
  },
  stampProgress: { fontFamily: fonts.body,
    marginTop: 2,
    fontSize: 10,
    color: colors.mutedText,
    textAlign: 'center',
  },
  hiddenProgress: {
    lineHeight: 13,
  },
  emptyPanel: {
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 20,
    backgroundColor: 'rgba(255, 253, 248, 0.5)',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(185, 165, 138, 0.28)',
  },
  emptyTitle: { fontFamily: fonts.editorial,
    fontSize: 16,
    color: colors.primary,
    marginBottom: 7,
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.mutedText,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(62, 43, 33, 0.26)',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  detailSheet: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 460 : undefined,
    alignSelf: 'center',
    maxHeight: '86%',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    backgroundColor: colors.background,
    ...shadow.card,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 4,
    marginBottom: 18,
    backgroundColor: 'rgba(185, 165, 138, 0.42)',
  },
  detailHero: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 134,
  },
  detailHalo: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(248, 232, 212, 0.64)',
  },
  detailTitle: { fontFamily: fonts.editorial,
    marginTop: 6,
    fontSize: 17,
    lineHeight: 23,
    textAlign: 'center',
    color: colors.primary,
  },
  detailMeta: {
    marginTop: 5,
    textAlign: 'center',
    fontSize: 12,
    color: colors.secondary,
  },
  detailDescription: {
    marginTop: 13,
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
    color: colors.mutedText,
  },
  detailProgressBlock: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginTop: 20,
    backgroundColor: 'rgba(255, 253, 248, 0.6)',
  },
  detailProgressTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  detailProgressLabel: {
    fontSize: 12,
    color: colors.mutedText,
  },
  detailProgressValue: {
    fontSize: 12,
    color: colors.secondary,
  },
  detailProgressTrack: {
    height: 8,
    borderRadius: 9,
    backgroundColor: 'rgba(234, 223, 204, 0.58)',
    overflow: 'hidden',
  },
  detailProgressFill: {
    height: '100%',
    borderRadius: 9,
    backgroundColor: 'rgba(180, 145, 88, 0.88)',
  },
  detailRemaining: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 19,
    color: colors.mutedText,
  },
  detailUnlocked: {
    marginTop: 14,
    textAlign: 'center',
    fontSize: 13,
    color: colors.secondary,
  },
  detailActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  detailPrimary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(92, 64, 51, 0.9)',
  },
  detailPrimaryDisabled: {
    opacity: 0.45,
  },
  detailPrimaryText: {
    color: colors.background,
  },
  detailSecondary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248, 232, 212, 0.42)',
  },
  detailSecondaryText: {
    color: colors.secondary,
  },

  toastWrap: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 18,
    zIndex: 40,
    alignItems: 'center',
  },
  toast: {
    width: '100%',
    maxWidth: 350,
    minHeight: 72,
    borderRadius: 125,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 253, 248, 0.94)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(180, 145, 88, 0.38)',
    ...shadow.card,
  },
  toastTextWrap: {
    flex: 1,
    marginLeft: 10,
  },
  toastKicker: {
    fontSize: 11,
    color: colors.mutedText,
  },
  toastTitle: {
    marginTop: 3,
    fontSize: 16,
    color: colors.primary,
  },
  standardUnlockOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(62, 43, 33, 0.26)',
  },
  unlockBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  standardUnlockSheet: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 460 : undefined,
    alignSelf: 'center',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    alignItems: 'center',
    backgroundColor: colors.background,
    ...shadow.card,
  },
  standardUnlockKicker: {
    marginBottom: 12,
    fontSize: 13,
    color: colors.secondary,
  },
  paperSparkle: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(215, 180, 106, 0.58)',
  },
  paperSparkleOne: {
    left: 58,
    top: 62,
  },
  paperSparkleTwo: {
    right: 70,
    top: 98,
    backgroundColor: 'rgba(169, 185, 133, 0.58)',
  },
  paperSparkleThree: {
    right: 118,
    bottom: 128,
    backgroundColor: 'rgba(185, 122, 86, 0.42)',
  },
  unlockOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    backgroundColor: 'rgba(62, 43, 33, 0.28)',
  },
  unlockSheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 22,
    alignItems: 'center',
    backgroundColor: colors.background,
    overflow: 'hidden',
    ...shadow.card,
  },
  unlockSheetMajor: {
    paddingTop: 34,
  },
  unlockHalo: {
    position: 'absolute',
    top: 16,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(248, 232, 212, 0.58)',
  },
  unlockKicker: {
    marginTop: 16,
    fontSize: 12,
    color: colors.mutedText,
  },
  unlockTitle: {
    marginTop: 7,
    fontSize: 26,
    lineHeight: 32,
    textAlign: 'center',
    color: colors.primary,
  },
  unlockBody: {
    marginTop: 9,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    color: colors.mutedText,
  },
  unlockDate: {
    marginTop: 9,
    fontSize: 12,
    color: colors.secondary,
  },
  unlockActions: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  unlockPrimary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(92, 64, 51, 0.9)',
  },
  unlockPrimaryText: {
    color: colors.background,
  },
  unlockSecondary: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248, 232, 212, 0.42)',
  },
  unlockSecondaryText: {
    color: colors.secondary,
  },
});
