// Real provider evaluation on synthetic evidence only. One call by default; --all is explicit.
const fs = require('node:fs');
const path = require('node:path');
const cases = require('./fixtures/ai-golden.json');
const target = process.env.MEALOG_URL || 'http://127.0.0.1:8793';
const selected = process.argv.includes('--all') ? cases : cases.slice(0, 1);
(async () => {
  const results = [];
  for (const fixture of selected) {
    const input = { version: 1, month: '2026-10', locale: fixture.locale, meals: [{ id: fixture.id, date: '2026-10-01', title: fixture.title, note: fixture.note, mealType: 'snack', moodTags: [], companyTags: [], hasPhoto: true }] };
    const start = Date.now();
    const response = await fetch(`${target}/api/insights/monthly`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const result = await response.json();
    const citations = result.narrative?.observations.flatMap(item => item.mealIds) || [];
    const idsValid = response.ok && citations.length > 0 && citations.every(id => id === fixture.id);
    results.push({ case: fixture, status: response.status, latencyMs: Date.now() - start, idsValid, result, semanticHumanReview: 'TBD', acceptable: 'TBD' });
    if (!response.ok) break;
  }
  const directory = path.resolve(__dirname, '../artifacts/ai-product'); fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'golden-results.json'), JSON.stringify(results, null, 2));
  console.log(`${results.length} synthetic provider case(s) recorded. Human semantic review required.`);
  if (results.some(result => !result.idsValid)) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
