import { useI18n, translate } from '../i18n';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import type { MealCompanion, PersonProfile, SharedMealPhoto } from '../types';
import {
  deleteSharedMealPhoto,
  getMealCompanions,
  getPeopleProfiles,
  getSharedMealPhotos,
  removeMealCompanion,
  saveSharedMealPhoto,
  setMealCompanions,
} from '../storage';
import { colors } from '../theme';
import PersonAvatar from './PersonAvatar';
import PeoplePickerSheet from './PeoplePickerSheet';
import SharedPhotoUploader from './SharedPhotoUploader';
import CreatePersonModal from './CreatePersonModal';
import LoadState from './LoadState';

function confirmAction(title: string, body: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-restricted-globals
    if (confirm(`${title}\n\n${body}`)) onConfirm();
    return;
  }
  Alert.alert(title, body, [
    { text: translate('Cancel'), style: 'cancel' },
    { text: translate('Remove'), style: 'destructive', onPress: onConfirm },
  ]);
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export default function MealCompanySection({
  mealId,
  onChanged,
}: {
  mealId: string;
  onChanged?: () => Promise<void> | void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [companions, setCompanions] = useState<MealCompanion[]>([]);
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [photos, setPhotos] = useState<SharedMealPhoto[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<PersonProfile | undefined>();
  const [editingPhotoId, setEditingPhotoId] = useState<string | undefined>();
  const [captionDraft, setCaptionDraft] = useState('');
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setError(undefined);
    setLoading(true);
    try {
      const [nextCompanions, nextPeople, nextPhotos] = await Promise.all([
        getMealCompanions(mealId),
        getPeopleProfiles({ includeDeleted: true }),
        getSharedMealPhotos(mealId),
      ]);
      setCompanions(nextCompanions);
      setPeople(nextPeople);
      setPhotos(nextPhotos);
    } catch {
      setError('Could not load people.');
    } finally {
      setLoading(false);
    }
  }, [mealId]);

  useFocusEffect(useCallback(() => {
    void reload();
  }, [reload]));

  const saveChange = async (action: () => Promise<unknown>) => {
    if (saving) return;
    setSaving(true);
    setError(undefined);
    try {
      await action();
      await reload();
      await onChanged?.();
    } catch {
      setError('Could not save these changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people],
  );

  const companionPeople = useMemo(
    () => companions
      .map((companion) => peopleById.get(companion.personId))
      .filter((person): person is PersonProfile => Boolean(person)),
    [companions, peopleById],
  );

  const selectedPersonIds = companions.map((companion) => companion.personId);

  const handleSavePeople = async (personIds: string[]) => {
    await setMealCompanions(mealId, personIds);
    await reload();
    await onChanged?.();
  };

  const handleRemove = (personId: string) => {
    confirmAction(
      t('Remove from this meal?'),
      t('This only removes the person from this meal. Their profile and other shared meals stay.'),
      () => { void saveChange(() => removeMealCompanion(mealId, personId)); },
    );
  };

  const beginPhotoEdit = (photo: SharedMealPhoto) => {
    setEditingPhotoId(photo.id);
    setCaptionDraft(photo.caption ?? '');
    setTagDraft(photo.taggedPersonIds);
  };

  const savePhotoEdit = async (photo: SharedMealPhoto) => {
    await saveChange(async () => {
      await saveSharedMealPhoto({
        ...photo,
        origin: 'user',
        caption: captionDraft.trim() || undefined,
        taggedPersonIds: tagDraft,
      });
      setEditingPhotoId(undefined);
    });
  };

  const handleDeletePhoto = (photoId: string) => {
    confirmAction(
      t('Delete shared photo?'),
      t('This removes only this shared photograph from the meal.'),
      () => { void saveChange(() => deleteSharedMealPhoto(photoId)); },
    );
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>{t("Company")}</Text>
          <Text style={styles.sectionSubtitle}>{t("Meal companions, not contacts.")}</Text>
        </View>
        <Pressable accessibilityRole="button" style={styles.addButton} onPress={() => setPickerOpen(true)}>
          <Text style={styles.addButtonText}>{t("+ Add person")}</Text>
        </Pressable>
      </View>

      <LoadState loading={loading} error={error} onRetry={reload} />
      {companions.length > 0 ? (
        <View style={styles.companionList}>
          {companions.map((companion) => {
            const person = peopleById.get(companion.personId);
            const name = (person?.deletedAt
              ? companion.personNameSnapshot
              : person?.nickname ?? person?.name ?? companion.personNameSnapshot) ?? t('Deleted person');
            return (
              <View key={companion.id} style={styles.companionRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={name}
                  disabled={!person}
                  onPress={() => person && router.push(`/people/${person.id}`)}
                >
                  <PersonAvatar
                    person={person}
                    name={name}
                    avatarUrl={companion.personAvatarSnapshot}
                    size={44}
                  />
                </Pressable>
                <View style={styles.companionTextWrap}>
                  <Text style={styles.companionName}>{name}</Text>
                  <Text style={styles.companionMeta}>
                    {person?.deletedAt ? t('Deleted person') : t(person?.relationship ?? 'At this table')}
                  </Text>
                </View>
                {person && !person.deletedAt ? (
                  <Pressable accessibilityRole="button" style={styles.linkButton} onPress={() => setEditingPerson(person)}>
                    <Text style={styles.linkButtonText}>{t("Edit person")}</Text>
                  </Pressable>
                ) : null}
                <Pressable accessibilityRole="button" style={styles.removeButton} onPress={() => handleRemove(companion.personId)} disabled={saving}>
                  <Text style={styles.removeButtonText}>{t("Remove")}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : loading || error ? null : (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>{t("Who was at the table?")}</Text>
          <Text style={styles.emptyBody}>
            {t("Add someone you shared this meal with, or keep this meal as a solo memory.")}</Text>
        </View>
      )}

      <View style={styles.photoBlock}>
        <Text style={styles.photoTitle}>{t("Together at this table")}</Text>
        <SharedPhotoUploader
          mealId={mealId}
          people={companionPeople}
          onSaved={async () => {
            await reload();
            await onChanged?.();
          }}
        />

        {!loading && !error && photos.length === 0 ? <Text style={styles.emptyBody}>{t('No shared photographs yet.')}</Text> : null}

        {photos.map((photo) => {
          const editing = editingPhotoId === photo.id;
          return (
            <View key={photo.id} style={styles.sharedPhotoCard}>
              <Image source={{ uri: photo.imageUrl }} style={styles.sharedPhoto} />
              {editing ? (
                <View style={styles.photoEditPanel}>
                  <TextInput
                    value={captionDraft}
                    onChangeText={setCaptionDraft}
                    placeholder={t("Caption for this shared photo...")}
                    placeholderTextColor="rgba(141, 123, 102, 0.52)"
                    style={styles.captionInput}
                  />
                  <View style={styles.tagRow}>
                    {companionPeople.map((person) => {
                      const selected = tagDraft.includes(person.id);
                      return (
                        <Pressable
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                          key={person.id}
                          style={[styles.tagChip, selected && styles.tagChipActive]}
                          onPress={() => setTagDraft((current) => toggleValue(current, person.id))}
                        >
                          <Text style={[styles.tagText, selected && styles.tagTextActive]}>
                            {person.nickname ?? person.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.photoActions}>
                    <Pressable accessibilityRole="button" style={styles.linkButton} onPress={() => setEditingPhotoId(undefined)}>
                      <Text style={styles.linkButtonText}>{t("Cancel")}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" style={styles.linkButton} onPress={() => savePhotoEdit(photo)} disabled={saving}>
                      <Text style={styles.linkButtonText}>{t("Save caption")}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.photoMeta}>
                  <Text style={styles.photoCaption}>
                    {photo.caption ?? t('A shared meal photograph')}
                  </Text>
                  <View style={styles.photoActions}>
                    <Pressable accessibilityRole="button" style={styles.linkButton} onPress={() => beginPhotoEdit(photo)}>
                      <Text style={styles.linkButtonText}>{t("Edit photo")}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" style={styles.removeButton} onPress={() => handleDeletePhoto(photo.id)} disabled={saving}>
                      <Text style={styles.removeButtonText}>{t("Delete photo")}</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>

      <PeoplePickerSheet
        visible={pickerOpen}
        mealId={mealId}
        selectedPersonIds={selectedPersonIds}
        onClose={() => setPickerOpen(false)}
        onSave={handleSavePeople}
        onChanged={reload}
      />

      <CreatePersonModal
        visible={Boolean(editingPerson)}
        person={editingPerson}
        onClose={() => setEditingPerson(undefined)}
        onSaved={async () => {
          setEditingPerson(undefined);
          await reload();
          await onChanged?.();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 4,
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 22,
    lineHeight: 28,
    color: colors.primary,
    fontStyle: 'italic',
  },
  sectionSubtitle: {
    marginTop: 3,
    fontSize: 12,
    color: colors.mutedText,
  },
  addButton: {
    borderRadius: 17,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(248, 232, 212, 0.42)',
  },
  addButtonText: {
    color: colors.secondary,
    fontSize: 12,
    fontStyle: 'italic',
  },
  companionList: {
    gap: 9,
  },
  companionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 253, 248, 0.52)',
  },
  companionTextWrap: {
    flex: 1,
  },
  companionName: {
    fontSize: 15,
    color: colors.primary,
    fontStyle: 'italic',
  },
  companionMeta: {
    marginTop: 3,
    fontSize: 11,
    color: colors.mutedText,
  },
  linkButton: {
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: 'rgba(248, 232, 212, 0.34)',
  },
  linkButtonText: {
    fontSize: 11,
    color: colors.secondary,
    fontStyle: 'italic',
  },
  removeButton: {
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: colors.destructiveSoft,
  },
  removeButtonText: {
    fontSize: 11,
    color: colors.destructive,
    fontStyle: 'italic',
  },
  emptyBox: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 17,
    backgroundColor: 'rgba(255, 253, 248, 0.52)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(185, 165, 138, 0.28)',
  },
  emptyTitle: {
    fontSize: 18,
    color: colors.primary,
    fontStyle: 'italic',
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.mutedText,
  },
  photoBlock: {
    marginTop: 20,
    gap: 12,
  },
  photoTitle: {
    fontSize: 18,
    color: colors.primary,
    fontStyle: 'italic',
  },
  sharedPhotoCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 253, 248, 0.58)',
  },
  sharedPhoto: {
    width: '100%',
    aspectRatio: 1.36,
  },
  photoMeta: {
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  photoCaption: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.mutedText,
    marginBottom: 10,
  },
  photoActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoEditPanel: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  captionInput: {
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
    backgroundColor: 'rgba(255, 248, 238, 0.68)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.22)',
    color: colors.primary,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 10,
  },
  tagChip: {
    borderRadius: 13,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(248, 232, 212, 0.32)',
  },
  tagChipActive: {
    backgroundColor: 'rgba(180, 145, 88, 0.18)',
  },
  tagText: {
    fontSize: 11,
    color: colors.mutedText,
  },
  tagTextActive: {
    color: colors.secondary,
  },
});
