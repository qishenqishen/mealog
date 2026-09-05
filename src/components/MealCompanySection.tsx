import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useRouter } from 'expo-router';

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
import { getPersonDisplayName } from '../utils/people';
import PersonAvatar from './PersonAvatar';
import PeoplePickerSheet from './PeoplePickerSheet';
import SharedPhotoUploader from './SharedPhotoUploader';
import CreatePersonModal from './CreatePersonModal';

function confirmAction(title: string, body: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-restricted-globals
    if (confirm(`${title}\n\n${body}`)) onConfirm();
    return;
  }
  Alert.alert(title, body, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: onConfirm },
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
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [companions, setCompanions] = useState<MealCompanion[]>([]);
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [photos, setPhotos] = useState<SharedMealPhoto[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<PersonProfile | undefined>();
  const [editingPhotoId, setEditingPhotoId] = useState<string | undefined>();
  const [captionDraft, setCaptionDraft] = useState('');
  const [tagDraft, setTagDraft] = useState<string[]>([]);

  const reload = useCallback(async () => {
    const [nextCompanions, nextPeople, nextPhotos] = await Promise.all([
      getMealCompanions(mealId),
      getPeopleProfiles({ includeDeleted: true }),
      getSharedMealPhotos(mealId),
    ]);
    setCompanions(nextCompanions);
    setPeople(nextPeople);
    setPhotos(nextPhotos);
  }, [mealId]);

  useEffect(() => {
    reload();
  }, [reload]);

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
    onChanged?.();
  };

  const handleRemove = (personId: string) => {
    confirmAction(
      'Remove from this meal?',
      'This only removes the person from this meal. Their profile and other shared meals stay.',
      async () => {
        await removeMealCompanion(mealId, personId);
        await reload();
        onChanged?.();
      },
    );
  };

  const beginPhotoEdit = (photo: SharedMealPhoto) => {
    setEditingPhotoId(photo.id);
    setCaptionDraft(photo.caption ?? '');
    setTagDraft(photo.taggedPersonIds);
  };

  const savePhotoEdit = async (photo: SharedMealPhoto) => {
    await saveSharedMealPhoto({
      ...photo,
      caption: captionDraft.trim() || undefined,
      taggedPersonIds: tagDraft,
    });
    setEditingPhotoId(undefined);
    await reload();
    onChanged?.();
  };

  const handleDeletePhoto = (photoId: string) => {
    confirmAction(
      'Delete shared photo?',
      'This removes only this shared photograph from the meal.',
      async () => {
        await deleteSharedMealPhoto(photoId);
        await reload();
        onChanged?.();
      },
    );
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Company</Text>
          <Text style={styles.sectionSubtitle}>Meal companions, not contacts.</Text>
        </View>
        <Pressable style={styles.addButton} onPress={() => setPickerOpen(true)}>
          <Text style={styles.addButtonText}>+ Add person</Text>
        </Pressable>
      </View>

      {companions.length > 0 ? (
        <View style={styles.companionList}>
          {companions.map((companion) => {
            const person = peopleById.get(companion.personId);
            const name = getPersonDisplayName(person, companion);
            return (
              <View key={companion.id} style={styles.companionRow}>
                <Pressable
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
                    {person?.deletedAt ? 'Deleted person' : person?.relationship ?? 'At this table'}
                  </Text>
                </View>
                {person && !person.deletedAt ? (
                  <Pressable style={styles.linkButton} onPress={() => setEditingPerson(person)}>
                    <Text style={styles.linkButtonText}>Edit person</Text>
                  </Pressable>
                ) : null}
                <Pressable style={styles.removeButton} onPress={() => handleRemove(companion.personId)}>
                  <Text style={styles.removeButtonText}>Remove</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Who was at the table?</Text>
          <Text style={styles.emptyBody}>
            Add someone you shared this meal with, or keep this meal as a solo memory.
          </Text>
        </View>
      )}

      <View style={styles.photoBlock}>
        <Text style={styles.photoTitle}>Together at this table</Text>
        <SharedPhotoUploader
          mealId={mealId}
          people={companionPeople}
          onSaved={async () => {
            await reload();
            onChanged?.();
          }}
        />

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
                    placeholder="Caption for this shared photo..."
                    placeholderTextColor="rgba(141, 123, 102, 0.52)"
                    style={styles.captionInput}
                  />
                  <View style={styles.tagRow}>
                    {companionPeople.map((person) => {
                      const selected = tagDraft.includes(person.id);
                      return (
                        <Pressable
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
                    <Pressable style={styles.linkButton} onPress={() => setEditingPhotoId(undefined)}>
                      <Text style={styles.linkButtonText}>Cancel</Text>
                    </Pressable>
                    <Pressable style={styles.linkButton} onPress={() => savePhotoEdit(photo)}>
                      <Text style={styles.linkButtonText}>Save caption</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.photoMeta}>
                  <Text style={styles.photoCaption}>
                    {photo.caption ?? 'A shared meal photograph'}
                  </Text>
                  <View style={styles.photoActions}>
                    <Pressable style={styles.linkButton} onPress={() => beginPhotoEdit(photo)}>
                      <Text style={styles.linkButtonText}>Edit photo</Text>
                    </Pressable>
                    <Pressable style={styles.removeButton} onPress={() => handleDeletePhoto(photo.id)}>
                      <Text style={styles.removeButtonText}>Delete photo</Text>
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
          onChanged?.();
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
