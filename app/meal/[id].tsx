import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { deleteMeal, getMealById } from '../../src/storage';
import {
  DEFAULT_COMPANIONSHIP_TAGS,
  type MealEntry,
  type MealType,
  type MoodTag,
} from '../../src/types';
import { colors, shadow } from '../../src/theme';
import MealCompanySection from '../../src/components/MealCompanySection';

// ── Helpers ─────────────────────────────────────────────────

const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Treat',
  treat: 'Treat',
};

const MEAL_TYPE_INITIALS: Record<MealType, string> = {
  breakfast: 'B',
  lunch: 'L',
  dinner: 'D',
  snack: 'T',
  treat: 'T',
};

const MOOD_LABELS: Record<MoodTag, string> = {
  peaceful: 'Peaceful',
  everyday: 'Everyday',
  nostalgic: 'Nostalgic',
  healing: 'Healing',
  heartfelt: 'Heartfelt',
  overwhelming: 'Overwhelming',
  celebratory: 'Celebratory',
};

const PEOPLE_TAG_LABELS = Object.fromEntries(
  DEFAULT_COMPANIONSHIP_TAGS.map((tag) => [tag.id, tag.label]),
) as Record<string, string>;

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function getMoodTags(meal: MealEntry): MoodTag[] {
  if (meal.moodTags.length > 0) return meal.moodTags;
  return meal.moodTag ? [meal.moodTag] : [];
}

function getPeopleLabels(meal: MealEntry): string[] {
  return meal.peopleTags.map((tag) => PEOPLE_TAG_LABELS[tag] ?? tag);
}

/** Cross-platform confirm dialog (Alert.alert doesn't work on web). */
function confirmDelete(onConfirm: () => void) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-restricted-globals
    const yes = confirm('Delete this meal? This memory will be removed from your archive.');
    if (yes) onConfirm();
  } else {
    Alert.alert(
      'Delete this meal?',
      'This memory will be removed from your archive.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onConfirm },
      ],
    );
  }
}

// ── Small components ────────────────────────────────────────

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

function PhotoFallback({ mealType }: { mealType: MealType }) {
  return (
    <View style={styles.photoFallback}>
      <View style={styles.fallbackPlate}>
        <View style={styles.fallbackPlateInner} />
      </View>
      <Text style={styles.fallbackInitial}>{MEAL_TYPE_INITIALS[mealType]}</Text>
      <Text style={styles.fallbackCaption}>
        {MEAL_TYPE_LABELS[mealType]} memory
      </Text>
    </View>
  );
}

function SeatMark({ label }: { label: string }) {
  const initial = label.trim().charAt(0).toUpperCase();
  return (
    <View style={styles.seatItem}>
      <View style={styles.seatCircle}>
        <Text style={styles.seatInitial}>{initial}</Text>
      </View>
      <Text style={styles.seatLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ── Meal Detail Screen ──────────────────────────────────────

export default function MealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [meal, setMeal] = useState<MealEntry | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMeal = useCallback(() => {
    if (!id) return;
    setLoading(true);
    getMealById(id).then((m) => {
      setMeal(m ?? null);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    loadMeal();
  }, [loadMeal]);

  const handleDelete = () => {
    if (!meal) return;
    confirmDelete(async () => {
      await deleteMeal(meal.id);
      router.back();
    });
  };

  const handleEdit = () => {
    if (!meal) return;
    router.push(`/add?editMealId=${encodeURIComponent(meal.id)}`);
  };

  const moodTags = useMemo(() => (meal ? getMoodTags(meal) : []), [meal]);
  const peopleLabels = useMemo(() => (meal ? getPeopleLabels(meal) : []), [meal]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>Opening this memory...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!meal) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>This meal could not be found.</Text>
          <Pressable style={styles.notFoundBack} onPress={() => router.back()}>
            <Text style={styles.notFoundBackText}>Back to the table</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const location = meal.location ?? meal.locationText;
  const title = meal.title || MEAL_TYPE_LABELS[meal.mealType];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Pressable style={styles.navButton} onPress={() => router.back()}>
            <Text style={styles.navButtonText}>Back</Text>
          </Pressable>
          <Pressable style={styles.navButton} onPress={handleEdit}>
            <Text style={styles.navButtonText}>Edit</Text>
          </Pressable>
        </View>

        <View style={styles.memoryPage}>
          <View style={styles.photoCard}>
            {meal.photoUri ? (
              <Image
                source={{ uri: meal.photoUri }}
                style={styles.photo}
                resizeMode="cover"
                accessibilityLabel={title}
              />
            ) : (
              <PhotoFallback mealType={meal.mealType} />
            )}

            {peopleLabels.length > 0 ? (
              <View style={styles.photoSeatStrip}>
                {peopleLabels.slice(0, 4).map((label) => (
                  <SeatMark key={label} label={label} />
                ))}
                {peopleLabels.length > 4 ? (
                  <Text style={styles.moreSeats}>+{peopleLabels.length - 4}</Text>
                ) : null}
              </View>
            ) : null}
          </View>

          <View style={styles.titleBlock}>
            <Text style={styles.mealType}>{MEAL_TYPE_LABELS[meal.mealType]}</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.date}>{formatDate(meal.date)}</Text>
          </View>

          <View style={styles.metaCluster}>
            <View style={styles.metaLine}>
              <Text style={styles.metaIcon}>◷</Text>
              <Text style={styles.metaText}>{meal.time}</Text>
            </View>
            {location ? (
              <View style={styles.metaLine}>
                <Text style={styles.metaIcon}>⌖</Text>
                <Text style={styles.metaText}>{location}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Emotion Tag</Text>
            {moodTags.length > 0 ? (
              <View style={styles.chipRow}>
                {moodTags.map((tag) => (
                  <Chip key={tag} label={MOOD_LABELS[tag] ?? tag} />
                ))}
              </View>
            ) : (
              <Text style={styles.emptyLine}>No emotion tag was added.</Text>
            )}
          </View>

          <MealCompanySection mealId={meal.id} onChanged={loadMeal} />

          {peopleLabels.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Table Context</Text>
              <View style={styles.chipRow}>
                {peopleLabels.map((label) => (
                  <Chip key={label} label={label} />
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Memory Note</Text>
            {meal.note ? (
              <Text style={styles.noteText}>{meal.note}</Text>
            ) : (
              <Text style={styles.emptyLine}>
                This memory was kept without extra words.
              </Text>
            )}
          </View>
        </View>

        <View style={styles.actionArea}>
          <Pressable
            style={({ pressed }) => [
              styles.deleteButton,
              pressed && styles.deleteButtonPressed,
            ]}
            onPress={handleDelete}
          >
            <Text style={styles.deleteButtonText}>Delete this memory</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  loadingText: {
    fontSize: 15,
    color: colors.secondary,
  },
  notFoundBack: {
    marginTop: 18,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.34)',
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  notFoundBackText: {
    fontSize: 14,
    color: colors.primary,
  },
  scroll: {
    paddingHorizontal: 18,
    paddingBottom: 34,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
    paddingTop: 8,
    paddingBottom: 14,
  },
  navButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(92, 64, 51, 0.28)',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 253, 248, 0.46)',
  },
  navButtonText: {
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.primary,
  },
  memoryPage: {
    borderRadius: 30,
    backgroundColor: 'rgba(255, 253, 248, 0.72)',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 28,
    ...shadow.soft,
  },
  photoCard: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(248, 232, 212, 0.34)',
    marginBottom: 24,
  },
  photo: {
    width: '100%',
    aspectRatio: 0.92,
    borderRadius: 24,
  },
  photoFallback: {
    width: '100%',
    aspectRatio: 0.92,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 248, 238, 0.82)',
  },
  fallbackPlate: {
    width: 142,
    height: 92,
    borderRadius: 70,
    borderWidth: 1.2,
    borderColor: 'rgba(92, 64, 51, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackPlateInner: {
    width: 86,
    height: 44,
    borderRadius: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(92, 64, 51, 0.14)',
  },
  fallbackInitial: {
    position: 'absolute',
    fontSize: 34,
    fontStyle: 'italic',
    color: 'rgba(180, 145, 88, 0.72)',
  },
  fallbackCaption: {
    position: 'absolute',
    bottom: 28,
    fontSize: 13,
    color: colors.muted,
    fontStyle: 'italic',
  },
  photoSeatStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: 'rgba(255, 253, 248, 0.76)',
  },
  seatItem: {
    width: 42,
    alignItems: 'center',
  },
  seatCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180, 145, 88, 0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(180, 145, 88, 0.3)',
  },
  seatInitial: {
    fontSize: 12,
    color: colors.secondary,
    fontStyle: 'italic',
  },
  seatLabel: {
    marginTop: 4,
    fontSize: 10,
    color: colors.mutedText,
    fontStyle: 'italic',
    maxWidth: 48,
  },
  moreSeats: {
    fontSize: 16,
    color: colors.secondary,
    fontStyle: 'italic',
    marginLeft: 2,
  },
  titleBlock: {
    marginBottom: 18,
  },
  mealType: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 6,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontStyle: 'italic',
    color: colors.primary,
  },
  date: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedText,
  },
  metaCluster: {
    gap: 10,
    marginBottom: 26,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaIcon: {
    width: 25,
    fontSize: 17,
    color: colors.secondary,
  },
  metaText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    color: colors.mutedText,
    fontStyle: 'italic',
  },
  section: {
    marginTop: 3,
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    color: colors.primary,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  chip: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(248, 232, 212, 0.5)',
  },
  chipText: {
    fontSize: 13,
    color: colors.mutedText,
    fontStyle: 'italic',
  },
  seatList: {
    gap: 10,
  },
  seatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.36)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.18)',
  },
  chairGlyph: {
    width: 34,
    height: 34,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chairBack: {
    width: 20,
    height: 19,
    borderWidth: 1.1,
    borderColor: colors.secondary,
    borderRadius: 7,
    transform: [{ rotate: '-4deg' }],
  },
  chairSeat: {
    width: 24,
    height: 8,
    marginTop: -1,
    borderBottomWidth: 1.1,
    borderLeftWidth: 1.1,
    borderRightWidth: 1.1,
    borderBottomLeftRadius: 9,
    borderBottomRightRadius: 9,
    borderColor: colors.secondary,
  },
  seatRowText: {
    flex: 1,
    fontSize: 15,
    color: colors.primary,
    fontStyle: 'italic',
  },
  seatsEmpty: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.18)',
  },
  seatsEmptyTitle: {
    fontSize: 15,
    color: colors.primary,
    fontStyle: 'italic',
    marginBottom: 5,
  },
  seatsEmptyBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  noteText: {
    fontSize: 16,
    lineHeight: 25,
    color: colors.primary,
  },
  emptyLine: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    fontStyle: 'italic',
  },
  actionArea: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 4,
  },
  deleteButton: {
    alignSelf: 'center',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(201, 120, 98, 0.38)',
    backgroundColor: 'rgba(248, 228, 221, 0.32)',
  },
  deleteButtonPressed: {
    opacity: 0.7,
  },
  deleteButtonText: {
    fontSize: 13,
    color: colors.destructive,
    fontStyle: 'italic',
  },
});
