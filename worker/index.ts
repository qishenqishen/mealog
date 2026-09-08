import { DurableObject } from 'cloudflare:workers';
import { MODEL } from '../src/insights/contract';
import { handleMonthly, json, MAX_OUTPUT_TOKENS, RESPONSE_FORMAT } from './handler';
import { initializeQuota, reserveQuota } from './quota';

export class InsightsQuota extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    initializeQuota(ctx.storage.sql);
  }

  async consume(ip: string) {
    const salt = this.ctx.storage.sql.exec<{ salt: string }>('SELECT salt FROM privacy WHERE id = 1').one().salt;
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${ip}`));
    const hash = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return reserveQuota(this.ctx.storage, hash, Date.now());
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/api/insights/monthly') {
      return handleMonthly(request, {
        reserve: () => env.INSIGHTS_QUOTA.getByName('global-v1').consume(request.headers.get('CF-Connecting-IP') || 'unknown'),
        generate: (messages, signal) => env.AI.run(MODEL, {
          messages, max_tokens: MAX_OUTPUT_TOKENS, temperature: 0.3, stream: false, response_format: RESPONSE_FORMAT,
        }, { signal }),
      });
    }
    if (path === '/api' || path.startsWith('/api/')) return json({ error: { code: 'not_found' } }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
