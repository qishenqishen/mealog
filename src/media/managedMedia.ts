import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';

import type { ManagedMedia, MediaOwnerType, MediaStorageStatus } from '../types';
import { generateId } from '../utils/id';

const MANAGED_MEDIA_KEY = '@mealogue/managedMedia';
const WEB_DB_NAME = 'mealog-managed-media';
const WEB_DB_VERSION = 1;
const WEB_STORE_NAME = 'media-blobs';
const WEB_URI_PREFIX = 'indexeddb://mealog-media/';
const NATIVE_MEDIA_ROOT = 'media';

type ImportImageInput = {
  sourceUri: string;
  ownerType: MediaOwnerType;
  ownerId: string;
  userId?: string;
  existingMediaId?: string;
  originalFileName?: string;
  mimeType?: string;
  width?: number;
  height?: number;
};

type StoredManagedMedia = Partial<ManagedMedia>;

function normalizeManagedMedia(item: StoredManagedMedia): ManagedMedia | null {
  if (!item.id || !item.ownerType || !item.ownerId) return null;

  return {
    id: item.id,
    userId: item.userId,
    ownerType: item.ownerType,
    ownerId: item.ownerId,
    originalFileName: item.originalFileName,
    mimeType: item.mimeType ?? 'image/jpeg',
    width: item.width,
    height: item.height,
    localManagedUri: item.localManagedUri,
    remoteUrl: item.remoteUrl,
    thumbnailUri: item.thumbnailUri,
    createdAt: item.createdAt ?? new Date().toISOString(),
    storageStatus: item.storageStatus ?? 'stored_local',
  };
}

async function getStoredMedia(): Promise<ManagedMedia[]> {
  const raw = await AsyncStorage.getItem(MANAGED_MEDIA_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(normalizeManagedMedia).filter((item): item is ManagedMedia => item !== null)
      : [];
  } catch {
    return [];
  }
}

async function setStoredMedia(items: ManagedMedia[]): Promise<void> {
  await AsyncStorage.setItem(MANAGED_MEDIA_KEY, JSON.stringify(items));
}

async function upsertMedia(record: ManagedMedia): Promise<ManagedMedia> {
  const records = await getStoredMedia();
  const index = records.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    records[index] = record;
  } else {
    records.push(record);
  }
  await setStoredMedia(records);
  return record;
}

export async function getManagedMediaRecords(): Promise<ManagedMedia[]> {
  return getStoredMedia();
}

export async function getManagedMediaById(id?: string): Promise<ManagedMedia | undefined> {
  if (!id) return undefined;
  const records = await getStoredMedia();
  return records.find((item) => item.id === id);
}

export function isManagedMediaUri(uri?: string): boolean {
  if (!uri) return false;
  if (uri.startsWith(WEB_URI_PREFIX)) return true;
  const documentRoot = FileSystem.documentDirectory;
  return Boolean(documentRoot && uri.startsWith(`${documentRoot}${NATIVE_MEDIA_ROOT}/`));
}

export function isTransientWebUri(uri?: string): boolean {
  return Boolean(uri?.startsWith('blob:'));
}

function inferMimeType(sourceUri: string, hint?: string): string {
  if (hint) return hint;

  const dataMatch = sourceUri.match(/^data:([^;,]+)[;,]/);
  if (dataMatch?.[1]) return dataMatch[1];

  const clean = sourceUri.split('?')[0]?.toLowerCase() ?? '';
  if (clean.endsWith('.png')) return 'image/png';
  if (clean.endsWith('.webp')) return 'image/webp';
  if (clean.endsWith('.gif')) return 'image/gif';
  if (clean.endsWith('.heic')) return 'image/heic';
  if (clean.endsWith('.heif')) return 'image/heif';
  return 'image/jpeg';
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('heic')) return 'heic';
  if (mimeType.includes('heif')) return 'heif';
  return 'jpg';
}

function ownerFolder(ownerType: MediaOwnerType, ownerId: string): string {
  switch (ownerType) {
    case 'meal':
      return `meals/${ownerId}`;
    case 'person':
    case 'profile':
      return `people/${ownerId}`;
    case 'sharedMeal':
      return `shared/${ownerId}`;
    default:
      return `misc/${ownerId}`;
  }
}

function nativeDirectoryFor(input: ImportImageInput): string {
  const documentRoot = FileSystem.documentDirectory;
  if (!documentRoot) {
    throw new Error('Persistent document storage is not available on this platform.');
  }
  return `${documentRoot}${NATIVE_MEDIA_ROOT}/${ownerFolder(input.ownerType, input.ownerId)}/`;
}

async function ensureDirectory(uri: string): Promise<void> {
  await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
}

function dataUriToBase64(uri: string): string | undefined {
  const marker = ';base64,';
  const index = uri.indexOf(marker);
  return index >= 0 ? uri.slice(index + marker.length) : undefined;
}

function isRemoteUri(uri: string): boolean {
  return uri.startsWith('http://') || uri.startsWith('https://');
}

function webKeyFromManagedUri(uri?: string): string | undefined {
  return uri?.startsWith(WEB_URI_PREFIX) ? uri.slice(WEB_URI_PREFIX.length) : undefined;
}

async function assertNativeFile(uri: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error('The imported media file could not be verified.');
  }
}

function openWebDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WEB_DB_NAME, WEB_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WEB_STORE_NAME)) {
        db.createObjectStore(WEB_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open media database.'));
  });
}

async function putWebBlob(id: string, blob: Blob): Promise<void> {
  const db = await openWebDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(WEB_STORE_NAME, 'readwrite');
    transaction.objectStore(WEB_STORE_NAME).put(blob, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not store media blob.'));
  });
  db.close();
}

async function getWebBlob(id: string): Promise<Blob | undefined> {
  const db = await openWebDatabase();
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const transaction = db.transaction(WEB_STORE_NAME, 'readonly');
    const request = transaction.objectStore(WEB_STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error ?? new Error('Could not read media blob.'));
  });
  db.close();
  return blob;
}

async function deleteWebBlob(id: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openWebDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(WEB_STORE_NAME, 'readwrite');
    transaction.objectStore(WEB_STORE_NAME).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not delete media blob.'));
  });
  db.close();
}

async function sourceUriToBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('The selected image could not be read.');
  }
  return response.blob();
}

async function createWebThumbnailBlob(blob: Blob): Promise<Blob> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') {
    return blob;
  }

  try {
    const bitmap = await createImageBitmap(blob);
    const maxSide = 520;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return blob;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const thumbnail = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.72);
    });

    return thumbnail ?? blob;
  } catch {
    return blob;
  }
}

async function createNativeThumbnail(
  sourceUri: string,
  directory: string,
  mediaId: string,
): Promise<string | undefined> {
  try {
    const thumbnailDirectory = `${directory}thumbnails/`;
    await ensureDirectory(thumbnailDirectory);
    const result = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: { width: 520 } }],
      { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG },
    );
    const destination = `${thumbnailDirectory}${mediaId}.jpg`;
    await FileSystem.copyAsync({ from: result.uri, to: destination });
    await assertNativeFile(destination);
    return destination;
  } catch {
    return undefined;
  }
}

function makeRecord(
  input: ImportImageInput,
  id: string,
  status: MediaStorageStatus,
  localManagedUri?: string,
): ManagedMedia {
  const now = new Date().toISOString();
  return {
    id,
    userId: input.userId,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    originalFileName: input.originalFileName,
    mimeType: inferMimeType(input.sourceUri, input.mimeType),
    width: input.width,
    height: input.height,
    localManagedUri,
    thumbnailUri: localManagedUri,
    createdAt: now,
    storageStatus: status,
  };
}

export async function importImageToManagedStore(input: ImportImageInput): Promise<ManagedMedia> {
  const sourceUri = input.sourceUri?.trim();
  if (!sourceUri) {
    throw new Error('No image was selected.');
  }

  if (isManagedMediaUri(sourceUri) && input.existingMediaId) {
    const existing = await getManagedMediaById(input.existingMediaId);
    if (existing) return existing;
  }

  const mediaId = input.existingMediaId ?? generateId();
  const importing = makeRecord(input, mediaId, 'importing');
  await upsertMedia(importing);

  try {
    if (Platform.OS === 'web') {
      const blob = await sourceUriToBlob(sourceUri);
      const thumbnailBlob = await createWebThumbnailBlob(blob);
      const thumbnailKey = `${mediaId}:thumbnail`;
      await putWebBlob(mediaId, blob);
      await putWebBlob(thumbnailKey, thumbnailBlob);
      return upsertMedia({
        ...importing,
        mimeType: blob.type || importing.mimeType,
        localManagedUri: `${WEB_URI_PREFIX}${mediaId}`,
        thumbnailUri: `${WEB_URI_PREFIX}${thumbnailKey}`,
        storageStatus: 'stored_local',
      });
    }

    const mimeType = inferMimeType(sourceUri, input.mimeType);
    const extension = extensionForMimeType(mimeType);
    const directory = nativeDirectoryFor(input);
    const destination = `${directory}${mediaId}.${extension}`;
    await ensureDirectory(directory);

    if (sourceUri.startsWith('data:')) {
      const base64 = dataUriToBase64(sourceUri);
      if (!base64) throw new Error('The selected image data could not be decoded.');
      await FileSystem.writeAsStringAsync(destination, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } else if (isRemoteUri(sourceUri)) {
      await FileSystem.downloadAsync(sourceUri, destination);
    } else {
      await FileSystem.copyAsync({ from: sourceUri, to: destination });
    }

    await assertNativeFile(destination);
    const thumbnailUri = await createNativeThumbnail(destination, directory, mediaId);
    return upsertMedia({
      ...importing,
      localManagedUri: destination,
      thumbnailUri: thumbnailUri ?? destination,
      storageStatus: 'stored_local',
    });
  } catch (error) {
    await upsertMedia({
      ...importing,
      storageStatus: 'failed',
    });
    throw error;
  }
}

async function resolveManagedMediaRecordUri(
  mediaId?: string,
  fallbackUri?: string,
  variant: 'original' | 'thumbnail' = 'original',
): Promise<string | undefined> {
  if (!mediaId) return fallbackUri;

  const record = await getManagedMediaById(mediaId);
  if (!record) return fallbackUri;

  const preferredUri = variant === 'thumbnail'
    ? record.thumbnailUri ?? record.localManagedUri
    : record.localManagedUri ?? record.thumbnailUri;

  if (Platform.OS === 'web') {
    const webKey = webKeyFromManagedUri(preferredUri) ?? mediaId;
    const blob = await getWebBlob(webKey);
    if (blob) return URL.createObjectURL(blob);

    if (variant === 'thumbnail') {
      const originalBlob = await getWebBlob(mediaId);
      if (originalBlob) return URL.createObjectURL(originalBlob);
    }

    return record.remoteUrl ?? fallbackUri;
  }

  if (preferredUri) {
    const info = await FileSystem.getInfoAsync(preferredUri);
    if (info.exists) return preferredUri;
  }

  if (variant === 'thumbnail' && record.localManagedUri) {
    const info = await FileSystem.getInfoAsync(record.localManagedUri);
    if (info.exists) return record.localManagedUri;
  }

  return record.remoteUrl ?? fallbackUri;
}

export async function resolveManagedMediaUri(
  mediaId?: string,
  fallbackUri?: string,
): Promise<string | undefined> {
  return resolveManagedMediaRecordUri(mediaId, fallbackUri, 'original');
}

export async function resolveManagedMediaThumbnailUri(
  mediaId?: string,
  fallbackUri?: string,
): Promise<string | undefined> {
  return resolveManagedMediaRecordUri(mediaId, fallbackUri, 'thumbnail');
}

export async function deleteManagedMedia(mediaId?: string): Promise<void> {
  if (!mediaId) return;
  const records = await getStoredMedia();
  const record = records.find((item) => item.id === mediaId);

  if (Platform.OS === 'web') {
    await deleteWebBlob(mediaId);
    const thumbnailKey = webKeyFromManagedUri(record?.thumbnailUri);
    if (thumbnailKey && thumbnailKey !== mediaId) {
      await deleteWebBlob(thumbnailKey);
    }
  } else {
    const uris = [record?.localManagedUri, record?.thumbnailUri]
      .filter((uri, index, all): uri is string => Boolean(uri) && all.indexOf(uri) === index);

    await Promise.all(uris.map((uri) => (
      FileSystem.deleteAsync(uri, { idempotent: true })
    )));
  }

  await setStoredMedia(records.filter((item) => item.id !== mediaId));
}

export async function verifyManagedMedia(mediaId?: string): Promise<boolean> {
  if (!mediaId) return false;
  const record = await getManagedMediaById(mediaId);
  if (!record) return false;

  if (Platform.OS === 'web') {
    return Boolean(await getWebBlob(mediaId));
  }

  if (!record.localManagedUri) return false;
  const info = await FileSystem.getInfoAsync(record.localManagedUri);
  return info.exists;
}
