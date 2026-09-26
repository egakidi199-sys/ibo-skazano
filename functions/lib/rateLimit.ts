export interface RateLimitEnv {
  RATE_LIMIT_KV?: KVNamespace;
}

const DEFAULT_LIMIT = 20;
const WINDOW_SECONDS = 3600;

/**
 * Фиксированное почасовое окно на KV: ключ содержит номер текущего часа,
 * поэтому счётчик сам "обнуляется" со сменой часа без явной очистки.
 * Если KV не забинжен (например, ранняя локальная разработка без биндинга) —
 * не блокируем, чтобы не ломать основной сценарий из-за отсутствия инфраструктуры.
 */
export async function checkRateLimit(
  env: RateLimitEnv,
  ip: string,
  limit: number = DEFAULT_LIMIT,
): Promise<boolean> {
  if (!env.RATE_LIMIT_KV) return true;

  const hourBucket = Math.floor(Date.now() / (WINDOW_SECONDS * 1000));
  const key = `rl:${ip}:${hourBucket}`;

  const current = await env.RATE_LIMIT_KV.get(key);
  const count = current ? Number(current) : 0;
  if (count >= limit) return false;

  await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: WINDOW_SECONDS });
  return true;
}
