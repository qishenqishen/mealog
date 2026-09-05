import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import type { PersonProfile, PersonRelationship } from '../types';
import { savePersonProfile } from '../storage';
import { colors, shadow } from '../theme';
import { generateId } from '../utils/id';
import PersonAvatar from './PersonAvatar';
import { requestCameraPermission, requestPhotosPermission } from '../services/permissions';

const RELATIONSHIPS: PersonRelationship[] = [
  'Friend',
  'Partner',
  'Family',
  'Parent',
  'Child',
  'Colleague',
  'Classmate',
  'Guest',
  'Other',
];

function notify(message: string) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    alert(message);
    return;
  }
  Alert.alert('Mealog', message);
}

export default function CreatePersonModal({
  visible,
  person,
  onClose,
  onSaved,
}: {
  visible: boolean;
  person?: PersonProfile;
  onClose: () => void;
  onSaved: (person: PersonProfile) => void;
}) {
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [avatarMediaId, setAvatarMediaId] = useState<string | undefined>();
  const [relationship, setRelationship] = useState<PersonRelationship | undefined>();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(person?.name ?? '');
    setNickname(person?.nickname ?? '');
    setAvatarUrl(person?.avatarUrl);
    setAvatarMediaId(person?.avatarMediaId);
    setRelationship(person?.relationship);
    setNote(person?.note ?? '');
  }, [person, visible]);

  const pickAvatar = async (source: 'camera' | 'library') => {
    const permission = source === 'camera'
      ? await requestCameraPermission()
      : await requestPhotosPermission();

    if (!permission.granted) {
      notify(permission.message ?? 'Photo permission is needed only if you want to add a profile photo.');
      return;
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.82,
      })
      : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.82,
      });

    if (!result.canceled) {
      setAvatarUrl(result.assets[0]?.uri);
      setAvatarMediaId(undefined);
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      notify('A name is enough, but the name is needed.');
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const saved = await savePersonProfile({
        id: person?.id ?? generateId(),
        name: trimmedName,
        nickname: nickname.trim() || undefined,
        avatarMediaId,
        avatarUrl,
        relationship,
        note: note.trim() || undefined,
        createdAt: person?.createdAt ?? now,
        updatedAt: now,
        deletedAt: person?.deletedAt,
      });
      onSaved(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.kicker}>{person ? 'Edit person' : 'Add someone new'}</Text>
            <Text style={styles.title}>A seat at the table</Text>
            <Text style={styles.subtitle}>
              Keep only what you choose to remember. No contacts are read.
            </Text>

            <View style={styles.avatarRow}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
              ) : (
                <PersonAvatar name={name || 'New person'} size={66} />
              )}
              <View style={styles.avatarActions}>
                <Pressable style={styles.smallButton} onPress={() => pickAvatar('camera')}>
                  <Text style={styles.smallButtonText}>Take photo</Text>
                </Pressable>
                <Pressable style={styles.smallButton} onPress={() => pickAvatar('library')}>
                  <Text style={styles.smallButtonText}>Choose library</Text>
                </Pressable>
                <Pressable style={styles.smallButton} onPress={() => {
                    setAvatarUrl(undefined);
                    setAvatarMediaId(undefined);
                  }}>
                  <Text style={styles.smallButtonText}>Use initials</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Amy"
                placeholderTextColor="rgba(141, 123, 102, 0.52)"
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Nickname</Text>
              <TextInput
                value={nickname}
                onChangeText={setNickname}
                placeholder="Ames, Mom, Q..."
                placeholderTextColor="rgba(141, 123, 102, 0.52)"
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Relationship</Text>
              <View style={styles.relationshipRow}>
                {RELATIONSHIPS.map((option) => {
                  const active = relationship === option;
                  return (
                    <Pressable
                      key={option}
                      onPress={() => setRelationship(active ? undefined : option)}
                      style={[styles.relationshipChip, active && styles.relationshipChipActive]}
                    >
                      <Text
                        style={[
                          styles.relationshipText,
                          active && styles.relationshipTextActive,
                        ]}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Note</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="A small note about this person..."
                placeholderTextColor="rgba(141, 123, 102, 0.52)"
                style={[styles.input, styles.textArea]}
                multiline
                textAlignVertical="top"
              />
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              disabled={saving}
              onPress={handleSave}
            >
              <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save person'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
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
    maxHeight: '88%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 18,
    backgroundColor: colors.background,
    ...shadow.card,
  },
  kicker: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 6,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    color: colors.primary,
    fontStyle: 'italic',
  },
  subtitle: {
    marginTop: 7,
    marginBottom: 18,
    fontSize: 13,
    lineHeight: 19,
    color: colors.mutedText,
  },
  avatarRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  avatarImage: {
    width: 66,
    height: 66,
    borderRadius: 33,
  },
  avatarActions: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  smallButton: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(248, 232, 212, 0.44)',
  },
  smallButtonText: {
    fontSize: 11,
    color: colors.secondary,
    fontStyle: 'italic',
  },
  field: {
    marginBottom: 17,
  },
  label: {
    fontSize: 12,
    color: colors.mutedText,
    marginBottom: 7,
  },
  input: {
    minHeight: 44,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 253, 248, 0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.24)',
    color: colors.primary,
    fontSize: 15,
  },
  textArea: {
    minHeight: 92,
    lineHeight: 22,
  },
  relationshipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  relationshipChip: {
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 253, 248, 0.54)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.22)',
  },
  relationshipChipActive: {
    backgroundColor: 'rgba(180, 145, 88, 0.18)',
    borderColor: 'rgba(180, 145, 88, 0.4)',
  },
  relationshipText: {
    fontSize: 12,
    color: colors.mutedText,
    fontStyle: 'italic',
  },
  relationshipTextActive: {
    color: colors.secondary,
  },
  actions: {
    flexDirection: 'row',
    gap: 11,
    paddingTop: 12,
  },
  cancelButton: {
    flex: 1,
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
    flex: 1,
    minHeight: 46,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(92, 64, 51, 0.9)',
  },
  saveButtonDisabled: {
    opacity: 0.52,
  },
  saveText: {
    color: colors.background,
    fontStyle: 'italic',
  },
});
