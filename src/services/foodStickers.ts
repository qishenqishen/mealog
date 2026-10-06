import { trackEvent } from '../product/store';
import { Platform } from 'react-native';
import type { MealEntry } from '../types';
import { saveMealSticker } from '../storage';

let worker: Worker | undefined;
let busy = false;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function stopWorker() { worker?.terminate(); worker = undefined; }

/** Runs in a local Web Worker; no photograph is sent to a server. */
export async function createMealSticker(meal: MealEntry, onProgress?: (message: string) => void, cutoutUri?: string): Promise<void> {
  if (Platform.OS !== 'web' || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    throw new Error('Please open Mealog in a recent Safari or Chrome browser to make a sticker.');
  }
  if (!meal.photoUri) throw new Error('Add a meal photo first.');
  // ponytail: one foreground model at a time limits mobile memory; queue only if parallel processing is needed.
  if (busy) throw new Error('Another sticker is being made. Please try again shortly.');
  busy = true;
  const started = Date.now();
  clearTimeout(idleTimer);
  try {
    onProgress?.('Preparing the photo…');
    const response = await fetch(cutoutUri ?? meal.photoThumbnailUri ?? meal.photoUri);
    if (!response.ok) throw new Error('The original photo could not be read.');
    const photo = await response.blob();
    if (!photo.size || photo.size > 30 * 1024 * 1024) throw new Error('Choose a photo smaller than 30 MB.');
    worker ??= new Worker('/stickers/food-sticker-worker.js', { type: 'module' });
    const result = await new Promise<Blob>((resolve, reject) => {
      const timer = setTimeout(() => {
        stopWorker(); reject(new Error('Making the sticker took too long. Please retry with a smaller photo.'));
      }, 120000);
      worker!.onmessage = ({ data }) => {
        if (data.progress) { onProgress?.(data.progress); return; }
        clearTimeout(timer);
        if (data.error || !(data.blob instanceof Blob)) reject(new Error(data.error || 'The sticker could not be made.'));
        else resolve(data.blob);
      };
      worker!.onerror = () => {
        clearTimeout(timer); stopWorker();
        reject(new Error('The sticker tools could not be loaded. Check your connection and try again.'));
      };
      worker!.postMessage({ blob: photo, requireTransparent: Boolean(cutoutUri) });
    });
    onProgress?.('Saving the sticker…');
    const uri = URL.createObjectURL(result);
    try { await saveMealSticker(meal, uri); }
    finally { URL.revokeObjectURL(uri); }
    await trackEvent('sticker_succeeded', undefined, Date.now() - started);
  } catch (error) {
    await trackEvent('sticker_failed', undefined, Date.now() - started); throw error;
  } finally {
    busy = false;
    idleTimer = setTimeout(stopWorker, 45000);
  }
}
