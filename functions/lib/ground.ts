// Второй проход (design D5a): модель получает точный текст проверенных стихов и заново
// ставит направленность, пишет пояснение по тексту и отбрасывает нерелевантные.
// Текст цитат не меняется — он по-прежнему из корпуса.

import { generate, type LlmEnv } from "./llm";
import { GROUND_SYSTEM_PROMPT, buildGroundPrompt } from "./prompts";
import { GROUND_JSON_SCHEMA, GroundOutputSchema, type GroundOutput } from "./schema";
import { sanitizeExplanation, type VerifiedQuote } from "./verify";

/**
 * Применяет оценку второго прохода. Стих без оценки остаётся как был (модель могла его
 * пропустить); стих, признанный нерелевантным, убирается. Порядок сохраняется.
 */
export function applyGrounding(items: readonly VerifiedQuote[], output: GroundOutput): VerifiedQuote[] {
  const byN = new Map(output.items.map((x) => [x.n, x]));
  return items.flatMap((q, i) => {
    const g = byN.get(i + 1);
    if (!g) return [q];
    if (!g.relevant) return [];
    return [{ ...q, stance: g.stance, explanation: sanitizeExplanation(g.explanation, q.text) }];
  });
}

/** null — второй проход не удался; вызывающий оставляет результат первого прохода. */
export async function groundQuotes(
  env: LlmEnv,
  ctx: { situation: string; thesis: string },
  items: readonly VerifiedQuote[],
  signal: AbortSignal,
): Promise<VerifiedQuote[] | null> {
  const raw = await generate(env, {
    systemPrompt: GROUND_SYSTEM_PROMPT,
    userPrompt: buildGroundPrompt({ ...ctx, verses: items }),
    schema: GROUND_JSON_SCHEMA,
    signal,
  });
  const parsed = GroundOutputSchema.safeParse(raw);
  return parsed.success ? applyGrounding(items, parsed.data) : null;
}
