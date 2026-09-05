import { useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import type { PersonProfile, SharedMealPhoto } from '../types';
import { saveSharedMealPhoto } from '../storage';
import { colors, shadow } from '../theme';
import { generateId } from '../utils/id';
import PersonAvatar from './PersonAvatar';
import { requestCameraPermission, requestPhotosPermission } from '../services/permissions';

function notify(message: string) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    alert(message);
    return;
  }
  Alert.alert('Mealog', message);
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

export default function SharedPhotoUploader({
  mealId,
  people,
  onSaved,
}: {
  mealId?: string;
  people: PersonProfile[];
  onSaved?: (photo: SharedMealPhoto) => void;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [caption, setCaption] = useState('');
  const [taggedPersonIds, setTaggedPersonIds] = useState<string[]>([]);
  const [isCover, setIsCover] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickPhoto = async (source: 'camera' | 'library') => {
    if (!mealId) {
      notify('Save the meal first, then add a photograph together.');
      return;
    }

    const permission = source === 'camera'
      ? await requestCameraPermission()
      : await requestPhotosPermission();

    if (!permission.granted) {
      notify(permission.message ?? 'Photo permission is needed only if you choose to add a shared photograph.');
      return;
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.86,
      })
      : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.86,
      });

    if (!result.canceled) {
      setImageUrl(result.assets[0]?.uri);
      setTaggedPersonIds(people.map((person) => person.id));
      setEditorOpen(true);
    }
  };

  const handleSave = async () => {
    if (!mealId || !imageUrl) return;

    setSaving(true);
    try {
      const saved = await saveSharedMealPhoto({
        id: generateId(),
        mealId,
        imageUrl,
        caption: caption.trim() || undefined,
        takenAt: new Date().toISOString(),
        taggedPersonIds,
        isCover,
        createdAt: new Date().toISOString(),
      });
      onSaved?.(saved);
      setEditorOpen(false);
      setImageUrl(undefined);
      setCaption('');
      setTaggedPersonIds([]);
      setIsCover(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <View style={styles.actions}>
        <Pressable style={styles.photoButton} onPress={() => pickPhoto('library')}>
          <Text style={styles.photoButtonText}>Choose photo together</Text>
        </Pressable>
        <Pressable style={styles.photoButton} onPress={() => pickPhoto('camera')}>
          <Text style={styles.photoButtonText}>Take photo together</Text>
        </Pressable>
      </View>

      <Modal visible={editorOpen} transparent animationType="fade" onRequestClose={() => setEditorOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.kicker}>Together at this table</Text>
            <Text style={styles.title}>Add a photo together</Text>

            {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.preview} /> : null}

            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Caption for this table memory..."
              placeholderTextColor="rgba(141, 123, 102, 0.52)"
              style={styles.input}
            />

            <Text style={styles.label}>Tag people in this photo</Text>
            <View style={styles.peopleGrid}>
              {people.map((person) => {
                const selected = taggedPersonIds.includes(person.id);
                return (
                  <Pressable
                    key={person.id}
                    style={[styles.personChip, selected && styles.personChipSelected]}
                    onPress={() => setTaggedPersonIds((current) => toggleValue(current, person.id))}
                  >
                    <PersonAvatar person={person} size={28} />
                    <Text
                      style={[styles.personText, selected && styles.personTextSelected]}
                      numberOfLines={1}
                    >
                      {person.nickname ?? person.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={[styles.coverRow, isCover && styles.coverRowActive]}
              onPress={() => setIsCover((current) => !current)}
            >
              <View style={[styles.coverDot, isCover && styles.coverDotActive]} />
              <Text style={[styles.coverText, isCover && styles.coverTextActive]}>
                Use as this meal's cover photo
              </Text>
            </Pressable>

            <View style={styles.footer}>
              <Pressable style={styles.cancelButton} onPress={() => setEditorOpen(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                disabled={saving}
                onPress={handleSave}
              >
                <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save photo'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  photoButton: {
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: 'rgba(248, 232, 212, 0.42)',
  },
  photoButtonText: {
    fontSize: 12,
    color: colors.secondary,
    fontStyle: 'italic',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(62, 43, 33, 0.28)',
  },
  sheet: {
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    backgroundColor: colors.background,
    ...shadow.card,
  },
  kicker: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 6,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    color: colors.primary,
    fontStyle: 'italic',
    marginBottom: 14,
  },
  preview: {
    width: '100%',
    aspectRatio: 1.15,
    borderRadius: 20,
    marginBottom: 12,
  },
  input: {
    minHeight: 44,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
    backgroundColor: 'rgba(255, 253, 248, 0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.24)',
    color: colors.primary,
    fontSize: 14,
  },
  label: {
    fontSize: 12,
    color: colors.mutedText,
    marginBottom: 8,
  },
  peopleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 13,
  },
  personChip: {
    maxWidth: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 18,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: 'rgba(255, 253, 248, 0.58)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.2)',
  },
  personChipSelected: {
    backgroundColor: 'rgba(180, 145, 88, 0.17)',
    borderColor: 'rgba(180, 145, 88, 0.38)',
  },
  personText: {
    flexShrink: 1,
    fontSize: 12,
    color: colors.mutedText,
  },
  personTextSelected: {
    color: colors.primary,
  },
  coverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 17,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 13,
    backgroundColor: 'rgba(255, 253, 248, 0.5)',
  },
  coverRowActive: {
    backgroundColor: 'rgba(180, 145, 88, 0.15)',
  },
  coverDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.muted,
  },
  coverDotActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  coverText: {
    fontSize: 13,
    color: colors.mutedText,
  },
  coverTextActive: {
    color: colors.primary,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 253, 248, 0.64)',
  },
  cancelText: {
    color: colors.secondary,
    fontStyle: 'italic',
  },
  saveButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 20,
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
