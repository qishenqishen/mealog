import { useI18n, translate } from '../i18n';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { MealCompanion, MealEntry, PersonProfile } from '../types';
import { getMealCompanions, getMeals, getPeopleProfiles } from '../storage';
import { colors, shadow } from '../theme';
import PersonAvatar from './PersonAvatar';
import CreatePersonModal from './CreatePersonModal';
import SharedPhotoUploader from './SharedPhotoUploader';
import LoadState from './LoadState';
import { peopleForScope } from '../utils/people';

type PeopleStats = Record<string, {
  count: number;
  lastDate?: string;
}>;

function buildStats(meals: MealEntry[], companions: MealCompanion[]): PeopleStats {
  const mealsById = new Map(meals.map((meal) => [meal.id, meal]));
  const stats: PeopleStats = {};

  for (const companion of companions) {
    const meal = mealsById.get(companion.mealId);
    const current = stats[companion.personId] ?? { count: 0 };
    const lastDate = meal?.date && (!current.lastDate || meal.date > current.lastDate)
      ? meal.date
      : current.lastDate;
    stats[companion.personId] = {
      count: current.count + 1,
      lastDate,
    };
  }

  return stats;
}

function personMatches(person: PersonProfile, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    person.name,
    person.nickname,
    person.relationship,
    person.relationship ? translate(person.relationship) : undefined,
    person.note,
  ].some((value) => value?.toLowerCase().includes(needle));
}

function PersonRow({
  person,
  selected,
  meta,
  onPress,
}: {
  person: PersonProfile;
  selected: boolean;
  meta?: string;
  onPress: () => void;
}) {
  const { t, locale } = useI18n();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      style={[styles.personRow, selected && styles.personRowSelected]}
      onPress={onPress}
    >
      <PersonAvatar person={person} size={42} />
      <View style={styles.personTextWrap}>
        <Text style={styles.personName}>{person.nickname ?? person.name}</Text>
        <Text style={styles.personMeta} numberOfLines={1}>
          {meta ?? t(person.relationship ?? 'A remembered seat')}
        </Text>
      </View>
      <View style={[styles.selectMark, selected && styles.selectMarkActive]}>
        <Text style={[styles.selectMarkText, selected && styles.selectMarkTextActive]}>
          {selected ? '✓' : '+'}
        </Text>
      </View>
    </Pressable>
  );
}

export default function PeoplePickerSheet({
  visible,
  mealId,
  selectedPersonIds,
  ateAlone = false,
  scope = 'personal',
  onClose,
  onSave,
  onChanged,
}: {
  visible: boolean;
  mealId?: string;
  selectedPersonIds: string[];
  ateAlone?: boolean;
  scope?: 'personal' | 'sample';
  onClose: () => void;
  onSave: (personIds: string[], alone: boolean) => Promise<void> | void;
  onChanged?: () => Promise<void> | void;
}) {
  const { t, locale } = useI18n();
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [meals, setMeals] = useState<MealEntry[]>([]);
  const [companions, setCompanions] = useState<MealCompanion[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(selectedPersonIds);
  const [alone, setAlone] = useState(ateAlone);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [photoToolsOpen, setPhotoToolsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [reloadToken, setReloadToken] = useState(0);
  const [activeScope, setActiveScope] = useState(scope);

  useEffect(() => {
    if (!visible) return;
    setSelectedIds(selectedPersonIds);
    setAlone(ateAlone);
    setQuery('');
    setPhotoToolsOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    setError(undefined);
    Promise.all([getPeopleProfiles(), getMeals(), getMealCompanions()]).then(
      ([nextPeople, nextMeals, nextCompanions]) => {
        if (!active) return;
        const meal = nextMeals.find(item => item.id === mealId);
        const nextScope = meal ? (meal.origin === 'sample' ? 'sample' : 'personal') : scope;
        setActiveScope(nextScope);
        const scopedPeople = peopleForScope(nextPeople, nextMeals, nextCompanions, nextScope);
        setPeople(nextPeople.filter(person => scopedPeople.includes(person) || selectedPersonIds.includes(person.id)));
        if (meal) setAlone(meal.peopleTags.includes('just-me') && selectedPersonIds.length === 0);
        const scopedMeals = nextMeals.filter(item => nextScope === 'sample' ? item.origin === 'sample' : item.origin !== 'sample');
        const mealIds = new Set(scopedMeals.map(item => item.id));
        setMeals(scopedMeals);
        setCompanions(nextCompanions.filter(item => mealIds.has(item.mealId)));
      },
    ).catch(() => {
      if (active) setError('Could not load people.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [visible, reloadToken]);

  const stats = useMemo(() => buildStats(meals, companions), [companions, meals]);

  const filteredPeople = useMemo(
    () => people.filter(person => personMatches(person, query))
      .sort((a, b) => (stats[b.id]?.lastDate ?? b.createdAt).localeCompare(stats[a.id]?.lastDate ?? a.createdAt)),
    [people, query, locale, stats],
  );

  const selectedPeople = useMemo(
    () => people.filter((person) => selectedIds.includes(person.id)),
    [people, selectedIds],
  );

  const togglePerson = (id: string) => {
    setAlone(false);
    setSelectedIds((current) => (
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    ));
  };

  const handleSave = async () => {
    if (saving || loading || error) return;
    setSaving(true);
    setError(undefined);
    try {
      await onSave(selectedIds, alone);
      await onChanged?.();
      onClose();
    } catch {
      setError('Could not save these changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderPersonSection = (
    title: string,
    sectionPeople: PersonProfile[],
    metaForPerson: (person: PersonProfile) => string | undefined,
  ) => {
    const matchingPeople = sectionPeople.filter((person) => personMatches(person, query));
    if (matchingPeople.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {matchingPeople.map((person) => (
          <PersonRow
            key={`${title}-${person.id}`}
            person={person}
            selected={selectedIds.includes(person.id)}
            meta={metaForPerson(person)}
            onPress={() => togglePerson(person.id)}
          />
        ))}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !saving && onClose()}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.kicker}>{t("Meal companions")}</Text>
            <Text style={styles.title}>{t("Who shared this meal?")}</Text>
            <TextInput
              accessibilityLabel={t('Search people at your table')}
              value={query}
              onChangeText={setQuery}
              placeholder={t("Search people at your table")}
              placeholderTextColor="rgba(141, 123, 102, 0.52)"
              style={styles.searchInput}
            />

              <Pressable accessibilityRole="button" style={styles.optionButton} onPress={() => setCreating(true)}>
                <Text style={styles.optionText}>{locale === 'zh' ? '＋ 加一把椅子 · 添加同桌人' : '＋ Add a chair · Someone new'}</Text>
              </Pressable>

            {selectedPeople.length > 0 ? (
              <View style={styles.selectedStrip}>
                {selectedPeople.map((person) => (
                  <View key={person.id} style={styles.selectedPerson}>
                    <PersonAvatar person={person} size={30} />
                    <Text style={styles.selectedName} numberOfLines={1}>
                      {person.nickname ?? person.name}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <LoadState loading={loading} error={error} onRetry={() => setReloadToken((value) => value + 1)} />
            {loading || error ? null : people.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>{t("Who was at the table?")}</Text>
                <Text style={styles.emptyBody}>
                  {t("Add someone you shared this meal with, or keep this meal as a solo memory.")}</Text>
              </View>
            ) : filteredPeople.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>{t("No one found.")}</Text>
                <Text style={styles.emptyBody}>{t("Add this person to your table.")}</Text>
              </View>
            ) : (
              renderPersonSection(activeScope === 'sample' ? (locale === 'zh' ? '示例人物' : 'Example people') : t('People at my table'), filteredPeople, person => {
                const lastDate = stats[person.id]?.lastDate;
                return lastDate ? t('Last shared {date}', { date: lastDate }) : t(person.relationship ?? 'A remembered seat');
              })
            )}

            <View style={styles.optionGroup}>
              <Pressable
                accessibilityRole="button"
                style={styles.optionButton}
                onPress={() => setPhotoToolsOpen((current) => !current)}
              >
                <Text style={styles.optionText}>{t("Add a group photo")}</Text>
              </Pressable>
              {photoToolsOpen ? (
                <View style={styles.photoTools}>
                  <SharedPhotoUploader
                    mealId={mealId}
                    people={selectedPeople}
                    onSaved={onChanged}
                  />
                  {!mealId ? (
                    <Text style={styles.photoHint}>
                      {t("Save the meal first, then this photo can be attached to the meal.")}</Text>
                  ) : null}
                </View>
              ) : null}
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: alone }} style={styles.optionButton}
                onPress={() => { setAlone(value => !value); setSelectedIds([]); }} disabled={saving || loading || Boolean(error)}>
                <Text style={styles.optionText}>{alone ? '✓ ' : ''}{t("I ate alone")}</Text>
              </Pressable>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable accessibilityRole="button" style={styles.cancelButton} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>{t("Cancel")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.saveButton, (saving || loading || Boolean(error)) && styles.saveButtonDisabled]}
              disabled={saving || loading || Boolean(error)}
              onPress={() => handleSave()}
            >
              <Text style={styles.saveText}>{saving ? t('Saving...') : locale === 'zh' ? '确认这一餐的同伴' : 'Confirm meal companions'}</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <CreatePersonModal
        visible={creating}
        onClose={() => setCreating(false)}
        onSaved={async (person) => {
          setAlone(false);
          setPeople((current) => {
            const index = current.findIndex((item) => item.id === person.id);
            if (index >= 0) {
              const next = [...current];
              next[index] = person;
              return next;
            }
            return [person, ...current];
          });
          setSelectedIds((current) => (
            current.includes(person.id) ? current : [...current, person.id]
          ));
          await onChanged?.();
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(62, 43, 33, 0.28)',
  },
  sheet: {
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 460 : undefined,
    alignSelf: 'center',
    maxHeight: '88%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 23,
    paddingBottom: 15,
    backgroundColor: colors.background,
    ...shadow.card,
  },
  kicker: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 6,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    color: colors.primary,
    fontStyle: 'italic',
    marginBottom: 14,
  },
  searchInput: {
    minHeight: 44,
    borderRadius: 17,
    paddingHorizontal: 15,
    marginBottom: 14,
    backgroundColor: 'rgba(255, 253, 248, 0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.24)',
    color: colors.primary,
    fontSize: 14,
  },
  selectedStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  selectedPerson: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 17,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: 'rgba(180, 145, 88, 0.15)',
  },
  selectedName: {
    maxWidth: 86,
    fontSize: 12,
    color: colors.primary,
    fontStyle: 'italic',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: 'rgba(255, 253, 248, 0.58)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.18)',
  },
  personRowSelected: {
    backgroundColor: 'rgba(180, 145, 88, 0.17)',
    borderColor: 'rgba(180, 145, 88, 0.38)',
  },
  personTextWrap: {
    flex: 1,
  },
  personName: {
    fontSize: 15,
    color: colors.primary,
    fontStyle: 'italic',
  },
  personMeta: {
    marginTop: 3,
    fontSize: 11,
    color: colors.mutedText,
  },
  selectMark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(248, 232, 212, 0.42)',
  },
  selectMarkActive: {
    backgroundColor: 'rgba(92, 64, 51, 0.8)',
  },
  selectMarkText: {
    color: colors.secondary,
    fontSize: 15,
  },
  selectMarkTextActive: {
    color: colors.background,
  },
  emptyBox: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 17,
    marginBottom: 16,
    backgroundColor: 'rgba(255, 253, 248, 0.52)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(185, 165, 138, 0.28)',
  },
  emptyTitle: {
    fontSize: 16,
    color: colors.primary,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.mutedText,
  },
  optionGroup: {
    gap: 8,
    marginBottom: 14,
  },
  optionButton: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(248, 232, 212, 0.34)',
  },
  optionText: {
    fontSize: 14,
    color: colors.secondary,
    fontStyle: 'italic',
  },
  photoTools: {
    borderRadius: 18,
    padding: 12,
    backgroundColor: 'rgba(255, 253, 248, 0.52)',
  },
  photoHint: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
  },
  cancelButton: {
    flex: 0.8,
    minHeight: 46,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 253, 248, 0.64)',
  },
  cancelText: {
    color: colors.secondary,
    fontStyle: 'italic',
  },
  saveButton: {
    flex: 1.2,
    minHeight: 46,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(92, 64, 51, 0.9)',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    color: colors.background,
    fontStyle: 'italic',
  },
});
