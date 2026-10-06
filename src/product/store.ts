import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, mutateProductList } from '../storage';
import { generateId } from '../utils/id';
import type { Narrative } from '../insights/contract';
import type { ReflectionPeriod } from './memory';

export interface FreeMemory { id: string; title: string; text: string; date: string; personIds: string[]; createdAt: string; updatedAt: string }
export interface MemoryCard { id: string; scope: 'personal' | 'sample'; period: ReflectionPeriod; start: string; end: string; personId?: string; narrative: Narrative; generatedAt: string; feedback: Record<number, 'yes' | 'no'>; feedbackNotes?: Record<number, string> }
export interface ProductEvent { id: string; type: 'record_saved' | 'revisit' | 'ai_requested' | 'ai_succeeded' | 'ai_failed' | 'ai_feedback' | 'import_saved' | 'interest' | 'sticker_succeeded' | 'sticker_failed'; at: string; value?: number; durationMs?: number }
export interface ProductPreferences { localOnlyAI: boolean; redact: boolean; analytics: boolean }
export async function readList<T>(key: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(key); if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('Saved data is unreadable');
  return value as T[];
}
const mutate = mutateProductList;
export const getFreeMemories = () => readList<FreeMemory>(STORAGE_KEYS.freeMemories);
export async function saveFreeMemory(entry: FreeMemory) {
  if (!entry.id || !entry.title.trim() || !entry.text.trim() || entry.title.length > 120 || entry.text.length > 4000 || (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || !Number.isFinite(Date.parse(`${entry.date}T12:00:00Z`)) || new Date(`${entry.date}T12:00:00Z`).toISOString().slice(0, 10) !== entry.date)) throw new Error('Invalid memory');
  await mutate<FreeMemory>(STORAGE_KEYS.freeMemories, items => [entry, ...items.filter(item => item.id !== entry.id)]);
}
export const getMemoryCards = () => readList<MemoryCard>(STORAGE_KEYS.memoryCards);
export const saveMemoryCard = (entry: MemoryCard) => mutate<MemoryCard>(STORAGE_KEYS.memoryCards, items => [entry, ...items.filter(item => item.id !== entry.id)]);
export async function feedbackCard(id: string, index: number, value: 'yes' | 'no', note = '') {
  if (!Number.isInteger(index) || index < 0 || note.length > 500) throw new Error('Invalid feedback');
  await mutate<MemoryCard>(STORAGE_KEYS.memoryCards, items => items.map(item => item.id === id ? { ...item, feedback: { ...item.feedback, [index]: value }, feedbackNotes: { ...item.feedbackNotes, [index]: note } } : item));
  await trackEvent('ai_feedback', value === 'yes' ? 1 : 0);
}
export async function getPreferences(): Promise<ProductPreferences> {
  const [saved] = await readList<ProductPreferences>(STORAGE_KEYS.productPreferences);
  return { localOnlyAI: saved?.localOnlyAI ?? false, redact: saved?.redact ?? true, analytics: saved?.analytics ?? false };
}
export const savePreferences = (value: ProductPreferences) => mutate(STORAGE_KEYS.productPreferences, () => [value]);
export const getProductEvents = () => readList<ProductEvent>(STORAGE_KEYS.productEvents);
export async function trackEvent(type: ProductEvent['type'], value?: number, durationMs?: number) {
  try {
    if (!(await getPreferences()).analytics) return;
    await mutate<ProductEvent>(STORAGE_KEYS.productEvents, items => [...items, { id: generateId(), type, at: new Date().toISOString(), value, durationMs }].slice(-10000));
  } catch { /* Recording never fails because optional measurement failed. */ }
}
