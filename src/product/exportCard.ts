import type { MemoryCard } from './store';
export function downloadBlob(blob: Blob, name: string) {
  const uri = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = uri; link.download = name; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(uri), 30000);
}
export async function cardImage(card: MemoryCard): Promise<Blob> {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1920;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image export is unavailable');
  ctx.fillStyle = '#FBF7EE'; ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = '#5C4033'; ctx.font = 'italic 48px serif'; ctx.fillText('Mealog', 90, 120);
  ctx.font = '28px sans-serif'; ctx.fillText(`${card.start} — ${card.end}`, 90, 185);
  const lines = (text: string, size: number, y: number) => {
    ctx.font = `${size}px sans-serif`; let line = '', top = y;
    for (const char of text) {
      if (char === '\n' || ctx.measureText(line + char).width > 900) { ctx.fillText(line, 90, top); line = char === '\n' ? '' : char; top += size * 1.6; }
      else line += char;
    }
    ctx.fillText(line, 90, top); return top + size * 1.6;
  };
  let y = lines(card.narrative.title, 48, 300) + 70;
  for (const observation of card.narrative.observations) y = lines(observation.text, 34, y) + 65;
  ctx.font = '24px sans-serif'; ctx.fillStyle = '#796F64'; ctx.fillText('AI reflection · 私人记忆回顾', 90, 1780);
  ctx.fillText('Only this card is included · 仅包含这张卡片', 90, 1830);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not export card'); return blob;
}
export async function shareCard(card: MemoryCard) {
  const file = new File([await cardImage(card)], `Mealog-${card.start}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: card.narrative.title });
  else downloadBlob(file, file.name);
}
