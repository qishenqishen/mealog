const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const { Module } = require('node:module');
const filename = require('node:path').resolve('src/utils/monthlyBooks.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const mod = new Module(filename, module);
mod._compile(compiled, filename);
const { isBookMonth, scopeMeals, monthMeals, shelfMonths, BOOK_MONTHS } = mod.exports;
const meals = [
  { id: 'sample', origin: 'sample', date: '2026-09-01', time: '08:00' },
  { id: 'later', origin: 'user', date: '2026-09-12', time: '18:00' },
  { id: 'earlier', date: '2026-09-12', time: '08:00' },
  { id: 'other-year', origin: 'user', date: '2025-09-01', time: '08:00' },
  { id: 'other-month', origin: 'user', date: '2026-08-01', time: '08:00' },
];
assert.deepEqual(monthMeals(scopeMeals(meals, 'personal'), '2026-09').map(m => m.id), ['earlier', 'later']);
assert.deepEqual(monthMeals(scopeMeals(meals, 'sample'), '2026-09').map(m => m.id), ['sample']);
assert.deepEqual(monthMeals(meals, '2026-07'), []);
assert.equal(meals[0].id, 'sample');
for (const invalid of [undefined, ['2026-09'], '2026-00', '2026-13', '2026-1', '<script>', '2026-09-01']) assert.equal(isBookMonth(invalid), false);
assert.equal(isBookMonth('2026-09'), true);
assert.equal(BOOK_MONTHS.length, 12);
console.log('Monthly books: scoped provenance, chronological order, year boundaries, empty month, route validation passed.');

assert.deepEqual(shelfMonths(2026, new Date(2026, 8, 12)), ['2026-09','2026-08','2026-07','2026-06','2026-05','2026-04','2026-03','2026-02','2026-01']);
assert.equal(shelfMonths(2025, new Date(2026, 8, 12)).length, 12);
assert.deepEqual(shelfMonths(2027, new Date(2026, 8, 12)), []);
