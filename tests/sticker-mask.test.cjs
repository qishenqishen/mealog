const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/stickers/food-sticker-worker.js', 'utf8');
const context = vm.createContext({ ort: { env: { wasm: {} } }, self: {}, URL, OffscreenCanvas: class {} });
vm.runInContext(source.replace(/^import .*;$/m, '').replaceAll('import.meta.url', '"https://mealog.test/stickers/worker.js"'), context);
const rgba = new Uint8ClampedArray(5 * 5 * 4);
// A three-pixel meal and separate background plate, including opposite row edges.
for (const pixel of [4, 5, 11, 12, 17]) rgba[pixel * 4 + 3] = 210;
context.keepLargestSubject(rgba, 5);
assert.deepEqual([...rgba].filter((_, i) => i % 4 === 3), [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 210, 210, 0, 0, 0, 0, 210, 0, 0, 0, 0, 0, 0, 0,
]);
const empty = new Uint8ClampedArray(4 * 4 * 4);
context.keepLargestSubject(empty, 4);
assert.ok(empty.every((v) => v === 0));
console.log('PASS: dominant food subject, row boundaries and empty mask');
