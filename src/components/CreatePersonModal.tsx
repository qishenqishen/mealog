import { useI18n } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
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
import { normalizedName } from '../product/memory';
import { getPeopleProfiles, savePersonProfile } from '../storage';
import { colors, shadow } from '../theme';
import { generateId } from '../utils/id';
import PersonAvatar from './PersonAvatar';
import LoadState from './LoadState';
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
  onSaved: (person: PersonProfile) => Promise<void> | void;
}) {
  const { t, locale } = useI18n();
  const draftId = useRef(generateId());
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [avatarMediaId, setAvatarMediaId] = useState<string | undefined>();
  const [relationship, setRelationship] = useState<PersonRelationship | undefined>();
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [existingPeople, setExistingPeople] = useState<PersonProfile[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (!visible) return;
    draftId.current = person?.id || generateId();
    setError(undefined);
    setDetailsOpen(false);
    void getPeopleProfiles().then(setExistingPeople).catch(() => undefined);
    setName(person?.name ?? '');
    setNickname(person?.nickname ?? '');
    setAvatarUrl(person?.avatarUrl);
    setAvatarMediaId(person?.avatarMediaId);
    setRelationship(person?.relationship);
    setNote(person?.note ?? '');
  }, [person, visible]);

  const pickAvatar = async (source: 'camera' | 'library') => {
    try {
    const permission = source === 'camera'
      ? await requestCameraPermission()
      : await requestPhotosPermission();

    if (!permission.granted) {
      notify(t(permission.message ?? 'Photo permission is needed only if you want to add a profile photo.'));
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
    } catch {
      setError('Could not open photos. Please try again.');
    }
  };

  const handleSave = async () => {
    if (saving) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      notify(t('A name is enough, but the name is needed.'));
      return;
    }

    setSaving(true);
    setError(undefined);
    try {
      const now = new Date().toISOString();
      const saved = await savePersonProfile({
        id: person?.id || draftId.current,
        origin: 'user',
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
      await onSaved(saved);
      onClose();
    } catch {
      setError('Could not save this person. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !saving && onClose()}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.kicker}>{locale === 'zh' ? '同桌的人' : 'People at the table'}</Text>
            <Text style={styles.title}>{person?.id ? t('Edit person') : locale === 'zh' ? '加一把椅子' : 'Add a chair'}</Text>
            <Text style={styles.subtitle}>
              {locale === 'zh' ? '写下一个称呼，就能为 TA 留个位置。' : 'A name is enough to save a seat for someone.'}</Text>

            <View style={styles.field}>
              <Text style={styles.label}>{locale === 'zh' ? '怎么称呼 TA？' : 'What do you call them?'}</Text>
              <TextInput
                accessibilityLabel={t('Name')}
                value={name}
                onChangeText={setName}
                returnKeyType="done"
                onSubmitEditing={() => { if (!detailsOpen) void handleSave(); }}
                placeholder={locale === 'zh' ? '妈妈、小林、阿宁…' : 'Mom, Alex, Sam…'}
                placeholderTextColor="rgba(141, 123, 102, 0.52)"
                style={styles.input}
              />
            </View>

            {!person && name.trim() && existingPeople.filter(item => normalizedName(item.name) === normalizedName(name) || Boolean(item.nickname && normalizedName(item.nickname) === normalizedName(name))).map(item => <Pressable key={item.id} accessibilityRole="button" style={styles.smallButton} onPress={async () => { await onSaved(item); onClose(); }}><Text style={styles.smallButtonText}>{locale === 'zh' ? `已有「${item.name}」，点击使用已有座位` : `Already have ${item.name}? Use this seat`}</Text></Pressable>)}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: detailsOpen }}
              style={styles.detailsButton}
              onPress={() => setDetailsOpen((current) => !current)}
            >
              <Text style={styles.detailsText}>{locale === 'zh' ? '头像与更多资料（可选）' : 'Photo & more details (optional)'}</Text>
              <Text style={styles.detailsText}>{detailsOpen ? '−' : '+'}</Text>
            </Pressable>
            {detailsOpen ? (<>
              <View style={styles.avatarRow}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <PersonAvatar name={name || t('New person')} size={66} />
                )}
                <View style={styles.avatarActions}>
                  <Pressable accessibilityRole="button" style={styles.smallButton} onPress={() => pickAvatar('camera')}>
                    <Text style={styles.smallButtonText}>{t("Take photo")}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" style={styles.smallButton} onPress={() => pickAvatar('library')}>
                    <Text style={styles.smallButtonText}>{t("Choose library")}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" style={styles.smallButton} onPress={() => {
                      setAvatarUrl(undefined);
                      setAvatarMediaId(undefined);
                    }}>
                    <Text style={styles.smallButtonText}>{t("Use initials")}</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>{t("Nickname")}</Text>
                <TextInput
                  accessibilityLabel={t('Nickname')}
                  value={nickname}
                  onChangeText={setNickname}
                  placeholder={t("Ames, Mom, Q...")}
                  placeholderTextColor="rgba(141, 123, 102, 0.52)"
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>{t("Relationship")}</Text>
                <View style={styles.relationshipRow}>
                  {RELATIONSHIPS.map((option) => {
                    const active = relationship === option;
                    return (
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: active }}
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
                          {t(option)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>{t("Note")}</Text>
                <TextInput
                  accessibilityLabel={t('Note')}
                  value={note}
                  onChangeText={setNote}
                  placeholder={t("A small note about this person...")}
                  placeholderTextColor="rgba(141, 123, 102, 0.52)"
                  style={[styles.input, styles.textArea]}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            </>) : null}
          </ScrollView>

          <LoadState error={error} />
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" style={styles.cancelButton} onPress={onClose} disabled={saving}>
              <Text style={styles.cancelText}>{t("Cancel")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              disabled={saving}
              onPress={handleSave}
            >
              <Text style={styles.saveText}>{saving ? t('Saving...') : person?.id ? t('Save person') : locale === 'zh' ? '留个位置' : 'Save a seat'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    fontSize: 26,
    lineHeight: 32,
    color: colors.primary,
  },
  subtitle: {
    marginTop: 7,
    marginBottom: 18,
    fontSize: 13,
    lineHeight: 19,
    color: colors.mutedText,
  },
  detailsButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 44,
    marginBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.24)',
  },
  detailsText: {
    fontSize: 13,
    color: colors.secondary,
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
  },
});
