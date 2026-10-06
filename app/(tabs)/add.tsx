import { TablePlate, TableChair, PLATES, CHAIRS } from '../../src/components/TableObjects';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  type ImageSourcePropType,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPreferences, trackEvent } from '../../src/product/store';
import { inferMealType } from '../../src/product/memory';
import { metadataFromUri } from '../../src/product/exif';
import { importImageToManagedStore, resolveManagedMediaUri } from '../../src/media/managedMedia';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import {
  STORAGE_KEYS,
  getMeals,
  getMealById,
  getMealCompanions,
  getPeopleProfiles,
  saveMealMemory,
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
import { colors, shadow, fonts } from '../../src/theme';
import PeoplePickerSheet from '../../src/components/PeoplePickerSheet';
import { requestCameraPermission, requestLocationPermission, requestPhotosPermission } from '../../src/services/permissions';
import {
  resolveMealLocationForSave,
  buildMealEatenAt,
  formatMealLocation,
  getCurrentMealLocation,
} from '../../src/services/mealMetadata';
import StackedAvatarGroup from '../../src/components/StackedAvatarGroup';
import { DEMO_MEAL_PHOTOS } from '../../src/demo/mealPhotoAssets';
import { resolveDemoImageAssetUri } from '../../src/demo/demoImageResolver';
import { useI18n } from '../../src/i18n';
import { companionTags } from '../../src/utils/people';
import { createMealSticker } from '../../src/services/foodStickers';
import { useAddCopy } from '../../src/i18n/add';

// ── Options ─────────────────────────────────────────────────

const MEAL_TYPES: { value: MealType; label: string; hint: string }[] = [
  { value: 'breakfast', label: 'Breakfast', hint: 'morning table' },
  { value: 'lunch', label: 'Lunch', hint: 'midday pause' },
  { value: 'dinner', label: 'Dinner', hint: 'evening plate' },
  { value: 'snack', label: 'Coffee / cooking / a small moment', hint: 'beyond a meal' },
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
  { label: 'Cream toast', source: DEMO_MEAL_PHOTOS.creamToast },
  { label: 'Granola bowl', source: DEMO_MEAL_PHOTOS.fruitGranolaBowl },
  { label: 'Seasonal salad', source: DEMO_MEAL_PHOTOS.seasonalSalad },
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

function notifyRaw(message: string) {
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
  const t = useAddCopy();
  return (
    <View style={styles.section}>
      {eyebrow ? <Text style={styles.eyebrow}>{t(eyebrow)}</Text> : null}
      <Text style={styles.sectionTitle}>{t(title)}</Text>
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
  const t = useAddCopy();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        compact && styles.chipCompact,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {t(label)}
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
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
  editable?: boolean;
}) {
  const t = useAddCopy();
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{t(label)}</Text>
      <TextInput
        editable={editable}
        style={[styles.input, multiline && styles.textArea]}
        value={value}
        onChangeText={onChangeText}
        placeholder={t(placeholder)}
        accessibilityLabel={t(label)}
        placeholderTextColor="rgba(141, 123, 102, 0.52)"
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

// ── Add Screen ──────────────────────────────────────────────

export default function AddScreen() {
  const { locale } = useI18n();
  const zh = locale === 'zh';
  const [plateStyle, setPlateStyle] = useState(1), [plateHovered, setPlateHovered] = useState(false), [chairStyle, setChairStyle] = useState(0);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [timingExpanded, setTimingExpanded] = useState(false);
  const [samplesExpanded, setSamplesExpanded] = useState(false);
  const [makeSticker, setMakeSticker] = useState(true);
  const [makingSticker, setMakingSticker] = useState(false);
  const t = useAddCopy();
  const notify = (message: string) => notifyRaw(t(message));
  const router = useRouter();
  const params = useLocalSearchParams();
  const rawEditMealId = params.editMealId;
  const requestedPersonId = typeof params.personId === 'string' ? params.personId : undefined;
  const personRequest = typeof params.personRequest === 'string' ? params.personRequest : requestedPersonId;
  const consumedPersonRequest = useRef<string | undefined>(undefined);
  const editMealId = Array.isArray(rawEditMealId)
    ? rawEditMealId[0]
    : typeof rawEditMealId === 'string'
      ? rawEditMealId
      : undefined;
  const draftId = useRef(generateId());
  const saveInFlight = useRef(false);
  const locationRequest = useRef(0);
  const pickingPhoto = useRef(false);
  const now = useMemo(() => new Date(), []);

  const [mealType, setMealType] = useState<MealType>(() => inferMealType(formatTimeKey(now)));
  const [recentMeals, setRecentMeals] = useState<MealEntry[]>([]);
  const [draftReady, setDraftReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState('');
  const startedRecording = useRef(Date.now());
  const draftReadFailed = useRef(false);
  const draftWrites = useRef<Promise<unknown>>(Promise.resolve());
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
  const [pendingPerson, setPendingPerson] = useState<PersonProfile>();
  const [personNotice, setPersonNotice] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingMeal, setEditingMeal] = useState<MealEntry | null>(null);
  const [loadingEditMeal, setLoadingEditMeal] = useState(false);
  const [editLoadAttempt, setEditLoadAttempt] = useState(0);
  const [saveError, setSaveError] = useState<string | undefined>();

  const selectedMealType = MEAL_TYPES.find((type) => type.value === mealType) ?? MEAL_TYPES[0];
  const isEditing = Boolean(editMealId);
  const selectedPeople = useMemo(
    () => peopleProfiles.filter((person) => personIds.includes(person.id)),
    [peopleProfiles, personIds],
  );

  const resetForm = () => {
    locationRequest.current += 1;
    draftId.current = generateId();
    setSaveError(undefined);
    const freshNow = new Date();
    setMealType(inferMealType(formatTimeKey(freshNow)));
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
    setPendingPerson(undefined);
    setPersonNotice('');
    setNote('');
    setEditingMeal(null);
    setDetailsExpanded(false);
    setSamplesExpanded(false);
    setMakeSticker(true);
  };

  useEffect(() => {
    let cancelled = false;
    locationRequest.current += 1;
    setLocating(false);

    getPeopleProfiles().then((profiles) => {
      if (!cancelled) setPeopleProfiles(profiles);
    }).catch(() => { if (!cancelled) setSaveError('People could not be loaded. Please try again.'); });

    if (!editMealId) {
      setLoadingEditMeal(false);
      if (editingMeal) resetForm();
      return () => { cancelled = true; locationRequest.current += 1; };
    }

    setLoadingEditMeal(true);
    setEditingMeal(null);
    setSaveError(undefined);
    getMealById(editMealId)
      .then(async (meal) => {
        if (cancelled) return;

        if (!meal) {
          setSaveError('This meal memory could not be opened for editing.');
          return;
        }

        const companions = await getMealCompanions(meal.id);
        if (cancelled) return;
        setEditingMeal(meal);
        setMealType(meal.mealType);
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
        setPersonIds(companions.map(companion => companion.personId));
        setNote(meal.note ?? '');
      })
      .catch(() => { if (!cancelled) setSaveError('This meal memory could not be opened for editing.'); })
      .finally(() => {
        if (!cancelled) setLoadingEditMeal(false);
      });

    return () => {
      cancelled = true;
      locationRequest.current += 1;
    };
    // The form intentionally resets only when the edit target changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMealId, editLoadAttempt]);

  useFocusEffect(useCallback(() => {
    let active = true;
    getPeopleProfiles().then(profiles => { if (active) setPeopleProfiles(profiles); })
      .catch(() => { if (active) setSaveError('People could not be loaded. Please try again.'); });
    return () => { active = false; };
  }, []));

  useEffect(() => {
    let active = true;
    getMeals().then(items => { if (active) setRecentMeals(items.filter(item => item.origin !== 'sample')); }).catch(() => undefined);
    if (!editMealId) AsyncStorage.getItem(STORAGE_KEYS.mealDraft).then(async raw => {
      if (!raw) return;
      const entries = JSON.parse(raw) as MealEntry[]; const draft = entries[0];
      if (!draft || !active) return;
      draftId.current = draft.id; setTitle(draft.title); setNote(draft.note || ''); setDate(draft.date); setTime(draft.time); setMealType(draft.mealType);
      setLocation(draft.location || ''); setMoodTags(draft.moodTags); setPeopleTags(draft.peopleTags); setPersonIds(draft.personIds || []);
      setPhotoMediaId(draft.photoMediaId); setPhotoUri(await resolveManagedMediaUri(draft.photoMediaId, draft.photoUri));
      if (active) setDraftStatus(zh ? '上次未完成的草稿已恢复。' : 'Your unfinished draft was restored.');
    }).catch(() => { draftReadFailed.current = true; if (active) setDraftStatus(zh ? '草稿暂时无法读取，未覆盖旧草稿。' : 'Draft unreadable; the previous draft is kept.'); })
      .finally(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
  }, [editMealId]);

  useEffect(() => {
    if (!draftReady || draftReadFailed.current || editMealId || saving) return;
    const timer = setTimeout(() => {
      if (!title && !note && !photoUri && !personIds.length && !location) return;
      const timestamp = new Date().toISOString();
      draftWrites.current = draftWrites.current.catch(() => undefined).then(() => AsyncStorage.setItem(STORAGE_KEYS.mealDraft, JSON.stringify([{ id: draftId.current, title, note, date, time, mealType, location, moodTags, peopleTags, personIds, photoMediaId, photoUri: photoMediaId ? undefined : photoUri, createdAt: timestamp, updatedAt: timestamp }])))
        .catch(() => setDraftStatus(zh ? '草稿保存失败，请保持此页并重试。' : 'Could not save draft; keep this page open.'));
    }, 400);
    return () => clearTimeout(timer);
  }, [draftReady, editMealId, saving, title, note, date, time, mealType, location, moodTags, peopleTags, personIds, photoMediaId, photoUri]);

  useEffect(() => {
    if (!requestedPersonId || !personRequest || consumedPersonRequest.current === personRequest || saving || loadingEditMeal) return;
    let active = true;
    getPeopleProfiles().then(profiles => {
      if (!active) return;
      consumedPersonRequest.current = personRequest;
      setPeopleProfiles(profiles);
      const person = profiles.find(item => item.id === requestedPersonId && !item.deletedAt);
      if (!person) {
        setPersonNotice(zh ? '这位同桌人暂时无法找到，可以重新选择。' : 'This person is unavailable. You can choose someone else.');
      } else if (editMealId) {
        setPendingPerson(person);
      } else {
        setPersonIds(ids => [...new Set([...ids, person.id])]);
        setPeopleTags(tags => companionTags(tags, [person.id]));
        setPersonNotice(zh ? `已选中 ${person.nickname ?? person.name}，可以继续记录这一餐。` : `${person.nickname ?? person.name} is selected. Continue your meal memory.`);
      }
      router.setParams({ personId: undefined, personRequest: undefined });
    }).catch(() => { if (active) setSaveError('People could not be loaded. Please try again.'); });
    return () => { active = false; };
  }, [requestedPersonId, personRequest, editMealId, saving, loadingEditMeal, zh]);

  const editPlace = (value: string) => {
    locationRequest.current += 1;
    setLocating(false);
    setLocation(value);
    setLocationDetails(undefined);
    setLocationStatus(undefined);
  };

  const applyMealLocation = (nextLocation: MealLocation) => {
    setLocationDetails(nextLocation);
    const label = formatMealLocation(nextLocation);
    if (label) setLocation(label);
  };

  const handleUseCurrentLocation = async () => {
    if (locating) return;
    const request = ++locationRequest.current;
    setLocating(true);
    try {
      const permission = await requestLocationPermission();
      if (request !== locationRequest.current) return;
      if (!permission.granted) {
        notify(permission.message ?? 'Location is optional. You can still type a place by hand.');
        return;
      }

      const currentLocation = await getCurrentMealLocation();
      if (request !== locationRequest.current) return;
      applyMealLocation(currentLocation);
      setLocationStatus('Current place added. You can still edit the text.');
    } catch {
      if (request === locationRequest.current) notify('Mealog could not read your current place. You can still type it by hand.');
    } finally {
      if (request === locationRequest.current) setLocating(false);
    }
  };

  const handlePhoto = async (camera: boolean) => {
    if (pickingPhoto.current) return;
    pickingPhoto.current = true;
    try {
      const permission = await (camera ? requestCameraPermission() : requestPhotosPermission());
      if (!permission.granted) {
        notify(permission.message ?? (camera ? 'Camera access is optional. You can choose a photo instead.' : 'Photo access is needed to attach a snapshot to this meal.'));
        return;
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 1, exif: true };
      const result = await (camera ? ImagePicker.launchCameraAsync(options) : ImagePicker.launchImageLibraryAsync(options));
      if (!result.canceled && result.assets[0]?.uri) {
        const asset = result.assets[0];
        const metadata = await metadataFromUri(asset.uri).catch(() => undefined);
        const media = await importImageToManagedStore({ sourceUri: asset.uri, ownerType: 'meal', ownerId: editingMeal?.id || draftId.current, originalFileName: asset.fileName || undefined });
        setPhotoUri(await resolveManagedMediaUri(media.id)); setPhotoMediaId(media.id);
        if (metadata && !isEditing) { setDate(metadata.date); setTime(metadata.time); setMealType(inferMealType(metadata.time)); }
        setDraftStatus(metadata ? (zh ? '已读取照片拍摄日期，请确认或修改。' : 'Photo date found. Confirm or edit it.') : (zh ? '照片没有可用拍摄日期，请确认日期。' : 'No capture date found. Please confirm the date.'));
        setSaveError(undefined);
      }
    } catch {
      setSaveError('This photo could not be opened. Please choose another photo.');
    } finally { pickingPhoto.current = false; }
  };
  const handlePickPhoto = () => handlePhoto(false);

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
    if (saveInFlight.current || loadingEditMeal || (editMealId && editingMeal?.id !== editMealId)) return;

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

    saveInFlight.current = true;
    Keyboard.dismiss();
    locationRequest.current += 1;
    setLocating(false);
    setSaving(true);
    setSaveError(undefined);
    try {
      const savedId = editingMeal?.id ?? draftId.current;
      const createdAt = editingMeal?.createdAt ?? new Date().toISOString();
      const nextLocationDetails = resolveMealLocationForSave(trimmedLocation, locationDetails);
      await saveMealMemory({
        id: savedId,
        origin: 'user',
        title: trimmedTitle || t(selectedMealType.label),
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
      }, personIds);

      await trackEvent('record_saved', photoUri && (personIds.length || trimmedLocation || trimmedNote || moodTags.length || peopleTags.includes('just-me')) ? 1 : 0, Date.now() - startedRecording.current);
      if (!isEditing) { await draftWrites.current; await AsyncStorage.removeItem(STORAGE_KEYS.mealDraft).catch(() => undefined); }
      let stickerPending = false;
      if (makeSticker && photoUri && Platform.OS === 'web') {
        setMakingSticker(true);
        try {
          const saved = await getMealById(savedId);
          if (saved && !saved.stickerUri) await createMealSticker(saved);
        } catch { stickerPending = true; }
        finally { setMakingSticker(false); }
      }
      resetForm();
      router.setParams({ editMealId: undefined, personId: undefined, personRequest: undefined });
      router.push(`/meal/${savedId}${stickerPending ? '?stickerNotice=pending' : ''}`);
    } catch {
      setSaveError('Your memory could not be saved. Check that the photo is readable and browser storage is available, then try again. Your form is kept.');
    } finally {
      saveInFlight.current = false;
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
          pointerEvents={saving || loadingEditMeal ? 'none' : 'auto'}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.headerKicker}>
              {t(isEditing ? 'Editing meal memory' : 'A new meal memory')}
            </Text>
            <Text style={styles.headerTitle}>
              {zh ? (isEditing ? '再添一笔。' : '留住这一餐。') : (isEditing ? 'One more detail.' : 'Keep this meal.')}
            </Text>
            <Text style={styles.headerSubtitle}>
              {zh ? '以后想起今天，也许就从这一餐开始。' : 'One day, this meal might bring today back.'}
            </Text>
          </View>

          {!isEditing && <View style={styles.section}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: timingExpanded }} onPress={() => setTimingExpanded(!timingExpanded)} style={styles.locationButton}><Text style={styles.locationButtonText}>{date} · {time}　{timingExpanded ? '−' : '+'}</Text></Pressable>
            {draftStatus ? <Text accessibilityLiveRegion="polite" style={styles.headerSubtitle}>{draftStatus}</Text> : null}
            {timingExpanded && <>
            <Text style={styles.sectionTitle}>{zh ? '确认这个时刻' : 'Confirm this moment'}</Text>
            <Text style={styles.headerSubtitle}>{zh ? '时间建议可以修改，同行的人与心情由你确认。咖啡和做饭过程也可以留下。' : 'Edit the time suggestion. Only you decide companions and feelings; coffee or cooking belongs here too.'}</Text>
            <TextField label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD"/>
            <TextField label="Time" value={time} onChangeText={value => { setTime(value); setMealType(inferMealType(value)); }} placeholder="HH:mm"/>

            <Text style={styles.fieldLabel}>{zh ? '最近同桌的人（点击确认，不自动添加）' : 'Recent companions — tap to confirm'}</Text>
            <View style={styles.chipRow}>{[...new Set(recentMeals.flatMap(meal => meal.personIds || []))].slice(0, 3).map(id => { const person = peopleProfiles.find(person => person.id === id); return person ? <SoftChip key={id} label={person.nickname || person.name} selected={personIds.includes(id)} onPress={() => { const ids = toggleValue(personIds, id); setPersonIds(ids); setPeopleTags(tags => companionTags(tags, ids)); }}/> : null; })}</View>
            <View style={styles.chipRow}>{[...new Set(recentMeals.map(meal => meal.location).filter((place): place is string => Boolean(place)))].slice(0, 3).map(place => <SoftChip key={place} label={place} selected={location === place} onPress={() => editPlace(place)}/>)}</View>
            <View style={styles.chipRow}>{[...new Set(recentMeals.map(meal => meal.title))].slice(0, 3).map(name => <SoftChip key={name} label={name} selected={title === name} onPress={() => setTitle(name)}/>)}</View>
          </>}</View>}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(photoUri ? 'Change meal photo' : 'Upload a meal photo')}
            onPress={handlePickPhoto}
            onHoverIn={() => setPlateHovered(true)}
            onHoverOut={() => setPlateHovered(false)}
            style={({ pressed }) => [
              styles.photoFrame,
              pressed && styles.photoFramePressed,
            ]}
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoPreview} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <TablePlate variant={plateHovered ? (plateStyle + 1) % PLATES.length : plateStyle}/>
                <Text style={styles.photoTitle}>{zh ? '先放一张照片' : 'Start with a photograph'}</Text>
                <Text style={styles.photoHint}>{zh ? '轻触餐盘，带回这一刻' : 'Tap the plate to bring this moment back'}</Text>
              </View>
            )}
          </Pressable>

          {!photoUri && <View style={styles.objectChoices}>{PLATES.map((plate, index) => <Pressable key={plate.en} accessibilityRole="button" accessibilityLabel={zh ? `换成${plate.zh}餐盘` : `Choose ${plate.en} plate`} accessibilityState={{ selected: plateStyle === index }} onPress={() => { setPlateStyle(index); setPlateHovered(false); }} style={styles.objectChoice}><View style={[styles.plateSwatch, { backgroundColor: plate.rim }, plateStyle === index && styles.objectSelected]}/><Text style={styles.objectLabel}>{zh ? plate.zh : plate.en}</Text></Pressable>)}</View>}

          <View style={styles.locationToolsRow}>
            <Pressable accessibilityRole="button" onPress={() => handlePhoto(true)} style={styles.locationButton}>
              <Text style={styles.locationButtonText}>{t('Take photo')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={handlePickPhoto} style={styles.locationButton}>
              <Text style={styles.locationButtonText}>{t('Photo library')}</Text>
            </Pressable>
          </View>

            <Pressable accessibilityRole="button" accessibilityState={{ expanded: samplesExpanded }} onPress={() => setSamplesExpanded(!samplesExpanded)} style={styles.sampleToggle}>
              <Text style={styles.locationButtonText}>{zh ? (samplesExpanded ? '收起示例照片 −' : '试用示例照片 +') : (samplesExpanded ? 'Hide sample photos −' : 'Try a sample photo +')}</Text>
            </Pressable>
            {samplesExpanded && <View style={styles.demoPhotoPicker}>
              <Text style={styles.demoPhotoKicker}>{t('Or choose a sample photo')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.demoPhotoRow}
              >
                {DEMO_PHOTO_CHOICES.map((choice) => (
                  <Pressable
                    key={choice.label}
                    accessibilityRole="button"
                    accessibilityLabel={t(choice.label)}
                    onPress={() => handleUseDemoPhoto(choice.source)}
                    style={({ pressed }) => [
                      styles.demoPhotoButton,
                      pressed && styles.demoPhotoButtonPressed,
                    ]}
                  >
                    <Image source={choice.source} style={styles.demoPhotoThumb} />
                    <Text style={styles.demoPhotoLabel}>{t(choice.label)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>}

          <TextField editable={!saving && !loadingEditMeal} label="Meal name" value={title} onChangeText={setTitle} placeholder="Wheat bread, sushi, soup..." />

          <View style={styles.realPeopleBox}>
            <Text style={styles.peopleIntroTitle}>{zh ? '这一餐，和谁一起？' : 'Who is at this table?'}</Text>
            <Pressable accessibilityRole="button" onPress={() => setPeoplePickerOpen(true)} style={styles.companionChoice}>
              {selectedPeople.length > 0 ? <StackedAvatarGroup people={selectedPeople} size={28} /> :
                <TableChair variant={chairStyle} size={38}/>}
              <Text style={[styles.peoplePickerButtonText, { flex: 1 }]}>
                {selectedPeople.length ? selectedPeople.map(person => person.nickname ?? person.name).join('、') :
                  zh ? '选择 / 添加同桌人 ＋' : 'Choose / add someone ＋'}
              </Text>
              {selectedPeople.length > 0 && <Text style={styles.peoplePickerButtonText}>{zh ? '编辑' : 'Edit'}</Text>}
            </Pressable>
            <View style={styles.chairChoices}>{CHAIRS.map((chair, index) => <Pressable key={chair.key} accessibilityRole="button" accessibilityLabel={zh ? `选择${chair.zh}` : `Choose ${chair.en}`} accessibilityState={{ selected: chairStyle === index }} onPress={() => setChairStyle(index)} style={[styles.chairChoice, chairStyle === index && styles.chairSelected]}><TableChair variant={index} size={30}/><Text style={styles.objectLabel}>{zh ? chair.zh : chair.en}</Text></Pressable>)}</View>
            <View style={[styles.companionOptions, { justifyContent: 'flex-end' }]}>
              <Pressable accessibilityRole="checkbox" accessibilityLabel={zh ? '独自用餐' : 'I ate alone'}
                accessibilityState={{ checked: peopleTags.includes('just-me') }} style={styles.soloChoice}
                onPress={() => { setPersonIds([]); setPeopleTags(current => companionTags(current, [], !current.includes('just-me'))); setPersonNotice(''); }}>
                <Text style={styles.peoplePickerButtonText}>{peopleTags.includes('just-me') ? '✓ ' : ''}{zh ? '独自用餐' : 'I ate alone'}</Text>
              </Pressable>
            </View>
            {personNotice ? <Text accessibilityLiveRegion="polite" style={styles.optionalHint}>{personNotice}</Text> : null}
            {pendingPerson && <View>
              <Text style={styles.optionalHint}>{zh ? '你正在编辑另一餐。是否把这位同桌人加入当前餐食？' : 'You are editing another meal. Add this person to that meal?'}</Text>
              <View style={styles.companionOptions}>
                <Pressable accessibilityRole="button" style={styles.soloChoice} onPress={() => {
                  setPersonIds(ids => [...new Set([...ids, pendingPerson.id])]);
                  setPeopleTags(tags => companionTags(tags, [pendingPerson.id]));
                  setPendingPerson(undefined);
                }}><Text style={styles.peoplePickerButtonText}>{zh ? `加入 ${pendingPerson.nickname ?? pendingPerson.name}` : `Add ${pendingPerson.nickname ?? pendingPerson.name}`}</Text></Pressable>
                <Pressable accessibilityRole="button" style={styles.soloChoice} onPress={() => setPendingPerson(undefined)}>
                  <Text style={styles.peoplePickerButtonText}>{zh ? '暂不添加' : 'Not now'}</Text>
                </Pressable>
              </View>
            </View>}
          </View>
          <TextInput editable={!saving && !loadingEditMeal} accessibilityLabel={t('Note')} style={[styles.input, styles.noteInput]} value={note} onChangeText={setNote}
            placeholder={zh ? '今天聊起的话题，或一个想留住的小细节。' : 'A conversation, or a small detail you want to keep.'}
            placeholderTextColor={colors.muted} multiline maxLength={420} textAlignVertical="top" />
          {photoUri && Platform.OS === 'web' && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: makeSticker }}
            onPress={() => setMakeSticker(!makeSticker)} style={styles.stickerOption}>
            <Text style={styles.locationButtonText}>{makeSticker ? '☑' : '□'} {zh ? '保存后制作餐食贴纸' : 'Make a food sticker after saving'}</Text>
            <Text style={styles.optionalHint}>{zh ? '自动放入日历与饮食图册。照片仅在设备上处理。' : 'For your calendar and food album. Photos stay on this device.'}</Text>
          </Pressable>}
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsExpanded }} onPress={() => setDetailsExpanded(!detailsExpanded)} style={styles.detailsToggle}>
            <Text style={styles.detailTitle}>{zh ? '再添几笔' : 'A few more details'} {detailsExpanded ? '−' : '+'}</Text>
            <Text style={styles.optionalHint}>{t(selectedMealType.label)} · {date} · {time}</Text>
          </Pressable>
          {detailsExpanded && <>
          <Section eyebrow="Catering" title="What kind of meal was it?">
            <View style={styles.mealTypeGrid}>
              {MEAL_TYPES.map((type) => (
                <Pressable
                  key={type.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mealType === type.value }}
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
                    {t(type.label)}
                  </Text>
                  <Text style={styles.mealTypeHint}>{t(type.hint)}</Text>
                </Pressable>
              ))}
            </View>
          </Section>

          <View style={styles.paper}>

            {isEditing && <View style={styles.dateTimeRow}>
              <View style={styles.dateTimeField}>
                <TextField
                  editable={!saving && !loadingEditMeal}
                  label="Date"
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                />
              </View>
              <View style={styles.dateTimeField}>
                <TextField
                  editable={!saving && !loadingEditMeal}
                  label="Time"
                  value={time}
                  onChangeText={setTime}
                  placeholder="HH:mm"
                />
              </View>
            </View>}

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>{t('Location')}</Text>
              <TextInput
                editable={!saving && !loadingEditMeal}
                accessibilityLabel={t('Location')}
                style={styles.input}
                value={location}
                onChangeText={editPlace}
                placeholder={t("Little Ruby's SoHo, kitchen table...")}
                placeholderTextColor="rgba(141, 123, 102, 0.52)"
              />
              <View style={styles.locationToolsRow}>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.locationButton, locating && styles.locationButtonDisabled]}
                  disabled={locating}
                  onPress={handleUseCurrentLocation}
                >
                  <Text style={styles.locationButtonText}>
                    {t(locating ? 'Finding place...' : 'Use current location')}
                  </Text>
                </Pressable>
                {Boolean(location || locationDetails || locating) && <Pressable accessibilityRole="button" onPress={() => editPlace('')} style={styles.locationButton}>
                  <Text style={styles.locationButtonText}>{t('Remove place')}</Text>
                </Pressable>}
                {locationStatus ? <Text style={styles.locationStatus}>{t(locationStatus)}</Text> : null}
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

          <Section eyebrow="Seats" title="Choose the kind of table this meal belonged to.">
            <View style={styles.chipRow}>
              {DEFAULT_COMPANIONSHIP_TAGS.filter(tag => tag.id !== 'just-me').map(tag => (
                <SoftChip key={tag.id} label={tag.label} selected={peopleTags.includes(tag.id)}
                  onPress={() => setPeopleTags(current => toggleValue(current.filter(value => value !== 'just-me'), tag.id))} />
              ))}
            </View>
          </Section>

          </>}
        </ScrollView>

        <View style={styles.saveBar}>
          {saveError ? <Text accessibilityLiveRegion="polite" style={styles.saveError}>{t(saveError)}</Text> : null}
          {editMealId && !loadingEditMeal && editingMeal?.id !== editMealId ? (
            <Pressable accessibilityRole="button" style={styles.sampleToggle} onPress={() => setEditLoadAttempt(attempt => attempt + 1)}>
              <Text style={styles.locationButtonText}>{zh ? '重新读取这餐' : 'Reload this meal'}</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.saveButton,
              pressed && styles.saveButtonPressed,
              saving && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            disabled={saving || loadingEditMeal || Boolean(editMealId && editingMeal?.id !== editMealId)}
          >
            <Text style={styles.saveButtonText}>
              {makingSticker ? (zh ? '餐食已保存，正在制作贴纸…' : 'Meal saved. Making your sticker…') : t(loadingEditMeal
                ? 'Opening memory...'
                : saving
                  ? 'Saving memory...'
                  : isEditing
                    ? 'Save changes'
                    : 'Save meal memory')}
            </Text>
          </Pressable>
        </View>

        <PeoplePickerSheet
          visible={peoplePickerOpen}
          selectedPersonIds={personIds}
          ateAlone={peopleTags.includes('just-me')}
          scope={editingMeal?.origin === 'sample' ? 'sample' : 'personal'}
          onClose={() => setPeoplePickerOpen(false)}
          onSave={async (ids, alone) => {
            setPersonIds(ids);
            setPeopleTags(tags => companionTags(tags, ids, alone));
            setPersonNotice('');
            const profiles = await getPeopleProfiles();
            setPeopleProfiles(profiles);
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
  objectChoices: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 4, marginBottom: 6 }, objectChoice: { alignItems: 'center', justifyContent: 'center', minHeight: 44, gap: 5, padding: 4 }, plateSwatch: { width: 19, height: 19, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' }, objectSelected: { borderWidth: 2, borderColor: colors.primary }, objectLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.mutedText }, chairChoices: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 9 }, chairChoice: { minHeight: 48, alignItems: 'center', padding: 5, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' }, chairSelected: { borderColor: colors.border, backgroundColor: colors.accentSoft },

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
  headerKicker: { fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginBottom: 6,
  },
  headerTitle: { fontFamily: fonts.editorial,
    fontSize: 26,
    lineHeight: 32,
    fontStyle: 'normal',
    color: colors.primary,
  },
  headerSubtitle: { fontFamily: fonts.body,
    marginTop: 8,
    maxWidth: 310,
    fontSize: 14,
    lineHeight: 21,
    color: colors.mutedText,
  },
  photoFrame: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 253, 248, 0.7)',
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: 8,
  },
  photoFramePressed: {
    opacity: 0.82,
  },
  photoPreview: {
    width: '100%',
    aspectRatio: 1.8,
  },
  photoPlaceholder: {
    minHeight: 204,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
  },
  photoPlus: {
    fontSize: 30,
    lineHeight: 34,
    color: '#B49158',
    fontWeight: '200',
  },
  photoPlate: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: '#D5C2A5',
    backgroundColor: '#F5EDDE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoPlateWell: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: '#E1D2BB',
    backgroundColor: '#FFFCF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTitle: {
    marginTop: 8,
    fontSize: 17,
    fontStyle: 'normal',
    color: colors.primary,
  },
  photoHint: {
    marginTop: 6,
    fontSize: 12,
    color: colors.muted,
  },
  demoPhotoPicker: {
    marginTop: 6,
    marginBottom: 26,
  },
  demoPhotoKicker: {
    marginBottom: 9,
    fontSize: 12,
    color: colors.mutedText,
    fontStyle: 'normal',
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
  sectionTitle: { fontFamily: fonts.editorial,
    fontSize: 17,
    lineHeight: 23,
    fontStyle: 'normal',
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
    borderRadius: 2,
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
    fontSize: 16,
    fontStyle: 'normal',
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
    borderRadius: 2,
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
  fieldLabel: { fontFamily: fonts.body,
    fontSize: 12,
    color: colors.mutedText,
    marginBottom: 7,
  },
  input: { fontFamily: fonts.body,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderWidth: 1.2,
    borderColor: colors.primary,
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
    fontStyle: 'normal',
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
    borderRadius: 22,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: colors.background,
    borderWidth: 1.2,
    borderColor: colors.primary,
  },
  chipCompact: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipPressed: {
    opacity: 0.72,
  },
  chipText: {
    fontSize: 13,
    color: colors.mutedText,
    fontStyle: 'normal',
  },
  chipTextSelected: {
    color: colors.background,
  },
  realPeopleBox: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 15,
    marginBottom: 14,
    backgroundColor: colors.surface,
    borderWidth: 1.2,
    borderColor: colors.primary,
  },
  companionChoice: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  companionOptions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  soloChoice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  peoplePickerButtonText: {
    fontSize: 13,
    color: colors.secondary,
    fontStyle: 'normal',
  },
  peopleIntroTitle: { fontFamily: fonts.editorial,
    fontSize: 15,
    fontStyle: 'normal',
    color: colors.primary,
    marginBottom: 5,
  },
  peopleIntroText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  noteInput: {
    minHeight: 78,
    lineHeight: 22,
  },
  optionalHint: { color: colors.mutedText, fontSize: 12, lineHeight: 18, marginBottom: 8 },
  sampleToggle: { minHeight: 40, justifyContent: 'center', marginBottom: 8 },
  detailsToggle: { paddingVertical: 18, marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  detailTitle: { fontFamily: fonts.editorial, fontSize: 15, color: colors.primary, marginBottom: 4 },
  stickerOption: { gap: 6, paddingTop: 16 },
  saveError: { color: '#9a4545', fontSize: 13, lineHeight: 18, marginBottom: 8 },
  saveBar: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  saveButton: {
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    ...shadow.soft,
    borderWidth: 1.5, borderColor: colors.primary,
  },
  saveButtonPressed: {
    opacity: 0.84,
  },
  saveButtonDisabled: {
    opacity: 0.52,
  },
  saveButtonText: {
    fontSize: 16,
    color: colors.primary,
    fontStyle: 'normal',
    fontWeight: '600',
  },
});
