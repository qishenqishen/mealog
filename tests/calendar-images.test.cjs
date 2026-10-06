// Run: node tests/calendar-images.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Render the real calendar and FoodSticker; only replace native platform boundaries.
const host = tag => ({ children, testID, accessibilityLabel, style }) => React.createElement(tag, {
  'data-testid': testID, 'aria-label': accessibilityLabel,
  'data-style': style?.testStyle,
}, children);
const native = {
  View: host('div'), Text: host('span'), Pressable: host('button'),
  Image: ({ source, accessibilityLabel }) => React.createElement('img', { src: source.uri, alt: accessibilityLabel }),
  StyleSheet: { create: styles => Object.fromEntries(Object.entries(styles).map(([name, value]) => [name, { ...value, testStyle: name }])) },
};
function load(relative, imports, appendix = '') {
  const filename = path.resolve(__dirname, '..', relative);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8') + appendix, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, { Date })((name) => {
    if (name.startsWith('react/')) return require(name);
    assert(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
    return imports[name];
  }, module, module.exports);
  return module.exports;
}
const FoodSticker = load('src/components/FoodSticker.tsx', { 'react-native': native }).default;
const stickerInputs = [];
const { MonthCalendar } = load('app/(tabs)/archive.tsx', {
  react: React, 'react-native': native,
  '../../src/i18n': { useI18n: () => ({ locale: 'en', t: (text, values) => text.replace('{count}', values?.count) }) },
  '../../src/theme': { colors: {}, shadow: {}, fonts: { editorial: "serif", body: "sans-serif" } },
  '../../src/components/FoodSticker': { default: props => {
    stickerInputs.push(props.uri);
    return React.createElement(FoodSticker, props);
  } },
  '../../src/components/LoadState': {}, '../../src/components/MonthlyBookshelf': {},
  '../../src/utils/monthlyBooks': {}, '../../src/storage': {},
  'react-native-safe-area-context': {}, 'expo-router': {},
}, '\nexport { MonthCalendar };');

const meal = (day, extra = {}) => ({ id: `meal-${day}`, date: `2026-09-${String(day).padStart(2, '0')}`, title: `Meal ${day}`, ...extra });
const meals = [
  meal(1, { photoThumbnailUri: 'blob:thumbnail', photoUri: 'blob:original' }),
  meal(2, { stickerUri: 'blob:sticker', photoThumbnailUri: 'blob:unused-thumbnail' }),
  meal(3, { photoUri: 'blob:photo-only' }), meal(4), meal(5),
  meal(6, { photoUri: 'blob:own-photo' }), meal(7),
  meal(8, { photoUri: 'blob:first-meal-photo' }), meal(8, { id: 'second-meal', stickerUri: 'blob:second-meal-sticker' }),
];
const sharedPhotos = [
  { mealId: 'outside-scope', thumbnailUri: 'blob:unrelated' },
  { mealId: 'meal-4', thumbnailUri: 'blob:shared-thumbnail', imageUrl: 'blob:shared-original' },
  { mealId: 'meal-6', thumbnailUri: 'blob:unused-shared' },
  { mealId: 'meal-7', imageUrl: 'blob:shared-photo-only' },
];
const html = renderToStaticMarkup(React.createElement(MonthCalendar, {
  group: { key: '2026-09', meals }, selectedDateKey: '2026-09-01', sharedPhotos, onDayPress() {},
}));
const day = number => {
  const cell = html.match(new RegExp(`<button[^>]*data-testid="calendar-day-2026-09-${String(number).padStart(2, '0')}"[^>]*>[\\s\\S]*?</button>`));
  assert(cell, `Day ${number} must remain a clickable calendar cell`);
  return cell[0];
};
const sources = number => [...day(number).matchAll(/<img[^>]*src="([^"]+)"/g)].map(match => match[1]);
for (const [number, uri] of [[2, 'blob:sticker'], [8, 'blob:second-meal-sticker']]) {
  assert.deepEqual(sources(number), [uri], `Day ${number} should render its saved cutout sticker`);
}
assert.deepEqual(stickerInputs, ['blob:sticker', 'blob:second-meal-sticker'], 'Only stickerUri may be passed to FoodSticker');
for (const number of [1, 3, 4, 5, 6, 7]) {
  assert.deepEqual(sources(number), [], `Day ${number} must not substitute an original, thumbnail, or shared photo for a cutout`);
  assert.match(day(number), /1 meals/);
  assert.match(day(number), /data-style="mealDot"/, 'A meal without a sticker retains its calendar marker');
}
assert.match(day(8), /2 meals/, 'A multi-meal day retains its count while showing an available sticker');
assert.deepEqual(sources(9), []);
assert.doesNotMatch(day(9), /data-style="mealDot"/, 'An empty day does not acquire another day’s image or marker');
assert.doesNotMatch(html, /blob:(?:thumbnail|original|unused-thumbnail|photo-only|shared-thumbnail|shared-original|own-photo|unused-shared|shared-photo-only|first-meal-photo|unrelated)["<]/);
console.log('Calendar collage: saved cutout stickers only, no rectangular photo substitution, multi-meal sticker selection, and meal markers passed.');
