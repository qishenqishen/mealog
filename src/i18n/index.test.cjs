// Run with: node --test src/i18n/index.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const ts = require('typescript');

function compile(file) {
  return ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

function harness({ platform = 'web', language = 'en-US', saved = null, delayed = false, unavailable = false } = {}) {
  const slots = [];
  const effects = [];
  const writes = [];
  let cursor = 0;
  let resolveRead;
  const read = delayed ? new Promise(resolve => { resolveRead = resolve; }) : Promise.resolve(saved);
  const storage = {
    getItem: () => unavailable ? Promise.reject(new Error('Storage unavailable')) : read,
    setItem: async (key, value) => { writes.push([key, value]); },
  };
  const react = {
    createContext: value => ({ Provider: 'Provider', value }),
    useContext: context => context.value,
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], next => { slots[index] = next; }];
    },
    useRef(initial) {
      const index = cursor++;
      return slots[index] ??= { current: initial };
    },
    useEffect(effect) { if (!(cursor++ in slots)) { slots[cursor - 1] = true; effects.push(effect); } },
    useCallback: fn => fn,
    useMemo: fn => fn(),
  };
  const exports = {};
  vm.runInNewContext(compile(path.join(__dirname, 'index.tsx')), {
    exports,
    navigator: language ? { language } : undefined,
    require(name) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
      if (name === 'react-native') return { Platform: { OS: platform } };
      if (name === '@react-native-async-storage/async-storage') return { default: storage };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return {
    ...exports, writes, resolveRead,
    render() { cursor = 0; return exports.I18nProvider({ children: 'child' }).props.value; },
    mount() { this.render(); effects.splice(0).forEach(effect => effect()); },
  };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('browser language and native fallback; interpolation does not translate user text', () => {
  const zh = harness({ language: 'zh-TW' });
  assert.equal(zh.translate('Home'), '首页');
  assert.equal(zh.translate('Unknown phrase {name}', { name: 'Family' }), 'Unknown phrase Family');
  assert.equal(zh.translate('Shared with {name}', { name: 'Friend' }), '与 Friend 同享');
  assert.equal(zh.translate('Shared with {name}', { name: 'Mom {count} $&' }), '与 Mom {count} $& 同享');
  assert.equal(zh.translate('{count} shared meals', { count: 0 }), '0 次同桌用餐');
  assert.equal(zh.translate('Missing {value}'), 'Missing {value}');
  assert.equal(zh.translate('__proto__'), '__proto__');
  assert.equal(harness({ platform: 'ios', language: 'zh-CN' }).translate('Home'), 'Home');
  assert.equal(harness({ platform: 'android', language: null }).translate('Home'), 'Home');
  assert.equal(harness({ language: 'fr-FR' }).translate('Home'), 'Home');
});

test('persisted preference and both translation APIs follow locale changes', async () => {
  const app = harness({ saved: 'zh' });
  app.mount();
  await flush();
  assert.equal(app.render().locale, 'zh');
  assert.equal(app.render().t('Home'), '首页');
  app.render().setLocale('en');
  assert.equal(app.render().t('Home'), 'Home');
  assert.equal(app.translate('Home'), 'Home');
  app.render().setLocale('zh');
  await flush();
  assert.equal(app.render().locale, 'zh');
  assert.deepEqual(app.writes.map(x => x[1]), ['en', 'zh']);
});

test('a choice during hydration wins; missing or broken storage keeps the default', async () => {
  const app = harness({ delayed: true });
  app.mount();
  app.render().setLocale('zh');
  app.resolveRead('en');
  await flush();
  assert.equal(app.render().locale, 'zh');
  assert.equal(app.translate('Home'), '首页');
  for (const options of [{ saved: 'invalid' }, { unavailable: true }]) {
    const fallback = harness({ language: 'zh-CN', ...options });
    fallback.mount();
    await flush();
    assert.equal(fallback.render().locale, 'zh');
  }
});

test('every static Collection title and description has a Chinese translation', () => {
  const app = harness({ language: 'zh-CN' });
  const exports = {};
  vm.runInNewContext(compile(path.join(__dirname, '../achievements/definitions.ts')), { exports });
  for (const definition of exports.ACHIEVEMENT_DEFINITIONS) {
    assert.notEqual(app.translate(definition.title), definition.title, definition.id);
    assert.notEqual(app.translate(definition.description), definition.description, definition.id);
  }
  for (const label of Object.values(exports.FAMILY_LABELS)) assert.notEqual(app.translate(label), label);
});
