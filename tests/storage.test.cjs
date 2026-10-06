const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const timestamp = '2026-09-01T12:00:00.000Z';
const imageBlob = (label = 'original', width = 1200, height = 2400) =>
  new Blob([JSON.stringify({ label, width, height })], { type: 'image/png' });

// Exercise the actual TS modules with isolated platform boundaries, without adding a test dependency.
function runtime(platform = 'web') {
  const values = new Map();
  const blobs = new Map();
  const files = new Map();
  const sources = new Map();
  const urls = new Map();
  const revoked = [];
  const writes = [];
  const thumbnails = [];
  const failures = [];
  let sequence = 0;
  const fail = (operation, key, options = {}) => failures.push({ operation, key, ...options });
  const takeFailure = (operation, key) => {
    const index = failures.findIndex((item) => item.operation === operation && item.key === key);
    return index < 0 ? undefined : failures.splice(index, 1)[0];
  };
  const storage = {
    async getItem(key) {
      await Promise.resolve();
      if (takeFailure('get', key)) throw new Error('Injected storage read failure');
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      await Promise.resolve();
      writes.push(key);
      const failure = takeFailure('set', key);
      if (!failure || failure.after) values.set(key, value);
      if (failure) throw new Error('Injected storage write failure');
    },
    async removeItem(key) {
      if (takeFailure('remove', key)) throw new Error('Injected storage remove failure');
      values.delete(key);
    },
    async multiRemove(keys) { keys.forEach((key) => values.delete(key)); },
  };
  const fileSystem = {
    documentDirectory: 'file:///documents/',
    EncodingType: { Base64: 'base64' },
    async makeDirectoryAsync() {},
    async copyAsync({ from, to }) {
      if (!files.has(from)) throw new Error('Source file is unreadable');
      files.set(to, { ...files.get(from) });
    },
    async getInfoAsync(uri) {
      const file = files.get(uri);
      return file ? { exists: true, isDirectory: false, size: file.bytes.length } : { exists: false };
    },
    async deleteAsync(uri) { files.delete(uri); },
    async downloadAsync(uri, destination) {
      const file = files.get(uri);
      if (file) files.set(destination, { ...file });
      return { status: file ? 200 : 404 };
    },
  };
  const indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          objectStoreNames: { contains: () => true },
          close() {},
          transaction() {
            const transaction = {};
            const operation = (action, key, value) => {
              const item = {};
              queueMicrotask(() => {
                const failure = takeFailure(`blob-${action}`, key);
                if (failure) {
                  transaction.error = new Error('Injected media transaction abort');
                  transaction.onabort?.();
                  return;
                }
                if (action === 'put') blobs.set(key, value);
                if (action === 'delete') blobs.delete(key);
                if (action === 'get') item.result = blobs.get(key);
                item.onsuccess?.();
                transaction.oncomplete?.();
              });
              return item;
            };
            transaction.objectStore = () => ({
              put: (value, key) => operation('put', key, value),
              get: (key) => operation('get', key),
              delete: (key) => operation('delete', key),
            });
            return transaction;
          },
        };
        request.onsuccess();
      });
      return request;
    },
  };
  const context = vm.createContext({
    console, Blob, Error, Uint8Array, ArrayBuffer, TextEncoder, TextDecoder, setTimeout: (callback) => 0, URL: {
      createObjectURL(blob) { const uri = `blob:display-${++sequence}`; urls.set(uri, blob); return uri; },
      revokeObjectURL(uri) { revoked.push(uri); urls.delete(uri); },
    },
    crypto: { randomUUID: () => `generated-${++sequence}` },
    indexedDB,
    async fetch(uri) {
      const blob = sources.get(uri) ?? urls.get(uri);
      if (blob instanceof Error) throw blob;
      return { ok: Boolean(blob), blob: async () => blob };
    },
    async createImageBitmap(blob) {
      const parsed = JSON.parse(await blob.text());
      return { ...parsed, close() {} };
    },
    document: {
      createElement(tag) {
        assert.equal(tag, 'canvas');
        return {
          width: 0, height: 0,
          getContext: () => ({ drawImage() {} }),
          toBlob(callback) {
            thumbnails.push({ width: this.width, height: this.height });
            callback(imageBlob('thumbnail', this.width, this.height));
          },
        };
      },
    },
  });
  const mocks = {
    fflate: require('fflate'),
    '@react-native-async-storage/async-storage': storage,
    'expo-file-system/legacy': fileSystem,
    'react-native': {
      Platform: { OS: platform },
      Image: { async getSize(uri) {
        const file = files.get(uri);
        if (!file || !file.width || !file.height) throw new Error('Invalid image encoding');
        return { width: file.width, height: file.height };
      } },
    },
    'expo-image-manipulator': {
      SaveFormat: { JPEG: 'jpeg' },
      async manipulateAsync(uri, actions) {
        const resize = actions[0].resize;
        thumbnails.push(resize);
        const result = `file:///cache/thumbnail-${++sequence}.jpg`;
        files.set(result, { bytes: 'thumbnail', ...resize });
        return { uri: result, ...resize };
      },
    },
  };
  const modules = new Map();
  function load(filename) {
    const absolute = path.resolve(root, filename);
    if (modules.has(absolute)) return modules.get(absolute).exports;
    const module = { exports: {} };
    modules.set(absolute, module);
    const source = fs.readFileSync(absolute, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: absolute,
    }).outputText;
    const localRequire = (specifier) => {
      if (mocks[specifier]) return mocks[specifier];
      if (!specifier.startsWith('.')) throw new Error(`Unexpected dependency: ${specifier}`);
      const base = path.resolve(path.dirname(absolute), specifier);
      return load(fs.existsSync(`${base}.ts`) ? `${base}.ts` : path.join(base, 'index.ts'));
    };
    vm.runInContext(`(function(require, module, exports) {${output}\n})`, context, { filename: absolute })(
      localRequire, module, module.exports,
    );
    return module.exports;
  }
  const api = load('src/storage/index.ts');
  const media = load('src/media/managedMedia.ts');
  return {
    load, api, media, values, blobs, files, sources, urls, revoked, writes, thumbnails, fail, context,
    read: (key) => JSON.parse(values.get(key) ?? '[]'),
    store: (key, value) => values.set(key, JSON.stringify(value)),
  };
}

const meal = (id, extra = {}) => ({
  id, title: 'Lunch', mealType: 'lunch', date: '2026-09-01', time: '12:00',
  moodTags: [], peopleTags: [], createdAt: timestamp, updatedAt: timestamp, ...extra,
});
const person = (id, extra = {}) => ({ id, name: id, createdAt: timestamp, updatedAt: timestamp, ...extra });
const photo = (id, mealId, extra = {}) => ({
  id, mealId, imageUrl: 'blob:picker', taggedPersonIds: [], createdAt: timestamp, ...extra,
});
const plain = (value) => JSON.parse(JSON.stringify(value));

test('picker replacements import distinct persistent originals for meals, people, and shared photos', async () => {
  const r = runtime();
  r.sources.set('blob:picker', imageBlob('old'));
  r.sources.set('blob:new', imageBlob('new'));
  await r.api.saveMeal(meal('meal', { photoUri: 'blob:picker', origin: 'sample' }));
  const first = r.read(r.api.KEYS.meals)[0];
  await r.api.saveMeal(meal('meal', { photoUri: 'blob:new', origin: 'user' }));
  const second = r.read(r.api.KEYS.meals)[0];
  assert.notEqual(first.photoMediaId, second.photoMediaId);
  assert.equal(JSON.parse(await r.blobs.get(second.photoMediaId).text()).label, 'new');
  assert.equal(second.origin, 'user');
  assert.match(second.photoUri, /^indexeddb:/);

  const oldPerson = await r.api.savePersonProfile(person('person', { avatarUrl: 'blob:picker', origin: 'sample' }));
  const newPerson = await r.api.savePersonProfile(person('person', { avatarUrl: 'blob:new', origin: 'user' }));
  assert.notEqual(oldPerson.avatarMediaId, newPerson.avatarMediaId);
  const oldPhoto = await r.api.saveSharedMealPhoto(photo('photo', 'meal', { origin: 'sample' }));
  const newPhoto = await r.api.saveSharedMealPhoto(photo('photo', 'meal', { imageUrl: 'blob:new', origin: 'user' }));
  assert.notEqual(oldPhoto.mediaId, newPhoto.mediaId);
  assert.equal(newPhoto.origin, 'user');
  assert.ok(r.thumbnails.every(({ width, height }) => Math.max(width, height) <= 520));
  assert.ok(r.thumbnails.every(({ width, height }) => width === 260 && height === 520));
});

test('reuse requires an explicit readable media ID; even managed sources without ID get their own copy', async () => {
  const r = runtime();
  r.sources.set('blob:picker', imageBlob());
  await r.api.saveMeal(meal('meal', { photoUri: 'blob:picker' }));
  const stored = r.read(r.api.KEYS.meals)[0];
  const hydrated = await r.api.getMealById('meal');
  await r.api.saveMeal({ ...hydrated, title: 'Edited' });
  assert.equal(r.read(r.api.KEYS.meals)[0].photoMediaId, stored.photoMediaId);
  await r.api.saveMeal(meal('copy', { photoUri: stored.photoUri }));
  assert.notEqual(r.read(r.api.KEYS.meals).find((item) => item.id === 'copy').photoMediaId, stored.photoMediaId);
  r.blobs.delete(stored.photoMediaId);
  const before = r.values.get(r.api.KEYS.meals);
  await assert.rejects(r.api.saveMeal({ ...hydrated, title: 'Must fail' }), /saved image could not be verified/);
  assert.equal(r.values.get(r.api.KEYS.meals), before);
  await assert.rejects(r.api.saveMeal(meal('bad-id', { photoMediaId: 'missing', photoUri: 'blob:picker' })), /saved image is missing/);
});

test('empty, non-image, unreadable and undecodable sources do not alter an existing meal', async () => {
  const r = runtime();
  await r.api.saveMeal(meal('meal'));
  const before = r.values.get(r.api.KEYS.meals);
  const inputs = [
    new Blob([], { type: 'image/png' }), new Blob(['text'], { type: 'text/plain' }),
    new Blob(['corrupt'], { type: 'image/png' }), new Error('Picker permission expired'),
  ];
  for (const input of inputs) {
    r.sources.set('blob:bad', input);
    await assert.rejects(r.api.saveMeal(meal('meal', { photoUri: 'blob:bad' })), /image could not be saved/);
    assert.equal(r.values.get(r.api.KEYS.meals), before);
    assert.equal(r.blobs.size, 0);
    assert.equal((await r.media.getManagedMediaRecords()).length, 0);
  }
});

test('saveMealMemory rolls back a partially applied companion write and retries with one stable meal ID', async () => {
  const r = runtime();
  r.sources.set('blob:picker', imageBlob());
  await r.api.savePersonProfile(person('person'));
  r.fail('set', r.api.KEYS.mealCompanions, { after: true });
  const draft = meal('retry-id', { photoUri: 'blob:picker', origin: 'user' });
  await assert.rejects(r.api.saveMealMemory(draft, ['person']), /previous data was restored/);
  assert.equal(r.values.has(r.api.KEYS.meals), false);
  assert.equal(r.values.has(r.api.KEYS.mealCompanions), false);
  assert.equal(r.blobs.size, 0);
  assert.equal((await r.media.getManagedMediaRecords()).length, 0);
  await r.api.saveMealMemory(draft, ['person', 'person']);
  await r.api.saveMealMemory(await r.api.getMealById('retry-id'), ['person']);
  assert.equal(r.read(r.api.KEYS.meals).length, 1);
  assert.equal(r.read(r.api.KEYS.mealCompanions).length, 1);
  assert.deepEqual(r.read(r.api.KEYS.meals)[0].personIds, ['person']);
});

test('failed edits preserve the original meal, companions and image; failed rollback is explicit', async () => {
  const r = runtime();
  r.sources.set('blob:picker', imageBlob('original'));
  r.sources.set('blob:new', imageBlob('replacement'));
  await r.api.savePersonProfile(person('person'));
  await r.api.saveMealMemory(meal('meal', { photoUri: 'blob:picker' }), ['person']);
  const original = r.values.get(r.api.KEYS.meals);
  const originalCompanions = r.values.get(r.api.KEYS.mealCompanions);
  const originalMedia = r.read(r.api.KEYS.meals)[0].photoMediaId;
  r.fail('set', r.api.KEYS.mealCompanions);
  await assert.rejects(r.api.saveMealMemory(meal('meal', { photoUri: 'blob:new' }), []), /previous data was restored/);
  assert.equal(r.values.get(r.api.KEYS.meals), original);
  assert.equal(r.values.get(r.api.KEYS.mealCompanions), originalCompanions);
  assert.equal(JSON.parse(await r.blobs.get(originalMedia).text()).label, 'original');
  assert.equal((await r.media.getManagedMediaRecords()).length, 1);
  r.fail('set', r.api.KEYS.mealCompanions);
  r.fail('set', r.api.KEYS.mealCompanions);
  await assert.rejects(r.api.saveMealMemory(meal('meal', { photoUri: 'blob:new' }), []), /Restoring the previous data also failed/);
});

test('concurrent writes preserve each meal, person, relation and media index record', async () => {
  const r = runtime();
  r.sources.set('blob:picker', imageBlob());
  await Promise.all(Array.from({ length: 6 }, (_, index) => r.api.savePersonProfile(person(`p${index}`, { avatarUrl: 'blob:picker' }))));
  await Promise.all(Array.from({ length: 6 }, (_, index) => r.api.saveMealMemory(meal(`m${index}`, { photoUri: 'blob:picker' }), [`p${index}`])));
  await Promise.all(['p1', 'p2'].map((id) => r.api.addMealCompanion('m0', id)));
  assert.equal(r.read(r.api.KEYS.meals).length, 6);
  assert.equal(r.read(r.api.KEYS.peopleProfiles).length, 6);
  assert.equal(r.read(r.api.KEYS.mealCompanions).length, 8);
  await Promise.all(Array.from({ length: 6 }, (_, index) => r.media.importImageToManagedStore({
    sourceUri: 'blob:picker', ownerType: 'meal', ownerId: `independent-${index}`,
  })));
  assert.equal((await r.media.getManagedMediaRecords()).length, 18);
});

test('companion snapshots are stable through hydration, normalization, soft delete and merge', async () => {
  const r = runtime();
  r.sources.set('blob:picker', imageBlob());
  const saved = await r.api.savePersonProfile(person('source', { avatarUrl: 'blob:picker' }));
  await r.api.savePersonProfile(person('target'));
  const hydrated = await r.api.getPersonById('source');
  assert.match(hydrated.avatarUrl, /^blob:/);
  await r.api.saveMealMemory(meal('meal'), ['source']);
  await r.api.setMealCompanions('meal', ['source']);
  const snapshot = r.read(r.api.KEYS.mealCompanions)[0];
  assert.equal(snapshot.personAvatarSnapshot, saved.avatarUrl);
  assert.equal(snapshot.personAvatarMediaIdSnapshot, saved.avatarMediaId);
  assert.equal((await r.api.getMealCompanions())[0].personAvatarMediaIdSnapshot, saved.avatarMediaId);
  r.store(r.api.KEYS.mealCompanions, [{ ...snapshot, personAvatarSnapshot: hydrated.avatarUrl }]);
  await r.api.getMealCompanions();
  assert.equal(r.read(r.api.KEYS.mealCompanions)[0].personAvatarSnapshot, saved.avatarUrl);
  await r.api.mergePersonProfiles('source', 'target');
  await r.api.softDeletePersonProfile('target');
  for (const key of [r.api.KEYS.meals, r.api.KEYS.peopleProfiles, r.api.KEYS.mealCompanions, r.api.KEYS.sharedMealPhotos]) {
    assert.doesNotMatch(r.values.get(key) ?? '', /blob:|https?:/);
  }
});

test('getMeals shares cached display URLs and deletion revokes them', async () => {
  const r = runtime();
  r.sources.set('blob:picker', imageBlob());
  await r.api.saveMeal(meal('meal', { photoUri: 'blob:picker' }));
  const results = await Promise.all(Array.from({ length: 8 }, () => r.api.getMeals()));
  assert.equal(new Set(results.map((items) => items[0].photoUri)).size, 1);
  assert.equal(r.urls.size, 2);
  await r.api.getMeals();
  assert.equal(r.urls.size, 2);
  await r.api.deleteMeal('meal');
  assert.equal(r.urls.size, 0);
  assert.equal(r.revoked.length, 2);
  assert.equal(r.blobs.size, 0);
});

test('meal stickers preserve originals and text edits, reject stale sources, and clean only unreferenced cutouts', async () => {
  const r = runtime();
  r.sources.set('blob:picker', imageBlob('original'));
  r.sources.set('blob:cutout', imageBlob('cutout', 500, 500));
  r.sources.set('blob:new', imageBlob('replacement'));
  await r.api.saveMeal(meal('meal', { photoUri: 'blob:picker' }));
  const source = await r.api.getMealById('meal');
  await r.api.saveMealSticker(source, 'blob:cutout');
  let saved = r.read(r.api.KEYS.meals)[0];
  const firstSticker = saved.stickerMediaId;
  assert.notEqual(firstSticker, source.photoMediaId);
  assert.match(saved.stickerUri, /^indexeddb:/);
  assert.equal(r.blobs.get(firstSticker).type, 'image/png');
  assert.equal(JSON.parse(await r.blobs.get(source.photoMediaId).text()).label, 'original');
  const hydrated = (await r.api.getMeals())[0];
  assert.match(hydrated.stickerUri, /^blob:/);
  assert.equal(JSON.parse(await r.urls.get(hydrated.stickerUri).text()).label, 'cutout');

  // The add/edit form can predate sticker generation and omit both sticker fields.
  for (const save of [r.api.saveMeal, (entry) => r.api.saveMealMemory(entry, [])]) {
    const { stickerMediaId, stickerUri, ...textEdit } = source;
    await save({ ...textEdit, title: 'New title', note: 'My original words' });
    saved = r.read(r.api.KEYS.meals)[0];
    assert.equal(saved.stickerMediaId, firstSticker);
    assert.equal(saved.photoMediaId, source.photoMediaId);
  }
  await r.api.saveMealSticker(source, 'blob:cutout');
  saved = r.read(r.api.KEYS.meals)[0];
  assert.equal(saved.title, 'New title', 'Finishing a cutout must not overwrite later text edits');
  assert.equal(saved.note, 'My original words');
  assert.equal(r.blobs.has(firstSticker), false, 'A regenerated cutout releases its unused predecessor');
  const beforeFailedSave = r.values.get(r.api.KEYS.meals);
  const beforeFailedMedia = [...r.blobs.keys()];
  r.fail('set', r.api.KEYS.meals, { after: true });
  await assert.rejects(r.api.saveMealSticker(source, 'blob:cutout'), /previous data was restored/);
  assert.equal(r.values.get(r.api.KEYS.meals), beforeFailedSave);
  assert.deepEqual([...r.blobs.keys()], beforeFailedMedia, 'A failed cutout save keeps originals and removes only its incomplete copy');

  for (const replace of [
    () => r.api.saveMeal(meal('meal', { photoUri: 'blob:new' })),
    () => r.api.saveMealMemory(meal('meal', { photoUri: 'blob:picker' }), []),
    () => r.api.saveSharedMealPhoto(photo('new-cover', 'meal', { imageUrl: 'blob:new', isCover: true })),
  ]) {
    const staleSource = await r.api.getMealById('meal');
    const oldSticker = staleSource.stickerMediaId;
    await replace();
    saved = r.read(r.api.KEYS.meals)[0];
    assert.equal(saved.stickerMediaId, undefined, 'Replacing the source, including a shared cover, invalidates the cutout');
    assert.equal(saved.stickerUri, undefined);
    assert.equal(r.blobs.has(oldSticker), false, 'Replacing a source releases its unused cutout');
    const unchanged = r.values.get(r.api.KEYS.meals);
    await assert.rejects(r.api.saveMealSticker(staleSource, 'blob:cutout'), /source photo changed/i);
    assert.equal(r.values.get(r.api.KEYS.meals), unchanged);
    await r.api.saveMealSticker(await r.api.getMealById('meal'), 'blob:cutout');
  }

  const finalSource = await r.api.getMealById('meal');
  await r.api.saveMeal(meal('shared-reference', { photoMediaId: finalSource.stickerMediaId }));
  await r.api.deleteMeal('meal');
  assert.ok(r.blobs.has(finalSource.stickerMediaId), 'Deleting a meal keeps a cutout referenced by another record');
  const beforeStaleSave = r.values.get(r.api.KEYS.meals);
  await assert.rejects(r.api.saveMealSticker(finalSource, 'blob:cutout'), /source photo changed/i);
  assert.equal(r.values.get(r.api.KEYS.meals), beforeStaleSave, 'Late generation cannot recreate a deleted meal');
  await r.api.deleteMeal('shared-reference');
  assert.equal(r.blobs.has(finalSource.stickerMediaId), false);
  assert.equal(r.urls.has(finalSource.stickerUri), false);

  await r.api.saveMeal(meal('sample', { origin: 'sample', photoUri: 'blob:picker' }));
  await r.api.saveMealSticker(await r.api.getMealById('sample'), 'blob:cutout');
  const sampleSticker = (await r.api.getMealById('sample')).stickerMediaId;
  await r.api.removeSampleData();
  assert.equal(r.blobs.has(sampleSticker), false, 'Sample cleanup also releases its cutouts');
  await r.api.saveMeal(meal('no-photo'));
  await assert.rejects(r.api.saveMealSticker(await r.api.getMealById('no-photo'), 'blob:cutout'));
  assert.equal((await r.api.getMealById('no-photo')).stickerMediaId, undefined);
});

test('related-record deletion failures roll back before any image is deleted', async () => {
  const r = runtime();
  r.sources.set('blob:picker', imageBlob());
  await r.api.savePersonProfile(person('person'));
  await r.api.saveMealMemory(meal('meal', { photoUri: 'blob:picker' }), ['person']);
  await r.api.saveSharedMealPhoto(photo('photo', 'meal'));
  const keys = [r.api.KEYS.meals, r.api.KEYS.mealCompanions, r.api.KEYS.sharedMealPhotos];
  const before = keys.map((key) => r.values.get(key));
  r.fail('set', r.api.KEYS.sharedMealPhotos, { after: true });
  await assert.rejects(r.api.deleteMeal('meal'), /previous data was restored/);
  assert.deepEqual(keys.map((key) => r.values.get(key)), before);
  assert.equal(r.blobs.size, 4);
});

test('sample cover keeps sample origin; a user shared photo protects its meal, even without cover', async () => {
  const r = runtime();
  r.sources.set('blob:picker', imageBlob());
  await r.api.saveMealMemory(meal('sample', { origin: 'sample' }), []);
  await r.api.saveSharedMealPhoto(photo('cover', 'sample', { origin: 'sample', isCover: true }));
  assert.equal(r.read(r.api.KEYS.meals)[0].origin, 'sample');
  await r.api.saveSharedMealPhoto(photo('user-photo', 'sample', { origin: 'user' }));
  assert.equal(r.read(r.api.KEYS.meals)[0].origin, 'user');
  await r.api.removeSampleData();
  assert.equal(r.read(r.api.KEYS.meals).length, 1);
  assert.equal(r.read(r.api.KEYS.sharedMealPhotos).length, 2);
});

test('explicit companion set, add and remove protect edited samples while untouched seed meals remain removable', async () => {
  const r = runtime();
  await r.api.savePersonProfile(person('first', { origin: 'sample' }));
  await r.api.savePersonProfile(person('second', { origin: 'sample' }));
  for (const id of ['set', 'add', 'remove', 'untouched']) {
    await r.api.saveMealMemory(meal(id, { origin: 'sample' }), ['first']);
  }
  assert.ok(r.read(r.api.KEYS.meals).every((item) => item.origin === 'sample'));

  await r.api.setMealCompanions('set', ['second']);
  await r.api.addMealCompanion('add', 'second');
  await r.api.removeMealCompanion('remove', 'first');
  await r.api.removeSampleData();

  const retained = r.read(r.api.KEYS.meals);
  assert.deepEqual(retained.map((item) => item.id).sort(), ['add', 'remove', 'set']);
  assert.ok(retained.every((item) => item.origin === 'user'));
  const peopleByMeal = Object.fromEntries(retained.map((item) => [item.id, item.personIds]));
  assert.deepEqual(peopleByMeal, { set: ['second'], add: ['first', 'second'], remove: [] });
  const companions = r.read(r.api.KEYS.mealCompanions);
  assert.equal(companions.length, 3);
  assert.ok(companions.every((item) => item.mealId === 'set' || item.mealId === 'add'));
});

test('failed cover saves restore both the prior cover list and the meal origin/image', async () => {
  const r = runtime();
  r.sources.set('blob:picker', imageBlob());
  await r.api.saveMealMemory(meal('sample', { origin: 'sample' }), []);
  await r.api.saveSharedMealPhoto(photo('sample-cover', 'sample', { origin: 'sample', isCover: true }));
  const oldMeal = r.values.get(r.api.KEYS.meals);
  const oldPhotos = r.values.get(r.api.KEYS.sharedMealPhotos);
  r.fail('set', r.api.KEYS.meals, { after: true });
  await assert.rejects(r.api.saveSharedMealPhoto(photo('user-cover', 'sample', { origin: 'user', isCover: true })), /previous data was restored/);
  assert.equal(r.values.get(r.api.KEYS.meals), oldMeal);
  assert.equal(r.values.get(r.api.KEYS.sharedMealPhotos), oldPhotos);
  assert.equal((await r.media.getManagedMediaRecords()).length, 1);
});

test('aborted blob writes and failed media-index writes reject and remove only their incomplete copies', { timeout: 2000 }, async () => {
  const r = runtime();
  r.sources.set('blob:picker', imageBlob());
  const input = { sourceUri: 'blob:picker', ownerType: 'meal', ownerId: 'meal' };
  r.fail('blob-put', 'generated-1:thumbnail');
  await assert.rejects(r.media.importImageToManagedStore(input), /transaction abort/);
  assert.equal(r.blobs.size, 0);
  assert.equal((await r.media.getManagedMediaRecords()).length, 0);
  r.fail('set', '@mealogue/managedMedia', { after: true });
  await assert.rejects(r.media.importImageToManagedStore(input), /storage write failure/);
  assert.equal(r.blobs.size, 0);
  assert.equal((await r.media.getManagedMediaRecords()).length, 0);
  const good = await r.media.importImageToManagedStore(input);
  assert.equal(await r.media.verifyManagedMedia(good.id), true);
});

test('overlapping hydration and deletion do not retain new display URLs for deleted images', async () => {
  const r = runtime();
  r.sources.set('blob:picker', imageBlob());
  const media = await r.media.importImageToManagedStore({ sourceUri: 'blob:picker', ownerType: 'meal', ownerId: 'meal' });
  await Promise.all([
    r.media.resolveManagedMediaUri(media.id),
    r.media.deleteManagedMedia(media.id),
    r.media.resolveManagedMediaThumbnailUri(media.id),
  ]);
  assert.equal(r.urls.size, 0);
  assert.equal(r.blobs.size, 0);
});

test('sample removal retains legacy/user records, used sample people/photos, media references and session marker', async () => {
  const r = runtime();
  r.sources.set('blob:picker', imageBlob());
  const avatar = await r.api.savePersonProfile(person('sample-avatar', { origin: 'sample', avatarUrl: 'blob:picker' }));
  await r.api.savePersonProfile(person('used-sample', { origin: 'sample' }));
  await r.api.savePersonProfile(person('sample-only', { origin: 'sample' }));
  await r.api.savePersonProfile(person('legacy-person'));
  await r.api.savePersonProfile(person('user-person', { origin: 'user' }));
  await r.api.saveMealMemory(meal('sample', { origin: 'sample', photoUri: 'blob:picker' }), ['sample-only']);
  await r.api.saveMealMemory(meal('legacy'), ['used-sample']);
  await r.api.saveMealMemory(meal('user', { origin: 'user' }), []);
  const sampleMedia = r.read(r.api.KEYS.meals).find((item) => item.id === 'sample').photoMediaId;
  await r.api.saveSharedMealPhoto(photo('sample-used', 'legacy', { origin: 'sample' }));
  await r.api.saveSharedMealPhoto(photo('sample-only', 'sample', { origin: 'sample' }));
  r.store(r.api.KEYS.sharedMealPhotos, [
    ...r.read(r.api.KEYS.sharedMealPhotos),
    photo('legacy-photo', 'sample', { mediaId: sampleMedia, imageUrl: `indexeddb://mealog-media/${sampleMedia}` }),
    photo('user-photo', 'sample', { origin: 'user', imageUrl: 'legacy-external.jpg' }),
  ]);
  r.store(r.api.KEYS.mealCompanions, [...r.read(r.api.KEYS.mealCompanions), {
    id: 'historic-avatar', mealId: 'user', personId: 'user-person', addedAt: timestamp,
    personAvatarMediaIdSnapshot: avatar.avatarMediaId, personAvatarSnapshot: avatar.avatarUrl,
  }]);
  const legacyImage = await r.media.importImageToManagedStore({ sourceUri: 'blob:picker', ownerType: 'meal', ownerId: 'legacy-image' });
  await r.api.saveMeal(meal('sample-shared-image', {
    origin: 'sample', photoMediaId: legacyImage.id, photoUri: legacyImage.localManagedUri,
  }));
  r.store(r.api.KEYS.meals, [...r.read(r.api.KEYS.meals), {
    id: 'unknown-legacy-shape', note: 'Keep verbatim', photoMediaId: legacyImage.id,
  }]);
  const marker = '@mealogue/standaloneDemoSession';
  r.values.set(marker, '{"complete":true}');
  await r.api.removeSampleData();
  assert.deepEqual(r.read(r.api.KEYS.meals).map((item) => item.id).sort(), ['legacy', 'unknown-legacy-shape', 'user']);
  assert.deepEqual(r.read(r.api.KEYS.peopleProfiles).map((item) => item.id).sort(), ['legacy-person', 'used-sample', 'user-person']);
  assert.deepEqual(r.read(r.api.KEYS.sharedMealPhotos).map((item) => item.id).sort(), ['legacy-photo', 'sample-used', 'user-photo']);
  assert.ok(r.blobs.has(avatar.avatarMediaId), 'historical avatar still references the removed sample person image');
  assert.ok(r.blobs.has(sampleMedia), 'legacy photo still references the removed sample meal image');
  assert.ok(r.blobs.has(legacyImage.id), 'unrecognized legacy meal still references the managed image');
  assert.equal(r.values.get(marker), '{"complete":true}');
  assert.equal(r.read(r.api.KEYS.meals).find((item) => item.id === 'legacy').origin, undefined);
  const before = [...r.values];
  await r.api.removeSampleData();
  assert.deepEqual([...r.values], before);
});

test('sample cleanup recalculates supported achievements and preserves historical user/unknown unlocks', async () => {
  const r = runtime();
  await r.api.saveMealMemory(meal('sample', { origin: 'sample', note: 'Sample note' }), []);
  await r.api.saveMealMemory(meal('user', { origin: 'user' }), []);
  const progress = (achievementId, firstSourceMealId, currentValue = 1) => ({
    achievementId, firstSourceMealId, currentValue, targetValue: currentValue,
    status: 'unlocked', unlockedAt: timestamp, seenAt: timestamp, lastEvaluatedAt: timestamp,
  });
  r.store(r.api.KEYS.achievementProgress, [
    progress('first-plate', 'sample'), progress('written-corner', 'sample'),
    progress('little-photograph', 'user'), progress('familiar-seat', undefined, 3),
    progress('legacy-custom-reward', 'deleted-user-meal'),
  ]);
  await r.api.removeSampleData();
  const next = new Map(r.read(r.api.KEYS.achievementProgress).map((item) => [item.achievementId, item]));
  assert.equal(next.get('first-plate').unlockedAt, timestamp);
  assert.equal(next.get('written-corner').unlockedAt, undefined);
  assert.equal(next.get('little-photograph').unlockedAt, timestamp);
  assert.equal(next.get('familiar-seat').unlockedAt, timestamp);
  assert.equal(next.get('legacy-custom-reward').unlockedAt, timestamp);
});

test('sample cleanup restores all lists on write failure and never deletes referenced files early', async () => {
  const r = runtime();
  r.sources.set('blob:picker', imageBlob());
  await r.api.saveMealMemory(meal('sample', { origin: 'sample', photoUri: 'blob:picker' }), []);
  await r.api.savePersonProfile(person('sample-person', { origin: 'sample' }));
  const before = [...r.values];
  r.fail('set', r.api.KEYS.peopleProfiles);
  await assert.rejects(r.api.removeSampleData(), /previous data was restored/);
  assert.deepEqual([...r.values], before);
  assert.equal(r.blobs.size, 2);
});

test('migration retries after rejection and never deletes unreferenced stored images on startup', async () => {
  const r = runtime();
  r.sources.set('blob:picker', imageBlob());
  const orphan = await r.media.importImageToManagedStore({ sourceUri: 'blob:picker', ownerType: 'meal', ownerId: 'orphan' });
  r.fail('get', r.api.KEYS.meals);
  await assert.rejects(r.api.runMediaMigrationOnce(), /read failure/);
  const report = await r.api.runMediaMigrationOnce();
  assert.equal(report.totalLegacyMediaRecords, 0);
  assert.ok(r.blobs.has(orphan.id));
  assert.equal(r.revoked.length, 0);
});

test('clearAll removes Insights cache and meal data while preserving the standalone session marker', async () => {
  const r = runtime();
  const cacheKey = '@mealogue/insightsCache/v1';
  const markerKey = '@mealogue/standaloneDemoSession';
  r.store(cacheKey, [{ snapshot: 'saved report input', report: { month: '2026-09' } }]);
  r.store(r.api.KEYS.meals, [meal('user', { origin: 'user' })]);
  r.values.set(markerKey, '{"complete":true}');
  await r.api.saveMonthlyReflection('2026-09', 'personal', 'My private words');
  await r.api.clearAll();
  assert.equal(r.values.has(cacheKey), false);
  assert.equal(r.values.has(r.api.KEYS.meals), false);
  assert.equal(r.values.get(markerKey), '{"complete":true}');
  assert.equal(r.values.has(r.api.KEYS.monthlyReflections), false);
});

test('monthly reflections isolate month/scope, survive reads and retry safely after failed writes', async () => {
  const r = runtime();
  await Promise.all([
    r.api.saveMonthlyReflection('2026-09', 'personal', ' My words '),
    r.api.saveMonthlyReflection('2026-09', 'sample', 'Sample thoughts'),
    r.api.saveMonthlyReflection('2026-08', 'personal', 'Last month'),
  ]);
  assert.equal((await r.api.getMonthlyReflections()).length, 3);
  r.fail('set', r.api.KEYS.monthlyReflections, { after: true });
  await assert.rejects(r.api.saveMonthlyReflection('2026-09', 'personal', 'Changed'), /write failure/);
  assert.equal((await r.api.getMonthlyReflections()).find((row) => row.scope === 'personal' && row.month === '2026-09').text, 'My words');
  await r.api.saveMonthlyReflection('2026-09', 'personal', 'Changed');
  await r.api.saveMonthlyReflection('2026-09', 'sample', '');
  assert.equal((await r.api.getMonthlyReflections()).length, 2);
  assert.equal(r.values.has(r.api.KEYS.insightsCache), false, 'Own words are never written to AI cache');
  await assert.rejects(r.api.saveMonthlyReflection('2026-13', 'personal', 'bad'));
  await assert.rejects(r.api.saveMonthlyReflection('2026-09', 'personal', 'a'.repeat(1201)));
  r.store(r.api.KEYS.monthlyReflections, [{ month: '2026-09', scope: 'personal', text: { broken: true } }]);
  const corrupt = r.values.get(r.api.KEYS.monthlyReflections);
  await assert.rejects(r.api.saveMonthlyReflection('2026-09', 'personal', 'Do not overwrite'), /could not be read/);
  assert.equal(r.values.get(r.api.KEYS.monthlyReflections), corrupt);
});

test('native import preserves original bytes, bounds portrait/landscape thumbnails and rejects bad files', async () => {
  const r = runtime('ios');
  for (const [id, width, height] of [['portrait', 1000, 4000], ['landscape', 4000, 1000], ['small', 40, 60]]) {
    const source = `file:///picker/${id}.png`;
    r.files.set(source, { bytes: `original-${id}`, width, height });
    await r.api.saveMeal(meal(id, { photoUri: source }));
    const stored = r.read(r.api.KEYS.meals).find((item) => item.id === id);
    assert.equal(r.files.get(stored.photoUri).bytes, `original-${id}`);
    assert.equal(r.files.get(source).bytes, `original-${id}`);
    const thumbnail = r.files.get(stored.photoThumbnailUri);
    assert.ok(thumbnail.width <= 520 && thumbnail.height <= 520);
    assert.ok(thumbnail.width <= width && thumbnail.height <= height);
  }
  assert.deepEqual(plain(r.thumbnails), [{ width: 130, height: 520 }, { width: 520, height: 130 }, { width: 40, height: 60 }]);
  const before = r.values.get(r.api.KEYS.meals);
  for (const [name, file] of [['empty', { bytes: '', width: 10, height: 10 }], ['text', { bytes: 'hello' }]]) {
    r.files.set(`file:///picker/${name}.jpg`, file);
    await assert.rejects(r.api.saveMeal(meal('portrait', { photoUri: `file:///picker/${name}.jpg` })), /image could not be saved/);
    assert.equal(r.values.get(r.api.KEYS.meals), before);
  }
  await assert.rejects(r.api.saveMeal(meal('unreadable', { photoUri: 'file:///picker/gone.jpg' })), /unreadable/);
});


test('chairs are independent and companionship changes preserve the target meal and distinguish solo from unknown', async () => {
  const r = runtime();
  await r.api.savePersonProfile(person('chair', { origin: 'user' }));
  assert.equal((await r.api.getPersonMealSummaries())[0].sharedMealCount, 0);
  await r.api.saveMealMemory(meal('first', { peopleTags: ['just-me'] }), []);
  await r.api.saveMealMemory(meal('second', { peopleTags: ['just-me'] }), ['chair']);
  assert.deepEqual(r.read(r.api.KEYS.meals).find(m => m.id === 'first').peopleTags, ['just-me']);
  assert.deepEqual(r.read(r.api.KEYS.meals).find(m => m.id === 'second').peopleTags, []);
  assert.deepEqual(r.read(r.api.KEYS.mealCompanions).map(c => c.mealId), ['second']);
  await r.api.setMealCompanions('second', [], undefined, false);
  assert.deepEqual(r.read(r.api.KEYS.meals).find(m => m.id === 'second').peopleTags, []);
  await r.api.setMealCompanions('second', [], undefined, true);
  assert.deepEqual(r.read(r.api.KEYS.meals).find(m => m.id === 'second').peopleTags, ['just-me']);
  r.fail('set', r.api.KEYS.mealCompanions, { after: true });
  await assert.rejects(r.api.setMealCompanions('second', ['chair'], undefined, false), /previous data was restored/);
  assert.deepEqual(r.read(r.api.KEYS.meals).find(m => m.id === 'second').peopleTags, ['just-me']);
  assert.equal(r.read(r.api.KEYS.mealCompanions).length, 0);
  await r.api.addMealCompanion('second', 'chair');
  assert.deepEqual(r.read(r.api.KEYS.meals).find(m => m.id === 'second').peopleTags, []);
});

test('recovery keeps original images and relations, restores once, and rolls back interrupted deletion', async () => {
  const r = runtime(); r.sources.set('blob:recovery', imageBlob());
  await r.api.savePersonProfile(person('p'));
  await r.api.saveMealMemory(meal('recover-me', { photoUri: 'blob:recovery' }), ['p']);
  const original = r.read(r.api.KEYS.meals)[0].photoMediaId;
  await r.api.trashMeal('recover-me');
  assert.equal((await r.api.getMeals()).length, 0);
  assert.equal((await r.api.getTrash()).length, 1);
  assert.ok(r.blobs.has(original));
  await r.api.restoreMeal('recover-me');
  assert.equal((await r.api.getMeals()).length, 1);
  assert.equal((await r.api.getMealCompanions('recover-me')).length, 1);
  assert.equal((await r.api.getTrash()).length, 0);
  await assert.rejects(r.api.restoreMeal('recover-me'));
  r.fail('set', r.api.KEYS.mealCompanions, { after: true });
  await assert.rejects(r.api.trashMeal('recover-me'), /previous data was restored/);
  assert.equal((await r.api.getMeals()).length, 1);
  assert.equal((await r.api.getTrash()).length, 0);
  assert.ok(r.blobs.has(original));
});

test('archive and backup merge preserve existing records and are atomic under write failure', async () => {
  const r = runtime(); await r.api.saveMeal(meal('local'));
  await r.api.setMealArchived('local', true);
  assert.ok((await r.api.getMeals())[0].archivedAt);
  await r.api.mergeProductSnapshot({ [r.api.KEYS.meals]: [meal('local', { title: 'overwrite' }), meal('new')] });
  assert.equal((await r.api.getMealById('local')).title, 'Lunch');
  assert.equal((await r.api.getMeals()).length, 2);
  await assert.rejects(r.api.mergeProductSnapshot({ '@untrusted': [] }));
  r.fail('set', r.api.KEYS.freeMemories, { after: true });
  await assert.rejects(r.api.mergeProductSnapshot({ [r.api.KEYS.meals]: [meal('rollback')], [r.api.KEYS.freeMemories]: [{ id: 'note' }] }), /previous data was restored/);
  assert.equal((await r.api.getMeals()).length, 2);
});


test('portable ZIP carries original bytes and restores across a fresh device without losing local data', async () => {
  const first = runtime(); first.sources.set('blob:zip-original', imageBlob('original portable bytes'));
  await first.api.savePersonProfile(person('zip-person'));
  await first.api.saveMealMemory(meal('zip-meal', { photoUri: 'blob:zip-original', note: 'private memory' }), ['zip-person']);
  const backup = first.load('src/product/backup.ts');
  const blob = await backup.createBackup(); assert.ok(blob.size > 0);
  const parsed = await backup.readBackup(blob);
  const originalId = first.read(first.api.KEYS.meals)[0].photoMediaId;
  assert.equal(new TextDecoder().decode(parsed.files[`photos/${originalId}`]), await first.blobs.get(originalId).text());
  const fresh = runtime(); await fresh.api.saveMeal(meal('keep-local', { title: 'local record' }));
  const restore = fresh.load('src/product/backup.ts');
  await restore.restoreBackup(parsed);
  const restored = await fresh.api.getMealById('zip-meal');
  assert.equal(restored.note, 'private memory'); assert.ok(restored.photoUri.startsWith('blob:'));
  assert.equal((await fresh.api.getPeopleForMeal('zip-meal'))[0].name, 'zip-person');
  assert.equal((await fresh.api.getMealById('keep-local')).title, 'local record');
  const stored = fresh.read(fresh.api.KEYS.meals).find(item => item.id === 'zip-meal');
  assert.equal(await fresh.blobs.get(stored.photoMediaId).text(), await first.blobs.get(originalId).text());
  await restore.restoreBackup(parsed); assert.equal((await fresh.api.getMeals()).length, 2);
  assert.throws(() => restore.validateBackup({ ...parsed.backup, data: { '@unknown': [] } }));
  assert.throws(() => restore.validateBackup({ ...parsed.backup, data: { [first.api.KEYS.meals]: [{ id: 'bad', date: '2026-02-30' }] } }));
  const { zipSync, strToU8 } = require('fflate');
  await assert.rejects(restore.readBackup(new Blob([zipSync({ '../evil': strToU8('bad') })])), /Unsafe/);
});
