const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { Module } = require('node:module');
const filename = require('node:path').resolve('src/utils/people.ts');
const mod = new Module(filename, module);
mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const { peopleForScope, companionTags } = mod.exports;
const people = [
  { id: 'new', origin: 'user' }, { id: 'legacy' }, { id: 'example', origin: 'sample' },
  { id: 'kept', origin: 'sample' }, { id: 'legacy-link', origin: 'sample' },
  { id: 'photographed', origin: 'sample' }, { id: 'deleted', deletedAt: 'today' },
];
const meals = [{ id: 'own', personIds: ['legacy-link'] }, { id: 'example-meal', origin: 'sample' }];
const companions = [{ mealId: 'own', personId: 'kept' }, { mealId: 'missing', personId: 'example' }];
const photos = [{ mealId: 'own', taggedPersonIds: ['photographed'] }];
assert.deepEqual(peopleForScope(people, meals, companions, 'personal', photos).map(p => p.id), ['new', 'legacy', 'kept', 'legacy-link', 'photographed']);
assert.equal(peopleForScope(people, meals, companions, 'sample', photos).some(p => p.id === 'new'), false);
assert.equal(peopleForScope(people, meals, companions, 'personal', [{ mealId: 'example-meal', origin: 'user', taggedPersonIds: ['example'] }]).some(p => p.id === 'example'), false);
assert.deepEqual(companionTags([], [], undefined), []);
assert.deepEqual(companionTags(['family-table'], [], true), ['just-me']);
assert.deepEqual(companionTags(['just-me'], [], false), []);
assert.deepEqual(companionTags(['just-me', 'family-table'], ['kept']), ['family-table']);
assert.deepEqual(companionTags(['just-me'], [], undefined), ['just-me']);
console.log('People context: zero-meal/legacy profiles, sample boundaries, real references and explicit solo state passed.');

// The real navigation reducers must retain the tab instance holding the draft and its edit target.
const { StackRouter, TabRouter } = require('@react-navigation/routers');
const { mealWithPersonAction } = mod.exports;
const stack = StackRouter({ initialRouteName: '(tabs)' });
const stackOptions = { routeNames: ['(tabs)', 'people/[id]'], routeParamList: {}, routeGetIdList: {} };
const initialStack = stack.getInitialState(stackOptions);
const tab = TabRouter({ initialRouteName: 'add' });
const tabOptions = { routeNames: ['index', 'add'], routeParamList: {}, routeGetIdList: {} };
let tabState = tab.getInitialState(tabOptions);
tabState.routes = tabState.routes.map(route => route.name === 'add' ? { ...route, params: { editMealId: 'existing-meal' } } : route);
const oldTabKey = initialStack.routes[0].key;
const oldAddKey = tabState.routes.find(route => route.name === 'add').key;
const before = { ...initialStack, index: 1, routes: [{ ...initialStack.routes[0], state: tabState }, { key: 'person-detail', name: 'people/[id]' }] };
const after = stack.getStateForAction(before, mealWithPersonAction('friend', 'new-request'), stackOptions);
assert.equal(after.routes.length, 1);
assert.equal(after.routes[0].key, oldTabKey);
const request = after.routes[0].params;
const nextTabs = tab.getStateForAction(after.routes[0].state, { type: 'NAVIGATE', payload: { name: request.screen, params: request.params, merge: request.merge } }, tabOptions);
const addRoute = nextTabs.routes.find(route => route.name === 'add');
assert.equal(addRoute.key, oldAddKey);
assert.equal(addRoute.params.editMealId, 'existing-meal');
assert.equal(addRoute.params.personId, 'friend');
console.log('Person → record navigation preserves existing draft route and edit target.');
