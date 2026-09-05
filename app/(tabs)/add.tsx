import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  type ImageSourcePropType,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  getMealById,
  getMealCompanions,
  getPeopleProfiles,
  saveMeal,
  setMealCompanions,
} from '../../src/storage';
import { generateId } from '../../src/utils/id';
import {
  DEFAULT_COMPANIONSHIP_TAGS,
  type MealEntry,
  type MealLocation,
  type MealType,
  type MoodTag,
  type PersonProfile,
} from '../../src/types';
import { colors, shadow } from '../../src/theme';
import PeoplePickerSheet from '../../src/components/PeoplePickerSheet';
import { requestLocationPermission, requestPhotosPermission } from '../../src/services/permissions';
import {
  buildManualMealLocation,
  buildMealEatenAt,
  formatMealLocation,
  getCurrentMealLocation,
  getCurrentMealLocationIfAllowed,
} from '../../src/services/mealMetadata';
import StackedAvatarGroup from '../../src/components/StackedAvatarGroup';
import { DEMO_MEAL_PHOTOS } from '../../src/demo/mealPhotoAssets';
import { resolveDemoImageAssetUri } from '../../src/demo/demoImageResolver';

// ── Options ─────────────────────────────────────────────────

const MEAL_TYPES: { value: MealType; label: string; hint: string }[] = [
  { value: 'breakfast', label: 'Breakfast', hint: 'morning table' },
  { value: 'lunch', label: 'Lunch', hint: 'midday pause' },
  { value: 'dinner', label: 'Dinner', hint: 'evening plate' },
  { value: 'treat', label: 'Treats', hint: 'small sweetness' },
];

const MOODS: { value: MoodTag; label: string }[] = [
  { value: 'peaceful', label: 'Peaceful' },
  { value: 'everyday', label: 'Everyday' },
  { value: 'nostalgic', label: 'Nostalgic' },
  { value: 'healing', label: 'Healing' },
  { value: 'heartfelt', label: 'Heartfelt' },
  { value: 'overwhelming', label: 'Overwhelming' },
  { value: 'celebratory', label: 'Celebratory' },
];

const DEMO_PHOTO_CHOICES: Array<{ label: string; source: ImageSourcePropType }> = [
  { label: 'Toast', source: DEMO_MEAL_PHOTOS.blueberryToast },
  { label: 'Rice bowl', source: DEMO_MEAL_PHOTOS.riceBowl },
  { label: 'Pasta', source: DEMO_MEAL_PHOTOS.pastaBowl },
  { label: 'Cake', source: DEMO_MEAL_PHOTOS.cafeTiramisuDrinks },
  { label: 'Hotpot', source: DEMO_MEAL_PHOTOS.tableFeast },
];

// ── Helpers ─────────────────────────────────────────────────

function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatTimeKey(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function isDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function isTimeKey(value: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function notify(message: string) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    alert(message);
    return;
  }
  Alert.alert('Mealog', message);
}

function toggleValue<T extends string>(values: T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

// ── Small components ────────────────────────────────────────

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SoftChip({
  label,
  selected,
  onPress,
  compact = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        compact && styles.chipCompact,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.textArea]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="rgba(141, 123, 102, 0.52)"
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

// ── Add Screen ──────────────────────────────────────────────

export default function AddScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const rawEditMealId = params.editMealId;
  const editMealId = Array.isArray(rawEditMealId)
    ? rawEditMealId[0]
    : typeof rawEditMealId === 'string'
      ? rawEditMealId
      : undefined;
  const isShowcase = firstParam(params.showcase) === '1';
  const appliedShowcasePreset = useRef(false);
  const now = useMemo(() => new Date(), []);

  const [mealType, setMealType] = useState<MealType>('lunch');
  const [date, setDate] = useState(() => formatDateKey(now));
  const [time, setTime] = useState(() => formatTimeKey(now));
  const [title, setTitle] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [photoMediaId, setPhotoMediaId] = useState<string | undefined>(undefined);
  const [location, setLocation] = useState('');
  const [locationDetails, setLocationDetails] = useState<MealLocation | undefined>();
  const [locationStatus, setLocationStatus] = useState<string | undefined>();
  const [locating, setLocating] = useState(false);
  const [moodTags, setMoodTags] = useState<MoodTag[]>([]);
  const [peopleTags, setPeopleTags] = useState<string[]>([]);
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [peopleProfiles, setPeopleProfiles] = useState<PersonProfile[]>([]);
  const [peoplePickerOpen, setPeoplePickerOpen] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingMeal, setEditingMeal] = useState<MealEntry | null>(null);
  const [loadingEditMeal, setLoadingEditMeal] = useState(false);

  const selectedMealType = MEAL_TYPES.find((type) => type.value === mealType) ?? MEAL_TYPES[0];
  const isEditing = Boolean(editMealId);
  const selectedPeople = useMemo(
    () => peopleProfiles.filter((person) => personIds.includes(person.id)),
    [peopleProfiles, personIds],
  );

  const resetForm = () => {
    const freshNow = new Date();
    setMealType('lunch');
    setDate(formatDateKey(freshNow));
    setTime(formatTimeKey(freshNow));
    setTitle('');
    setPhotoUri(undefined);
    setPhotoMediaId(undefined);
    setLocation('');
    setLocationDetails(undefined);
    setLocationStatus(undefined);
    setLocating(false);
    setMoodTags([]);
    setPeopleTags([]);
    setPersonIds([]);
    setNote('');
    setEditingMeal(null);
  };

  useEffect(() => {
    let cancelled = false;

    getPeopleProfiles().then((profiles) => {
      if (!cancelled) setPeopleProfiles(profiles);
    });

    if (!editMealId) {
      if (editingMeal) resetForm();
      return undefined;
    }

    setLoadingEditMeal(true);
    getMealById(editMealId)
      .then((meal) => {
        if (cancelled) return;

        if (!meal) {
          notify('This meal memory could not be opened for editing.');
          setEditingMeal(null);
          return;
        }

        setEditingMeal(meal);
        setMealType(meal.mealType === 'snack' ? 'treat' : meal.mealType);
        setDate(meal.date);
        setTime(meal.time);
        setTitle(meal.title);
        setPhotoUri(meal.photoUri);
        setPhotoMediaId(meal.photoMediaId);
        setLocation(meal.location ?? meal.locationText ?? '');
        setLocationDetails(meal.locationDetails);
        setLocationStatus(meal.locationDetails?.source === 'gps' ? 'Current place saved with this memory.' : undefined);
        setMoodTags(meal.moodTags.length > 0 ? meal.moodTags : meal.moodTag ? [meal.moodTag] : []);
        setPeopleTags(meal.peopleTags);
        setPersonIds(meal.personIds ?? []);
        setNote(meal.note ?? '');
        getMealCompanions(meal.id).then((companions) => {
          if (!cancelled) {
            setPersonIds(companions.map((companion) => companion.personId));
          }
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingEditMeal(false);
      });

    return () => {
      cancelled = true;
    };
    // The form intentionally resets only when the edit target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMealId]);

  useEffect(() => {
    if (editMealId) return undefined;
    let cancelled = false;

    getCurrentMealLocationIfAllowed()
      .then((currentLocation) => {
        if (cancelled || !currentLocation) return;
        setLocationDetails(currentLocation);
        const label = formatMealLocation(currentLocation);
        if (label) {
          setLocation((current) => current || label);
          setLocationStatus('Current place added quietly because location was already allowed.');
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [editMealId]);

  useEffect(() => {
    if (!isShowcase || editMealId || appliedShowcasePreset.current) return;

    const uri = resolveDemoImageAssetUri(DEMO_MEAL_PHOTOS.salmonAvocadoBowl);
    if (uri) {
      setPhotoUri(uri);
      setPhotoMediaId(undefined);
    }

    setMealType('lunch');
    setTitle('Salmon bowl after the studio');
    setLocation('Window table');
    setMoodTags(['peaceful', 'heartfelt']);
    setPeopleTags(['shared-with-friend']);
    setPersonIds(['demo-person-amy', 'demo-person-jordan']);
    setNote('We ate slowly, traded notes, and let the afternoon stay soft for a little longer.');
    appliedShowcasePreset.current = true;
  }, [editMealId, isShowcase]);

  const applyMealLocation = (nextLocation: MealLocation) => {
    setLocationDetails(nextLocation);
    const label = formatMealLocation(nextLocation);
    if (label) setLocation(label);
  };

  const handleUseCurrentLocation = async () => {
    if (locating) return;

    setLocating(true);
    try {
      const permission = await requestLocationPermission();
      if (!permission.granted) {
        notify(permission.message ?? 'Location is optional. You can still type a place by hand.');
        return;
      }

      const currentLocation = await getCurrentMealLocation();
      applyMealLocation(currentLocation);
      setLocationStatus('Current place added. You can still edit the text.');
    } catch {
      notify('Mealog could not read your current place. You can still type it by hand.');
    } finally {
      setLocating(false);
    }
  };

  const handlePickPhoto = async () => {
    const permission = await requestPhotosPermission();
    if (!permission.granted) {
      notify(permission.message ?? 'Photo access is needed to attach a snapshot to this meal.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.85,
    });

    if (!result.canceled) {
      setPhotoUri(result.assets[0]?.uri);
      setPhotoMediaId(undefined);
    }
  };

  const handleUseDemoPhoto = (source: ImageSourcePropType) => {
    const uri = resolveDemoImageAssetUri(source);
    if (!uri) {
      notify('Mealog could not prepare this demo photo.');
      return;
    }

    setPhotoUri(uri);
    setPhotoMediaId(undefined);
  };

  const handleSave = async () => {
    if (saving || loadingEditMeal) return;

    const trimmedTitle = title.trim();
    const trimmedLocation = location.trim();
    const trimmedNote = note.trim();

    if (!isDateKey(date.trim())) {
      notify('Use a date like 2026-06-30.');
      return;
    }

    if (!isTimeKey(time.trim())) {
      notify('Use a time like 09:35.');
      return;
    }

    setSaving(true);
    try {
      const savedId = editingMeal?.id ?? generateId();
      const createdAt = editingMeal?.createdAt ?? new Date().toISOString();
      const nextLocationDetails = locationDetails
        ? {
            ...locationDetails,
            label: trimmedLocation || locationDetails.label,
            address: locationDetails.address ?? (trimmedLocation || undefined),
          }
        : buildManualMealLocation(trimmedLocation);
      await saveMeal({
        id: savedId,
        title: trimmedTitle || selectedMealType.label,
        mealType,
        date: date.trim(),
        time: time.trim(),
        eatenAt: buildMealEatenAt(date.trim(), time.trim()),
        photoMediaId,
        photoUri,
        location: trimmedLocation || nextLocationDetails?.label || nextLocationDetails?.address,
        locationText: trimmedLocation || nextLocationDetails?.label || nextLocationDetails?.address,
        locationDetails: nextLocationDetails,
        moodTags,
        moodTag: moodTags[0],
        peopleTags,
        personIds,
        note: trimmedNote || undefined,
        createdAt,
        updatedAt: new Date().toISOString(),
      });
      await setMealCompanions(savedId, personIds);

      resetForm();

      if (editingMeal) {
        router.replace(`/meal/${savedId}`);
      } else {
        router.navigate('/');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.headerKicker}>
              {isEditing ? 'Editing meal memory' : 'A new meal memory'}
            </Text>
            <Text style={styles.headerTitle}>
              {isEditing ? 'Refine the memory' : 'Set the table'}
            </Text>
            <Text style={styles.headerSubtitle}>
              {isEditing
                ? 'Adjust the details that still belong to this meal.'
                : 'Keep the food, the hour, and who was near enough to remember.'}
            </Text>
          </View>

          <Pressable
            onPress={handlePickPhoto}
            style={({ pressed }) => [
              styles.photoFrame,
              pressed && styles.photoFramePressed,
            ]}
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Text style={styles.photoPlus}>+</Text>
                <Text style={styles.photoTitle}>A snapshot of the table</Text>
                <Text style={styles.photoHint}>Some stories live best in pictures.</Text>
              </View>
            )}
          </Pressable>

          {isShowcase ? (
            <View style={styles.demoPhotoPicker}>
              <Text style={styles.demoPhotoKicker}>Showcase food photos</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.demoPhotoRow}
              >
                {DEMO_PHOTO_CHOICES.map((choice) => (
                  <Pressable
                    key={choice.label}
                    onPress={() => handleUseDemoPhoto(choice.source)}
                    style={({ pressed }) => [
                      styles.demoPhotoButton,
                      pressed && styles.demoPhotoButtonPressed,
                    ]}
                  >
                    <Image source={choice.source} style={styles.demoPhotoThumb} />
                    <Text style={styles.demoPhotoLabel}>{choice.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <Section eyebrow="Catering" title="What kind of meal was it?">
            <View style={styles.mealTypeGrid}>
              {MEAL_TYPES.map((type) => (
                <Pressable
                  key={type.value}
                  onPress={() => setMealType(type.value)}
                  style={[
                    styles.mealTypeCard,
                    mealType === type.value && styles.mealTypeCardActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.mealTypeLabel,
                      mealType === type.value && styles.mealTypeLabelActive,
                    ]}
                  >
                    {type.label}
                  </Text>
                  <Text style={styles.mealTypeHint}>{type.hint}</Text>
                </Pressable>
              ))}
            </View>
          </Section>

          <View style={styles.paper}>
            <TextField
              label="Meal name"
              value={title}
              onChangeText={setTitle}
              placeholder="Wheat bread, sushi, soup..."
            />

            <View style={styles.dateTimeRow}>
              <View style={styles.dateTimeField}>
                <TextField
                  label="Date"
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                />
              </View>
              <View style={styles.dateTimeField}>
                <TextField
                  label="Time"
                  value={time}
                  onChangeText={setTime}
                  placeholder="HH:mm"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Location</Text>
              <TextInput
                style={styles.input}
                value={location}
                onChangeText={(value) => {
                  setLocation(value);
                  if (!value.trim()) {
                    setLocationDetails(undefined);
                    setLocationStatus(undefined);
                  }
                }}
                placeholder="Little Ruby's SoHo, kitchen table..."
                placeholderTextColor="rgba(141, 123, 102, 0.52)"
              />
              <View style={styles.locationToolsRow}>
                <Pressable
                  style={[styles.locationButton, locating && styles.locationButtonDisabled]}
                  disabled={locating}
                  onPress={handleUseCurrentLocation}
                >
                  <Text style={styles.locationButtonText}>
                    {locating ? 'Finding place...' : 'Use current location'}
                  </Text>
                </Pressable>
                {locationStatus ? <Text style={styles.locationStatus}>{locationStatus}</Text> : null}
              </View>
            </View>
          </View>

          <Section eyebrow="Emotion Tag" title="How did it feel?">
            <View style={styles.chipRow}>
              {MOODS.map((mood) => (
                <SoftChip
                  key={mood.value}
                  label={mood.label}
                  selected={moodTags.includes(mood.value)}
                  onPress={() => setMoodTags((current) => toggleValue(current, mood.value))}
                  compact
                />
              ))}
            </View>
          </Section>

          <Section eyebrow="Seats" title="Who was around the table?">
            <View style={styles.realPeopleBox}>
              <View style={styles.realPeopleHeader}>
                <View style={styles.realPeopleTextWrap}>
                  <Text style={styles.peopleIntroTitle}>Meal companions</Text>
                  <Text style={styles.peopleIntroText}>
                    Save real people you can remember again at another table.
                  </Text>
                </View>
                {selectedPeople.length > 0 ? (
                  <StackedAvatarGroup people={selectedPeople} size={34} />
                ) : null}
              </View>
              {selectedPeople.length > 0 ? (
                <Text style={styles.selectedPeopleLine}>
                  {selectedPeople.map((person) => person.nickname ?? person.name).join(', ')}
                </Text>
              ) : (
                <Text style={styles.selectedPeopleLine}>
                  No one has taken a seat yet.
                </Text>
              )}
              <Pressable
                style={styles.peoplePickerButton}
                onPress={() => setPeoplePickerOpen(true)}
              >
                <Text style={styles.peoplePickerButtonText}>
                  {selectedPeople.length > 0 ? 'Edit people at this meal' : 'Add people at this meal'}
                </Text>
              </Pressable>
            </View>

            <View style={styles.peopleIntroBox}>
              <Text style={styles.peopleIntroTitle}>Companionship, not contacts.</Text>
              <Text style={styles.peopleIntroText}>
                Choose the kind of table this meal belonged to.
              </Text>
            </View>
            <View style={styles.chipRow}>
              {DEFAULT_COMPANIONSHIP_TAGS.map((tag) => (
                <SoftChip
                  key={tag.id}
                  label={tag.label}
                  selected={peopleTags.includes(tag.id)}
                  onPress={() => setPeopleTags((current) => toggleValue(current, tag.id))}
                />
              ))}
            </View>
          </Section>

          <Section eyebrow="Note" title="What should stay with it?">
            <TextInput
              style={[styles.input, styles.noteInput]}
              value={note}
              onChangeText={setNote}
              placeholder="A short memory, a conversation, the weather, the feeling of the room..."
              placeholderTextColor="rgba(141, 123, 102, 0.52)"
              multiline
              maxLength={420}
              textAlignVertical="top"
            />
          </Section>
        </ScrollView>

        <View style={styles.saveBar}>
          <Pressable
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.saveButtonPressed,
              saving && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={saving || loadingEditMeal}
          >
            <Text style={styles.saveButtonText}>
              {loadingEditMeal
                ? 'Opening memory...'
                : saving
                  ? 'Saving memory...'
                  : isEditing
                    ? 'Save changes'
                    : 'Save meal memory'}
            </Text>
          </Pressable>
        </View>

        <PeoplePickerSheet
          visible={peoplePickerOpen}
          mealId={editingMeal?.id}
          selectedPersonIds={personIds}
          onClose={() => setPeoplePickerOpen(false)}
          onSave={async (ids) => {
            setPersonIds(ids);
            const profiles = await getPeopleProfiles();
            setPeopleProfiles(profiles);
            if (editingMeal?.id) {
              await setMealCompanions(editingMeal.id, ids);
            }
          }}
          onChanged={async () => {
            const profiles = await getPeopleProfiles();
            setPeopleProfiles(profiles);
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 34,
  },
  header: {
    marginBottom: 22,
  },
  headerKicker: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontStyle: 'italic',
    color: colors.primary,
  },
  headerSubtitle: {
    marginTop: 8,
    maxWidth: 310,
    fontSize: 14,
    lineHeight: 21,
    color: colors.mutedText,
  },
  photoFrame: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 253, 248, 0.7)',
    borderWidth: 8,
    borderColor: 'rgba(234, 223, 204, 0.52)',
    marginBottom: 28,
  },
  photoFramePressed: {
    opacity: 0.82,
  },
  photoPreview: {
    width: '100%',
    aspectRatio: 1.24,
  },
  photoPlaceholder: {
    aspectRatio: 1.24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
  },
  photoPlus: {
    fontSize: 58,
    lineHeight: 64,
    color: '#B49158',
    fontWeight: '200',
  },
  photoTitle: {
    marginTop: 8,
    fontSize: 17,
    fontStyle: 'italic',
    color: colors.primary,
  },
  photoHint: {
    marginTop: 6,
    fontSize: 12,
    color: colors.muted,
  },
  demoPhotoPicker: {
    marginTop: -14,
    marginBottom: 26,
  },
  demoPhotoKicker: {
    marginBottom: 9,
    fontSize: 12,
    color: colors.mutedText,
    fontStyle: 'italic',
  },
  demoPhotoRow: {
    gap: 10,
    paddingRight: 12,
  },
  demoPhotoButton: {
    width: 82,
  },
  demoPhotoButtonPressed: {
    opacity: 0.78,
  },
  demoPhotoThumb: {
    width: 82,
    height: 96,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.32)',
    backgroundColor: 'rgba(255, 253, 248, 0.7)',
  },
  demoPhotoLabel: {
    marginTop: 6,
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
  },
  section: {
    marginBottom: 28,
  },
  eyebrow: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 22,
    lineHeight: 29,
    fontStyle: 'italic',
    color: colors.primary,
    marginBottom: 14,
  },
  mealTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  mealTypeCard: {
    width: '47.8%',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 15,
    backgroundColor: 'rgba(255, 253, 248, 0.46)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.28)',
  },
  mealTypeCardActive: {
    backgroundColor: 'rgba(180, 145, 88, 0.16)',
    borderColor: 'rgba(180, 145, 88, 0.42)',
  },
  mealTypeLabel: {
    fontSize: 18,
    fontStyle: 'italic',
    color: colors.primary,
  },
  mealTypeLabelActive: {
    color: '#8E6D35',
  },
  mealTypeHint: {
    marginTop: 4,
    fontSize: 12,
    color: colors.muted,
  },
  paper: {
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 4,
    marginBottom: 28,
    backgroundColor: 'rgba(255, 253, 248, 0.48)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(185, 165, 138, 0.3)',
  },
  field: {
    marginBottom: 17,
  },
  fieldLabel: {
    fontSize: 12,
    color: colors.mutedText,
    marginBottom: 7,
  },
  input: {
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.48)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.22)',
    color: colors.primary,
    fontSize: 15,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateTimeField: {
    flex: 1,
  },
  locationToolsRow: {
    marginTop: 9,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 9,
  },
  locationButton: {
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(180, 145, 88, 0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(180, 145, 88, 0.28)',
  },
  locationButtonDisabled: {
    opacity: 0.58,
  },
  locationButtonText: {
    fontSize: 12,
    color: colors.secondary,
    fontStyle: 'italic',
  },
  locationStatus: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 16,
    color: colors.muted,
  },
  textArea: {
    minHeight: 92,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  chip: {
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: 'rgba(248, 232, 212, 0.34)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.18)',
  },
  chipCompact: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: {
    backgroundColor: 'rgba(180, 145, 88, 0.2)',
    borderColor: 'rgba(180, 145, 88, 0.42)',
  },
  chipPressed: {
    opacity: 0.72,
  },
  chipText: {
    fontSize: 13,
    color: colors.mutedText,
    fontStyle: 'italic',
  },
  chipTextSelected: {
    color: colors.secondary,
  },
  realPeopleBox: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginBottom: 14,
    backgroundColor: 'rgba(255, 253, 248, 0.5)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.22)',
  },
  realPeopleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  realPeopleTextWrap: {
    flex: 1,
  },
  selectedPeopleLine: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.mutedText,
    marginBottom: 12,
  },
  peoplePickerButton: {
    alignSelf: 'flex-start',
    borderRadius: 17,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: 'rgba(180, 145, 88, 0.16)',
  },
  peoplePickerButtonText: {
    fontSize: 13,
    color: colors.secondary,
    fontStyle: 'italic',
  },
  peopleIntroBox: {
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
    backgroundColor: 'rgba(255, 253, 248, 0.42)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(185, 165, 138, 0.2)',
  },
  peopleIntroTitle: {
    fontSize: 15,
    fontStyle: 'italic',
    color: colors.primary,
    marginBottom: 5,
  },
  peopleIntroText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  noteInput: {
    minHeight: 122,
    lineHeight: 22,
  },
  saveBar: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: 'rgba(255, 248, 240, 0.92)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(234, 223, 204, 0.54)',
  },
  saveButton: {
    borderRadius: 22,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(92, 64, 51, 0.9)',
    ...shadow.soft,
  },
  saveButtonPressed: {
    opacity: 0.84,
  },
  saveButtonDisabled: {
    opacity: 0.52,
  },
  saveButtonText: {
    fontSize: 16,
    color: colors.background,
    fontStyle: 'italic',
  },
});
