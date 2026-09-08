import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.MEALOG_URL || 'http://127.0.0.1:8793';
const output = process.env.QA_OUTPUT || 'artifacts/sample-photo-refresh';
const choices = [
  ['Toast', 'blueberry-toast'],
  ['Cream toast', 'cream-toast'],
  ['Granola bowl', 'fruit-granola-bowl'],
  ['Seasonal salad', 'seasonal-salad'],
  ['Hotpot', 'table-feast'],
];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
const readable = (page) => page.waitForFunction(() => [...document.images]
  .filter((img) => img.src).every((img) => img.complete && img.naturalWidth > 0));
const meals = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('@mealogue/meals')));

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base + '/add');
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('@mealogue/standaloneDemoSession') || 'null')?.complete,
    undefined,
    { timeout: 180000 },
  );
  await page.getByRole('button', { name: 'Toast', exact: true }).waitFor();
  const originalMeals = await meals(page);
  for (const [label, file] of choices) {
    const source = await page.getByRole('button', { name: label, exact: true }).locator('img').getAttribute('src');
    assert(source.includes(file + '.'));
    const response = await context.request.get(new URL(source, base).href);
    assert(response.ok());
    assert.deepEqual(await response.body(), await readFile(`assets/demo/meal-photos/${file}.jpg`));
  }
  console.log('PASS sample order/assets; first Toast and final Hotpot unchanged');

  for (const [label, file] of choices.slice(1, 4)) {
    await page.goto(base + '/add');
    const choice = page.getByRole('button', { name: label, exact: true });
    await choice.click();
    const preview = page.getByRole('button', { name: 'Change meal photo', exact: true });
    assert((await preview.locator('img').getAttribute('src')).includes(file + '.'));
    await page.getByLabel('Meal name', { exact: true }).fill(`Photo QA: ${label}`);
    await page.getByRole('button', { name: 'Save meal memory', exact: true }).click();
    await page.waitForURL(/\/meal\//);
    await page.reload();
    await page.getByText(`Photo QA: ${label}`, { exact: true }).waitFor();
    await readable(page);
    const saved = (await meals(page)).find((meal) => meal.title === `Photo QA: ${label}`);
    assert(saved.photoMediaId && saved.photoUri.startsWith('indexeddb://'));
    assert(saved.photoThumbnailUri.startsWith('indexeddb://'));
    console.log(`PASS ${label}: preview, managed original/thumbnail, save and refresh`);
  }
  assert.deepEqual((await meals(page)).filter((meal) => originalMeals.some((original) => original.id === meal.id)), originalMeals);
  console.log('PASS pre-existing memories unchanged');

  await page.goto(base + '/profile');
  await page.getByText('中文', { exact: true }).click();
  await page.goto(base + '/add');
  for (const label of ['吐司', '奶油吐司', '水果麦片碗', '时令沙拉', '火锅']) {
    await page.getByRole('button', { name: label, exact: true }).waitFor();
  }
  for (const [name, width, height] of [['mobile', 390, 844], ['desktop', 1440, 1000]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: '时令沙拉', exact: true }).click();
    await page.getByRole('button', { name: '吐司', exact: true }).scrollIntoViewIfNeeded();
    await readable(page);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `${output}/${name}.png` });
  }
  assert.deepEqual(errors, []);
  console.log('PASS Chinese labels, mobile/desktop layouts, no broken images or runtime errors');
} finally {
  await browser.close();
}
