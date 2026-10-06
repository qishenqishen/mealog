import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { getManagedMediaRecords, getManagedOriginalBlob, importImageToManagedStore, deleteManagedMedia } from '../media/managedMedia';
import { STORAGE_KEYS, readProductSnapshot, mergeProductSnapshot } from '../storage';
import type { ManagedMedia } from '../types';
import { getCurrentUserId } from '../auth';
import { downloadBlob } from './exportCard';

const MAX_BYTES = 250 * 1024 * 1024;
const DATA_KEYS: string[] = [STORAGE_KEYS.meals, STORAGE_KEYS.peopleProfiles, STORAGE_KEYS.peopleTags, STORAGE_KEYS.mealCompanions,
  STORAGE_KEYS.sharedMealPhotos, STORAGE_KEYS.trash, STORAGE_KEYS.freeMemories, STORAGE_KEYS.memoryCards, STORAGE_KEYS.monthlyReflections,
  STORAGE_KEYS.achievementProgress, STORAGE_KEYS.collectionItems];
interface Backup { format: 'mealog'; version: 1; createdAt: string; data: Record<string, unknown[]>; media: ManagedMedia[] }
export async function createBackup(): Promise<Blob> {
  const raw = await readProductSnapshot(), records = await getManagedMediaRecords();
  const data = Object.fromEntries(DATA_KEYS.filter(key => raw[key]).map(key => [key, JSON.parse(raw[key])]));
  const text = JSON.stringify(data);
  const media = records.filter(record => text.includes(record.id));
  const files: Record<string, Uint8Array> = {}; let size = 0;
  // ponytail: memory-based ZIP is capped at 250 MB; use streaming archives for larger libraries.
  for (const record of media) {
    const blob = await getManagedOriginalBlob(record); size += blob.size;
    if (size > MAX_BYTES) throw new Error('Backup exceeds the 250 MB limit');
    files[`photos/${record.id}`] = new Uint8Array(await blob.arrayBuffer());
  }
  files['mealog.json'] = strToU8(JSON.stringify({ format: 'mealog', version: 1, createdAt: new Date().toISOString(), data, media } satisfies Backup));
  return new Blob([zipSync(files, { level: 0 }).buffer as ArrayBuffer], { type: 'application/zip' });
}
export async function exportBackup() {
  const blob = await createBackup();
  downloadBlob(blob, `Mealog-backup-${new Date().toISOString().slice(0, 10)}.zip`);
  return blob.size;
}
export function validateBackup(value: unknown): Backup {
  if (!value || typeof value !== 'object') throw new Error('Invalid backup');
  const backup = value as Backup;
  if (backup.format !== 'mealog' || backup.version !== 1 || !backup.data || typeof backup.data !== 'object' || !Array.isArray(backup.media) || backup.media.length > 10000) throw new Error('Unsupported backup');
  const clean = (entry: unknown, depth = 0): void => {
    if (depth > 20) throw new Error('Backup nesting exceeds limit');
    if (typeof entry === 'string' && entry.length > 20000) throw new Error('Backup field exceeds limit');
    if (entry && typeof entry === 'object') for (const [key, child] of Object.entries(entry)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Invalid backup property');
      clean(child, depth + 1);
    }
  };
  clean(backup.data);
  for (const [key, items] of Object.entries(backup.data)) {
    if (!DATA_KEYS.includes(key) || !Array.isArray(items) || items.length > 20000 || items.some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw new Error('Invalid backup list');
  }
  const id = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
  const unique = new Set<string>();
  for (const media of backup.media) {
    if (!id(media.id) || unique.has(media.id) || !id(media.ownerId) || !['meal', 'person', 'profile', 'sharedMeal'].includes(media.ownerType) || !/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(media.mimeType)) throw new Error('Invalid backup image');
    unique.add(media.id);
  }
  for (const meal of (backup.data[STORAGE_KEYS.meals] ?? []) as Record<string, unknown>[]) {
    if (!id(meal.id) || typeof meal.title !== 'string' || !['breakfast', 'lunch', 'dinner', 'snack', 'treat'].includes(String(meal.mealType)) || typeof meal.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(meal.date) || !Number.isFinite(Date.parse(`${meal.date}T12:00:00Z`)) || new Date(`${meal.date}T12:00:00Z`).toISOString().slice(0, 10) !== meal.date || !Array.isArray(meal.moodTags) || !Array.isArray(meal.peopleTags)) throw new Error('Invalid meal in backup');
  }

  const rows = (key: string) => (backup.data[key] || []) as Record<string, unknown>[];
  const strings = (value: unknown) => Array.isArray(value) && value.every(id);
  const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
  for (const person of rows(STORAGE_KEYS.peopleProfiles)) if (!id(person.id) || typeof person.name !== 'string' || !person.name.trim()) throw new Error('Invalid person in backup');
  for (const relation of rows(STORAGE_KEYS.mealCompanions)) if (!id(relation.id) || !id(relation.personId) || !id(relation.mealId)) throw new Error('Invalid companion in backup');
  for (const photo of rows(STORAGE_KEYS.sharedMealPhotos)) if (!id(photo.id) || !id(photo.mealId) || !strings(photo.taggedPersonIds)) throw new Error('Invalid photo in backup');
  for (const note of rows(STORAGE_KEYS.freeMemories)) if (!id(note.id) || typeof note.title !== 'string' || typeof note.text !== 'string' || !date(note.date) || !strings(note.personIds)) throw new Error('Invalid free memory in backup');
  for (const card of rows(STORAGE_KEYS.memoryCards)) {
    const narrative = card.narrative as { title?: unknown; observations?: unknown[] } | undefined;
    if (typeof card.id !== 'string' || typeof card.generatedAt !== 'string' || !['personal', 'sample'].includes(String(card.scope)) || !['week', 'month', 'year'].includes(String(card.period)) || !date(card.start) || !date(card.end) || !card.feedback || typeof card.feedback !== 'object' || !narrative || typeof narrative.title !== 'string' || !Array.isArray(narrative.observations) || narrative.observations.length > 3 || narrative.observations.some(item => !item || typeof item !== 'object' || typeof (item as { text?: unknown }).text !== 'string' || !strings((item as { mealIds?: unknown }).mealIds))) throw new Error('Invalid card in backup');
  }
  for (const entry of rows(STORAGE_KEYS.trash)) {
    const meal = entry.meal as Record<string, unknown> | undefined;
    if (!meal || !id(meal.id) || typeof meal.title !== 'string' || !date(meal.date) || !Array.isArray(meal.moodTags) || !Array.isArray(meal.peopleTags) || !Array.isArray(entry.companions) || !Array.isArray(entry.photos)) throw new Error('Invalid recovery memory');
  }
  return backup;
}
export async function readBackup(file: Blob) {
  if (!file.size || file.size > MAX_BYTES) throw new Error('Choose a Mealog ZIP backup under 250 MB');
  let total = 0, entries = 0;
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: entry => {
    total += entry.originalSize; entries++;
    if (total > MAX_BYTES || entries > 10001 || !/^(mealog\.json|photos\/[a-zA-Z0-9_-]{1,100})$/.test(entry.name) || (entry.name === 'mealog.json' && entry.originalSize > 10 * 1024 * 1024)) throw new Error(`Unsafe or oversized backup entry: ${entry.name}`);
    return true;
  } });
  if (!files['mealog.json']) throw new Error('Backup manifest is missing');
  const backup = validateBackup(JSON.parse(strFromU8(files['mealog.json'])));
  if (backup.media.some(media => !files[`photos/${media.id}`]?.length)) throw new Error('Backup image is missing');
  return { backup, files };
}
export async function restoreBackup(parsed: Awaited<ReturnType<typeof readBackup>>) {
  const imported: string[] = [], replacements = new Map<string, string>(), userId = await getCurrentUserId();
  let commitAttempted = false;
  try {
    for (const old of parsed.backup.media) {
      const uri = URL.createObjectURL(new Blob([parsed.files[`photos/${old.id}`].buffer as ArrayBuffer], { type: old.mimeType }));
      try {
        const media = await importImageToManagedStore({ sourceUri: uri, ownerId: old.ownerId, ownerType: old.ownerType, userId, mimeType: old.mimeType, originalFileName: old.originalFileName });
        imported.push(media.id); replacements.set(old.id, media.id);
        if (old.localManagedUri) replacements.set(old.localManagedUri, media.localManagedUri!);
        if (old.thumbnailUri) replacements.set(old.thumbnailUri, media.thumbnailUri!);
      } finally { URL.revokeObjectURL(uri); }
    }
    const remap = (value: unknown, key = ''): unknown => {
      if (key === 'userId') return userId;
      if (typeof value === 'string') {
        if (replacements.has(value)) return replacements.get(value);
        // Never restore device-specific display URLs or trigger a network fetch from a backup.
        if (/(Uri|Url|Snapshot)$/.test(key) && /^(blob:|file:|https?:|indexeddb:)/.test(value)) return undefined;
        return value;
      }
      if (Array.isArray(value)) return value.map(item => remap(item));
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, remap(child, childKey)]));
      return value;
    };
    commitAttempted = true;
    await mergeProductSnapshot(remap(parsed.backup.data) as Record<string, unknown[]>);
    const saved = JSON.stringify(await readProductSnapshot());
    await Promise.all(imported.filter(id => !saved.includes(id)).map(deleteManagedMedia));
  } catch (error) {
    // Preserve media if a record commit or rollback might have left a live reference.
    if (commitAttempted) throw error;
    const cleanup = await Promise.allSettled(imported.map(deleteManagedMedia));
    if (cleanup.some(result => result.status === 'rejected')) throw new Error('Restore failed; some unused image copies remain. Existing records are preserved.');
    throw error;
  }
}
