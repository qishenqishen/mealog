import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.MEALOG_URL || 'http://127.0.0.1:8793';
const output = process.env.QA_OUTPUT || 'artifacts/collection-loading';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: true });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const requested = new Set();
  page.on('request', (request) => { if (request.url().includes('/keepsakes/')) requested.add(request.url()); });
  await page.goto(base + '/collection');
  await page.getByText('Keepsake Families', { exact: true }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(300);
  const initialRequests = requested.size;
  assert(initialRequests < 20, 'The whole shelf must not load on entry');
  const stamps = page.getByRole('button', { name: /, (unlocked|in progress|secret)/ });
  const count = await stamps.count();
  assert(count >= 45);
  for (let index = 0; index < count; index++) {
    const stamp = stamps.nth(index);
    await stamp.scrollIntoViewIfNeeded();
    await stamp.locator('img').first().waitFor({ state: 'attached' });
    await page.waitForFunction((element) => [...element.querySelectorAll('img')].every((img) => img.complete && img.naturalWidth > 0), await stamp.elementHandle());
  }
  assert(requested.size > initialRequests);
  await page.screenshot({ path: `${output}/last-shelf.png` });
  results.push({ status: 'PASS', test: 'Only nearby art loads initially; every keepsake decodes after scrolling into view', initialRequests, finalRequests: requested.size, stamps: count });
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  results.push({ status: 'FAIL', error: error.stack });
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ base, testedAt: new Date().toISOString(), results }, null, 2));
}
