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
import { verifyCandidates } from "../lib/verify";

type Env = LlmEnv & RateLimitEnv & AssetsEnv;

const BUDGET_MS = 9000;
const ATTEMPT_TIMEOUT_MS = 6000;
const MIN_RETRY_MS = 3000;

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
      if (!parsed.success) throw new InvalidOutput("schema");
      return parsed.data;
    } catch (err) {
      const retryable = err instanceof InvalidOutput || err instanceof SyntaxError;
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

  const verified = await verifyCandidates({ candidates: out.candidates, position, exclude: req.exclude ?? [] }, reader);
  if (!verified) return fallback(); // ни одна ссылка не прошла сверку

  let { quotes, noDirectSupport } = verified;
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
