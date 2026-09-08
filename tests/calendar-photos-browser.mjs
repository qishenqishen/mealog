import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.MEALOG_URL || 'http://127.0.0.1:8793';
const output = process.env.QA_OUTPUT || 'artifacts/calendar-photos/local';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
const page = await context.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('dialog', (dialog) => dialog.accept());
const read = (key) => page.evaluate((key) => JSON.parse(localStorage.getItem('@mealogue/' + key)), key);
const ready = async () => {
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('@mealogue/standaloneDemoSession') || 'null')?.photoCollectionVersion === 1, undefined, { timeout: 240000 });
  await page.getByRole('tab', { name: 'Archive', exact: true }).waitFor();
};
const readable = () => page.waitForFunction(() => [...document.images].filter((img) => img.src).every((img) => img.complete && img.naturalWidth > 0));

try {
  await page.goto(base + '/archive'); await ready(); await readable();
  const initial = await read('meals');
  const previous = initial.filter((meal) => meal.id.includes('-previous-'));
  assert.equal(previous.length, 19);
  assert.equal(previous.filter((meal) => meal.id.includes('-photo-')).length, 9);
  assert(initial.every((meal) => meal.photoMediaId && meal.photoUri.startsWith('indexeddb://') && meal.photoThumbnailUri.startsWith('indexeddb://')));
  assert(initial.every((meal) => Date.parse(meal.eatenAt) <= Date.parse((new Date()).toISOString())));
  console.log('PASS new visitor: 19 last-month meals; new food photos use managed originals and thumbnails');

  await page.getByText('Month table', { exact: true }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: `${output}/calendar-current-mobile.png` });
  const previousLabel = new Date(previous[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  await page.getByRole('button', { name: /Current table/ }).click();
  await page.getByRole('button', { name: new RegExp(previousLabel + '.*19 memories') }).click();
  await page.getByText('Choose a month', { exact: true }).waitFor({ state: 'hidden' });
  await readable();
  assert.equal(await page.getByRole('button', { name: /, [1-9]\d* meals$/ }).count(), new Set(previous.map((meal) => meal.date)).size);
  for (const [name, width, height] of [['mobile', 390, 844], ['desktop', 1440, 1000]]) {
    await page.setViewportSize({ width, height });
    await page.getByText('Month table', { exact: true }).evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await readable();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/calendar-previous-${name}.png` });
  }
  const dessert = previous.find((meal) => meal.id.endsWith('photo-06'));
  const dessertDay = new Date(dessert.date + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  await page.getByRole('button', { name: new RegExp(`^${dessertDay},`) }).click();
  await page.getByText(dessert.title, { exact: true }).click();
  await page.waitForURL(/\/meal\//); await readable();
  await page.reload(); await page.getByText(dessert.title, { exact: true }).waitFor(); await readable();
  await page.screenshot({ path: `${output}/uploaded-dessert-detail.png` });
  console.log('PASS Calendar day opens the fourth uploaded photo; detail survives refresh; mobile/desktop render');

  // Recreate an old completed session in this isolated browser, with an edited and a deleted sample.
  await page.evaluate(() => {
    const meals = JSON.parse(localStorage.getItem('@mealogue/meals')).filter((meal) => !meal.id.includes('-photo-') && meal.id !== 'demo-meal-previous-03');
    meals[0].origin = 'user'; meals[0].title = 'My edited memory';
    localStorage.setItem('@mealogue/meals', JSON.stringify(meals));
    const session = JSON.parse(localStorage.getItem('@mealogue/standaloneDemoSession'));
    delete session.photoCollectionVersion; delete session.photoCollectionAnchorDate;
    localStorage.setItem('@mealogue/standaloneDemoSession', JSON.stringify(session));
  });
  const retained = await read('meals');
  await page.route('**/*counter-dessert*.jpg', (route) => route.abort());
  await page.goto(base + '/archive');
  await page.getByRole('button', { name: 'Try again', exact: true }).waitFor({ timeout: 180000 });
  assert.equal((await read('standaloneDemoSession')).photoCollectionVersion, undefined);
  await page.unroute('**/*counter-dessert*.jpg');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await ready(); await readable();
  const updated = await read('meals');
  for (const meal of retained) assert.deepEqual(updated.find((next) => next.id === meal.id), meal);
  assert(!updated.some((meal) => meal.id === 'demo-meal-previous-03'));
  assert.equal(updated.length, initial.length - 1);
  await page.reload(); await ready();
  assert.deepEqual(await read('meals'), updated);
  console.log('PASS existing visitor: interrupted upgrade retries, edited/deleted meals preserved, no duplicates on refresh');

  await page.goto(base + '/profile');
  await page.getByText('Clear sample memories', { exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('@mealogue/meals')).length === 1);
  await page.goto(base + '/archive'); await ready();
  assert.deepEqual((await read('meals')).map((meal) => meal.title), ['My edited memory']);
  assert.deepEqual(errors, []);
  console.log('PASS clear samples stays cleared; edited memory retained; no runtime errors');
  await writeFile(`${output}/results.json`, JSON.stringify({ base, status: 'PASS', initialMeals: initial.length, previousMonthMeals: previous.length, errors }, null, 2));
} catch (error) {
  console.error(page.url(), await page.locator('body').innerText());
  await page.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await browser.close();
}
