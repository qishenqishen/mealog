import { getManagedMediaById, getManagedOriginalBlob } from '../media/managedMedia';
import type { MealEntry } from '../types';

export const SLOW_MAIL_GUEST_KEY = /^[A-Za-z0-9_-]{32}$/;

const MAILBOX_KEY = '@mealogue/slowMailKey';
const API = '/api/slow-mail';
const PHOTO_LIMIT = 12 * 1024 * 1024;
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export interface SlowLetter {
  id: string;
  senderName: string;
  recipientName: string;
  text: string;
  month: string;
  releaseAt: string;
  photos: { type: string }[];
  guestKey?: string;
}

export interface SlowMailbox {
  address: string;
  remaining: number;
  releaseAt: string;
  incoming: SlowLetter[];
  outgoing: SlowLetter[];
}

async function key(): Promise<string> {
  const readOrCreate = () => {
    const stored = localStorage.getItem(MAILBOX_KEY);
    if (stored && /^[a-f0-9]{64}$/.test(stored)) return stored;
    const created = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(MAILBOX_KEY, created);
    return created;
  };
  try {
    return navigator.locks ? await navigator.locks.request(MAILBOX_KEY, readOrCreate) : readOrCreate();
  } catch {
    throw new Error('mailbox_storage');
  }
}

async function request(path = '', body?: FormData, guestKey?: string): Promise<Response> {
  const response = await fetch(API + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + (guestKey ?? await key()) },
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    body,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.code || 'unavailable');
  }
  return response;
}

export async function getSlowMailbox(): Promise<SlowMailbox> {
  return (await request()).json();
}

export async function getSlowPhoto(id: string, index: number): Promise<Blob> {
  return (await request('/' + encodeURIComponent(id) + '/photos/' + index)).blob();
}

export function slowMailGuestUrl(guestKey: string, locale: 'en' | 'zh'): string {
  const url = new URL('/letter', window.location.origin);
  url.hash = `${locale}.${guestKey}`;
  return url.href;
}

export interface SlowGuestLetter {
  releaseAt: string;
  letter: SlowLetter | null;
}

export async function getSlowGuestLetter(guestKey: string): Promise<SlowGuestLetter> {
  return (await request('/guest', undefined, guestKey)).json();
}

export async function getSlowGuestPhoto(guestKey: string, index: number): Promise<Blob> {
  return (await request('/guest/photos/' + index, undefined, guestKey)).blob();
}

export async function queueSlowLetter(input: {
  recipient?: string;
  senderName: string;
  recipientName: string;
  text: string;
  month: string;
  requestId: string;
  releaseAt: string;
  photos: MealEntry[];
}): Promise<SlowLetter> {
  const { photos, ...fields } = input;
  if (photos.length < 1 || photos.length > 3) throw new Error('invalid_letter');
  const body = new FormData();
  for (const [field, value] of Object.entries(fields)) {
    if (value !== undefined) body.set(field, value);
  }
  let size = 0;
  for (const photo of photos) {
    const original = await getManagedMediaById(photo.photoMediaId);
    if (!original || photo.origin === 'sample') throw new Error('original_missing');
    const blob = await getManagedOriginalBlob(original).catch(() => { throw new Error('original_missing'); });
    const type = PHOTO_TYPES.has(blob.type) ? blob.type : original.mimeType;
    if (!PHOTO_TYPES.has(type)) throw new Error('photo_format');
    size += blob.size;
    if (size > PHOTO_LIMIT) throw new Error('photo_too_large');
    body.append('photo', blob.type === type ? blob : blob.slice(0, blob.size, type), 'photo');
  }
  const result = await (await request('', body)).json();
  return result.letter;
}

export function slowMailError(error: unknown, zh: boolean): string {
  const labels: Record<string, [string, string]> = {
    mailbox_storage: ['无法保存信箱，请允许浏览器保存本站数据。', 'Allow this browser to save site data to use your mailbox.'],
    original_missing: ['找不到所选照片的原件。请重新选择照片。', 'The original photo is no longer available. Choose another photo.'],
    photo_format: ['请选择 JPG、PNG、WebP 或 GIF 原图。', 'Choose JPG, PNG, WebP, or GIF originals.'],
    unsupported_photo: ['所选照片格式不匹配，请换一张原图。', 'This photo is not in a supported image format. Choose a different original.'],
    photo_too_large: ['所选原图合计不能超过 12 MB。', 'Choose originals totaling no more than 12 MB.'],
    body_too_large: ['所选原图合计不能超过 12 MB。', 'Choose originals totaling no more than 12 MB.'],
    recipient_not_found: ['找不到这个收信地址。请和对方确认。', 'Mailbox not found. Check the address with your recipient.'],
    self_recipient: ['请填写对方的收信地址。', 'Enter the other person’s mailing address.'],
    monthly_limit: ['本月 3 封信已经寄满。', 'You have used all three letters for this month.'],
    invalid_letter: ['请检查署名、信件内容与照片。', 'Check the names, letter, and photos.'],
    release_changed: ['已进入新的寄送月份，请确认更新后的寄出时间。', 'A new mailing month has begun. Confirm the updated mailing time.'],
    upload_limit: ['今天提交的次数已达上限，请明天再试。', 'You have reached today’s submission limit. Try again tomorrow.'],
    mailbox_capacity: ['慢递信箱的容量已满，请稍后再试。', 'Slow mail has reached its storage limit. Try again later.'],
  };
  const fallback = ['暂时无法连接慢递信箱，请重试。', 'Slow mail is temporarily unavailable. Please try again.'];
  return (labels[error instanceof Error ? error.message : ''] || fallback)[zh ? 0 : 1];
}
