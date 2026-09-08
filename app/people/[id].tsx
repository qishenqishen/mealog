import { useI18n, translate, type Locale } from '../../src/i18n';
import { useCallback, useMemo, useState } from 'react';
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
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import {
  getMealCompanions,
  getMeals,
  getPersonById,
  getSharedMealPhotos,
  softDeletePersonProfile,
} from '../../src/storage';
import type { MealCompanion, MealEntry, PersonProfile, SharedMealPhoto } from '../../src/types';
import { colors, shadow } from '../../src/theme';
import PersonAvatar from '../../src/components/PersonAvatar';
import CreatePersonModal from '../../src/components/CreatePersonModal';
import LoadState from '../../src/components/LoadState';

function formatDate(dateStr: string | undefined, locale: Locale): string {
  if (!dateStr) return translate('not yet');
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function confirmDelete(person: PersonProfile, onConfirm: () => void) {
  const message = translate('This soft-deletes the profile only. Meal memories stay in the archive.');
  const title = translate('Delete {name}?', { name: person.name });
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-restricted-globals
    if (confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: translate('Cancel'), style: 'cancel' },
    { text: translate('Delete person'), style: 'destructive', onPress: onConfirm },
  ]);
}

export default function PersonDetailPage() {
  const { t, locale } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const goBack = () => router.canGoBack() ? router.back() : router.replace('/people');
  const [person, setPerson] = useState<PersonProfile | null>(null);
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [companions, setCompanions] = useState<MealCompanion[]>([]);
  const [photos, setPhotos] = useState<SharedMealPhoto[]>([]);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    if (!id) { setLoading(false); return; }
    setLoading(true);
    setError(undefined);
    try {
    const [nextPerson, nextMeals, nextCompanions, nextPhotos] = await Promise.all([
      getPersonById(id, { includeDeleted: true }),
      getMeals(),
      getMealCompanions(),
      getSharedMealPhotos(),
    ]);
    setPerson(nextPerson ?? null);
    setMeals(nextMeals);
    setCompanions(nextCompanions);
    setPhotos(nextPhotos);
    } catch {
      setError('Could not load this person.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const sharedMealIds = useMemo(
    () => new Set(companions.filter((item) => item.personId === id).map((item) => item.mealId)),
    [companions, id],
  );

  const sharedMeals = useMemo(
    () => meals
      .filter((meal) => sharedMealIds.has(meal.id))
      .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)),
    [meals, sharedMealIds],
  );

  const sharedPhotos = useMemo(
    () => photos.filter((photo) => photo.taggedPersonIds.includes(id)),
    [id, photos],
  );

  const notesMentioningPerson = useMemo(() => {
    if (!person) return [];
    const names = [person.name, person.nickname].filter(Boolean).map((value) => value!.toLowerCase());
    return sharedMeals.filter((meal) => {
      const note = meal.note?.toLowerCase();
      return note && names.some((name) => note.includes(name));
    });
  }, [person, sharedMeals]);

  const dates = sharedMeals.map((meal) => meal.date).sort();
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.loadingText}>{t("Opening this seat...")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!person) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          {error ? <LoadState error={error} onRetry={load} /> : <Text style={styles.loadingText}>{t("This person could not be found.")}</Text>}
          <Pressable accessibilityRole="button" style={styles.navButton} onPress={goBack}>
            <Text style={styles.navButtonText}>{t("Back")}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" style={styles.navButton} onPress={goBack}>
            <Text style={styles.navButtonText}>{t("Back")}</Text>
          </Pressable>
          {!person.deletedAt ? (
            <Pressable accessibilityRole="button" style={styles.navButton} onPress={() => setEditing(true)}>
              <Text style={styles.navButtonText}>{t("Edit person")}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.hero}>
          <PersonAvatar person={person} size={86} />
          <Text style={styles.name}>{person.nickname ?? person.name}</Text>
          <Text style={styles.relationship}>
            {person.deletedAt ? t('Deleted person') : t(person.relationship ?? 'A remembered seat')}
          </Text>
          {person.note ? <Text style={styles.note}>{person.note}</Text> : null}
        </View>

        <LoadState error={error} onRetry={load} />

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{sharedMeals.length}</Text>
            <Text style={styles.statLabel}>{t("shared meals")}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{sharedPhotos.length}</Text>
            <Text style={styles.statLabel}>{t("photographs")}</Text>
          </View>
        </View>

        <View style={styles.paper}>
          <Text style={styles.paperLine}>{t('First meal together: {date}', { date: formatDate(firstDate, locale) })}</Text>
          <Text style={styles.paperLine}>{t('Recently shared: {date}', { date: formatDate(lastDate, locale) })}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("Shared meals")}</Text>
          {sharedMeals.length > 0 ? (
            sharedMeals.map((meal) => (
              <Pressable
                accessibilityRole="button"
                key={meal.id}
                style={styles.mealRow}
                onPress={() => router.push(`/meal/${meal.id}`)}
              >
                <Text style={styles.mealTitle}>{meal.title}</Text>
                <Text style={styles.mealMeta}>{formatDate(meal.date, locale)} · {meal.time}</Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.emptyText}>{t("No shared meals yet.")}</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("Shared photographs")}</Text>
          {sharedPhotos.length > 0 ? (
            <View style={styles.photoGrid}>
              {sharedPhotos.map((photo) => (
                <View key={photo.id} style={styles.photoCard}>
                  <Image source={{ uri: photo.imageUrl }} style={styles.photo} />
                  <Text style={styles.photoCaption} numberOfLines={2}>
                    {photo.caption ?? t('Together at this table')}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>{t("No shared photographs yet.")}</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("Notes mentioning this person")}</Text>
          {notesMentioningPerson.length > 0 ? (
            notesMentioningPerson.map((meal) => (
              <View key={meal.id} style={styles.noteCard}>
                <Text style={styles.noteMeal}>{meal.title}</Text>
                <Text style={styles.noteBody}>{meal.note}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>{t("No notes mention this person yet.")}</Text>
          )}
        </View>

        {!person.deletedAt ? (
          <Pressable
            accessibilityRole="button"
            style={styles.deleteProfile}
            onPress={() => confirmDelete(person, async () => {
              try {
                await softDeletePersonProfile(person.id);
                await load();
              } catch {
                setError('Could not delete this person. Please try again.');
              }
            })}
          >
            <Text style={styles.deleteProfileText}>{t("Delete person profile")}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <CreatePersonModal
        visible={editing}
        person={person}
        onClose={() => setEditing(false)}
        onSaved={async () => {
          setEditing(false);
          await load();
        }}
      />
    </SafeAreaView>
  );
}

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
  scroll: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 50,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  navButton: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 253, 248, 0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.24)',
  },
  navButtonText: {
    fontSize: 13,
    color: colors.primary,
    fontStyle: 'italic',
  },
  hero: {
    alignItems: 'center',
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingVertical: 26,
    marginBottom: 20,
    backgroundColor: 'rgba(255, 253, 248, 0.72)',
    ...shadow.soft,
  },
  name: {
    marginTop: 13,
    fontSize: 32,
    lineHeight: 38,
    color: colors.primary,
    fontStyle: 'italic',
  },
  relationship: {
    marginTop: 4,
    fontSize: 14,
    color: colors.secondary,
  },
  note: {
    marginTop: 12,
    maxWidth: 300,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 21,
    color: colors.mutedText,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 17,
    backgroundColor: 'rgba(255, 253, 248, 0.58)',
  },
  statNumber: {
    fontSize: 28,
    lineHeight: 32,
    color: colors.secondary,
    fontStyle: 'italic',
  },
  statLabel: {
    fontSize: 12,
    color: colors.mutedText,
  },
  paper: {
    borderRadius: 22,
    paddingHorizontal: 17,
    paddingVertical: 15,
    marginBottom: 24,
    backgroundColor: 'rgba(248, 232, 212, 0.32)',
  },
  paperLine: {
    fontSize: 13,
    lineHeight: 21,
    color: colors.mutedText,
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 22,
    lineHeight: 28,
    color: colors.primary,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  mealRow: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 9,
    backgroundColor: 'rgba(255, 253, 248, 0.58)',
  },
  mealTitle: {
    fontSize: 16,
    color: colors.primary,
    fontStyle: 'italic',
  },
  mealMeta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.mutedText,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoCard: {
    width: '48%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 253, 248, 0.58)',
  },
  photo: {
    width: '100%',
    aspectRatio: 1,
  },
  photoCaption: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 11,
    lineHeight: 16,
    color: colors.mutedText,
  },
  noteCard: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 9,
    backgroundColor: 'rgba(255, 253, 248, 0.58)',
  },
  noteMeal: {
    fontSize: 15,
    color: colors.primary,
    fontStyle: 'italic',
    marginBottom: 5,
  },
  noteBody: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.mutedText,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.mutedText,
  },
  deleteProfile: {
    alignSelf: 'center',
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: colors.destructiveSoft,
  },
  deleteProfileText: {
    color: colors.destructive,
    fontStyle: 'italic',
  },
});
