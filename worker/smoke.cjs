// Explicit live verification. Sends synthetic journal text, consuming two real quota attempts.
const assert = require('node:assert/strict');
const origin = process.argv[2];
if (!origin || !/^(https:\/\/|http:\/\/127\.0\.0\.1:)/.test(origin)) throw new Error('Usage: node worker/smoke.cjs https://deployed-worker.example (or http://127.0.0.1:port)');
async function main() {
  for (const locale of ['en', 'zh']) {
    const meal = { id: 'smoke-meal-1', date: '2026-09-01', title: locale === 'zh' ? '安静的午餐' : 'A quiet lunch', mealType: 'lunch',
      moodTags: ['peaceful'], companyTags: ['just-me'], note: locale === 'zh' ? '午餐喝了一碗汤，记录了平静的心情。' : 'I had a bowl of soup and recorded a peaceful mood.', hasPhoto: false };
    const response = await fetch(new URL('/api/insights/monthly', origin), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: new URL(origin).origin },
      body: JSON.stringify({ version: 1, month: '2026-09', locale, meals: [meal] }), signal: AbortSignal.timeout(45_000),
    });
    const result = await response.json();
    assert.equal(response.status, 200, `Live ${locale} request failed: ${JSON.stringify(result.error)}`);
    assert.equal(result.provider, 'cloudflare_workers_ai');
    assert.equal(result.model, '@cf/meta/llama-3.1-8b-instruct-fast');
    assert.equal(result.locale, locale);
    assert.equal(result.metrics.mealCount, 1);
    assert.equal(result.metrics.daysLogged, 1);
    assert.ok(result.narrative.observations.length > 0);
    for (const row of result.narrative.observations) assert.ok(row.mealIds.every((id) => id === meal.id));
    if (locale === 'zh') assert.match(JSON.stringify(result.narrative), /[\u4e00-\u9fff]/);
    console.log(JSON.stringify({ locale, status: response.status, provider: result.provider, model: result.model, metrics: result.metrics, narrative: result.narrative }));
  }
  const invalid = await fetch(new URL('/api/insights/monthly', origin), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(invalid.status, 400);
  const unknown = await fetch(new URL('/api/not-a-route', origin));
  assert.equal(unknown.status, 404);
  assert.ok(unknown.headers.get('Content-Type').includes('application/json'));
  console.log('PASS: live English/Chinese AI, truthful provider, deterministic metrics, known references, invalid input and API-first routing');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
