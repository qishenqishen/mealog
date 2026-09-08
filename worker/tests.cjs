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
const memory = new Map();
const storage = { getItem: async (key) => memory.get(key) ?? null, setItem: async (key, value) => { memory.set(key, value); }, removeItem: async (key) => { memory.delete(key); } };
const load = Module._load;
Module._load = function (id, ...args) { return id === '@react-native-async-storage/async-storage' ? { default: storage } : load.call(this, id, ...args); };
const client = require('../src/insights/monthlyReport.ts');
Module._load = load;

const meal = { id: 'meal-1', date: '2026-09-02', title: 'Lunch with soup', mealType: 'lunch', moodTags: ['peaceful'], companyTags: ['just-me'], note: 'A quiet lunch.', hasPhoto: true };
const input = { version: 1, month: '2026-09', locale: 'en', meals: [meal, { ...meal, id: 'meal-2', date: '2026-09-03', note: '', hasPhoto: false }] };
const narrative = { title: 'A pause at the table', observations: [{ text: 'Your note remembers a quiet lunch.', mealIds: ['meal-1'] }] };
function request(body = input, headers = {}) {
  return new Request('https://mealog.example/api/insights/monthly', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://mealog.example', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
}
function openQuota(filename) {
  const db = new DatabaseSync(filename);
  const sql = { exec(query, ...params) {
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

async function main() {
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
  validateReport(report, normalized);
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
  const entry = { snapshot: client.inputSnapshot(clientInput), report };
  await client.saveReportCache(entry);
  assert.equal((await client.readReportCache()).length, 1);
  const edited = client.makeMonthlyInput([{ ...localMeals[0], note: 'Changed' }, localMeals[1]], input.month, input.locale);
  assert.notEqual(client.selectCachedReport([entry], edited).snapshot, client.inputSnapshot(edited));
  assert.equal(client.selectCachedReport([entry], { ...clientInput, locale: 'zh' }), undefined);
  assert.equal(client.selectCachedReport([entry], { ...clientInput, month: '2026-08' }), undefined);
  assert.deepEqual(client.parseCache('{bad'), []);
  assert.deepEqual(client.parseCache(JSON.stringify([{ ...entry, report: { ...report, provider: 'fake' } }])), []);
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
  console.log('PASS: validation, privacy allowlist, bounded prompt/body, SQLite quota concurrency/reopen/day reset, provider failures, references, client cache and errors');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
