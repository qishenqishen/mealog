const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
const source = ts.transpileModule(fs.readFileSync('src/components/TableObjects.tsx', 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const makeElement = (type, props) => ({ type, props });
vm.runInNewContext(source, { exports: exportsObject, require(name) {
  if (name === 'react-native') return { Image: 'image', Text: 'text', View: 'view', StyleSheet: { create: value => value } };
  if (name === 'react/jsx-runtime') return { jsx: makeElement, jsxs: makeElement };
  if (name.endsWith('/keepsakeArt')) return { getKeepsakeArt: key => key };
  throw new Error(name);
} });
const { PLATES, CHAIRS, TablePlate, TableChair } = exportsObject;
function finite(value) {
  if (typeof value === 'number') assert(Number.isFinite(value), 'Every plate position must be finite');
  if (value && typeof value === 'object') Object.values(value).forEach(finite);
}
PLATES.forEach((_, variant) => finite(TablePlate({ variant })));
CHAIRS.forEach((chair, variant) => assert.equal(TableChair({ variant }).props.source, chair.key));
assert.equal(new Set(PLATES.map(plate => plate.rim)).size, PLATES.length);
console.log('PASS table objects: all plate geometries render, distinct palettes, matching chair artwork');
