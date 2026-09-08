// Opt-in live test: three real generations and one deliberately rate-limited attempt.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const origin = process.env.MEALOG_URL;
if (!origin) throw new Error('Set MEALOG_URL explicitly. This test consumes three real AI attempts.');
const output = process.env.QA_OUTPUT || 'artifacts/live-ai';
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'mealog-browser-restart-'));
const launch = () => chromium.launchPersistentContext(profile, { channel: process.env.CHROME_CHANNEL || undefined, headless: true, viewport: { width: 390, height: 844 }, locale: 'en-US' });
let context = await launch();
const results = [];
const reports = [];
let generationCount = 0;
let page = await context.newPage();
const observe = (page) => page.on('request', (request) => {
  if (request.url().endsWith('/api/insights/monthly')) {
    generationCount++;
    const body = request.postDataJSON();
    assert.deepEqual(Object.keys(body).sort(), ['locale', 'meals', 'month', 'version']);
    assert(!JSON.stringify(body).includes('blob:') && !JSON.stringify(body).includes('indexeddb:'));
    assert(body.meals.every((meal) => Object.keys(meal).sort().join() === ['companyTags', 'date', 'hasPhoto', 'id', 'mealType', 'moodTags', 'note', 'title'].sort().join()));
  }
});
observe(page);
const generate = async (buttonLabel) => {
  const response = page.waitForResponse((response) => response.url().endsWith('/api/insights/monthly'), { timeout: 60000 });
  await page.getByRole('button', { name: buttonLabel, exact: true }).click();
  const actual = await response;
  const report = await actual.json();
  assert.equal(actual.status(), 200, JSON.stringify(report));
  assert.equal(report.provider, 'cloudflare_workers_ai');
  assert.equal(report.model, '@cf/meta/llama-3.1-8b-instruct-fast');
  assert(report.narrative.observations.length > 0);
  assert(report.narrative.observations.every((observation) => observation.mealIds.every((id) => report.evidenceMealIds.includes(id))));
  reports.push(report);
  await page.getByText(report.narrative.title, { exact: true }).last().waitFor();
  await page.waitForFunction(() => [...document.images].every((image) => !image.src || (image.complete && image.naturalWidth > 0)));
  return report;
};

const showReport = async (report) => {
  await page.getByText(report.narrative.title, { exact: true }).last().evaluate((element) => element.scrollIntoView({ block: 'start' }));
};

try {
  await page.goto(origin + '/insights');
  await page.getByRole('button', { name: 'Generate reflection', exact: true }).waitFor({ timeout: 60000 });
  assert.equal(generationCount, 0);
  const english = await generate('Generate reflection');
  await showReport(english);
  await page.screenshot({ path: output + '/01-real-ai-english.png' });
  results.push('PASS real English report, exact provider/model and valid evidence');

  await page.reload();
  await page.getByText(english.narrative.title, { exact: true }).last().waitFor();
  assert.equal(generationCount, 1);
  results.push('PASS reload uses cached report without AI request');

  await page.getByRole('tab', { name: 'Add', exact: true }).click();
  await page.getByLabel('Meal name', { exact: true }).fill('Dumplings folded with Amy');
  await page.getByLabel('Note', { exact: true }).fill('We folded dumplings together. Amy made a tiny star-shaped one, and we laughed about it.');
  await page.getByRole('button', { name: 'Cake', exact: true }).click();
  await page.getByRole('button', { name: 'Heartfelt', exact: true }).click();
  await page.getByRole('button', { name: 'Save meal memory', exact: true }).click();
  await page.waitForURL(/\/meal\//);
  const newId = new URL(page.url()).pathname.split('/').pop();
  await page.goto(origin + '/insights');
  await page.getByText('Saved report is out of date. Meal details have changed.', { exact: true }).waitFor();
  assert.equal(generationCount, 1);
  const updated = await generate('Generate again');
  assert.equal(updated.metrics.mealCount, english.metrics.mealCount + 1);
  assert(updated.evidenceMealIds.includes(newId));
  assert.notDeepEqual(updated.narrative, english.narrative);
  await showReport(updated);
  await page.screenshot({ path: output + '/02-real-ai-after-new-meal.png' });
  results.push('PASS newly recorded meal changes real report and metrics, linked in evidence');

  await page.getByRole('tab', { name: '中文', exact: true }).click();
  assert.equal(generationCount, 2);
  const chinese = await generate('生成月度回顾');
  assert.match(JSON.stringify(chinese.narrative), /[\u4e00-\u9fff]/);
  assert.equal(chinese.locale, 'zh');
  await showReport(chinese);
  await page.screenshot({ path: output + '/03-real-ai-chinese.png' });
  results.push('PASS real Chinese generation; language switch alone does not call AI');

  const quotaResponse = page.waitForResponse((response) => response.url().endsWith('/api/insights/monthly'));
  await page.getByRole('button', { name: '重新生成', exact: true }).click();
  const quota = await quotaResponse;
  assert.equal(quota.status(), 429);
  assert.equal((await quota.json()).error.code, 'ip_limit');
  await page.getByText(chinese.narrative.title, { exact: true }).last().waitFor();
  await page.screenshot({ path: output + '/04-live-quota-error.png' });
  results.push('PASS fourth network attempt rejected with 429; previous report preserved');

  await context.close();
  context = await launch(); page = await context.newPage(); observe(page);
  await page.goto(origin + '/insights');
  await page.getByText(chinese.narrative.title, { exact: true }).last().waitFor();
  assert.equal(generationCount, 4);
  await page.goto(origin + '/meal/' + newId);
  await page.getByText('Dumplings folded with Amy', { exact: true }).waitFor();
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
  await page.screenshot({ path: output + '/05-full-browser-restart.png' });
  results.push('PASS full Chrome process restart preserves language, AI cache, meal and managed photo');
  console.log(JSON.stringify({ results, reports }, null, 2));
} catch (error) {
  results.push('FAIL ' + error.stack);
  console.error(error);
  await page.screenshot({ path: output + '/failure.png' }).catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(output + '/results.json', JSON.stringify({ origin, generatedAt: new Date().toISOString(), results, reports }, null, 2));
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
