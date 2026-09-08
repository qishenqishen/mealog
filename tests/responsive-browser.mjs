import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.MEALOG_URL || 'http://127.0.0.1:8793';
const output = process.env.QA_OUTPUT || 'artifacts/responsive';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.CHROME_CHANNEL || 'chrome', headless: true });
const results = [];
try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const context = await browser.newContext({ viewport, locale: 'zh-CN' });
    const page = await context.newPage();
    for (const route of ['/', '/add', '/archive', '/insights', '/collection']) {
      await page.goto(base + route);
      await page.getByRole('tab', { name: '首页', exact: true }).waitFor({ timeout: 60000 });
      await page.waitForFunction(() => [...document.images].every((img) => !img.src || (img.complete && img.naturalWidth > 0)));
      assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
      const dimensions = await page.getByTestId('mealog-app').boundingBox();
      assert(dimensions.width <= 460 && Math.abs(dimensions.height - viewport.height) <= 1);
      const nav = await page.getByRole('tab', { name: '首页', exact: true }).boundingBox();
      assert(nav.y >= 0 && nav.y + nav.height <= viewport.height + 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false);
      await page.screenshot({ path: `${output}/${viewport.width}-${route.slice(1) || 'home'}.png` });
      results.push({ status: 'PASS', viewport, route, app: dimensions });
    }
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
  const page = await context.newPage();
  await page.goto(base + '/add');
  await page.getByLabel('Note', { exact: true }).waitFor({ timeout: 60000 });
  await page.getByLabel('Note', { exact: true }).fill('A longer note, with the keyboard taking up part of the screen.');
  await page.getByLabel('Note', { exact: true }).focus();
  await page.setViewportSize({ width: 390, height: 450 });
  const save = page.getByRole('button', { name: 'Save meal memory', exact: true });
  await save.scrollIntoViewIfNeeded();
  const button = await save.boundingBox();
  const nav = await page.getByRole('tab', { name: 'Home', exact: true }).boundingBox();
  assert(button.y >= 0 && button.y + button.height <= nav.y + 1);
  await page.screenshot({ path: `${output}/reduced-viewport-form.png` });
  results.push({ status: 'PASS', test: 'Reduced-height focused form can scroll the save control above the fixed navigation; simulated viewport, not a physical keyboard test' });
  await context.close();
} catch (error) {
  results.push({ status: 'FAIL', error: error.stack });
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ base, testedAt: new Date().toISOString(), results }, null, 2));
  console.log(JSON.stringify(results, null, 2));
}
