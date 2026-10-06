/** JPEG EXIF date only. GPS and people are never read or inferred. Missing metadata stays unknown. */
export function photoDate(bytes: ArrayBuffer): { date: string; time: string } | undefined {
  const view = new DataView(bytes);
  try {
    if (view.getUint16(0) !== 0xffd8) return;
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset), length = view.getUint16(offset + 2);
      if (marker === 0xffda || marker === 0xffd9 || length < 2 || offset + 2 + length > view.byteLength) return;
      if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0) {
        const base = offset + 10, end = offset + 2 + length;
        const little = view.getUint16(base) === 0x4949;
        if (!little && view.getUint16(base) !== 0x4d4d) return;
        if (view.getUint16(base + 2, little) !== 42) return;
        const visited = new Set<number>();
        const readDirectory = (relative: number): string | undefined => {
          const at = base + relative;
          if (visited.has(at) || visited.size > 4 || at < base || at + 2 > end) return;
          visited.add(at); const count = view.getUint16(at, little);
          if (count > 256 || at + 2 + count * 12 > end) return;
          let fallback: string | undefined;
          for (let i = 0; i < count; i++) {
            const entry = at + 2 + i * 12, tag = view.getUint16(entry, little), type = view.getUint16(entry + 2, little);
            if (tag === 0x8769 && type === 4) { const date = readDirectory(view.getUint32(entry + 8, little)); if (date) return date; }
            if ((tag === 0x9003 || tag === 0x0132) && type === 2 && view.getUint32(entry + 4, little) === 20) {
              const pointer = base + view.getUint32(entry + 8, little);
              if (pointer < base || pointer + 20 > end) continue;
              const text = new TextDecoder().decode(new Uint8Array(bytes, pointer, 19));
              if (tag === 0x9003) return text;
              fallback = text;
            }
          }
          return fallback;
        };
        const text = readDirectory(view.getUint32(base + 4, little));
        const match = text?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
        if (!match) return;
        const [, y, m, d, h, min, sec] = match, date = `${y}-${m}-${d}`;
        if (!/^(19|20)\d{2}$/.test(y) || Number(h) > 23 || Number(min) > 59 || Number(sec) > 59 || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) return;
        return { date, time: `${h}:${min}` };
      }
      offset += length + 2;
    }
  } catch { return; }
}
export async function metadataFromUri(uri: string) {
  const response = await fetch(uri);
  const blob = await response.blob();
  // Bound metadata parsing; a missing EXIF date is never replaced with file-modification time.
  return photoDate(await blob.slice(0, 256 * 1024).arrayBuffer());
}
