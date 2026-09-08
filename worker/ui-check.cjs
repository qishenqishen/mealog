// Offline browser QA against dist; AI responses are explicitly mocked test fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const { chromium } = require('playwright');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, filename);
const { calculateMetrics, MODEL, PROVIDER } = require('../src/insights/contract.ts');

async function main() {
  const root = path.resolve(__dirname, '../dist');
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' }[path.extname(file)] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-US' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      if (localStorage.getItem('insights-qa')) return;
      const date = new Date();
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const now = date.toISOString();
      localStorage.setItem('@mealogue/userIdentity', JSON.stringify({ id: 'qa-user', mode: 'guest', displayName: 'QA', createdAt: now, updatedAt: now }));
      localStorage.setItem('@mealogue/standaloneDemoSession', JSON.stringify({ version: 1, anchorDate: now, complete: true }));
      localStorage.setItem('@mealogue/onboardingComplete', 'true');
      localStorage.setItem('@mealogue/locale', 'en');
      localStorage.setItem('@mealogue/meals', JSON.stringify([
        { id: 'qa-meal-1', userId: 'qa-user', title: 'Quiet lunch', date: `${month}-01`, time: '12:00', mealType: 'lunch', moodTags: ['peaceful'], peopleTags: ['shared-with-friend'], personIds: ['qa-person'], note: 'Soup with a friend.', createdAt: now, updatedAt: now },
      ]));
      localStorage.setItem('@mealogue/peopleProfiles', JSON.stringify([{ id: 'qa-person', userId: 'qa-user', name: 'Alex', relationship: 'Friend', createdAt: now, updatedAt: now }]));
      localStorage.setItem('@mealogue/mealCompanions', JSON.stringify([{ id: 'qa-companion', mealId: 'qa-meal-1', personId: 'qa-person', addedAt: now }]));
      localStorage.setItem('insights-qa', 'true');
    });
    let requests = 0;
    let fail = false;
    await page.route('**/api/insights/monthly', async (route) => {
      requests++;
      const input = route.request().postDataJSON();
      assert.ok(!JSON.stringify(input).includes('Alex'));
      const metrics = calculateMetrics(input.meals);
      if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'ai_unavailable' }, metrics }) });
      const title = input.locale === 'zh' ? '餐桌片刻' : 'A quiet table';
      const text = input.locale === 'zh' ? '你记录了与朋友一起喝汤的午餐。' : 'Your note remembers soup with a friend.';
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        version: 1, month: input.month, locale: input.locale, provider: PROVIDER, model: MODEL, generatedAt: new Date().toISOString(), metrics,
        narrative: { title, observations: [{ text, mealIds: ['qa-meal-1'] }] }, evidenceMealIds: ['qa-meal-1'],
      }) });
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin + '/insights');
    await page.getByRole('button', { name: 'Generate reflection', exact: true }).waitFor();
    assert.equal(requests, 0, 'Opening Insights never generates');
    await page.getByRole('link', { name: /^Alex/ }).waitFor();
    await page.getByRole('button', { name: 'Generate reflection', exact: true }).click();
    await page.getByText('A quiet table', { exact: true }).waitFor();
    assert.equal(requests, 1);
    await page.getByRole('link', { name: /Quiet lunch/ }).click();
    await page.waitForURL('**/meal/qa-meal-1');
    await page.goto(origin + '/insights');
    await page.getByText('A quiet table', { exact: true }).waitFor();
    assert.equal(requests, 1, 'Cached reports load without generation');
    await page.evaluate(() => {
      const meals = JSON.parse(localStorage.getItem('@mealogue/meals'));
      meals[0].note = 'Updated lunch note.';
      localStorage.setItem('@mealogue/meals', JSON.stringify(meals));
    });
    await page.reload();
    await page.getByText('Saved report is out of date. Meal details have changed.', { exact: true }).waitFor();
    fail = true;
    await page.getByRole('button', { name: 'Generate again', exact: true }).click();
    await page.getByText('AI is unavailable right now. Your saved report and meal counts are still available.', { exact: true }).waitFor();
    await page.getByText('A quiet table', { exact: true }).waitFor();
    assert.equal(requests, 2);
    fail = false;
    await page.getByRole('tab', { name: '中文', exact: true }).click();
    await page.getByRole('button', { name: '生成月度回顾', exact: true }).waitFor();
    assert.equal(requests, 2, 'Changing language never generates');
    await page.getByRole('button', { name: '生成月度回顾', exact: true }).click();
    await page.getByText('餐桌片刻', { exact: true }).waitFor();
    const output = '/private/tmp/mealog-insights-ui';
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'mobile-zh.png'), fullPage: true });
    await page.getByRole('button', { name: '上个月', exact: true }).click();
    await page.getByText('本月还没有保存用餐记录。', { exact: true }).waitFor();
    assert.equal(requests, 3, 'Changing month never generates');
    assert.equal(await page.getByRole('button', { name: '生成月度回顾', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: '回到本月', exact: true }).click();
    await page.getByText('餐桌片刻', { exact: true }).waitFor();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('tab', { name: 'English', exact: true }).click();
    await page.getByText('A quiet table', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, 'desktop-en.png'), fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false);
    assert.deepEqual(errors, []);
    console.log('PASS: no auto generation, explicit generate, meal/person links, cache reload, stale edits, failure preservation, month/locale switches; screenshots:', output);
  } finally { await browser?.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
