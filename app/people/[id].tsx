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
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';

import {
  getMealCompanions,
  getMeals,
  getPersonById,
  getSharedMealPhotos,
  softDeletePersonProfile,
} from '../../src/storage';
import type { MealCompanion, MealEntry, PersonProfile, SharedMealPhoto } from '../../src/types';
import { colors, shadow, fonts } from '../../src/theme';
import PersonAvatar from '../../src/components/PersonAvatar';
import CreatePersonModal from '../../src/components/CreatePersonModal';
import LoadState from '../../src/components/LoadState';
import { mealWithPersonAction, peopleForScope } from '../../src/utils/people';
import { scopeMeals, type BookScope } from '../../src/utils/monthlyBooks';

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
  const { id, scope: requestedScope } = useLocalSearchParams<{ id: string; scope?: BookScope }>();
  const router = useRouter();
  const navigation = useNavigation('/');
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

  const personalPerson = person && peopleForScope([person], meals, companions, 'personal', photos).length > 0;
  const scope: BookScope = requestedScope === 'sample' ? 'sample'
    : requestedScope === 'personal' ? 'personal'
      : personalPerson || person?.origin !== 'sample' ? 'personal' : 'sample';
  const visiblePerson = person && peopleForScope([person], meals, companions, scope, photos).length > 0;
  const scopedMeals = useMemo(() => scopeMeals(meals, scope), [meals, scope]);
  const sharedMealIds = useMemo(
    () => new Set(companions.filter((item) => item.personId === id).map((item) => item.mealId)),
    [companions, id],
  );
  const sharedMeals = useMemo(
    () => scopedMeals.filter((meal) => sharedMealIds.has(meal.id))
      .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time)),
    [scopedMeals, sharedMealIds],
  );
  const sharedPhotos = useMemo(() => {
    const mealIds = new Set(scopedMeals.map((meal) => meal.id));
    return photos.filter((photo) => mealIds.has(photo.mealId) && photo.taggedPersonIds.includes(id));
  }, [id, photos, scopedMeals]);

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

  if (!person || (!person.deletedAt && !visiblePerson)) {
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

  const displayName = person.nickname ?? person.name;
  // Return to the existing tab tree; merge also preserves an in-progress edit target.
  const recordTogether = () => navigation.dispatch(mealWithPersonAction(person.id));

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
          <PersonAvatar person={person} size={60} />
          <Text style={styles.name}>{locale === 'zh' ? `我和${displayName}的餐桌` : `My table with ${displayName}`}</Text>
          <Text style={styles.relationship}>
            {person.deletedAt ? t('Deleted person') : t(person.relationship ?? 'A remembered seat')}
          </Text>
          {person.note ? <Text style={styles.note}>{person.note}</Text> : null}
          {scope === 'sample' ? <Text style={styles.scopeNote}>{locale === 'zh' ? '这里是示例回忆，新增的一餐会存入「我的餐桌」。' : 'These are example memories. New meals will be saved to My table.'}</Text> : null}
          {visiblePerson && !person.deletedAt ? (
            <Pressable accessibilityRole="button" style={styles.recordButton} onPress={recordTogether}>
              <Text style={styles.recordButtonText}>{locale === 'zh' ? `记下和${displayName}的一餐` : `Record a meal with ${displayName}`}</Text>
            </Pressable>
          ) : null}
        </View>

        <LoadState error={error} onRetry={load} />

        {sharedMeals.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{locale === 'zh' ? '一起留下的餐食' : 'Meals we remember'}</Text>
            {sharedMeals.map((meal) => {
              const photo = meal.photoThumbnailUri || meal.photoUri;
              return (
                <Pressable accessibilityRole="button" key={meal.id} style={styles.mealRow}
                  onPress={() => router.push({ pathname: '/meal/[id]', params: { id: meal.id, scope } })}>
                  {photo ? <Image source={{ uri: photo }} style={styles.mealPhoto} accessibilityLabel={meal.title} /> : null}
                  <View style={styles.mealText}>
                    <Text style={styles.mealMeta}>{formatDate(meal.date, locale)} · {meal.time}</Text>
                    {meal.title ? <Text style={styles.mealTitle}>{meal.title}</Text> : null}
                    {meal.note ? <Text style={styles.noteBody}>{meal.note}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>{person.deletedAt
              ? (locale === 'zh' ? '这个座位已收起，留下的回忆依然保留。' : 'This seat has been put away; saved memories remain.')
              : (locale === 'zh' ? '下次同桌，把这一餐留在这里。' : 'Next time you share a table, keep the meal here.')}</Text>
          </View>
        )}

        {sharedPhotos.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('Shared photographs')}</Text>
            <View style={styles.photoGrid}>
              {sharedPhotos.map((photo) => (
                <Pressable key={photo.id} accessibilityRole="button" style={styles.photoCard}
                  onPress={() => router.push({ pathname: '/meal/[id]', params: { id: photo.mealId, scope } })}>
                  <Image source={{ uri: photo.thumbnailUri || photo.imageUrl }} style={styles.photo} />
                  <Text style={styles.photoCaption} numberOfLines={2}>{photo.caption ?? t('Together at this table')}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {sharedMeals.length > 0 ? (
          <View style={styles.paper}>
            <Text style={styles.paperLine}>{t('{count} shared meals', { count: sharedMeals.length })}</Text>
            <Text style={styles.paperLine}>{locale === 'zh' ? `最早留下的一餐：${formatDate(firstDate, locale)}` : `Earliest recorded meal: ${formatDate(firstDate, locale)}`}</Text>
            <Text style={styles.paperLine}>{t('Recently shared: {date}', { date: formatDate(lastDate, locale) })}</Text>
          </View>
        ) : null}

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
          await load();
          router.setParams({ scope: 'personal' });
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
    borderRadius: 2,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 253, 248, 0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.24)',
  },
  navButtonText: {
    fontSize: 13,
    color: colors.primary,
  },
  hero: {
    alignItems: 'center',
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingVertical: 20,
    marginBottom: 20,
    backgroundColor: 'rgba(255, 253, 248, 0.72)',
    ...shadow.soft,
  },
  name: { fontFamily: fonts.editorial,
    marginTop: 13,
    fontSize: 26,
    lineHeight: 34,
    textAlign: 'center',
    color: colors.primary,
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
  scopeNote: {
    marginTop: 10,
    fontSize: 12,
    color: colors.mutedText,
  },
  recordButton: {
    marginTop: 18,
    minHeight: 46,
    borderRadius: 23,
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  recordButtonText: {
    color: colors.background,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
  },
  paper: {
    borderRadius: 2,
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
  sectionTitle: { fontFamily: fonts.editorial,
    fontSize: 17,
    lineHeight: 23,
    color: colors.primary,
    marginBottom: 12,
  },
  mealRow: {
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: 'rgba(255, 253, 248, 0.58)',
  },
  mealPhoto: {
    width: '100%',
    aspectRatio: 1.35,
  },
  mealText: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 7,
  },
  mealTitle: {
    fontSize: 16,
    color: colors.primary,
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
  noteBody: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.mutedText,
  },
  emptyBox: {
    marginBottom: 24,
    borderRadius: 2,
    padding: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(185, 165, 138, 0.28)',
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.mutedText,
  },
  deleteProfile: {
    alignSelf: 'center',
    borderRadius: 2,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: colors.destructiveSoft,
  },
  deleteProfileText: {
    color: colors.destructive,
  },
});
