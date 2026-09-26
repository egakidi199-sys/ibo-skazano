import { fallbackSelect } from "../shared/fallback";
import type { QuoteRequest, QuoteResponse } from "../shared/types";
import { clientCorpus } from "./corpus";

const API_TIMEOUT_MS = 10000;

/** Сервер отклонил ввод (HTTP 400) — показать сообщение, а не уходить в fallback. */
export class InputError extends Error {}

/**
 * Запрос цитат. Сервер недоступен (голый `npm run dev` — 404, офлайн, таймаут, 5xx)
 * или сам просит искать по корпусу (needsClientSearch) — выполняем ту же функцию
 * fallbackSelect в браузере, уже с поиском по всему корпусу (design D6).
 */
export async function requestQuotes(req: QuoteRequest): Promise<QuoteResponse> {
  let data: QuoteResponse | null = null;
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
        signal: controller.signal,
      });
      if (res.status === 400) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new InputError(body.error ?? "Проверьте введённый текст");
      }
      if (res.ok) data = (await res.json()) as QuoteResponse;
    } finally {
      window.clearTimeout(timer);
    }
  } catch (err) {
    if (err instanceof InputError) throw err;
    // сеть / таймаут — ниже локальный подбор
  }

  if (data && !(data.kind === "empty" && data.needsClientSearch)) return data;
  return fallbackSelect(req, clientCorpus, { fullSearch: true });
}
