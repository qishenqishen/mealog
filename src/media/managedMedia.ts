import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { Image as NativeImage, Platform } from 'react-native';

import type { ManagedMedia, MediaOwnerType, MediaStorageStatus } from '../types';
import { generateId } from '../utils/id';

const MANAGED_MEDIA_KEY = '@mealogue/managedMedia';
const WEB_DB_NAME = 'mealog-managed-media';
const WEB_DB_VERSION = 1;
const WEB_STORE_NAME = 'media-blobs';
const WEB_URI_PREFIX = 'indexeddb://mealog-media/';
const NATIVE_MEDIA_ROOT = 'media';
const objectUrls = new Map<string, Promise<string | undefined>>();
const deletingWebKeys = new Set<string>();
let mediaWrite: Promise<unknown> = Promise.resolve();

function serializeMediaWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = mediaWrite.then(operation);
  mediaWrite = result.catch(() => undefined);
  return result;
}

function mediaError(action: string, error: unknown): Error {
  return new Error(`${action} ${error instanceof Error ? error.message : String(error)}`);
}

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
    if (!Array.isArray(parsed)) throw new Error('Expected a media list.');
    return parsed.map(normalizeManagedMedia).filter((item): item is ManagedMedia => item !== null);
  } catch {
    throw new Error('The saved media index could not be read.');
  }
}

async function setStoredMedia(items: ManagedMedia[]): Promise<void> {
  await AsyncStorage.setItem(MANAGED_MEDIA_KEY, JSON.stringify(items));
}

async function upsertMedia(record: ManagedMedia): Promise<ManagedMedia> {
  return serializeMediaWrite(async () => {
    const records = await getStoredMedia();
    const index = records.findIndex((item) => item.id === record.id);
    if (index >= 0) records[index] = record;
    else records.push(record);
    await setStoredMedia(records);
    return record;
  });
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
  return `${documentRoot}${NATIVE_MEDIA_ROOT}/${ownerFolder(input.ownerType, encodeURIComponent(input.ownerId))}/`;
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
  if (!info.exists || info.isDirectory || !info.size || info.size <= 0) {
    throw new Error('The image file is missing or empty.');
  }
}

async function nativeImageSize(uri: string): Promise<{ width: number; height: number }> {
  await assertNativeFile(uri);
  const size = await NativeImage.getSize(uri);
  if (!(size.width > 0 && size.height > 0)) throw new Error('The image could not be decoded.');
  return size;
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
    request.onblocked = () => reject(new Error('The media database is blocked by another browser tab.'));
  });
}

async function putWebBlob(id: string, blob: Blob): Promise<void> {
  const db = await openWebDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(WEB_STORE_NAME, 'readwrite');
      transaction.objectStore(WEB_STORE_NAME).put(blob, id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not store media blob.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Storing the image was interrupted.'));
    });
  } finally { db.close(); }
}

async function getWebBlob(id: string): Promise<Blob | undefined> {
  const db = await openWebDatabase();
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const transaction = db.transaction(WEB_STORE_NAME, 'readonly');
      const request = transaction.objectStore(WEB_STORE_NAME).get(id);
      transaction.oncomplete = () => resolve(request.result as Blob | undefined);
      request.onerror = () => reject(request.error ?? new Error('Could not read media blob.'));
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not read media blob.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Reading the image was interrupted.'));
    });
  } finally { db.close(); }
}

async function deleteWebBlob(id: string): Promise<void> {
  const db = await openWebDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(WEB_STORE_NAME, 'readwrite');
      transaction.objectStore(WEB_STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not delete media blob.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Deleting the image was interrupted.'));
    });
  } finally { db.close(); }
}

async function sourceUriToBlob(uri: string): Promise<Blob> {
  const key = webKeyFromManagedUri(uri);
  if (key) {
    const blob = await getWebBlob(key);
    if (!blob) throw new Error('The selected managed image is missing.');
    return blob;
  }
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('The selected image could not be read.');
  }
  return response.blob();
}

async function decodeWebImage(blob: Blob) {
  if (!(blob instanceof Blob) || blob.size <= 0) throw new Error('The selected image is empty.');
  if (blob.type && !blob.type.toLowerCase().startsWith('image/')) {
    throw new Error('The selected file is not an image.');
  }
  if (typeof createImageBitmap !== 'undefined') {
    const bitmap = await createImageBitmap(blob);
    if (!(bitmap.width > 0 && bitmap.height > 0)) {
      bitmap.close();
      throw new Error('The selected image could not be decoded.');
    }
    return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }
  if (typeof document === 'undefined') throw new Error('Image decoding is not available.');
  const uri = URL.createObjectURL(blob);
  try {
    const image = document.createElement('img');
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The selected image could not be decoded.'));
      image.src = uri;
    });
    if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) {
      throw new Error('The selected image could not be decoded.');
    }
    return { image, width: image.naturalWidth, height: image.naturalHeight, close: () => undefined };
  } finally { URL.revokeObjectURL(uri); }
}

async function createWebThumbnailBlob(blob: Blob) {
  const decoded = await decodeWebImage(blob);
  try {
    const scale = Math.min(1, 520 / Math.max(decoded.width, decoded.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The image thumbnail could not be created.');
    context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);

    const thumbnail = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.72);
    });

    if (!thumbnail?.size) throw new Error('The image thumbnail is empty.');
    return { blob: thumbnail, width: decoded.width, height: decoded.height };
  } finally { decoded.close(); }
}

async function createNativeThumbnail(
  sourceUri: string,
  directory: string,
  mediaId: string,
  size: { width: number; height: number },
): Promise<string> {
  const thumbnailDirectory = `${directory}thumbnails/`;
  await ensureDirectory(thumbnailDirectory);
  const scale = Math.min(1, 520 / Math.max(size.width, size.height));
  const result = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{
      resize: {
        width: Math.max(1, Math.round(size.width * scale)),
        height: Math.max(1, Math.round(size.height * scale)),
      }
    }],
    { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG },
  );
  const destination = `${thumbnailDirectory}${mediaId}.jpg`;
  try {
    await FileSystem.copyAsync({ from: result.uri, to: destination });
    const thumbnailSize = await nativeImageSize(destination);
    if (Math.max(thumbnailSize.width, thumbnailSize.height) > 520) {
      throw new Error('The image thumbnail is too large.');
    }
  } finally {
    if (result.uri !== sourceUri) await FileSystem.deleteAsync(result.uri, { idempotent: true });
  }
  return destination;
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

  if (input.existingMediaId) return assertManagedMediaReadable(input.existingMediaId);

  const mediaId = generateId();
  const importing = makeRecord(input, mediaId, 'importing');
  const createdUris: string[] = [];
  let recordWriteAttempted = false;

  try {
    if (Platform.OS === 'web') {
      const blob = await sourceUriToBlob(sourceUri);
      const thumbnail = await createWebThumbnailBlob(blob);
      const thumbnailKey = `${mediaId}:thumbnail`;
      await putWebBlob(mediaId, blob);
      await putWebBlob(thumbnailKey, thumbnail.blob);
      const persisted = await getWebBlob(mediaId);
      if (!persisted || persisted.size !== blob.size) throw new Error('The image copy could not be verified.');
      const decoded = await decodeWebImage(persisted);
      decoded.close();
      recordWriteAttempted = true;
      return await upsertMedia({
        ...importing,
        mimeType: blob.type || importing.mimeType,
        width: thumbnail.width,
        height: thumbnail.height,
        localManagedUri: `${WEB_URI_PREFIX}${mediaId}`,
        thumbnailUri: `${WEB_URI_PREFIX}${thumbnailKey}`,
        storageStatus: 'stored_local',
      });
    }

    const mimeType = inferMimeType(sourceUri, input.mimeType);
    if (!mimeType.toLowerCase().startsWith('image/')) throw new Error('The selected file is not an image.');
    const extension = extensionForMimeType(mimeType);
    const directory = nativeDirectoryFor(input);
    const destination = `${directory}${mediaId}.${extension}`;
    createdUris.push(destination, `${directory}thumbnails/${mediaId}.jpg`);
    await ensureDirectory(directory);

    if (sourceUri.startsWith('data:')) {
      const base64 = dataUriToBase64(sourceUri);
      if (!base64) throw new Error('The selected image data could not be decoded.');
      await FileSystem.writeAsStringAsync(destination, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } else if (isRemoteUri(sourceUri)) {
      const response = await FileSystem.downloadAsync(sourceUri, destination);
      if (response.status < 200 || response.status >= 300) throw new Error('The selected image could not be downloaded.');
    } else {
      await FileSystem.copyAsync({ from: sourceUri, to: destination });
    }

    const size = await nativeImageSize(destination);
    const thumbnailUri = await createNativeThumbnail(destination, directory, mediaId, size);
    recordWriteAttempted = true;
    return await upsertMedia({
      ...importing,
      ...size,
      localManagedUri: destination,
      thumbnailUri,
      storageStatus: 'stored_local',
    });
  } catch (error) {
    const cleanup = await Promise.allSettled([
      ...(Platform.OS === 'web'
        ? [deleteWebBlob(mediaId), deleteWebBlob(`${mediaId}:thumbnail`)]
        : createdUris.map((uri) => FileSystem.deleteAsync(uri, { idempotent: true }))),
      ...(recordWriteAttempted ? [serializeMediaWrite(async () => {
        await setStoredMedia((await getStoredMedia()).filter((record) => record.id !== mediaId));
      })] : []),
    ]);
    const incomplete = cleanup.some((result) => result.status === 'rejected');
    throw mediaError(`The image could not be saved.${incomplete ? ' Its incomplete copy could not be fully removed.' : ''}`, error);
  }
}

function cachedWebUri(key: string): Promise<string | undefined> {
  if (deletingWebKeys.has(key)) return Promise.resolve(undefined);
  const existing = objectUrls.get(key);
  if (existing) return existing;
  const pending = getWebBlob(key).then((blob) => {
    if (!blob?.size || deletingWebKeys.has(key)) {
      if (objectUrls.get(key) === pending) objectUrls.delete(key);
      return undefined;
    }
    return URL.createObjectURL(blob);
  }).catch((error) => {
    if (objectUrls.get(key) === pending) objectUrls.delete(key);
    throw mediaError('The saved image could not be read.', error);
  });
  objectUrls.set(key, pending);
  return pending;
}

async function revokeCachedWebUri(key: string): Promise<void> {
  const pending = objectUrls.get(key);
  objectUrls.delete(key);
  const uri = await pending?.catch(() => undefined);
  if (uri) URL.revokeObjectURL(uri);
}

async function resolveManagedMediaRecordUri(
  mediaId?: string,
  fallbackUri?: string,
  variant: 'original' | 'thumbnail' = 'original',
): Promise<string | undefined> {
  if (!mediaId) return fallbackUri;

  const record = await getManagedMediaById(mediaId);
  if (!record) return undefined;

  const preferredUri = variant === 'thumbnail'
    ? record.thumbnailUri ?? record.localManagedUri
    : record.localManagedUri ?? record.thumbnailUri;

  if (Platform.OS === 'web') {
    const webKey = webKeyFromManagedUri(preferredUri) ?? mediaId;
    const uri = await cachedWebUri(webKey);
    if (uri) return uri;

    if (variant === 'thumbnail') {
      const originalUri = await cachedWebUri(mediaId);
      if (originalUri) return originalUri;
    }

    return record.remoteUrl;
  }

  if (preferredUri) {
    const info = await FileSystem.getInfoAsync(preferredUri);
    if (info.exists) return preferredUri;
  }

  if (variant === 'thumbnail' && record.localManagedUri) {
    const info = await FileSystem.getInfoAsync(record.localManagedUri);
    if (info.exists) return record.localManagedUri;
  }

  return record.remoteUrl;
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
  return serializeMediaWrite(async () => {
    const records = await getStoredMedia();
    const record = records.find((item) => item.id === mediaId);

    if (Platform.OS === 'web') {
      const thumbnailKey = webKeyFromManagedUri(record?.thumbnailUri) ?? `${mediaId}:thumbnail`;
      const keys = [...new Set([mediaId, thumbnailKey])];
      keys.forEach((key) => deletingWebKeys.add(key));
      try {
        for (const key of keys) {
          await revokeCachedWebUri(key);
          await deleteWebBlob(key);
        }
      } finally {
        keys.forEach((key) => deletingWebKeys.delete(key));
      }
    } else {
      const uris = [record?.localManagedUri, record?.thumbnailUri]
        .filter((uri, index, all): uri is string => isManagedMediaUri(uri) && all.indexOf(uri) === index);

      await Promise.all(uris.map((uri) => (
        FileSystem.deleteAsync(uri, { idempotent: true })
      )));
    }

    await setStoredMedia(records.filter((item) => item.id !== mediaId));
  }).catch((error) => { throw mediaError('The saved image could not be deleted.', error); });
}

export async function assertManagedMediaReadable(mediaId: string): Promise<ManagedMedia> {
  const record = await getManagedMediaById(mediaId);
  if (!record || !isManagedMediaUri(record.localManagedUri)
    || !['stored_local', 'uploaded'].includes(record.storageStatus)) {
    throw new Error('The saved image is missing. Please select the image again.');
  }
  try {
    if (Platform.OS === 'web') {
      const key = webKeyFromManagedUri(record.localManagedUri);
      const blob = key ? await getWebBlob(key) : undefined;
      if (!blob) throw new Error('The image copy is missing.');
      const decoded = await decodeWebImage(blob);
      decoded.close();
    } else {
      await nativeImageSize(record.localManagedUri!);
    }
    return record;
  } catch (error) { throw mediaError('The saved image could not be verified.', error); }
}

export async function verifyManagedMedia(mediaId?: string): Promise<boolean> {
  if (!mediaId) return false;
  try {
    await assertManagedMediaReadable(mediaId);
    return true;
  } catch { return false; }
}
