import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium, expect } from 'playwright/test';
import ts from 'typescript';

const contract = await readFile(new URL('../src/insights/contract.ts', import.meta.url), 'utf8');
const shared = {};
new Function('exports', ts.transpileModule(contract, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(shared);
const { calculateMetrics, CONTENT_VERSION, MODEL, PROVIDER } = shared;

// Real local Worker, paired browser identities and synthetic memories. AI output is fixed.
const base = new URL(process.env.MEALOG_URL || 'http://127.0.0.1:8794');
assert.equal(base.hostname, '127.0.0.1', 'Use an isolated local preview for slow-mail QA');
const output = process.env.QA_OUTPUT || 'artifacts/slow-mail';
await mkdir(output, { recursive: true });
const fixtures = await Promise.all(['blueberry-toast.jpg', 'sushi-set.jpg'].map(file => readFile(new URL(`../assets/demo/meal-photos/${file}`, import.meta.url))));
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: true });
const options = { viewport: { width: 390, height: 844 }, locale: 'en-US' };
const open = (page, path) => page.goto(new URL(path, base).href);
const signature = 'Taylor QA';
const memory = 'Jamie and I saved the last bite on both days.';
try {
  const recipientContext = await browser.newContext(options);
  const receiver = await recipientContext.newPage();
  await receiver.addInitScript(() => localStorage.setItem('@mealogue/locale', 'en'));
  await open(receiver, '/slow-mail');
  const recipientAddress = receiver.getByLabel('My mailing address', { exact: true });
  await expect(recipientAddress).toHaveText(/^[a-f0-9]{64}$/, { timeout: 60000 });
  const address = await recipientAddress.innerText();
  await expect(receiver.getByText('Your mailbox is quiet')).toBeVisible();

  const senderContext = await browser.newContext(options);
  const sender = await senderContext.newPage();
  await sender.addInitScript(({ images }) => {
    localStorage.setItem('@mealogue/locale', 'en');
    if (localStorage.getItem('slow-mail-browser-fixture')) return;
    const now = new Date();
    const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    const timestamp = now.toISOString();
    localStorage.setItem('@mealogue/peopleProfiles', JSON.stringify([{ id: 'jamie', name: 'Jamie' }, { id: 'alex', name: 'Alex' }].map(person => ({ ...person, origin: 'user', createdAt: timestamp, updatedAt: timestamp }))));
    localStorage.setItem('@mealogue/meals', JSON.stringify([
      { id: 'shared-toast', title: 'Blueberry toast', personIds: ['jamie'], photoUri: `data:image/jpeg;base64,${images[0]}` },
      { id: 'shared-sushi', title: 'Sushi lunch', personIds: ['jamie'], photoUri: `data:image/jpeg;base64,${images[1]}` },
      { id: 'other-meal', title: 'Another table', personIds: ['alex'] },
    ].map(meal => ({ ...meal, origin: 'user', date, time: '12:00', mealType: 'lunch', moodTags: [], peopleTags: [], createdAt: timestamp, updatedAt: timestamp }))));
    localStorage.setItem('slow-mail-browser-fixture', 'true');
  }, { images: fixtures.map(bytes => bytes.toString('base64')) });
  await sender.route('**/api/insights/monthly', async route => {
    const { month, locale, period, rangeStart, rangeEnd, meals } = route.request().postDataJSON();
    await route.fulfill({ json: {
      version: 1, contentVersion: CONTENT_VERSION, month, locale, period, rangeStart, rangeEnd, provider: PROVIDER, model: MODEL,
      generatedAt: new Date().toISOString(), evidenceMealIds: meals.map(meal => meal.id), metrics: calculateMetrics(meals),
      narrative: { title: 'Three meals, two tables', observations: [
        { text: memory, mealIds: ['shared-toast', 'shared-sushi'] },
        { text: 'I ate at two different tables.', mealIds: ['shared-toast', 'other-meal'] },
      ] },
    } });
  });

  await open(sender, '/insights?period=month');
  const anchor = sender.getByLabel('Period anchor date YYYY-MM-DD');
  const recordedDate = await anchor.inputValue();
  const generate = sender.getByRole('button', { name: 'Compose a reflection', exact: true });
  await expect(generate).toBeVisible({ timeout: 60000 });
  await sender.getByLabel('Allow AI text upload').click();
  await generate.click();
  const draft = sender.getByRole('button', { name: 'Send at month end', exact: true });
  await expect(sender.getByText('I ate at two different tables.')).toBeVisible();
  await expect(draft).toHaveCount(1);
  await draft.click();
  const seal = sender.getByRole('button', { name: 'Seal for month-end delivery' });
  await expect(seal).toBeDisabled();
  await expect(sender.getByLabel('Letter text', { exact: true })).toHaveValue(memory);
  await sender.getByLabel('Your signature', { exact: true }).fill(signature);
  const addressField = sender.getByLabel('Recipient mailbox address', { exact: true });
  await addressField.fill('wrong');
  await expect(sender.getByText('Enter the other person’s 64-character mailbox address.')).toBeVisible();
  await expect(seal).toBeDisabled();
  await addressField.fill(address);
  await expect(seal).toBeDisabled();
  await sender.getByRole('checkbox', { name: 'Include original photo from Sushi lunch' }).click();
  await expect(seal).toBeEnabled();
  await sender.screenshot({ path: `${output}/composer-mobile.png`, animations: 'disabled' });
  const submitted = sender.waitForResponse(response => new URL(response.url()).pathname === '/api/slow-mail' && response.request().method() === 'POST');
  await seal.click();
  const response = await submitted;
  assert(response.ok(), await response.text());
  const { letter } = await response.json();
  assert.equal(letter.photos.length, 1);
  assert.equal(letter.text, memory);
  const senderKey = await sender.evaluate(() => localStorage.getItem('@mealogue/slowMailKey'));
  const original = await senderContext.request.get(new URL(`/api/slow-mail/${letter.id}/photos/0`, base).href, { headers: { Authorization: `Bearer ${senderKey}` } });
  assert(original.ok());
  assert.deepEqual(await original.body(), fixtures[1]);

  await expect(sender.getByText('Your letter is sealed.')).toBeVisible();
  await sender.screenshot({ path: `${output}/sealed-mobile.png` });
  await sender.getByRole('button', { name: 'Open mailbox', exact: true }).click();
  await sender.getByRole('button', { name: 'Sent letters', exact: true }).click();
  await expect(sender.getByText('2 of 3 letters left this month', { exact: true })).toBeVisible();
  await sender.getByRole('button', { name: 'Read letter to Jamie · 1' }).click();
  await expect(sender.getByText(memory, { exact: true }).filter({ visible: true })).toBeVisible();
  await sender.screenshot({ path: `${output}/sent-letter-mobile.png` });

  await receiver.reload();
  await expect(receiver.getByText('Your mailbox is quiet')).toBeVisible();
  const recipientKey = await receiver.evaluate(() => localStorage.getItem('@mealogue/slowMailKey'));
  const hiddenPhoto = await recipientContext.request.get(new URL(`/api/slow-mail/${letter.id}/photos/0`, base).href, { headers: { Authorization: `Bearer ${recipientKey}` } });
  assert.equal(hiddenPhoto.status(), 404);
  await open(sender, '/insights?slowMail=1&personId=jamie&date=2025-06-15');
  await expect(anchor).toHaveValue('2025-06-15');
  await expect(sender.getByText('2025-06-01 — 2025-06-30', { exact: true })).toBeVisible();
  await anchor.fill(recordedDate);
  await expect(sender.getByText('2 moments', { exact: true })).toBeVisible();
  console.log('PASS person/month link, shared-only draft, mobile composer, selected original bytes, one quota used, recipient sealed until release');
} finally {
  await browser.close();
}
