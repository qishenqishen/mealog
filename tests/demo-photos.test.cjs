const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const key = '@mealogue/standaloneDemoSession';
const source = ts.transpileModule(fs.readFileSync('src/demo/seedData.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const clone = (value) => JSON.parse(JSON.stringify(value));

function runtime() {
  const values = new Map(), meals = new Map(), people = new Map(), shared = new Map();
  let now = '2026-09-07T20:00:00.000Z', failId;
  const dependencies = {
    '@react-native-async-storage/async-storage': {
      getItem: async (name) => values.get(name) ?? null,
      setItem: async (name, value) => { values.set(name, value); },
    },
    '../auth': { getCurrentUserId: async () => 'visitor' },
    '../achievements/engine': { evaluateAndPersistAchievements: async () => ({ achievements: [] }) },
    '../services/mealMetadata': { buildMealEatenAt: (date, time) => new Date(`${date}T${time}:00`).toISOString() },
    './demoImageResolver': { resolveDemoImageAssetUri: (asset) => asset },
    './mealPhotoAssets': { DEMO_MEAL_PHOTOS: new Proxy({}, { get: (_, name) => `asset:${name}` }) },
    '../storage': {
      getMeals: async () => [...meals.values()],
      getMealById: async (id) => meals.get(id),
      getPeopleProfiles: async () => [...people.values()],
      getSharedMealPhotos: async (id) => [...shared.values()].filter((photo) => photo.mealId === id),
      saveMealMemory: async (meal, personIds) => {
        if (meal.id === failId) throw new Error('Photo import failed');
        assert(personIds.every((id) => people.has(id)));
        meals.set(meal.id, clone(meal));
      },
      savePersonProfile: async (person) => { people.set(person.id, clone(person)); },
      saveSharedMealPhoto: async (photo) => { shared.set(photo.id, clone(photo)); },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } },
  })((name) => { assert(dependencies[name], name); return dependencies[name]; }, module, module.exports);
  return {
    meals, people, values, seed: module.exports.seedDemoData,
    session: () => JSON.parse(values.get(key)),
    fail: (id) => { failId = id; },
    advance: (date) => { now = date; },
    legacy() {
      for (const id of meals.keys()) if (id.includes('-photo-')) meals.delete(id);
      const session = JSON.parse(values.get(key));
      delete session.photoCollectionVersion;
      delete session.photoCollectionAnchorDate;
      values.set(key, JSON.stringify(session));
    },
  };
}

test('calendar gets 19 photo memories last month and every elapsed day this month, without future dates', async () => {
  const r = runtime();
  await r.seed();
  const meals = [...r.meals.values()];
  assert.equal(meals.length, 26);
  assert.equal(meals.filter((meal) => meal.date.startsWith('2026-08')).length, 19);
  assert.equal(new Set(meals.filter((meal) => meal.date.startsWith('2026-09')).map((meal) => meal.date)).size, 7);
  assert.equal(new Set(meals.map((meal) => meal.photoUri)).size, 19);
  for (const name of ['creamToast', 'fruitGranolaBowl', 'seasonalSalad', 'counterDessert']) {
    assert(meals.some((meal) => meal.photoUri === `asset:${name}`));
  }
  assert(meals.every((meal) => Date.parse(meal.eatenAt) <= Date.parse(r.session().anchorDate)));
  r.advance('2026-10-15T20:00:00.000Z');
  await r.seed();
  assert.deepEqual([...r.meals.values()], meals);
});

test('existing visitors get additions once; personal/edited/deleted meals and removed people stay untouched', async () => {
  const r = runtime();
  await r.seed(); r.legacy();
  r.meals.delete('demo-meal-current-03');
  r.people.delete('demo-person-amy');
  r.meals.get('demo-meal-current-01').origin = 'user';
  r.meals.get('demo-meal-current-01').title = 'My own breakfast';
  r.meals.set('personal', { id: 'personal', origin: 'user', title: 'Mine' });
  const retained = clone([...r.meals.values()]);
  await r.seed();
  for (const meal of retained) assert.deepEqual(r.meals.get(meal.id), meal);
  assert(!r.meals.has('demo-meal-current-03'));
  assert(!r.people.has('demo-person-amy'));
  assert.equal([...r.meals.keys()].filter((id) => id.includes('-photo-')).length, 13);
  r.meals.delete('demo-meal-current-photo-01');
  await r.seed();
  assert(!r.meals.has('demo-meal-current-photo-01'));
});

test('photo expansion resumes after failure with stable dates and without duplicate records', async () => {
  const r = runtime();
  await r.seed(); r.legacy();
  r.fail('demo-meal-previous-photo-04');
  await assert.rejects(r.seed(), /Photo import failed/);
  assert.equal(r.session().photoCollectionVersion, undefined);
  const first = clone(r.meals.get('demo-meal-previous-photo-01'));
  r.advance('2026-10-15T20:00:00.000Z'); r.fail(undefined);
  await r.seed();
  assert.equal(r.meals.size, 26);
  assert.deepEqual(r.meals.get(first.id), first);
  assert([...r.meals.values()].every((meal) => meal.date < '2026-09-08'));
  assert.equal(r.session().photoCollectionVersion, 1);
});

test('cleared samples and legacy-only installations never get refilled', async () => {
  const r = runtime();
  await r.seed(); r.legacy(); r.meals.clear();
  r.meals.set('personal', { id: 'personal', origin: 'user' });
  await r.seed();
  assert.equal(r.meals.size, 1);
  const legacy = runtime();
  legacy.meals.set('old', { id: 'old' });
  await legacy.seed(); await legacy.seed();
  assert.deepEqual([...legacy.meals.values()], [{ id: 'old' }]);
});
