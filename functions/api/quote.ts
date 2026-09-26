// POST /api/quote — подбор цитат.
// Валидация → эвристика sensitive → рейт-лимит → LLM (бюджет 9 с, один повтор при
// невалидном ответе) → сверка по корпусу → при любом сбое fallback по темам
// (поиск по всему корпусу сервер не делает — needsClientSearch, design D6).
// Тексты пользователей не логируются (service-safeguards).

import { fallbackSelect } from "../../src/shared/fallback";
import { isHarmJustification } from "../../src/shared/safety";
import type { Position, QuoteRequest, QuoteResponse } from "../../src/shared/types";
import { createAssetsCorpusReader, type AssetsEnv } from "../lib/corpus";
import { generate, type LlmEnv } from "../lib/llm";
import { FEW_SHOT, SYSTEM_PROMPT, buildUserPrompt } from "../lib/prompts";
import { checkRateLimit, type RateLimitEnv } from "../lib/rateLimit";
import { LLM_JSON_SCHEMA, LlmOutputSchema, QuoteRequestSchema, type LlmOutput } from "../lib/schema";
import { hasBothSides, supplementSides } from "../lib/supplement";
import { groundQuotes } from "../lib/ground";
import { selectQuotes, verifyAll, type VerifiedQuote } from "../lib/verify";

type Env = LlmEnv & RateLimitEnv & AssetsEnv;

const BUDGET_MS = 9000;
const ATTEMPT_TIMEOUT_MS = 6000;
const MIN_RETRY_MS = 3000;
// Второй проход запускается, только если в бюджете осталось не меньше этого (design D5a).
const MIN_GROUND_MS = 1500;
const GROUND_TIMEOUT_MS = 4000;

class InvalidOutput extends Error {}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/** Ответ модели или null (сбой, таймаут, исчерпан бюджет). Повтор — только при невалидном ответе. */
async function askLlm(env: Env, req: QuoteRequest, started: number): Promise<LlmOutput | null> {
  const userPrompt = buildUserPrompt({ ...req, exclude: req.exclude ?? [] });
  for (let attempt = 1; attempt <= 2; attempt++) {
    const left = BUDGET_MS - (Date.now() - started);
    if (attempt > 1 && left < MIN_RETRY_MS) return null;
    try {
      const raw = await withTimeout(
        (signal) =>
          generate(env, { systemPrompt: SYSTEM_PROMPT, examples: FEW_SHOT, userPrompt, schema: LLM_JSON_SCHEMA, signal }),
        Math.min(ATTEMPT_TIMEOUT_MS, left - 500),
      );
      const parsed = LlmOutputSchema.safeParse(raw);
      if (!parsed.success) throw new InvalidOutput(`schema: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.code}`).join(", ").slice(0, 150)}`);
      return parsed.data;
    } catch (err) {
      // Невалидный ответ модели, в том числе когда провайдер сам не смог уложить генерацию
      // в JSON-схему (Groq: HTTP 400 «Failed to generate JSON») — пробуем ещё раз.
      const providerJsonFailure = err instanceof Error && /Failed to generate JSON|does not match the expected schema/.test(err.message);
      const retryable = err instanceof InvalidOutput || err instanceof SyntaxError || providerJsonFailure;
      console.error(`[quote] attempt ${attempt}: ${err instanceof Error ? `${err.name}: ${err.message.slice(0, 200)}` : "error"}`);
      if (!retryable) return null;
    }
  }
  return null;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const started = Date.now();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный JSON" }, { status: 400 });
  }
  const parsed = QuoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Некорректные входные данные: ситуация — от 10 до 600 символов, тезис — до 200" }, { status: 400 });
  }
  const req: QuoteRequest = parsed.data;

  const reader = createAssetsCorpusReader(env, request.url);
  const fallback = async () => Response.json(await fallbackSelect(req, reader, { fullSearch: false }));

  // Превышен лимит — не ошибка, а упрощённый подбор (service-safeguards).
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!(await checkRateLimit(env, ip))) return fallback();

  const out = await askLlm(env, req, started);
  if (!out) return fallback();

  // Чувствительный тезис — не отказ, а обе стороны (design D7).
  const sensitive = out.sensitive || isHarmJustification(req.situation, req.thesis ?? "");
  const position: Position = sensitive ? "both" : req.position;

  let verified: VerifiedQuote[] = await verifyAll({ candidates: out.candidates, exclude: req.exclude ?? [] }, reader);
  if (verified.length === 0) return fallback(); // ни одна ссылка не прошла сверку

  // Второй проход: направленность и пояснения — по точному тексту стихов (design D5a).
  // При сбое или нехватке времени остаётся результат первого прохода.
  const left = BUDGET_MS - (Date.now() - started);
  if (left >= MIN_GROUND_MS) {
    const thesis = out.thesis.trim() || req.thesis || req.situation;
    const grounded = await withTimeout(
      (signal) => groundQuotes(env, { situation: req.situation, thesis }, verified, signal),
      Math.min(GROUND_TIMEOUT_MS, left - 500),
    ).catch((err: unknown) => {
      console.error(`[quote] ground: ${err instanceof Error ? `${err.name}: ${err.message.slice(0, 200)}` : "error"}`);
      return null;
    });
    if (grounded) verified = grounded;
  }
  if (verified.length === 0) return fallback(); // все стихи признаны нерелевантными

  let { quotes, noDirectSupport } = selectQuotes(verified, position);
  if (position === "both" && !hasBothSides(quotes)) {
    // Модель не дала одну из сторон — добираем из тематического указателя (текст тоже из корпуса).
    const extra = await fallbackSelect({ ...req, position: "both" }, reader, { fullSearch: false });
    if (extra.kind === "quotes") quotes = supplementSides(quotes, extra.quotes);
    noDirectSupport = !hasBothSides(quotes);
  }

  const response: QuoteResponse = {
    kind: "quotes",
    source: "llm",
    thesis: out.thesis.trim().slice(0, 200) || req.thesis || "",
    quotes,
    noDirectSupport,
    sensitive,
  };
  return Response.json(response);
};
