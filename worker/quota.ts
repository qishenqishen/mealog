export const DAILY_LIMIT = 50;
export const IP_LIMIT = 3;
export const IP_WINDOW_MS = 10 * 60_000;
export type QuotaResult = { allowed: true } | { allowed: false; code: 'daily_limit' | 'ip_limit'; retryAfter: number };

export function initializeQuota(sql: SqlStorage) {
  sql.exec('CREATE TABLE IF NOT EXISTS daily (id INTEGER PRIMARY KEY CHECK (id = 1), day TEXT NOT NULL, attempts INTEGER NOT NULL CHECK (attempts BETWEEN 0 AND 50))');
  sql.exec('CREATE TABLE IF NOT EXISTS ip_windows (ip_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL)');
  sql.exec('CREATE TABLE IF NOT EXISTS privacy (id INTEGER PRIMARY KEY CHECK (id = 1), salt TEXT NOT NULL)');
  sql.exec('INSERT OR IGNORE INTO privacy (id, salt) VALUES (1, ?)', crypto.randomUUID());
}

// One global coordination point is deliberate: this installation permits only 50 attempts/day.
export function reserveQuota(storage: Pick<DurableObjectStorage, 'sql' | 'transactionSync'>, ipHash: string, now: number): QuotaResult {
  const day = new Date(now).toISOString().slice(0, 10);
  return storage.transactionSync(() => {
    const sql = storage.sql;
    const daily = sql.exec<{ day: string; attempts: number }>('SELECT day, attempts FROM daily WHERE id = 1').toArray()[0];
    if (daily?.day === day && daily.attempts >= DAILY_LIMIT) {
      return { allowed: false, code: 'daily_limit', retryAfter: Math.ceil((Date.parse(`${day}T00:00:00Z`) + 86_400_000 - now) / 1000) };
    }
    const ip = sql.exec<{ expires_at: number; attempts: number }>('SELECT expires_at, attempts FROM ip_windows WHERE ip_hash = ?', ipHash).toArray()[0];
    if (ip && ip.expires_at > now && ip.attempts >= IP_LIMIT) {
      return { allowed: false, code: 'ip_limit', retryAfter: Math.ceil((ip.expires_at - now) / 1000) };
    }
    sql.exec('DELETE FROM ip_windows WHERE expires_at <= ?', now);
    sql.exec('INSERT INTO daily (id, day, attempts) VALUES (1, ?, 1) ON CONFLICT(id) DO UPDATE SET day = excluded.day, attempts = CASE WHEN daily.day = excluded.day THEN daily.attempts + 1 ELSE 1 END', day);
    sql.exec('INSERT INTO ip_windows (ip_hash, expires_at, attempts) VALUES (?, ?, ?) ON CONFLICT(ip_hash) DO UPDATE SET expires_at = excluded.expires_at, attempts = excluded.attempts',
      ipHash, ip && ip.expires_at > now ? ip.expires_at : now + IP_WINDOW_MS, ip && ip.expires_at > now ? ip.attempts + 1 : 1);
    return { allowed: true };
  });
}
