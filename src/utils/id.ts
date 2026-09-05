/**
 * Generate a random ID string.
 * Uses crypto.randomUUID when available, otherwise falls back to
 * a simple random hex string. Good enough for local-first IDs.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: 16 random hex chars
  const chars = 'abcdef0123456789';
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12)}`;
}
