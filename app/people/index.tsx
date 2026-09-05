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

type SortMode = 'recent' | 'count';

function confirmDelete(person: PersonProfile, onConfirm: () => void) {
  const message = 'This soft-deletes the profile only. Meal memories stay in the archive.';
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-restricted-globals
    if (confirm(`Delete ${person.name}?\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(`Delete ${person.name}?`, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete person', style: 'destructive', onPress: onConfirm },
  ]);
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export default function PeopleLibraryPage() {
  const router = useRouter();
  const [summaries, setSummaries] = useState<PersonMealSummary[]>([]);
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [editingPerson, setEditingPerson] = useState<PersonProfile | undefined>();

  const refresh = useCallback(async () => {
    const next = await getPersonMealSummaries();
    setSummaries(next);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getPersonMealSummaries().then((next) => {
        if (active) setSummaries(next);
      });
      return () => {
        active = false;
      };
    }, []),
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
  }, [query, sortMode, summaries]);

  const handleMergeDuplicates = async () => {
    for (const group of duplicateGroups) {
      const sorted = [...group].sort((a, b) => a.person.createdAt.localeCompare(b.person.createdAt));
      const keeper = sorted[0].person;
      const duplicates = sorted.slice(1);
      for (const duplicate of duplicates) {
        await mergePersonProfiles(duplicate.person.id, keeper.id);
      }
    }
    await refresh();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable style={styles.navButton} onPress={() => router.back()}>
            <Text style={styles.navButtonText}>Back</Text>
          </Pressable>
          <Pressable style={styles.navButton} onPress={() => setEditingPerson({
            id: '',
            name: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })}>
            <Text style={styles.navButtonText}>Add person</Text>
          </Pressable>
        </View>

        <View style={styles.header}>
          <Text style={styles.kicker}>Meal companions</Text>
          <Text style={styles.title}>People at my table</Text>
          <Text style={styles.subtitle}>
            Reusable people profiles for the meals you share. Mealog never reads contacts.
          </Text>
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or relationship"
          placeholderTextColor="rgba(141, 123, 102, 0.52)"
          style={styles.searchInput}
        />

        <View style={styles.sortRow}>
          {(['recent', 'count'] as const).map((mode) => {
            const active = sortMode === mode;
            return (
              <Pressable
                key={mode}
                style={[styles.sortChip, active && styles.sortChipActive]}
                onPress={() => setSortMode(mode)}
              >
                <Text style={[styles.sortText, active && styles.sortTextActive]}>
                  {mode === 'recent' ? 'Recent shared' : 'Most shared'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {duplicateGroups.length > 0 ? (
          <Pressable style={styles.mergeNote} onPress={handleMergeDuplicates}>
            <Text style={styles.mergeTitle}>Merge duplicate names</Text>
            <Text style={styles.mergeBody}>
              {duplicateGroups.length} possible duplicate group found.
            </Text>
          </Pressable>
        ) : null}

        {visibleSummaries.length > 0 ? (
          <View style={styles.peopleList}>
            {visibleSummaries.map((summary) => (
              <Pressable
                key={summary.person.id}
                style={styles.personRow}
                onPress={() => router.push(`/people/${summary.person.id}`)}
              >
                <PersonAvatar person={summary.person} size={48} />
                <View style={styles.personTextWrap}>
                  <Text style={styles.personName}>{summary.person.nickname ?? summary.person.name}</Text>
                  <Text style={styles.personMeta}>
                    {summary.person.relationship ?? 'A remembered seat'} · {summary.sharedMealCount} shared meals
                  </Text>
                  <Text style={styles.personDate}>
                    Last shared: {summary.lastSharedMealDate ?? 'not yet'}
                  </Text>
                </View>
                <View style={styles.rowActions}>
                  <Pressable style={styles.smallButton} onPress={() => setEditingPerson(summary.person)}>
                    <Text style={styles.smallButtonText}>Edit</Text>
                  </Pressable>
                  <Pressable
                    style={styles.deleteButton}
                    onPress={() => confirmDelete(summary.person, async () => {
                      await softDeletePersonProfile(summary.person.id);
                      await refresh();
                    })}
                  >
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </Pressable>
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>
              {query.trim() ? 'No one found.' : 'No one has taken a seat yet.'}
            </Text>
            <Text style={styles.emptyBody}>
              {query.trim()
                ? 'Add this person to your table.'
                : 'Add someone the next time you share a meal.'}
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
