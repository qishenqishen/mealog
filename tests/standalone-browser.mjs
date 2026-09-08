import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.MEALOG_URL || 'http://127.0.0.1:8793';
const output = process.env.QA_OUTPUT || 'artifacts/standalone';
await mkdir(output, { recursive: true });
const sourceDir = await mkdtemp(join(tmpdir(), 'mealog-qa-'));
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || undefined, headless: true });
const results = [];
const errors = [];
const key = '@mealogue/';
const log = (test, detail) => { results.push({ test, status: 'PASS', detail }); console.log(`PASS ${test}`, detail || ''); };
const state = (page, name) => page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey) || 'null'), key + name);
const ready = async (page) => {
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('@mealogue/standaloneDemoSession') || 'null')?.complete, { timeout: 60000 });
  await page.locator('[role="tab"]').first().waitFor({ timeout: 20000 });
};
const visit = async (page, path) => { await page.goto(base + path); await ready(page); };
const screenshot = async (page, name) => { await page.screenshot({ path: `${output}/${name}.png` }); };
const imagesReadable = async (page) => {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  try {
    await page.waitForFunction(() => [...document.images].filter((img) => img.src).every((img) => img.complete && img.naturalWidth > 0));
  } catch (error) {
    console.error('Unreadable images', await page.evaluate(() => [...document.images].filter((img) => img.src && (!img.complete || img.naturalWidth === 0)).map((img) => ({ src: img.src, complete: img.complete }))));
    throw error;
  }
};
const storageBlobs = (page) => page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('mealog-managed-media', 1);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('media-blobs', 'readonly');
      const request = tx.objectStore('media-blobs').getAll();
      request.onsuccess = () => resolve(request.result.map((blob) => ({ size: blob.size, type: blob.type })));
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
});

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  let page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  await visit(page, '/');
  const initialMeals = await state(page, 'meals');
  const session = await state(page, 'standaloneDemoSession');
  assert.equal((await state(page, 'peopleProfiles')).length, 5);
  assert.equal(new Set(initialMeals.map((meal) => meal.id)).size, initialMeals.length);
  assert(initialMeals.every((meal) => meal.origin === 'sample' && Date.parse(meal.eatenAt) <= Date.parse(session.anchorDate)));
  assert(initialMeals.every((meal) => meal.photoMediaId && meal.photoUri.startsWith('indexeddb://')));
  assert((await storageBlobs(page)).every((blob) => blob.size > 0 && blob.type.startsWith('image/')));
  await imagesReadable(page);
  await screenshot(page, '01-home-mobile');
  log('Fresh visitor, five people, past/current dates and managed sample photos', { meals: initialMeals.length, anchor: session.anchorDate });
  await page.reload(); await ready(page);
  assert.deepEqual(await state(page, 'meals'), initialMeals);
  assert.deepEqual(await state(page, 'standaloneDemoSession'), session);
  log('Repeat visit does not drift or overwrite sample records');

  await page.getByRole('tab', { name: 'Add', exact: true }).click();
  await page.getByLabel('Meal name', { exact: true }).fill('QA dumplings with Amy');
  await page.getByLabel('Note', { exact: true }).fill('We folded dumplings together and saved the last one for Amy.');
  await page.getByLabel('Location', { exact: true }).fill('Our kitchen');
  await page.getByRole('button', { name: 'Peaceful', exact: true }).click();
  await page.getByRole('button', { name: 'Add people at this meal', exact: true }).click();
  await page.getByRole('checkbox', { name: /Amy/ }).first().click();
  await page.getByText('Add to this meal', { exact: true }).click();
  const source = join(sourceDir, 'source-to-delete.jpg');
  await copyFile('assets/demo/meal-photos/blueberry-toast.jpg', source);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload a meal photo', exact: true }).click();
  await (await chooser).setFiles(source);
  await page.getByRole('button', { name: 'Change meal photo', exact: true }).waitFor();
  await screenshot(page, '02-add-mobile');
  await page.getByRole('button', { name: 'Save meal memory', exact: true }).click();
  await page.waitForURL(/\/meal\//);
  await page.getByText('QA dumplings with Amy', { exact: true }).waitFor();
  const saved = (await state(page, 'meals')).find((meal) => meal.title === 'QA dumplings with Amy');
  assert(saved && saved.origin === 'user' && saved.photoUri.startsWith('indexeddb://'));
  assert(saved.personIds.includes('demo-person-amy'));
  await imagesReadable(page);
  await screenshot(page, '03-saved-detail');
  await rm(source);
  await page.reload();
  await page.getByText('QA dumplings with Amy', { exact: true }).waitFor();
  await imagesReadable(page);
  await screenshot(page, '04-source-deleted-reloaded');
  log('Upload, add mood/person, save to detail, delete computer source, refresh', { id: saved.id, uri: saved.photoUri });

  await page.getByText('Edit', { exact: true }).click();
  await page.getByRole('button', { name: 'Pasta brunch', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForURL(/\/meal\//);
  const replaced = (await state(page, 'meals')).find((meal) => meal.id === saved.id);
  assert.notEqual(replaced.photoMediaId, saved.photoMediaId);
  assert.equal((await state(page, 'meals')).filter((meal) => meal.id === saved.id).length, 1);
  await imagesReadable(page);
  log('Replacing a photo creates a distinct managed image, same meal ID');
  const detailURL = page.url();
  await page.close(); page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(detailURL);
  await page.getByText('QA dumplings with Amy', { exact: true }).waitFor();
  await imagesReadable(page);
  log('Close and reopen App page: meal and image persist');

  for (const path of ['/archive', '/people/demo-person-amy', '/insights', '/collection']) {
    await page.goto(base + path);
    await page.waitForTimeout(1200);
    await imagesReadable(page);
    assert(!/could not be found|Unmatched Route/.test(await page.locator('body').innerText()));
    await screenshot(page, `05-${path.replaceAll('/', '-')}`);
  }
  await visit(page, '/archive');
  assert((await state(page, 'meals')).every((meal) => !meal.photoMediaId || meal.photoThumbnailUri?.startsWith('indexeddb://')));
  await page.getByText('Memories', { exact: true }).click();
  await imagesReadable(page);
  await screenshot(page, '06-month-memories');
  log('Archive/calendar, Month Memories, people, Insights, Collection deep links and thumbnails');

  await visit(page, '/add');
  await page.getByLabel('Meal name', { exact: true }).fill('QA retry memory');
  await page.getByRole('button', { name: 'Hand rolls', exact: true }).click();
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    window.__failMedia = true;
    IDBObjectStore.prototype.put = function (...args) {
      if (window.__failMedia && this.name === 'media-blobs') throw new DOMException('QA quota failure', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Save meal memory', exact: true }).click();
  await page.getByText(/Your memory could not be saved/).waitFor();
  assert.equal((await state(page, 'meals')).filter((meal) => meal.title === 'QA retry memory').length, 0);
  assert.equal(await page.getByLabel('Meal name', { exact: true }).inputValue(), 'QA retry memory');
  await screenshot(page, '07-save-failure');
  await page.evaluate(() => { window.__failMedia = false; });
  await page.getByRole('button', { name: 'Save meal memory', exact: true }).click();
  await page.waitForURL(/\/meal\//);
  assert.equal((await state(page, 'meals')).filter((meal) => meal.title === 'QA retry memory').length, 1);
  log('Actual IndexedDB write failure: visible error, intact form, no corrupt meal, one retry record');

  const sample = initialMeals[0];
  await page.goto(base + `/add?editMealId=${sample.id}`);
  await page.getByLabel('Meal name', { exact: true }).fill('My edited sample');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForURL(/\/meal\//);
  await page.goto(base + '/profile');
  await page.getByText('Clear sample memories', { exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('@mealogue/meals')).length === 3);
  const remaining = await state(page, 'meals');
  assert.equal(remaining.length, 3);
  assert(remaining.every((meal) => meal.origin === 'user'));
  await visit(page, '/');
  assert.equal((await state(page, 'meals')).length, 3);
  log('Clear samples preserves new and edited memories; reload never reseeds');

  await page.goto(base + `/meal/${saved.id}`);
  await page.getByText('Delete this memory', { exact: true }).click();
  await page.waitForFunction((id) => !JSON.parse(localStorage.getItem('@mealogue/meals')).some((meal) => meal.id === id), saved.id);
  await visit(page, '/archive');
  assert(!(await page.locator('body').innerText()).includes('QA dumplings with Amy'));
  log('Delete meal updates Archive without removing other records');

  await page.goto(base + '/profile');
  await page.getByText('中文', { exact: true }).click();
  await screenshot(page, '08-profile-chinese');
  await page.reload();
  await page.getByText('语言', { exact: true }).waitFor();
  for (const path of ['/', '/add', '/archive', '/people', '/insights', '/collection', '/onboarding']) {
    await page.goto(base + path); await page.waitForTimeout(800); await imagesReadable(page);
    await screenshot(page, `09-zh-${path.slice(1) || 'home'}`);
  }
  log('Language preference persists; Chinese screens render without image failures');

  const second = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' });
  const desktop = await second.newPage();
  await visit(desktop, '/');
  assert(!(await state(desktop, 'meals')).some((meal) => meal.origin === 'user'));
  for (const path of ['/', '/add', '/archive', '/insights', '/collection']) {
    await visit(desktop, path); await imagesReadable(desktop);
    const bounds = await desktop.getByTestId('mealog-app').boundingBox();
    assert(bounds.width <= 460 && bounds.height <= 1000);
    const overflow = await desktop.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false);
    await screenshot(desktop, `10-desktop-${path.slice(1) || 'home'}`);
  }
  log('Separate visitors isolated; desktop width <=460, viewport bounded, no document horizontal overflow');
  desktop.on('dialog', (dialog) => dialog.accept());
  await desktop.goto(base + '/profile');
  await desktop.getByText('Clear sample memories', { exact: true }).click();
  await desktop.waitForFunction(() => JSON.parse(localStorage.getItem('@mealogue/meals')).length === 0);
  await visit(desktop, '/insights');
  await desktop.getByText('No meals saved for this month.', { exact: true }).waitFor();
  assert(await desktop.getByRole('button', { name: 'Generate reflection', exact: true }).isDisabled());
  log('Clear untouched samples leaves a usable empty App and disabled empty AI state');
  await second.close();

  const interrupted = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const recover = await interrupted.newPage();
  let blocked = false;
  await recover.route('**/assets/**', async (route) => {
    if (route.request().url().includes('rice-bowl')) { blocked = true; await route.abort(); } else await route.continue();
  });
  await recover.goto(base + '/');
  await recover.getByRole('button', { name: 'Try again', exact: true }).waitFor({ timeout: 60000 });
  assert(blocked);
  const partial = await state(recover, 'meals');
  assert(partial.length > 0 && partial.length < initialMeals.length);
  await screenshot(recover, '11-interrupted-initialization');
  await recover.unroute('**/assets/**');
  await recover.getByRole('button', { name: 'Try again', exact: true }).click();
  await ready(recover);
  assert.equal((await state(recover, 'peopleProfiles')).length, 5);
  assert.equal((await state(recover, 'meals')).length, initialMeals.length);
  log('Interrupted sample import resumes without duplicate people or meals');
  await interrupted.close();

  const legacyContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const legacy = await legacyContext.newPage();
  await legacy.addInitScript(({ image }) => {
    if (localStorage.getItem('legacy-qa-initialized')) return;
    const bytes = Uint8Array.from(atob(image), (char) => char.charCodeAt(0));
    const uri = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
    window.__legacySource = uri;
    const now = new Date().toISOString();
    const meal = { id: 'legacy-meal', title: 'Legacy photo memory', mealType: 'lunch', date: now.slice(0, 10), time: '12:00', photoUri: uri, moodTags: [], peopleTags: [], personIds: ['legacy-person'], createdAt: now, updatedAt: now };
    localStorage.setItem('@mealogue/meals', JSON.stringify([meal, { ...meal, id: 'missing-legacy', title: 'Missing old file', photoUri: 'blob:unavailable-legacy-source' }]));
    localStorage.setItem('@mealogue/peopleProfiles', JSON.stringify([{ id: 'legacy-person', name: 'Legacy friend', avatarUrl: uri, createdAt: now, updatedAt: now }]));
    localStorage.setItem('@mealogue/sharedMealPhotos', JSON.stringify([{ id: 'legacy-shared', mealId: 'legacy-meal', imageUrl: uri, taggedPersonIds: ['legacy-person'], isCover: false, createdAt: now }]));
    localStorage.setItem('legacy-qa-initialized', 'true');
  }, { image: (await readFile('assets/demo/meal-photos/blueberry-toast.jpg')).toString('base64') });
  await visit(legacy, '/');
  const migrated = (await state(legacy, 'meals')).find((meal) => meal.id === 'legacy-meal');
  assert(migrated.photoMediaId && migrated.photoUri.startsWith('indexeddb://'));
  assert((await state(legacy, 'peopleProfiles'))[0].avatarMediaId);
  assert((await state(legacy, 'sharedMealPhotos'))[0].mediaId);
  assert.equal((await state(legacy, 'meals')).length, 2);
  await legacy.evaluate(() => URL.revokeObjectURL(window.__legacySource));
  await legacy.goto(base + '/meal/legacy-meal');
  await legacy.getByText('Legacy photo memory', { exact: true }).waitFor();
  await imagesReadable(legacy);
  await screenshot(legacy, '12-migrated-legacy-media');
  log('Actual legacy blob migration for meal, avatar and shared photo; revoked source survives reload; missing source does not crash', await state(legacy, 'mediaMigrationReport'));
  await legacyContext.close();

  assert.deepEqual(errors, []);
  log('No uncaught browser runtime errors');
  await context.close();
} catch (error) {
  results.push({ test: 'Browser suite', status: 'FAIL', detail: error.stack });
  console.error(error);
  for (const context of browser.contexts()) for (const page of context.pages()) {
    console.error('AT', page.url(), (await page.locator('body').innerText()).slice(-7000));
    await page.screenshot({ path: `${output}/failure-${Date.now()}.png` });
  }
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ base, generatedAt: new Date().toISOString(), results, errors }, null, 2));
  await browser.close();
  await rm(sourceDir, { recursive: true, force: true });
}
