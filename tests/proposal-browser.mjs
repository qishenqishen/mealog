// UI/storage regressions use a mocked AI response. Live provider QA is separate.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, copyFile, rm, writeFile, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, filename);
const { calculateMetrics, MODEL, PROVIDER, CONTENT_VERSION } = require('../src/insights/contract.ts');
const base = process.env.MEALOG_URL || 'http://127.0.0.1:8793';
const output = process.env.QA_OUTPUT || 'artifacts/proposal-review/browser';
await promisify(mkdir)(output, { recursive: true });
const temp = await promisify(mkdtemp)(join(tmpdir(), 'mealog-proposal-'));
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US', permissions: ['geolocation'], geolocation: { latitude: 34.05, longitude: -118.25 } });
const page = await context.newPage();
const results = [], requests = [], errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('dialog', (dialog) => dialog.accept());
const read = (key) => page.evaluate((key) => JSON.parse(localStorage.getItem('@mealogue/' + key) || 'null'), key);
const shot = (name) => page.screenshot({ path: `${output}/${name}.png` });
const log = (message) => { results.push(message); console.log('PASS', message); };
let failAI = false;
await page.route('**/api/insights/monthly', async (route) => {
  const input = route.request().postDataJSON(); requests.push(input);
  assert.ok(!JSON.stringify(input).includes('PRIVATE MONTHLY WORDS'));
  assert.ok(!JSON.stringify(input).includes('latitude'));
  if (failAI) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'ai_unavailable' } }) });
  const first = input.meals[0];
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    version: 1, contentVersion: CONTENT_VERSION, month: input.month, locale: input.locale, provider: PROVIDER, model: MODEL,
    generatedAt: new Date().toISOString(), metrics: calculateMetrics(input.meals), evidenceMealIds: [first.id],
    narrative: { title: `Remembering ${first.title}`.slice(0, 80), observations: [{ text: first.note || `You saved ${first.title}.`, mealIds: [first.id] }] },
  }) });
});
await page.addInitScript(() => {
  window.__gpsCalls = 0; window.__gpsPending = [];
  const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
  navigator.geolocation.getCurrentPosition = (...args) => {
    window.__gpsCalls++;
    if (window.__holdGPS) window.__gpsPending.push(() => original(...args));
    else original(...args);
  };
});
try {
  await page.goto(base + '/insights');
  await page.getByRole('button', { name: 'Generate reflection', exact: true }).waitFor({ timeout: 180000 });
  assert.equal(await page.getByRole('tab', { name: 'Sample table', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(requests.length, 0);
  const field = page.getByLabel('Your monthly reflection', { exact: true });
  await field.fill('PRIVATE MONTHLY WORDS: a sentence of my own.');
  await page.getByRole('button', { name: 'Save my words', exact: true }).click();
  await page.getByText('Saved on this device.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Generate reflection', exact: true }).click();
  await page.getByText(/^Remembering /).waitFor();
  assert(requests[0].meals.every((meal) => meal.note === ''));
  const sampleReport = (await read('insightsCache/v1'))[0];
  await page.reload();
  await page.getByText(sampleReport.report.narrative.title, { exact: true }).waitFor();
  assert.equal(await field.inputValue(), 'PRIVATE MONTHLY WORDS: a sentence of my own.');
  assert.equal(requests.length, 1);
  log('Sample-only default; optional AI; own words persist on refresh and are excluded from requests');

  await field.fill('PRIVATE MONTHLY WORDS: revised.');
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    window.__failNote = true;
    Storage.prototype.setItem = function (key, value) {
      if (window.__failNote && key === '@mealogue/monthlyReflections/v1') throw new DOMException('QA failure', 'QuotaExceededError');
      return setItem.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Save my words', exact: true }).click();
  await page.getByText('Could not save. Your draft is kept here; please retry.', { exact: true }).waitFor();
  assert.equal((await read('monthlyReflections/v1'))[0].text, 'PRIVATE MONTHLY WORDS: a sentence of my own.');
  await page.evaluate(() => { window.__failNote = false; });
  await page.getByRole('button', { name: 'Save my words', exact: true }).click();
  await page.getByText('Saved on this device.', { exact: true }).waitFor();
  await field.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await shot('own-words-mobile');
  await page.getByRole('tab', { name: 'My table', exact: true }).click();
  assert.equal(await field.inputValue(), '');
  await page.getByText('No meals saved for this month.', { exact: true }).waitFor();
  assert.equal(await page.getByText(sampleReport.report.narrative.title, { exact: true }).count(), 0);
  assert(await page.getByRole('button', { name: 'Generate reflection', exact: true }).isDisabled());
  log('Failed save keeps old words and draft; retry works; source-specific reflection/cache and empty state');

  await page.getByRole('link', { name: 'Record a meal', exact: true }).click();
  await page.getByLabel('Meal name', { exact: true }).fill('QA soup after class');
  assert.equal(await page.evaluate(() => window.__gpsCalls), 0, 'No automatic GPS access even with granted permission');
  await page.getByRole('button', { name: 'Use current location', exact: true }).click();
  await page.getByText('Current place added. You can still edit the text.', { exact: true }).waitFor();
  await page.getByLabel('Location', { exact: true }).fill('My table, typed by hand');
  await page.getByLabel('Note', { exact: true }).fill('We shared soup and kept the last dumpling for Amy.');
  const source = join(temp, 'camera-test.jpg');
  await promisify(copyFile)('assets/demo/meal-photos/blueberry-toast.jpg', source);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Take photo', exact: true }).click();
  const chooser = await chooserPromise;
  assert(await chooser.element().getAttribute('capture'), 'Web camera control sets the native capture hint');
  await chooser.setFiles(source);
  await page.getByRole('button', { name: 'Change meal photo', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Save meal memory', exact: true }).click();
  await page.waitForURL(/\/meal\//);
  const saved = (await read('meals')).find((meal) => meal.title === 'QA soup after class');
  assert.equal(saved.locationDetails.source, 'manual'); assert.equal(saved.locationDetails.latitude, undefined);
  assert(saved.photoUri.startsWith('indexeddb://') && saved.photoMediaId);
  await promisify(rm)(source);
  await page.reload();
  await page.getByText(saved.title, { exact: true }).waitFor();
  await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
  await shot('saved-camera-upload-mobile');
  log('Explicit location only; manual edit removes GPS; capture file goes through managed media and survives source deletion/reload');

  await page.goto(base + `/add?editMealId=${saved.id}`);
  await page.getByRole('button', { name: 'Save changes', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Remove place', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForURL(/\/meal\//);
  assert.equal((await read('meals')).find((meal) => meal.id === saved.id).locationDetails, undefined);
  await page.goto(base + '/add');
  await page.evaluate(() => { window.__holdGPS = true; });
  await page.getByRole('button', { name: 'Use current location', exact: true }).click();
  await page.waitForFunction(() => window.__gpsPending.length > 0);
  await page.getByLabel('Location', { exact: true }).fill('Keep my new place');
  await page.evaluate(() => { window.__holdGPS = false; window.__gpsPending.forEach((run) => run()); });
  await page.waitForTimeout(500);
  assert.equal(await page.getByLabel('Location', { exact: true }).inputValue(), 'Keep my new place');
  await shot('add-photo-actions-mobile');
  log('Explicit remove-place persists; a delayed GPS result cannot overwrite manual input');

  await page.goto(base + '/insights');
  await page.getByRole('button', { name: 'Generate reflection', exact: true }).waitFor();
  assert.equal(await page.getByRole('tab', { name: 'My table', exact: true }).getAttribute('aria-selected'), 'true');
  await page.getByRole('switch', { name: 'Include meal notes', exact: true }).click();
  await page.getByRole('button', { name: 'Generate reflection', exact: true }).click();
  await page.getByText('Remembering QA soup after class', { exact: true }).waitFor();
  assert.equal(requests.at(-1).meals.length, 1);
  assert.equal(requests.at(-1).meals[0].note, 'We shared soup and kept the last dumpling for Amy.');
  const count = requests.length;
  await page.getByRole('tab', { name: 'Sample table', exact: true }).click();
  await page.getByText(sampleReport.report.narrative.title, { exact: true }).waitFor();
  assert.equal(requests.length, count);
  await page.getByRole('tab', { name: 'My table', exact: true }).click();
  failAI = true;
  await page.getByRole('button', { name: 'Generate again', exact: true }).click();
  await page.getByText(/AI is unavailable right now/).waitFor();
  await page.getByText('Remembering QA soup after class', { exact: true }).waitFor();
  log('Personal AI excludes samples, opt-in notes included, source switching makes no request, provider failure retains report');

  await page.getByRole('tab', { name: '中文', exact: true }).click();
  await page.getByText('也听听你自己的话', { exact: true }).waitFor();
  await page.getByLabel('我的月度感想', { exact: true }).fill('今晚的汤，想留给以后的自己。');
  await page.getByRole('button', { name: '保存我的感想', exact: true }).click();
  await page.getByText('已保存在此设备上。', { exact: true }).waitFor();
  await page.getByLabel('我的月度感想', { exact: true }).evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await shot('own-words-chinese-mobile');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await shot('insights-desktop');
  assert((await page.getByTestId('mealog-app').boundingBox()).width <= 460);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  log('Chinese copy/author reflection work; desktop stays <=460px; no page errors or horizontal overflow');
} catch (error) {
  results.push('FAIL ' + error.stack); console.error(error);
  console.error((await page.locator('body').innerText()).slice(-5000));
  await shot('failure').catch(() => {}); process.exitCode = 1;
} finally {
  await promisify(writeFile)(`${output}/results.json`, JSON.stringify({ base, results, errors, mockAI: true, requests }, null, 2));
  await browser.close(); await promisify(rm)(temp, { recursive: true, force: true });
}
