import { useI18n, translate } from '../../src/i18n';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import {
  getPeopleProfiles,
  getMeals,
  getMealCompanions,
  getSharedMealPhotos,
  softDeletePersonProfile,
} from '../../src/storage';
import type { MealCompanion, MealEntry, PersonProfile, SharedMealPhoto } from '../../src/types';
import { colors, shadow, fonts } from '../../src/theme';
import PersonAvatar from '../../src/components/PersonAvatar';
import CreatePersonModal from '../../src/components/CreatePersonModal';
import LoadState from '../../src/components/LoadState';

import { peopleForScope } from '../../src/utils/people';
import { scopeMeals, type BookScope } from '../../src/utils/monthlyBooks';

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

export default function PeopleLibraryPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ scope?: string }>();
  const scope: BookScope = params.scope === 'sample' ? 'sample' : 'personal';
  const setScope = (nextScope: BookScope) => router.setParams({ scope: nextScope });
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [companions, setCompanions] = useState<MealCompanion[]>([]);
  const [photos, setPhotos] = useState<SharedMealPhoto[]>([]);
  const [query, setQuery] = useState('');
  const [editingPerson, setEditingPerson] = useState<PersonProfile | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [nextPeople, nextMeals, nextCompanions, nextPhotos] = await Promise.all([
        getPeopleProfiles(), getMeals(), getMealCompanions(), getSharedMealPhotos(),
      ]);
      setPeople(nextPeople);
      setMeals(nextMeals);
      setCompanions(nextCompanions);
      setPhotos(nextPhotos);
    } catch {
      setError('Could not load people.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const summaries = useMemo(() => {
    const scopedMeals = scopeMeals(meals, scope);
    return peopleForScope(people, meals, companions, scope, photos).map((person) => {
      const ids = new Set(companions.filter((item) => item.personId === person.id).map((item) => item.mealId));
      const dates = scopedMeals.filter((meal) => ids.has(meal.id)).map((meal) => meal.date).sort();
      return { person, lastSharedMealDate: dates[dates.length - 1] };
    });
  }, [people, meals, companions, photos, scope]);

  const visibleSummaries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return summaries
      .filter((summary) => {
        if (!needle) return true;
        const person = summary.person;
        return [
          person.name,
          person.nickname,
          person.relationship,
          person.relationship ? t(person.relationship) : undefined,
          person.note,
        ].some((value) => value?.toLowerCase().includes(needle));
      })
      .sort((a, b) => (b.lastSharedMealDate ?? '').localeCompare(a.lastSharedMealDate ?? '')
        || b.person.createdAt.localeCompare(a.person.createdAt));
  }, [query, summaries, t]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" style={styles.navButton} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}>
            <Text style={styles.navButtonText}>{t("Back")}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.navButton} onPress={() => setEditingPerson({
            id: '',
            name: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })}>
            <Text style={styles.navButtonText}>{locale === 'zh' ? '＋ 加一把椅子' : '+ Add a chair'}</Text>
          </Pressable>
        </View>

        <View style={styles.header}>
          <Text style={styles.kicker}>{t("Meal companions")}</Text>
          <Text style={styles.title}>{locale === 'zh' ? '同桌的人' : 'People at my table'}</Text>
          <Text style={styles.subtitle}>
            {locale === 'zh' ? '给一个人留个位置，也留住一起吃饭的日子。' : 'Save a seat for someone, and the meals you share.'}</Text>
        </View>

        <TextInput
          accessibilityLabel={t('Search by name or relationship')}
          value={query}
          onChangeText={setQuery}
          placeholder={t("Search by name or relationship")}
          placeholderTextColor="rgba(141, 123, 102, 0.52)"
          style={styles.searchInput}
        />

        <View style={styles.sortRow}>
          {(['personal', 'sample'] as const).map((option) => (
            <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: scope === option }}
              style={[styles.sortChip, scope === option && styles.sortChipActive]} onPress={() => setScope(option)}>
              <Text style={[styles.sortText, scope === option && styles.sortTextActive]}>
                {option === 'personal' ? (locale === 'zh' ? '我的同桌人' : 'My people') : (locale === 'zh' ? '示例人物' : 'Example people')}
              </Text>
            </Pressable>
          ))}
        </View>
        {scope === 'sample' ? <Text style={styles.scopeNote}>{locale === 'zh' ? '这些人物来自示例餐食。' : 'These people belong to the example meals.'}</Text> : null}

        <LoadState loading={loading} error={error} onRetry={refresh} />
        {visibleSummaries.length > 0 ? (
          <View style={styles.peopleList}>
            {visibleSummaries.map((summary) => (
              <Pressable
                accessibilityRole="button"
                key={summary.person.id}
                style={styles.personRow}
                onPress={() => router.push({ pathname: '/people/[id]', params: { id: summary.person.id, scope } })}
              >
                <PersonAvatar person={summary.person} size={48} />
                <View style={styles.personTextWrap}>
                  <Text style={styles.personName}>{summary.person.nickname ?? summary.person.name}</Text>
                  <Text style={styles.personMeta} numberOfLines={2}>
                    {summary.person.note || t(summary.person.relationship ?? 'A remembered seat')}</Text>
                  <Text style={styles.personDate}>
                    {summary.lastSharedMealDate ? t('Last shared: {date}', { date: summary.lastSharedMealDate }) : locale === 'zh' ? '位置已留好，下一餐再写下故事。' : 'A seat is saved for the next shared meal.'}
                  </Text>
                </View>
                <View style={styles.rowActions}>
                  <Pressable accessibilityRole="button" style={styles.smallButton} onPress={(event) => {
                    event.stopPropagation();
                    setEditingPerson(summary.person);
                  }}>
                    <Text style={styles.smallButtonText}>{t("Edit")}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.deleteButton}
                    onPress={(event) => {
                      event.stopPropagation();
                      confirmDelete(summary.person, async () => {
                      try {
                        await softDeletePersonProfile(summary.person.id);
                        await refresh();
                      } catch {
                        setError('Could not delete this person. Please try again.');
                      }
                      });
                    }}
                  >
                    <Text style={styles.deleteButtonText}>{t("Delete")}</Text>
                  </Pressable>
                </View>
              </Pressable>
            ))}
          </View>
        ) : loading || error ? null : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>
              {query.trim() ? t('No one found.') : scope === 'sample' ? (locale === 'zh' ? '暂无示例人物' : 'No example people') : locale === 'zh' ? '为想记住的人，留个位置。' : 'Save a seat for someone you want to remember.'}
            </Text>
            <Text style={styles.emptyBody}>
              {query.trim()
                ? t('Add this person to your table.')
                : locale === 'zh' ? (scope === 'sample' ? '你的同桌人会留在「我的同桌人」里。' : '不必等到下一餐，只写一个称呼就能添加。') : (scope === 'sample' ? 'Your people stay in My people.' : 'You can add a name before your next meal together.')}
            </Text>
          </View>
        )}
      </ScrollView>

      <CreatePersonModal
        visible={Boolean(editingPerson)}
        person={editingPerson?.id ? editingPerson : undefined}
        onClose={() => setEditingPerson(undefined)}
        onSaved={async () => {
          await refresh();
          setScope('personal');
          setQuery('');
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
  header: {
    marginBottom: 20,
  },
  kicker: { fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginBottom: 7,
  },
  title: { fontFamily: fonts.editorial,
    fontSize: 26,
    lineHeight: 32,
    color: colors.primary,
  },
  subtitle: { fontFamily: fonts.body,
    marginTop: 8,
    maxWidth: 320,
    fontSize: 14,
    lineHeight: 21,
    color: colors.mutedText,
  },
  searchInput: {
    minHeight: 44,
    borderRadius: 17,
    paddingHorizontal: 15,
    marginBottom: 13,
    backgroundColor: 'rgba(255, 253, 248, 0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.24)',
    color: colors.primary,
  },
  sortRow: {
    flexDirection: 'row',
    gap: 9,
    marginBottom: 17,
  },
  sortChip: {
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: 'rgba(248, 232, 212, 0.32)',
  },
  sortChipActive: {
    backgroundColor: 'rgba(180, 145, 88, 0.18)',
  },
  sortText: {
    fontSize: 12,
    color: colors.mutedText,
  },
  sortTextActive: {
    color: colors.secondary,
  },
  scopeNote: {
    marginBottom: 14,
    fontSize: 12,
    lineHeight: 18,
    color: colors.mutedText,
  },
  peopleList: {
    gap: 11,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 2,
    paddingHorizontal: 13,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 253, 248, 0.68)',
    ...shadow.soft,
  },
  personTextWrap: {
    flex: 1,
  },
  personName: { fontFamily: fonts.editorial,
    fontSize: 17,
    color: colors.primary,
  },
  personMeta: {
    marginTop: 3,
    fontSize: 12,
    color: colors.mutedText,
  },
  personDate: {
    marginTop: 2,
    fontSize: 11,
    color: colors.muted,
  },
  rowActions: {
    gap: 6,
  },
  smallButton: {
    borderRadius: 13,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: 'rgba(248, 232, 212, 0.34)',
  },
  smallButtonText: {
    fontSize: 11,
    color: colors.secondary,
  },
  deleteButton: {
    borderRadius: 13,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: colors.destructiveSoft,
  },
  deleteButtonText: {
    fontSize: 11,
    color: colors.destructive,
  },
  emptyBox: {
    borderRadius: 2,
    paddingHorizontal: 18,
    paddingVertical: 22,
    backgroundColor: 'rgba(255, 253, 248, 0.58)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(185, 165, 138, 0.28)',
  },
  emptyTitle: { fontFamily: fonts.editorial,
    fontSize: 18,
    color: colors.primary,
    marginBottom: 7,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.mutedText,
  },
});
