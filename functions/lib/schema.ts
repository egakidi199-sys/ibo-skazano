import { z } from "zod";
import { LIMITS } from "../../src/shared/types";

// Управляющие символы, кроме перевода строки и табуляции (service-safeguards).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const clean = (s: string) => s.replace(CONTROL_CHARS, "").trim();

export const QuoteRequestSchema = z.object({
  situation: z.string().transform(clean).pipe(z.string().min(LIMITS.situationMin).max(LIMITS.situationMax)),
  thesis: z
    .string()
    .transform(clean)
    .pipe(z.string().max(LIMITS.thesisMax))
    .optional(),
  position: z.enum(["confirm", "refute", "both"]),
  exclude: z.array(z.string().max(40)).max(LIMITS.excludeMax).optional(),
});

export const MAX_CANDIDATES = 8;

/** Массив, из которого молча выбрасываются элементы, не прошедшие схему: один неверный
 * кандидат (например, stance «neutral») не должен ронять весь ответ модели. */
function lenientArray<T extends z.ZodType>(item: T) {
  return z
    .array(z.unknown())
    .max(20)
    .transform((xs) => xs.flatMap((x) => {
      const r = item.safeParse(x);
      return r.success ? [r.data as z.infer<T>] : [];
    }));
}

const CandidateSchema = z.object({
  ref: z.string(),
  keywords: z.array(z.string()),
  explanation: z.string(),
  stance: z.enum(["confirm", "refute"]),
});

// Ответ модели. Поля для текста стиха нет намеренно: текст берётся только из корпуса
// (главный инвариант, design D4).
export const LlmOutputSchema = z.object({
  sensitive: z.boolean(),
  thesis: z.string(),
  no_direct_support: z.boolean(),
  candidates: lenientArray(CandidateSchema),
});

export type LlmOutput = z.infer<typeof LlmOutputSchema>;
export type LlmCandidate = LlmOutput["candidates"][number];

// Плоская JSON-схема для structured output: без oneOf/union — поддержка композиции
// у провайдеров непоследовательна (урок AstroStrikeBack).
export const LLM_JSON_SCHEMA = {
  type: "object",
  properties: {
    sensitive: { type: "boolean" },
    thesis: { type: "string" },
    no_direct_support: { type: "boolean" },
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ref: { type: "string" },
          keywords: { type: "array", items: { type: "string" } },
          // Пояснение до направленности: модель сначала формулирует смысл стиха,
          // потом выводит из него пометку (эталонный прогон 7.2).
          explanation: { type: "string" },
          stance: { type: "string", enum: ["confirm", "refute"] },
        },
        required: ["ref", "keywords", "explanation", "stance"],
        additionalProperties: false,
      },
    },
  },
  required: ["sensitive", "thesis", "no_direct_support", "candidates"],
  additionalProperties: false,
} as const;

// --- второй проход: оценка стихов по их точному тексту (design D5a) ---

export const GroundOutputSchema = z.object({
  items: lenientArray(
    z.object({
      n: z.number().int(),
      relevant: z.boolean(),
      explanation: z.string(),
      stance: z.enum(["confirm", "refute"]),
    }),
  ),
});

export type GroundOutput = z.infer<typeof GroundOutputSchema>;

export const GROUND_JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer" },
          relevant: { type: "boolean" },
          explanation: { type: "string" },
          stance: { type: "string", enum: ["confirm", "refute"] },
        },
        required: ["n", "relevant", "explanation", "stance"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;
