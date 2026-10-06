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

  await page.getByRole('button', { name: 'Choose a month', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/calendar-current-mobile.png` });
  const previousLabel = new Date(previous[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  await page.getByRole('button', { name: 'Choose a month', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(previousLabel + '.*19 memories') }).click();
  await page.getByText('Choose a month', { exact: true }).waitFor({ state: 'hidden' });
  await readable();
  assert.equal(await page.getByRole('button', { name: /, [1-9]\d* meals$/ }).count(), new Set(previous.map((meal) => meal.date)).size);
  for (const [name, width, height] of [['mobile', 390, 844], ['desktop', 1440, 1000]]) {
    await page.setViewportSize({ width, height });
    await page.getByRole('button', { name: 'Choose a month', exact: true }).scrollIntoViewIfNeeded();
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

  const toast = initial.find((meal) => meal.id === 'demo-meal-current-01');
  assert(toast && toast.origin === 'sample' && !toast.stickerMediaId);
  await page.goto(`${base}/meal/${toast.id}`);
  await page.getByRole('button', { name: 'Make food sticker', exact: true }).click();
  await page.getByRole('button', { name: 'Remake sticker', exact: true }).waitFor({ timeout: 180000 });
  await readable();
  const withSticker = (await read('meals')).find((meal) => meal.id === toast.id);
  assert(withSticker.stickerMediaId && withSticker.stickerUri.startsWith('indexeddb://'));
  assert.notEqual(withSticker.stickerMediaId, toast.photoMediaId);
  const { stickerMediaId, stickerUri, ...originalFields } = withSticker;
  assert.deepEqual(originalFields, toast);
  const alpha = await page.getByRole('img', { name: `${toast.title} food sticker`, exact: true }).locator('img').evaluate((image) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0, opaque = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 20) transparent++;
      if (data[i] > 240) opaque++;
    }
    return { transparent, opaque, pixels: canvas.width * canvas.height };
  });
  assert(alpha.transparent / alpha.pixels > 0.01 && alpha.opaque > 0, 'Sticker must contain a visible cutout and transparent background');
  await page.reload();
  await page.getByRole('button', { name: 'Remake sticker', exact: true }).waitFor();
  await readable();
  assert.deepEqual((await read('meals')).find((meal) => meal.id === toast.id), withSticker);
  await page.getByRole('button', { name: 'Open food album →', exact: true }).click();
  await page.waitForURL(/\/food-album\?/);
  assert.equal(new URL(page.url()).searchParams.get('scope'), 'sample');
  assert.equal(await page.getByRole('tab', { name: 'Sample meals', exact: true }).getAttribute('aria-selected'), 'true');
  await page.getByTestId(`food-sticker-${toast.id}`).waitFor();
  await readable();
  await page.screenshot({ path: `${output}/food-sticker-album.png` });
  await page.goto(base + '/archive'); await ready();
  await page.getByTestId(`calendar-day-${toast.date}`).getByRole('img', { name: toast.title, exact: true }).waitFor();
  await readable();
  assert.deepEqual((await read('meals')).find((meal) => meal.id === toast.id), withSticker);
  console.log('PASS real transparent sticker: original photo/metadata unchanged; persisted after refresh; sample album and calendar display it');

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
