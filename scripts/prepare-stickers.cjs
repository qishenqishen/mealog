const { mkdirSync, copyFileSync } = require('node:fs');
const { join } = require('node:path');
const root = join(__dirname, '..');
const target = join(root, 'public/stickers/ort');
mkdirSync(target, { recursive: true });
for (const file of ['ort.wasm.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  copyFileSync(join(root, 'node_modules/onnxruntime-web/dist', file), join(target, file));
}
