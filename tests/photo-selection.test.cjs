const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/product/photoSelection.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject});
const {signature,similar}=exportsObject;
function pixels(sharp) { const p=new Uint8ClampedArray(128*128*4); for(let y=0;y<128;y++) for(let x=0;x<128;x++) {const i=(y*128+x)*4; const v=sharp ? ((x+y)%2 ? 175:85):130; p.set([v,v,v,255],i);} return p; }
const sharp=signature(pixels(true),128,128),blur=signature(pixels(false),128,128);
assert(sharp.quality>blur.quality,'Sharp image ranks above blurred image');
assert(similar(sharp,sharp),'Same image groups');
assert(!similar(sharp,{...sharp,color:[255,0,0]}),'Different dominant colors stay separate');
assert(!similar(sharp,{...sharp,hash:sharp.hash.map(x=>1-x)}),'Different structure stays separate');
console.log('PASS photo selection: sharpness ranking and conservative visual grouping');
