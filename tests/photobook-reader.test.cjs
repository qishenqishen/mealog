// Run: node tests/photobook-reader.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../public/photobook-runtime');
assert(!fs.existsSync(path.resolve(root, '../photobook/index.html')), 'Static reader must not shadow the /photobook app route on refresh');

// A small DOM boundary lets this check exercise real page construction without a browser server.
class Node {
  constructor(tagName = 'div') { this.tagName = tagName.toUpperCase(); this.children = []; this.dataset = {}; this.attrs = {}; this.events = {}; this.textContent = ''; this.style = { values: {}, setProperty(name, value) { this.values[name] = value; } }; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attrs[name] = value; }
  addEventListener(name, callback) { this.events[name] = callback; }
}
const nodes = new Map();
const events = {};
const messages = [];
const stored = new Map();
const origin = 'https://mealog.test';
const parent = { postMessage(message, target) { assert.equal(target, origin); messages.push(message); } };
let engine;
class PageFlip {
  constructor() { this.events = {}; this.page = 0; engine = this; }
  on(name, callback) { this.events[name] = callback; }
  loadFromHTML(pages) { this.pages = pages; this.events.init({ data: { mode: 'portrait' } }); }
  updateFromHtml(pages) { this.pages = pages; }
  turnToPage(page) { this.page = page; this.events.flip({ data: page }); }
  turnToPrevPage() { this.turnToPage(this.page - 1); }
  turnToNextPage() { this.turnToPage(this.page + 1); }
  getBoundsRect() { return { pageWidth: 480 }; }
  update() {}
  destroy() { this.destroyed = true; }
}
const context = {
  URL, location: { origin }, parent, St: { PageFlip }, innerHeight: 844,
  MutationObserver: class { observe() {} disconnect() {} },
  ResizeObserver: class { observe() {} disconnect() {} },
  requestAnimationFrame: callback => callback(),
  matchMedia: () => ({ matches: true }),
  sessionStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) },
  document: {
    createElement: tag => new Node(tag), documentElement: new Node('html'),
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, new Node()); return nodes.get(selector); },
  },
  addEventListener: (name, callback) => { events[name] = callback; },
};
context.window = context;
context.document.querySelector('#book').dataset = { pageWidth: '480', pageHeight: '640' };
vm.runInNewContext(fs.readFileSync(path.join(root, 'flipbook.js'), 'utf8'), context);
const visit = data => events.message({ origin, source: parent, data: { channel: 'mealog-photobook-v1', type: 'init', ...data } });
const all = root => [root, ...root.children.flatMap(all)];
const photo = 'data:image/png;base64,iVBORw0KGgo=';
const meal = { id: 'first', title: '<img src=x onerror=alert(1)>', date: '2026-09-01', time: '12:30', note: 'Original note\n<script>not markup</script>', photoUri: photo,
  companions: [{ personId: 'friend', name: 'Lina <img src=x>' }, { name: 'Old <script>name</script>' }] };
const payload = { month: '2026-09', locale: 'en', scope: 'personal', coverUri: '/assets/table-hero-september.png', theme: { en: 'September', zh: '九月', color: '#606a52', ink: '#faf7ee' },
  meals: [meal, ...Array.from({ length: 6 }, (_, index) => ({ id: `meal-${index}`, title: `Food ${index}`, date: '2026-09-02', time: '18:00', photoUri: index ? undefined : 'javascript:alert(1)' }))] };

events.message({ origin: 'https://other.test', source: parent, data: { channel: 'mealog-photobook-v1', type: 'init', ...payload } });
assert.equal(engine, undefined, 'Reject foreign origins');
events.message({ origin, source: {}, data: { channel: 'mealog-photobook-v1', type: 'init', ...payload } });
assert.equal(engine, undefined, 'Reject sibling frames');
visit(payload);
assert(messages.some(message => message.type === 'initialized'));
assert.equal(engine.pages.length % 2, 0, 'Book closes on an even final leaf');
assert.equal(engine.pages[0].dataset.density, 'hard');
assert.equal(all(engine.pages[0]).find(node => node.tagName === 'IMG').src, `${origin}/assets/table-hero-september.png`, 'Cover always uses the month illustration');
assert.equal(engine.pages.at(-1).dataset.density, 'hard');
assert(engine.pages.slice(1, -1).every(page => !page.dataset.density));
const mealPages = engine.pages.filter(page => page.dataset.mealId);
assert.equal(mealPages.length, payload.meals.length, 'Every meal remains in the book, with or without a photograph');
assert.equal(engine.pages.filter(page => page.className.includes('archive-page')).length, 2, 'Food archive paginates all meals');
assert(all(mealPages[0]).some(node => node.textContent === meal.note), 'Retain exact note without generated text');
assert(all(mealPages[0]).some(node => node.textContent === meal.title), 'Titles remain plain text');
const personLink = all(mealPages[0]).find(node => node.className === 'company-person');
assert.equal(personLink.textContent, `${meal.companions[0].name} ↗`, 'Companion names remain plain text');
personLink.events.click({ stopPropagation() {} });
assert.equal(messages.at(-1).type, 'person');
assert.equal(messages.at(-1).id, 'friend', 'Companion byline opens the actual person');
const snapshotName = all(mealPages[0]).find(node => node.className === 'company-snapshot');
assert.equal(snapshotName.textContent, meal.companions[1].name);
assert.equal(snapshotName.events.click, undefined, 'Deleted people retain their snapshot without a broken link');
assert(engine.pages.flatMap(all).filter(node => node.tagName === 'IMG').every(node => !node.src.startsWith('javascript:')));
assert(engine.pages.slice(1).every(page => page.inert && page.attrs['aria-hidden'] === 'true'), 'Hidden pages are inaccessible');
engine.events.changeOrientation({ data: 'landscape' });
assert.equal(nodes.get('#book').style.values['--cover-offset'], '-240px', 'Closed cover centers by its actual leaf width');
engine.events.changeState({ data: 'flipping' });
assert.equal(nodes.get('#book').style.values['--cover-offset'], '0px', 'Opening cover recenters when the turn starts, before the left leaf opens');
engine.events.changeState({ data: 'read' });
engine.events.changeOrientation({ data: 'portrait' });
assert.equal(nodes.get('#book').style.values['--cover-offset'], '0px', 'Portrait resize clears the spread offset');
nodes.get('#next').events.click();
assert.equal(engine.page, 1, 'Reduced motion turns directly');
assert.equal(engine.pages[1].inert, false);
nodes.get('#jump-archive').events.click();
assert(engine.pages[engine.page].className.includes('archive-page'));
const food = all(engine.pages[engine.page]).find(node => node.className === 'food-item');
food.events.click({ stopPropagation() {} });
assert.equal(messages.at(-1).type, 'meal');
assert.equal(messages.at(-1).id, meal.id, 'Archive links to the original record');
engine.turnToPage(3);
visit({ ...payload, meals: [{ ...meal, companions: [{ personId: 'friend', name: 'Updated name' }] }, ...payload.meals.slice(1)] });
assert.equal(engine.page, 3, 'Returning from a person preserves the book position even after a name update');
for (const companions of ['invalid', [null], [{ name: {} }], [{ name: 'Lina', personId: 42 }], [{ name: 'Lina', personId: '' }]]) {
  visit({ ...payload, meals: [{ ...meal, companions }] });
  assert.equal(messages.at(-1).type, 'error', 'Reject malformed companion payloads at the iframe boundary');
}
visit({ ...payload, meals: [] });
assert.equal(engine.pages.filter(page => page.dataset.mealId).length, 0);
assert(engine.pages.flatMap(all).some(node => node.textContent === 'This month is waiting for its first memory.'));
visit({ ...payload, month: '2026-99' });
assert.equal(messages.at(-1).type, 'error', 'Invalid input fails visibly');
events.pagehide();
assert(engine.destroyed, 'Reader tears down on leave');
for (const file of ['style/book-style.css', 'style/paper-grain.svg', 'style/cloth-weave.svg', 'style/fonts/LICENSE.md', 'vendor/page-flip.browser.js', 'vendor/PAGE-FLIP-LICENSE']) {
  assert(fs.statSync(path.join(root, file)).isFile(), `Bundled asset exists: ${file}`);
}
// Exercise the parent bridge too: frame messages may only open linked, live people in this book.
const bridgeEvents = {};
const childFrame = {};
const personVisits = [];
let refs = 0;
const bridgeWindow = { location: { origin }, setTimeout: () => 1, clearTimeout() {},
  addEventListener: (name, callback) => { bridgeEvents[name] = callback; }, removeEventListener() {} };
const bridge = { exports: {}, window: bridgeWindow, require(name) {
  if (name === 'react') return { useEffect: callback => callback(), useMemo: callback => callback(),
    useRef: value => ({ current: refs++ === 0 ? { contentWindow: childFrame } : value }), useState: () => [false, () => {}] };
  if (name === 'react/jsx-runtime') return { jsx() {}, jsxs() {} };
  if (name.endsWith('/monthlyBooks')) return { BOOK_MONTHS: Array(12).fill(payload.theme) };
  if (name.endsWith('/heroAssets')) return { getHeroAssetForMonth: () => '' };
  if (name.endsWith('/demoImageResolver')) return { resolveDemoImageAssetUri: () => '' };
  throw new Error(`Unexpected reader dependency: ${name}`);
} };
const ts = require('typescript');
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(root, '../../src/components/MonthlyBookReader.web.tsx'), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText, bridge);
bridge.exports.default({ ...payload, companions: { first: meal.companions, 'out-of-scope-meal': [{ personId: 'outsider', name: 'Other' }] }, onPersonPress: id => personVisits.push(id) });
const personMessage = (id, overrides = {}) => bridgeEvents.message({ origin, source: childFrame, data: { channel: 'mealog-photobook-v1', type: 'person', id }, ...overrides });
personMessage('friend', { origin: 'https://other.test' });
personMessage('friend', { source: {} });
personMessage('outsider');
personMessage('deleted');
assert.equal(personVisits.length, 0, 'Parent refuses foreign, unrelated and deleted profile navigation');
personMessage('friend');
assert.deepEqual(personVisits, ['friend']);
console.log('PASS photobook: secure person/meal bridges, companion snapshots, faithful meals/notes, complete archive, page order, reduced motion, accessibility, teardown, bundled assets');
