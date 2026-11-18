// Run with Node >=22.13 (built-in SQLite); uses the project's existing TypeScript.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: filename,
  }).outputText, filename);
};

const { validateInput, validateNarrative, validateReport, calculateMetrics, MODEL, PROVIDER, MAX_BODY_BYTES } = require('../src/insights/contract.ts');
const { handleMonthly, buildPrompt, MAX_PROMPT_BYTES, AI_TIMEOUT_MS } = require('./handler.ts');
const { initializeQuota, reserveQuota, IP_WINDOW_MS } = require('./quota.ts');
const { initializeMail, handleSlowMail } = require('./slowMail.ts');
const memory = new Map();
const storage = { getItem: async (key) => memory.get(key) ?? null, setItem: async (key, value) => { memory.set(key, value); }, removeItem: async (key) => { memory.delete(key); } };
const load = Module._load;
Module._load = function (id, ...args) {
  if (id === 'expo-location') return {};
  return id === '@react-native-async-storage/async-storage' ? { default: storage } : load.call(this, id, ...args);
};
const client = require('../src/insights/monthlyReport.ts');
const { resolveMealLocationForSave } = require('../src/services/mealMetadata.ts');
Module._load = load;

const meal = { id: 'meal-1', date: '2026-09-02', title: 'Lunch with soup', mealType: 'lunch', moodTags: ['peaceful'], companyTags: ['just-me'], note: 'A quiet lunch.', hasPhoto: true };
const input = { version: 1, month: '2026-09', locale: 'en', meals: [meal, { ...meal, id: 'meal-2', date: '2026-09-03', note: '', hasPhoto: false }] };
const narrative = { title: 'A pause at the table', observations: [{ text: 'Your note remembers a quiet lunch.', mealIds: ['meal-1'] }] };
function request(body = input, headers = {}) {
  return new Request('https://mealog.example/api/insights/monthly', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://mealog.example', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
}
function openQuota(filename) {
  const db = new DatabaseSync(filename);
  const sql = { get databaseSize() { return db.prepare('PRAGMA page_count').get().page_count * db.prepare('PRAGMA page_size').get().page_size; }, exec(query, ...params) {
    const rows = db.prepare(query).all(...params);
    return { toArray: () => rows, one: () => { assert.equal(rows.length, 1); return rows[0]; } };
  } };
  initializeQuota(sql);
  return { db, sql, transactionSync(callback) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = callback(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  } };
}

async function testSlowMail() {
  const storage = openQuota(':memory:');
  initializeMail(storage.sql);
  const base = 'https://mealog.example';
  const senderKey = 'a'.repeat(64), recipientKey = 'b'.repeat(64), strangerKey = 'c'.repeat(64);
  const releaseAt = '2026-12-01T00:00:00.000Z';
  let now = Date.parse('2026-11-30T23:59:59Z');
  const send = (path, auth, options = {}) => handleSlowMail(new Request(base + '/api/slow-mail' + path, {
    ...options,
    headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...options.headers },
  }), storage, () => now);
  const postHeaders = { Origin: base };
  const read = async (auth) => (await send('', auth)).json();
  const photoBytes = new Uint8Array(1024 * 1024 + 7).fill(127);
  photoBytes.set([255, 216, 255]);
  const form = (recipient, requestId = crypto.randomUUID(), release = releaseAt, photo = photoBytes) => {
    const fields = new FormData();
    const values = { senderName: 'Sender', recipientName: 'Recipient', text: 'The dumplings we made.', month: '2026-10', releaseAt: release, recipient, requestId };
    for (const [key, value] of Object.entries(values)) fields.set(key, value);
    fields.append('photo', new Blob([photo], { type: 'image/jpeg' }), 'original.jpg');
    return fields;
  };
  const post = (body) => send('', senderKey, { method: 'POST', headers: postHeaders, body });
  assert.equal((await send('', null)).status, 401);
  assert.equal((await send('', senderKey, { headers: { Origin: 'https://other.example' } })).status, 403);
  const sender = await read(senderKey), recipient = await read(recipientKey);
  assert.equal(sender.remaining, 3);
  assert.equal(sender.releaseAt, releaseAt);
  assert.notEqual(recipient.address, recipientKey);
  assert.equal((await read(recipient.address)).incoming.length, 0, 'Public address cannot authenticate as its owner');
  assert.equal((await send('', senderKey, { method: 'POST', body: form(recipient.address) })).status, 403);
  assert.equal((await post(form('d'.repeat(64)))).status, 404);
  assert.equal((await post(form(recipient.address, crypto.randomUUID(), '2026-11-01T00:00:00.000Z'))).status, 409);
  assert.equal((await post(form(recipient.address, crypto.randomUUID(), releaseAt, new Uint8Array([0, 0, 0])))).status, 415);
  const exec = storage.sql.exec;
  storage.sql.exec = (query, ...args) => {
    if (query.startsWith('INSERT INTO mail_photo_chunks') && args[2] === 1) throw new Error('write interrupted');
    return exec(query, ...args);
  };
  assert.equal((await post(form(recipient.address))).status, 503);
  storage.sql.exec = exec;
  assert.equal((await read(senderKey)).remaining, 3);
  assert.equal((await read(senderKey)).outgoing.length, 0);
  assert.equal(storage.sql.exec('SELECT COUNT(*) AS count FROM mail_photo_chunks').one().count, 0);
  const requestId = crypto.randomUUID();
  const initial = await post(form(recipient.address, requestId));
  assert.equal(initial.status, 200);
  const { letter } = await initial.json();
  assert.equal(letter.releaseAt, releaseAt);
  assert.equal(letter.month, '2026-10');
  const photoPath = `/${letter.id}/photos/0`;
  assert.equal((await read(senderKey)).outgoing.length, 1);
  assert.equal((await read(recipientKey)).incoming.length, 0);
  assert.equal((await send(photoPath, recipientKey)).status, 404);
  assert.equal((await send(photoPath, strangerKey)).status, 404);
  assert.equal((await send(photoPath, senderKey)).status, 200);
  const competing = await Promise.all(Array.from({ length: 3 }, () => post(form(recipient.address))));
  assert.equal(competing.filter(response => response.status === 200).length, 2);
  assert.equal(competing.filter(response => response.status === 429).length, 1);
  assert.equal((await read(senderKey)).remaining, 0);
  assert.equal((await read(recipientKey)).incoming.length, 0);
  now = Date.parse(releaseAt);
  const delivered = await read(recipientKey);
  assert.equal(delivered.incoming.length, 3);
  assert(delivered.incoming.some(item => item.id === letter.id));
  assert.equal((await read(senderKey)).remaining, 3);
  const existing = await post(form(recipient.address, requestId));
  assert.equal((await existing.json()).letter.id, letter.id, 'Retry across the month boundary does not create another letter');
  assert.equal((await read(senderKey)).remaining, 3);
  const image = await send(photoPath, recipientKey);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(image.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), photoBytes);
  assert.equal((await send(photoPath, recipient.address)).status, 404);
  assert.equal((await send(photoPath, strangerKey)).status, 404);
  const large = new Uint8Array(12 * 1024 * 1024 + 1);
  large.set([255, 216, 255]);
  assert.equal((await post(form(recipient.address, crypto.randomUUID(), releaseAt, large))).status, 413);
  assert.equal((await send('', senderKey, { method: 'POST', headers: { ...postHeaders, 'Content-Type': 'multipart/form-data; boundary=x' }, body: new Uint8Array(13 * 1024 * 1024) })).status, 413);
  storage.db.close();
}

async function main() {
  await testSlowMail();
  const gps = { source: 'gps', label: 'Old place', address: 'Old address', latitude: 34, longitude: -118 };
  assert.equal(resolveMealLocationForSave(' Old place ', gps), gps);
  assert.equal(resolveMealLocationForSave('', gps), undefined);
  const editedPlace = resolveMealLocationForSave('New place', gps);
  assert.equal(editedPlace.source, 'manual');
  assert.equal(editedPlace.address, 'New place');
  assert.equal(editedPlace.latitude, undefined);
  assert.equal(editedPlace.longitude, undefined);
  const normalized = validateInput(input);
  assert.equal(calculateMetrics(normalized.meals).daysLogged, 2);
  assert.equal(calculateMetrics(normalized.meals).byType.lunch, 2);
  assert.equal(calculateMetrics(normalized.meals).photoCount, 1);
  assert.equal(calculateMetrics(normalized.meals).noteCount, 1);
  assert.equal(calculateMetrics(validateInput({ ...input, meals: [{ ...meal, moodTags: ['peaceful', 'peaceful'] }] }).meals).byMood.peaceful, 1);
  for (const bad of [
    { ...input, locale: 'xx' }, { ...input, month: '2026-13' }, { ...input, meals: Array(201).fill(meal) },
    { ...input, meals: [meal, meal] }, { ...input, meals: [{ ...meal, date: '2026-09-31' }] },
    { ...input, meals: [{ ...meal, date: '2026-09-99' }] }, { ...input, meals: [{ ...meal, date: '2026-08-01' }] },
    { ...input, meals: [{ ...meal, note: 'a'.repeat(241) }] }, { ...input, meals: [{ ...meal, moodTags: ['bad'] }] },
    { ...input, metrics: { mealCount: 999 } }, { ...input, meals: [{ ...meal, photoUri: 'data:image/png;base64,PRIVATE' }] },
    { ...input, meals: [{ ...meal, locationDetails: { latitude: 1, longitude: 2 } }] },
    { ...input, meals: [{ ...meal, id: '../evil' }] },
  ]) assert.throws(() => validateInput(bad));
  assert.throws(() => validateNarrative({ ...narrative, observations: [{ text: 'Invented', mealIds: ['not-provided'] }] }, ['meal-1']));
  assert.throws(() => validateNarrative({ ...narrative, observations: [] }, ['meal-1']));
  const richInput = validateInput({ ...input, locale: 'zh', meals: Array.from({ length: 200 }, (_, i) => ({ ...meal, id: `meal-${i}`, title: '餐'.repeat(80), note: '饭'.repeat(240) })) });
  const prompt = buildPrompt(richInput, calculateMetrics(richInput.meals));
  assert.ok(new TextEncoder().encode(prompt.messages.map((message) => message.content).join('')).byteLength <= MAX_PROMPT_BYTES);
  assert.ok(prompt.evidenceMealIds.length > 0 && prompt.evidenceMealIds.length <= 12);
  assert.match(prompt.messages[0].content, /不是诊断/);
  assert.match(prompt.messages[0].content, /不劝人积极/);
  assert.match(prompt.messages[0].content, /没有笔记时/);
  assert.ok(!prompt.messages[1].content.includes('hasPhoto'), 'AI receives no image-content hint');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mealog-quota-'));
  try {
    const filename = path.join(tmp, 'quota.sqlite');
    let quota = openQuota(filename);
    const now = Date.parse('2026-09-08T00:00:00Z');
    for (let i = 0; i < 3; i++) assert.equal(reserveQuota(quota, 'ip-hash', now).allowed, true);
    assert.equal(reserveQuota(quota, 'ip-hash', now).code, 'ip_limit');
    assert.equal(quota.sql.exec('SELECT attempts FROM daily').one().attempts, 3);
    quota.db.close();
    quota = openQuota(filename);
    assert.equal(reserveQuota(quota, 'ip-hash', now + 1).code, 'ip_limit');
    assert.equal(reserveQuota(quota, 'ip-hash', now + IP_WINDOW_MS).allowed, true);
    const competing = await Promise.all(Array.from({ length: 100 }, (_, i) => Promise.resolve().then(() => reserveQuota(quota, `other-hash-${i}`, now + IP_WINDOW_MS))));
    assert.equal(competing.filter((result) => result.allowed).length, 46);
    assert.equal(quota.sql.exec('SELECT attempts FROM daily').one().attempts, 50);
    quota.db.close();
    quota = openQuota(filename);
    assert.equal(reserveQuota(quota, 'new-hash', now + IP_WINDOW_MS).code, 'daily_limit');
    assert.equal(reserveQuota(quota, 'new-hash', now + 86_400_000).allowed, true);
    assert.equal(quota.sql.exec('SELECT attempts FROM daily').one().attempts, 1);
    assert.equal(quota.sql.exec('SELECT COUNT(*) AS count FROM ip_windows').one().count, 1);
    quota.db.close();
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

  let reserved = 0;
  let generated = 0;
  const services = { reserve: async () => { reserved++; return { allowed: true }; }, generate: async () => { generated++; return { response: JSON.stringify(narrative) }; } };
  const success = await handleMonthly(request(), services);
  assert.equal(success.status, 200);
  const report = await success.json();
  assert.equal(report.provider, PROVIDER);
  assert.equal(report.model, MODEL);
  assert.equal(report.contentVersion, 2);
  validateReport(report, normalized);
  const { contentVersion, ...legacyReport } = report;
  assert.equal(validateReport(legacyReport, normalized).contentVersion, undefined, 'Old reports stay readable');
  assert.throws(() => validateReport({ ...report, contentVersion: 999 }, normalized));
  assert.equal(success.headers.get('Cache-Control'), 'no-store');
  for (const [req, status] of [
    [new Request('https://mealog.example/api/insights/monthly'), 405],
    [request(input, { Origin: 'https://evil.example' }), 403],
    [request(input, { 'Sec-Fetch-Site': 'cross-site' }), 403],
    [request(input, { 'Content-Type': 'text/plain' }), 415],
    [request('{'), 400], [request(' '.repeat(MAX_BODY_BYTES + 1)), 413],
    [request(input, { 'Content-Length': String(MAX_BODY_BYTES + 1) }), 413],
    [request({ ...input, meals: [] }), 422],
  ]) assert.equal((await handleMonthly(req, services)).status, status);
  assert.equal(reserved, 1);
  assert.equal(generated, 1);
  const denied = await handleMonthly(request(), { ...services, reserve: async () => ({ allowed: false, code: 'daily_limit', retryAfter: 60 }) });
  assert.equal(denied.status, 429);
  assert.equal(denied.headers.get('Retry-After'), '60');
  assert.deepEqual((await denied.json()).metrics, report.metrics);
  assert.equal(generated, 1);
  const failed = await handleMonthly(request(), { ...services, generate: async () => { throw new Error('PRIVATE PROVIDER DATA'); } });
  assert.equal(failed.status, 503);
  const failedText = await failed.text();
  assert.ok(!failedText.includes('PRIVATE'));
  assert.deepEqual(JSON.parse(failedText).metrics, report.metrics);
  const invalid = await handleMonthly(request(), { ...services, generate: async () => ({ response: JSON.stringify({ ...narrative, observations: [{ text: 'bad', mealIds: ['unknown'] }] }) }) });
  assert.equal(invalid.status, 502);
  assert.equal(reserved, 3, 'Failed/invalid provider responses still reserve an attempt');
  assert.ok(!(await invalid.text()).includes('unknown'));
  const structured = await handleMonthly(request(), { ...services, generate: async (_messages, signal) => {
    assert.ok(signal instanceof AbortSignal);
    return { response: narrative };
  } });
  assert.equal(structured.status, 200, 'JSON Mode object output is accepted and validated');
  const oneMeal = await handleMonthly(request({ ...input, meals: [meal] }), { ...services, generate: async () => ({
    response: { ...narrative, observations: [narrative.observations[0], narrative.observations[0]] },
  }) });
  assert.equal((await oneMeal.json()).narrative.observations.length, 1, 'One meal never becomes three repetitive paragraphs');
  const retelling = await handleMonthly(request({ ...input, locale: 'zh', meals: [meal] }), { ...services, generate: async () => ({
    response: { title: '一起吃饭', observations: [{ text: '我们一起笑了。', mealIds: ['meal-1'] }] },
  }) });
  assert.equal((await retelling.json()).narrative.observations[0].text, '你们一起笑了。', 'Narrator is not a participant');
  const liveLanguageRegression = await handleMonthly(request({ ...input, locale: 'zh', meals: [meal] }), { ...services, generate: async () => ({
    response: { title: 'Dumplings folded with Amy', observations: [{ text: '我们一起折叠饺子，Amy做了一个小型星形饺子，你们一起笑了', mealIds: ['meal-1'] }] },
  }) });
  const polished = (await liveLanguageRegression.json()).narrative;
  assert.equal(polished.title, '餐桌上的片刻');
  assert.equal(polished.observations[0].text, '你们一起包饺子，Amy做了一个星形小饺子，你们一起笑了。');
  const realTimer = global.setTimeout;
  let aborted = false;
  try {
    // Accelerate the actual deadline while exercising signal propagation and error handling.
    global.setTimeout = (callback, ms, ...args) => realTimer(callback, ms === AI_TIMEOUT_MS ? 5 : ms, ...args);
    const timeout = await handleMonthly(request(), { ...services, generate: (_messages, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true });
    }) });
    assert.equal(aborted, true);
    assert.equal(timeout.status, 503);
    assert.equal((await timeout.json()).error.code, 'ai_timeout');
  } finally { global.setTimeout = realTimer; }

  const localMeals = input.meals.map((item) => ({ ...item, peopleTags: item.companyTags, photoUri: item.hasPhoto ? 'PRIVATE-PHOTO' : undefined,
    locationDetails: { latitude: 1, longitude: 2 }, personIds: ['PRIVATE-PERSON'], updatedAt: 'now' }));
  const clientInput = client.makeMonthlyInput(localMeals, input.month, input.locale);
  assert.ok(!client.inputSnapshot(clientInput).includes('PRIVATE'));
  assert.ok(!client.inputSnapshot(clientInput).includes('latitude'));
  assert.equal(client.inputSnapshot(clientInput), client.inputSnapshot(client.makeMonthlyInput([...localMeals].reverse(), input.month, input.locale)));
  assert.ok(client.makeMonthlyInput(localMeals, input.month, input.locale, false).meals.every((row) => row.note === ''));
  const mixedMeals = [{ ...localMeals[0], origin: 'sample' }, { ...localMeals[1], origin: 'user' }, { ...localMeals[1], id: 'legacy' }];
  assert.deepEqual(client.mealsForScope(mixedMeals, 'personal').map((row) => row.id), ['meal-2', 'legacy']);
  assert.deepEqual(client.mealsForScope(mixedMeals, 'sample').map((row) => row.id), ['meal-1']);
  const entry = { snapshot: client.inputSnapshot(clientInput), report };
  await client.saveReportCache(entry);
  assert.equal((await client.readReportCache()).length, 1);
  const edited = client.makeMonthlyInput([{ ...localMeals[0], note: 'Changed' }, localMeals[1]], input.month, input.locale);
  assert.notEqual(client.selectCachedReport([entry], edited).snapshot, client.inputSnapshot(edited));
  assert.equal(client.selectCachedReport([entry], { ...clientInput, locale: 'zh' }), undefined);
  assert.equal(client.selectCachedReport([entry], { ...clientInput, month: '2026-08' }), undefined);
  assert.deepEqual(client.parseCache('{bad'), []);
  assert.deepEqual(client.parseCache(JSON.stringify([{ ...entry, report: { ...report, provider: 'fake' } }])), []);
  assert.equal(client.selectCachedReport([entry], clientInput, 'personal'), undefined, 'Unscoped legacy reports cannot masquerade as personal insights');
  const sampleEntry = { ...entry, scope: 'sample' };
  await client.saveReportCache(sampleEntry);
  assert.equal(client.selectCachedReport(await client.readReportCache(), clientInput, 'sample').scope, 'sample');
  assert.equal(client.selectCachedReport([sampleEntry], edited, 'personal'), undefined, 'No cross-scope stale report fallback');
  const fetchOriginal = global.fetch;
  try {
    let calls = 0;
    global.fetch = async (url, options) => { calls++; assert.equal(url, '/api/insights/monthly'); assert.equal(options.method, 'POST'); return Response.json(report); };
    assert.equal((await client.generateMonthlyReport(clientInput)).provider, PROVIDER);
    assert.equal(calls, 1);
    global.fetch = async () => Response.json({ error: { code: 'ai_unavailable' }, metrics: report.metrics }, { status: 503 });
    await assert.rejects(() => client.generateMonthlyReport(clientInput), (error) => error.code === 'ai_unavailable');
    assert.equal((await client.readReportCache())[0].report.generatedAt, report.generatedAt);
  } finally { global.fetch = fetchOriginal; }
  console.log('PASS: Insights validation, quota, provider failures and client cache; Slow Mail privacy, cutoff, quota, retries and original bytes');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
