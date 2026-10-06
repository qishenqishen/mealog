/** Local visual grouping. Conservative thresholds keep different meals separate. */
export interface PhotoSignature { hash: number[]; color: number[]; quality: number }
export function signature(pixels: Uint8ClampedArray, width: number, height: number): PhotoSignature {
  const gray = Array.from({ length: width * height }, (_, i) => .299 * pixels[i * 4] + .587 * pixels[i * 4 + 1] + .114 * pixels[i * 4 + 2]);
  const hash: number[] = [], color = [0, 0, 0]; let edge = 0, clipped = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const row = Math.min(height - 1, Math.floor((y + .5) * height / 8));
    const a = Math.floor(x * width / 9), b = Math.floor((x + 1) * width / 9);
    hash.push(gray[row * width + a] > gray[row * width + b] ? 1 : 0);
  }
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x, g = gray[i];
    edge += (4 * g - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width]) ** 2;
    if (g < 8 || g > 247) clipped++;
    for (let c = 0; c < 3; c++) color[c] += pixels[i * 4 + c];
  }
  const n = (width - 2) * (height - 2);
  return { hash, color: color.map(c => c / n), quality: Math.log1p(edge / n) - 2 * clipped / n };
}
export function similar(a: PhotoSignature, b: PhotoSignature): boolean {
  return a.hash.filter((v, i) => v !== b.hash[i]).length <= 6 && Math.sqrt(a.color.reduce((s, v, i) => s + (v - b.color[i]) ** 2, 0) / 3) < 18;
}
export async function inspectPhoto(uri: string): Promise<PhotoSignature> {
  const img = new Image(); img.src = uri; await img.decode();
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Photo analysis unavailable');
  ctx.drawImage(img, 0, 0, 128, 128);
  return signature(ctx.getImageData(0, 0, 128, 128).data, 128, 128);
}
