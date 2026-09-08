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
import { useFocusEffect, useRouter } from 'expo-router';

import {
  getPersonMealSummaries,
  mergePersonProfiles,
  softDeletePersonProfile,
} from '../../src/storage';
import type { PersonMealSummary, PersonProfile } from '../../src/types';
import { colors, shadow } from '../../src/theme';
import PersonAvatar from '../../src/components/PersonAvatar';
import CreatePersonModal from '../../src/components/CreatePersonModal';
import LoadState from '../../src/components/LoadState';

type SortMode = 'recent' | 'count';

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

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export default function PeopleLibraryPage() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [summaries, setSummaries] = useState<PersonMealSummary[]>([]);
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [editingPerson, setEditingPerson] = useState<PersonProfile | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [merging, setMerging] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setSummaries(await getPersonMealSummaries());
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

  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, PersonMealSummary[]>();
    for (const summary of summaries) {
      const key = normalizeName(summary.person.name);
      groups.set(key, [...(groups.get(key) ?? []), summary]);
    }
    return [...groups.values()].filter((group) => group.length > 1);
  }, [summaries]);

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
      .sort((a, b) => {
        if (sortMode === 'count') {
          return b.sharedMealCount - a.sharedMealCount
            || (b.lastSharedMealDate ?? '').localeCompare(a.lastSharedMealDate ?? '');
        }
        return (b.lastSharedMealDate ?? '').localeCompare(a.lastSharedMealDate ?? '')
          || b.sharedMealCount - a.sharedMealCount;
      });
  }, [query, sortMode, summaries, t]);

  const handleMergeDuplicates = async () => {
    if (merging) return;
    setMerging(true);
    try {
    for (const group of duplicateGroups) {
      const sorted = [...group].sort((a, b) => a.person.createdAt.localeCompare(b.person.createdAt));
      const keeper = sorted[0].person;
      const duplicates = sorted.slice(1);
      for (const duplicate of duplicates) {
        await mergePersonProfiles(duplicate.person.id, keeper.id);
      }
    }
    await refresh();
    } catch {
      setError('Could not merge these people. Please try again.');
    } finally {
      setMerging(false);
    }
  };

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
            <Text style={styles.navButtonText}>{t("Add person")}</Text>
          </Pressable>
        </View>

        <View style={styles.header}>
          <Text style={styles.kicker}>{t("Meal companions")}</Text>
          <Text style={styles.title}>{t("People at my table")}</Text>
          <Text style={styles.subtitle}>
            {t("Reusable people profiles for the meals you share. Mealog never reads contacts.")}</Text>
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
          {(['recent', 'count'] as const).map((mode) => {
            const active = sortMode === mode;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                key={mode}
                style={[styles.sortChip, active && styles.sortChipActive]}
                onPress={() => setSortMode(mode)}
              >
                <Text style={[styles.sortText, active && styles.sortTextActive]}>
                  {mode === 'recent' ? t('Recent shared') : t('Most shared')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {duplicateGroups.length > 0 ? (
          <Pressable accessibilityRole="button" style={styles.mergeNote} onPress={handleMergeDuplicates} disabled={merging}>
            <Text style={styles.mergeTitle}>{t("Merge duplicate names")}</Text>
            <Text style={styles.mergeBody}>
              {t('{count} possible duplicate group found.', { count: duplicateGroups.length })}</Text>
          </Pressable>
        ) : null}

        <LoadState loading={loading} error={error} onRetry={refresh} />
        {visibleSummaries.length > 0 ? (
          <View style={styles.peopleList}>
            {visibleSummaries.map((summary) => (
              <Pressable
                accessibilityRole="button"
                key={summary.person.id}
                style={styles.personRow}
                onPress={() => router.push(`/people/${summary.person.id}`)}
              >
                <PersonAvatar person={summary.person} size={48} />
                <View style={styles.personTextWrap}>
                  <Text style={styles.personName}>{summary.person.nickname ?? summary.person.name}</Text>
                  <Text style={styles.personMeta}>
                    {t(summary.person.relationship ?? 'A remembered seat')} · {t('{count} shared meals', { count: summary.sharedMealCount })}</Text>
                  <Text style={styles.personDate}>
                    {t('Last shared: {date}', { date: summary.lastSharedMealDate ?? t('not yet') })}
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
              {query.trim() ? t('No one found.') : t('No one has taken a seat yet.')}
            </Text>
            <Text style={styles.emptyBody}>
              {query.trim()
                ? t('Add this person to your table.')
                : t('Add someone the next time you share a meal.')}
            </Text>
          </View>
        )}
      </ScrollView>

      <CreatePersonModal
        visible={Boolean(editingPerson)}
        person={editingPerson?.id ? editingPerson : undefined}
        onClose={() => setEditingPerson(undefined)}
        onSaved={async () => {
          setEditingPerson(undefined);
          await refresh();
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
  header: {
    marginBottom: 20,
  },
  kicker: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 7,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    color: colors.primary,
    fontStyle: 'italic',
  },
  subtitle: {
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
    fontStyle: 'italic',
  },
  sortTextActive: {
    color: colors.secondary,
  },
  mergeNote: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginBottom: 16,
    backgroundColor: 'rgba(255, 253, 248, 0.58)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(180, 145, 88, 0.28)',
  },
  mergeTitle: {
    fontSize: 15,
    color: colors.primary,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  mergeBody: {
    fontSize: 12,
    color: colors.mutedText,
  },
  peopleList: {
    gap: 11,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 22,
    paddingHorizontal: 13,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 253, 248, 0.68)',
    ...shadow.soft,
  },
  personTextWrap: {
    flex: 1,
  },
  personName: {
    fontSize: 17,
    color: colors.primary,
    fontStyle: 'italic',
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
    fontStyle: 'italic',
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
    fontStyle: 'italic',
  },
  emptyBox: {
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 22,
    backgroundColor: 'rgba(255, 253, 248, 0.58)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(185, 165, 138, 0.28)',
  },
  emptyTitle: {
    fontSize: 20,
    color: colors.primary,
    fontStyle: 'italic',
    marginBottom: 7,
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.mutedText,
  },
});
