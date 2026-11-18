import { json } from './handler';
import { parseSlowMailStationery, type SlowMailStationery } from '../src/product/slowMailStationery';

const ADDRESS = /^[a-f0-9]{64}$/;
const GUEST_PATH = /^\/api\/slow-mail\/guest(?:\/photos\/([0-2]))?$/;
const LETTER_ID = '[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}';
const PHOTO_PATH = new RegExp(`^/api/slow-mail/(${LETTER_ID})/photos/([0-2])$`);
const MONTHLY_LIMIT = 3;
const PHOTO_LIMIT = 12 * 1024 * 1024;
const BODY_LIMIT = PHOTO_LIMIT + 64 * 1024;
const CHUNK_SIZE = 1024 * 1024;
const FIELDS = ['recipient', 'senderName', 'recipientName', 'text', 'month', 'requestId', 'releaseAt', 'stationery'];

type MailStorage = Pick<DurableObjectStorage, 'sql' | 'transactionSync'>;
type Letter = {
  id: string;
  senderName: string;
  recipientName: string;
  text: string;
  month: string;
  releaseAt: string;
  photos: { type: string }[];
  guestKey?: string;
  stationery?: SlowMailStationery;
};
type LetterRow = Omit<Letter, 'releaseAt' | 'photos' | 'stationery'> & { releaseAt: number; photos: string; stationery: string | null };
const LETTER_COLUMNS = 'id, senderName, recipientName, text, month, releaseAt, photos, stationery';
const LETTER_SOURCE = 'FROM letters LEFT JOIN letter_stationery ON letter_stationery.letterId = letters.id';
const SENT_LETTERS = `SELECT ${LETTER_COLUMNS}, guest_letters.key AS guestKey ${LETTER_SOURCE}
  LEFT JOIN guest_letters ON guest_letters.letterId = letters.id`;

class MailError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

export function initializeMail(sql: SqlStorage) {
  sql.exec('CREATE TABLE IF NOT EXISTS inboxes (address TEXT PRIMARY KEY)');
  sql.exec(`CREATE TABLE IF NOT EXISTS letters (
    id TEXT PRIMARY KEY, sender TEXT NOT NULL, recipient TEXT NOT NULL, requestId TEXT NOT NULL,
    senderName TEXT NOT NULL, recipientName TEXT NOT NULL, text TEXT NOT NULL, month TEXT NOT NULL,
    releaseAt INTEGER NOT NULL, photos TEXT NOT NULL, bytes INTEGER NOT NULL, UNIQUE(sender, requestId)
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS guest_letters (
    letterId TEXT PRIMARY KEY REFERENCES letters(id), key TEXT NOT NULL UNIQUE
  )`);
  sql.exec(`CREATE TABLE IF NOT EXISTS letter_stationery (
    letterId TEXT PRIMARY KEY REFERENCES letters(id), stationery TEXT NOT NULL
  )`);
  sql.exec('CREATE INDEX IF NOT EXISTS mail_sender_release ON letters (sender, releaseAt)');
  sql.exec('CREATE INDEX IF NOT EXISTS mail_recipient_release ON letters (recipient, releaseAt)');
  sql.exec(`CREATE TABLE IF NOT EXISTS mail_photo_chunks (
    letterId TEXT NOT NULL, photoIndex INTEGER NOT NULL, part INTEGER NOT NULL, bytes BLOB NOT NULL,
    PRIMARY KEY (letterId, photoIndex, part), FOREIGN KEY (letterId) REFERENCES letters(id)
  )`);
  sql.exec('CREATE TABLE IF NOT EXISTS mail_rate (day TEXT NOT NULL, bucket TEXT NOT NULL, attempts INTEGER NOT NULL, PRIMARY KEY(day, bucket))');
  sql.exec('CREATE TABLE IF NOT EXISTS mail_privacy (id INTEGER PRIMARY KEY CHECK(id = 1), salt TEXT NOT NULL)');
  if (!sql.exec('SELECT id FROM mail_privacy WHERE id = 1').toArray().length) {
    sql.exec('INSERT INTO mail_privacy (id, salt) VALUES (1, ?)', crypto.randomUUID());
  }
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function monthEnd(now: number) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

function decodeStationery(encoded: string | null) {
  if (!encoded) return undefined;
  try { return parseSlowMailStationery(JSON.parse(encoded)); }
  catch { return undefined; }
}

function letterView(row: LetterRow): Letter {
  const { guestKey, stationery: encodedStationery, ...letter } = row;
  const stationery = decodeStationery(encodedStationery);
  return {
    ...letter,
    releaseAt: new Date(row.releaseAt).toISOString(),
    photos: JSON.parse(row.photos) as Letter['photos'],
    ...(guestKey ? { guestKey } : {}),
    ...(stationery ? { stationery } : {}),
  };
}

function createGuestKey(sql: SqlStorage, letterId: string) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    const key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_');
    const row = sql.exec<{ key: string }>('INSERT INTO guest_letters VALUES (?, ?) ON CONFLICT(key) DO NOTHING RETURNING key', letterId, key).toArray()[0];
    if (row) return row.key;
  }
  throw new MailError('service_unavailable', 503);
}

function letterPhoto(sql: SqlStorage, id: string, index: number, photos: Letter['photos']) {
  const entry = photos[index];
  if (!entry) throw new MailError('not_found', 404);
  const rows = sql.exec<{ bytes: ArrayBuffer }>('SELECT bytes FROM mail_photo_chunks WHERE letterId = ? AND photoIndex = ? ORDER BY part', id, index).toArray();
  if (!rows.length) throw new MailError('not_found', 404);
  return new Response(new Blob(rows.map(row => row.bytes)), { headers: {
    'Content-Type': entry.type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
  } });
}

function openGuestLetter(request: Request, sql: SqlStorage, now: number, photoIndex?: string) {
  if (request.method !== 'GET') return json({ error: { code: 'method_not_allowed' } }, 405, { Allow: 'GET' });
  const key = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{32})$/)?.[1];
  if (!key) throw new MailError('not_found', 404);
  const row = sql.exec<LetterRow>(`SELECT ${LETTER_COLUMNS} ${LETTER_SOURCE}
    JOIN guest_letters ON guest_letters.letterId = letters.id WHERE guest_letters.key = ?`, key).toArray()[0];
  if (!row) throw new MailError('not_found', 404);
  if (photoIndex !== undefined) {
    if (row.releaseAt > now) throw new MailError('not_found', 404);
    return letterPhoto(sql, row.id, Number(photoIndex), JSON.parse(row.photos) as Letter['photos']);
  }
  const releaseAt = new Date(row.releaseAt).toISOString();
  if (row.releaseAt <= now) return json({ releaseAt, letter: letterView(row) });
  const stationery = decodeStationery(row.stationery);
  return json({ releaseAt, letter: null, ...(stationery ? { stationery } : {}) });
}

function remaining(sql: SqlStorage, address: string, releaseAt: number) {
  const { count } = sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM letters WHERE sender = ? AND releaseAt = ?', address, releaseAt).one();
  return MONTHLY_LIMIT - count;
}

function hasInbox(sql: SqlStorage, address: string) {
  return sql.exec('SELECT address FROM inboxes WHERE address = ?', address).toArray().length > 0;
}

async function networkBucket(request: Request, sql: SqlStorage, action: 'register' | 'upload') {
  const { salt } = sql.exec<{ salt: string }>('SELECT salt FROM mail_privacy WHERE id = 1').one();
  return digest(`${salt}:${action}:${request.headers.get('CF-Connecting-IP') || 'local'}`);
}

function takeNetworkAttempt(sql: SqlStorage, bucket: string, now: number, max: number) {
  const day = new Date(now).toISOString().slice(0, 10);
  const row = sql.exec<{ attempts: number }>('SELECT attempts FROM mail_rate WHERE day = ? AND bucket = ?', day, bucket).toArray()[0];
  if (row && row.attempts >= max) throw new MailError('upload_limit', 429);
  sql.exec('DELETE FROM mail_rate WHERE day < ?', day);
  sql.exec('INSERT INTO mail_rate VALUES (?, ?, 1) ON CONFLICT(day, bucket) DO UPDATE SET attempts = attempts + 1', day, bucket);
}

async function readLetterForm(request: Request) {
  const type = request.headers.get('Content-Type') || '';
  if (!/^multipart\/form-data\s*;/i.test(type) || (request.headers.get('Content-Encoding') || 'identity') !== 'identity') {
    throw new MailError('unsupported_media_type', 415);
  }
  const declared = request.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > BODY_LIMIT)) throw new MailError('body_too_large', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new MailError('invalid_letter', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > BODY_LIMIT) {
        void reader.cancel().catch(() => undefined);
        throw new MailError('body_too_large', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return await new Response(new Blob(chunks), { headers: { 'Content-Type': type } }).formData();
  } catch { throw new MailError('invalid_letter', 400); }
}

function requiredText(form: FormData, key: string, length: number) {
  const values = form.getAll(key);
  const value = values[0];
  if (values.length !== 1 || typeof value !== 'string' || !value.trim() || value.length > length) throw new MailError('invalid_letter', 400);
  return value.trim();
}

async function readPhotos(form: FormData) {
  const files = form.getAll('photo');
  if (files.length < 1 || files.length > 3 || !files.every(file => file instanceof File)) throw new MailError('invalid_letter', 400);
  if (files.reduce((total, file) => total + file.size, 0) > PHOTO_LIMIT) throw new MailError('photo_too_large', 413);
  const photos: { type: string; bytes: ArrayBuffer }[] = [];
  for (const file of files) {
    const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const magic = [
      ['image/jpeg', 0, [255, 216, 255]],
      ['image/png', 0, [137, 80, 78, 71, 13, 10, 26, 10]],
      ['image/gif', 0, [71, 73, 70, 56, 55, 97]],
      ['image/gif', 0, [71, 73, 70, 56, 57, 97]],
      ['image/webp', 0, [82, 73, 70, 70]],
      ['image/webp', 8, [87, 69, 66, 80]],
    ] as const;
    const signatures = magic.filter(([type]) => type === file.type);
    const matches = ([, offset, prefix]: typeof magic[number]) => prefix.every((byte, i) => head[offset + i] === byte);
    if (!signatures.length || (file.type === 'image/webp' ? !signatures.every(matches) : !signatures.some(matches))) {
      throw new MailError('unsupported_photo', 415);
    }
    photos.push({ type: file.type, bytes: await file.arrayBuffer() });
  }
  return photos;
}

export async function handleSlowMail(request: Request, storage: MailStorage, clock = Date.now): Promise<Response> {
  try {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if ((origin !== null && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site' || (request.method === 'POST' && origin !== url.origin)) {
      throw new MailError('origin_not_allowed', 403);
    }
    const { sql } = storage;
    const guest = url.pathname.match(GUEST_PATH);
    if (guest) return openGuestLetter(request, sql, clock(), guest[1]);
    const secret = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!secret) throw new MailError('unauthorized', 401);
    const address = await digest(secret);
    const photo = url.pathname.match(PHOTO_PATH);
    if (photo && request.method === 'GET') {
      const [, id, index] = photo;
      const row = sql.exec<{ photos: string }>('SELECT photos FROM letters WHERE id = ? AND (sender = ? OR (recipient = ? AND releaseAt <= ?))', id, address, address, clock()).toArray()[0];
      if (!row) throw new MailError('not_found', 404);
      return letterPhoto(sql, id, Number(index), JSON.parse(row.photos) as Letter['photos']);
    }
    if (url.pathname !== '/api/slow-mail') throw new MailError('not_found', 404);
    if (request.method === 'GET') {
      if (!hasInbox(sql, address)) {
        const bucket = await networkBucket(request, sql, 'register');
        storage.transactionSync(() => {
          if (hasInbox(sql, address)) return;
          if (sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM inboxes').one().count >= 10_000) throw new MailError('mailbox_capacity', 503);
          takeNetworkAttempt(sql, bucket, clock(), 24);
          sql.exec('INSERT INTO inboxes VALUES (?)', address);
        });
      }
      const now = clock();
      const releaseAt = monthEnd(now);
      const incoming = sql.exec<LetterRow>(`SELECT ${LETTER_COLUMNS} ${LETTER_SOURCE} WHERE recipient = ? AND releaseAt <= ? ORDER BY releaseAt DESC, letters.rowid DESC`, address, now);
      const outgoing = sql.exec<LetterRow>(`${SENT_LETTERS} WHERE sender = ? ORDER BY releaseAt DESC, letters.rowid DESC`, address);
      return json({ address, remaining: remaining(sql, address, releaseAt), releaseAt: new Date(releaseAt).toISOString(), incoming: incoming.toArray().map(letterView), outgoing: outgoing.toArray().map(letterView) });
    }
    if (request.method !== 'POST') return json({ error: { code: 'method_not_allowed' } }, 405, { Allow: 'GET, POST' });
    if (!hasInbox(sql, address)) throw new MailError('unauthorized', 401);
    const bucket = await networkBucket(request, sql, 'upload');
    storage.transactionSync(() => takeNetworkAttempt(sql, bucket, clock(), 12));
    const form = await readLetterForm(request);
    if ([...form.keys()].some(key => key !== 'photo' && !FIELDS.includes(key))) throw new MailError('invalid_letter', 400);
    const recipient = form.has('recipient') ? requiredText(form, 'recipient', 64) : '';
    const senderName = requiredText(form, 'senderName', 60);
    const recipientName = requiredText(form, 'recipientName', 60);
    const text = requiredText(form, 'text', 1200);
    const month = requiredText(form, 'month', 7);
    const requestId = requiredText(form, 'requestId', 36);
    const expectedRelease = requiredText(form, 'releaseAt', 24);
    const encodedStationery = form.has('stationery') ? requiredText(form, 'stationery', 128) : null;
    const stationery = decodeStationery(encodedStationery);
    if (recipient === address || (recipient !== '' && !ADDRESS.test(recipient)) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !new RegExp(`^${LETTER_ID}$`).test(requestId) || (encodedStationery && !stationery)) {
      throw new MailError('invalid_letter', 400);
    }
    const photos = await readPhotos(form);
    const bytes = photos.reduce((total, photo) => total + photo.bytes.byteLength, 0);
    const letter = storage.transactionSync(() => {
      const previous = sql.exec<LetterRow>(`${SENT_LETTERS} WHERE sender = ? AND requestId = ?`, address, requestId).toArray()[0];
      if (previous) return letterView(previous);
      const releaseAt = monthEnd(clock());
      if (new Date(releaseAt).toISOString() !== expectedRelease) throw new MailError('release_changed', 409);
      if (recipient && !hasInbox(sql, recipient)) throw new MailError('recipient_not_found', 404);
      if (remaining(sql, address, releaseAt) <= 0) throw new MailError('monthly_limit', 429);
      // shortcut: one bounded deployment mailbox, shard storage if the initial 512 MiB budget is reached.
      if (sql.databaseSize + bytes > 512 * 1024 * 1024 || sql.exec<{ count: number }>('SELECT COUNT(*) AS count FROM letters').one().count >= 5000) {
        throw new MailError('mailbox_capacity', 503);
      }
      const id = crypto.randomUUID();
      const attachments = photos.map(({ type }) => ({ type }));
      sql.exec('INSERT INTO letters VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', id, address, recipient, requestId, senderName, recipientName, text, month, releaseAt, JSON.stringify(attachments), bytes);
      if (stationery) sql.exec('INSERT INTO letter_stationery VALUES (?, ?)', id, JSON.stringify(stationery));
      photos.forEach((photo, index) => {
        for (let offset = 0; offset < photo.bytes.byteLength; offset += CHUNK_SIZE) {
          sql.exec('INSERT INTO mail_photo_chunks VALUES (?, ?, ?, ?)', id, index, offset / CHUNK_SIZE, photo.bytes.slice(offset, offset + CHUNK_SIZE));
        }
      });
      const guestKey = recipient ? undefined : createGuestKey(sql, id);
      return { id, senderName, recipientName, text, month, releaseAt: expectedRelease, photos: attachments, guestKey, stationery };
    });
    return json({ letter });
  } catch (error) {
    const known = error instanceof MailError ? error : new MailError('service_unavailable', 503);
    return json({ error: { code: known.code } }, known.status);
  }
}
