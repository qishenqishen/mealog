import * as ort from './ort/ort.wasm.min.mjs';

// U²-Net small, Apache 2.0; runtime/model are served by Mealog, on demand.
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = new URL('./ort/', import.meta.url).href;
let session;
const progress = (message) => self.postMessage({ progress: message });
const canvas = (width, height) => new OffscreenCanvas(width, height);

self.onmessage = async ({ data }) => {
  let bitmap;
  try {
    if (!(data.blob instanceof Blob) || !data.blob.size) throw new Error('The photo is empty.');
    bitmap = await createImageBitmap(data.blob);
    const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const cutout = canvas(width, height);
    const ctx = cutout.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close(); bitmap = undefined;
    const pixels = ctx.getImageData(0, 0, width, height);
    let transparent = 0;
    for (let i = 3; i < pixels.data.length; i += 4) if (pixels.data[i] < 20) transparent++;
    if (data.requireTransparent && transparent < width * height * 0.02) {
      throw new Error('Choose a PNG with a transparent background. The original photo is kept.');
    }

    // An imported cutout keeps its existing alpha, including hand-refined edges.
    if (transparent < width * height * 0.02) {
      progress(session ? 'Cutting out the food…' : 'Loading sticker tools for the first time…');
      if (!session) session = await ort.InferenceSession.create(new URL('./u2netp.onnx', import.meta.url).href,
        { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      progress('Cutting out the food…');
      const input = canvas(320, 320);
      const inputCtx = input.getContext('2d', { willReadFrequently: true });
      inputCtx.drawImage(cutout, 0, 0, 320, 320);
      const rgb = inputCtx.getImageData(0, 0, 320, 320).data;
      const tensor = new Float32Array(3 * 320 * 320);
      const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
      let max = 1;
      for (let i = 0; i < rgb.length; i += 4) max = Math.max(max, rgb[i], rgb[i + 1], rgb[i + 2]);
      for (let i = 0; i < 320 * 320; i++) {
        for (let c = 0; c < 3; c++) tensor[c * 320 * 320 + i] = (rgb[i * 4 + c] / max - mean[c]) / std[c];
      }
      const outputs = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', tensor, [1, 3, 320, 320]) });
      const prediction = outputs[session.outputNames[0]].data;
      let min = Infinity, high = -Infinity;
      for (const v of prediction) { min = Math.min(min, v); high = Math.max(high, v); }
      if (!(high - min > 0.01)) throw new Error('The food could not be separated. Try a clearer photo.');
      const mask = inputCtx.createImageData(320, 320);
      for (let i = 0; i < prediction.length; i++) {
        const confidence = (prediction[i] - min) / (high - min);
        mask.data[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, (confidence - 0.35) / 0.3)) * 255);
      }
      // ponytail: a single dominant subject; import a PNG to keep deliberate multi-object cutouts.
      keepLargestSubject(mask.data, 320);
      inputCtx.putImageData(mask, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(input, 0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
      Object.values(outputs).forEach((output) => output.dispose());
    }

    const alpha = ctx.getImageData(0, 0, width, height).data;
    let left = width, top = height, right = 0, bottom = 0, count = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (alpha[(y * width + x) * 4 + 3] > 40) {
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y); count++;
      }
    }
    if (count < width * height * 0.005) throw new Error('No clear food shape was found. Try a closer photo.');
    const w = right - left + 1, h = bottom - top + 1;
    const pad = 22, edge = 7;
    const outline = canvas(w + 2 * pad, h + 2 * pad);
    const border = outline.getContext('2d');
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 16) {
      border.drawImage(cutout, left, top, w, h, pad + Math.cos(angle) * edge, pad + Math.sin(angle) * edge, w, h);
    }
    border.globalCompositeOperation = 'source-in';
    border.fillStyle = '#fffefa'; border.fillRect(0, 0, outline.width, outline.height);
    border.globalCompositeOperation = 'source-over';
    const result = canvas(outline.width, outline.height);
    const final = result.getContext('2d');
    final.shadowColor = 'rgba(70, 51, 35, 0.18)'; final.shadowBlur = 7; final.shadowOffsetY = 4;
    final.drawImage(outline, 0, 0);
    final.shadowColor = 'transparent';
    final.drawImage(cutout, left, top, w, h, pad, pad, w, h);
    self.postMessage({ blob: await result.convertToBlob({ type: 'image/png' }) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'The sticker could not be made.' });
  } finally { bitmap?.close(); }
};

// Kept pure so the foreground selection can be checked without a browser/model.
function keepLargestSubject(rgba, size) {
  const visited = new Uint8Array(size * size);
  let largest = [];
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || rgba[start * 4 + 3] < 40) continue;
    const region = [start]; visited[start] = 1;
    for (let cursor = 0; cursor < region.length; cursor++) {
      const pos = region[cursor], x = pos % size, y = Math.floor(pos / size);
      const neighbors = [x > 0 ? pos - 1 : -1, x < size - 1 ? pos + 1 : -1, y > 0 ? pos - size : -1, y < size - 1 ? pos + size : -1];
      for (const neighbor of neighbors) if (neighbor >= 0 && !visited[neighbor] && rgba[neighbor * 4 + 3] >= 40) {
        visited[neighbor] = 1; region.push(neighbor);
      }
    }
    if (region.length > largest.length) largest = region;
  }
  const keep = new Uint8Array(visited.length);
  for (const pos of largest) keep[pos] = 1;
  for (let i = 0; i < keep.length; i++) if (!keep[i]) rgba[i * 4 + 3] = 0;
}
