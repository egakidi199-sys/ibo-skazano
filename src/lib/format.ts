import type { Position, Quote, QuoteStance } from "../shared/types";

/** Формат копирования и шеринга (quote-ui): «текст» (ссылка). Пояснение не входит. */
export function quoteForCopy(q: Pick<Quote, "text" | "ref">): string {
  return `«${q.text}» (${q.ref})`;
}

export const STANCE_LABEL: Record<QuoteStance, string> = {
  confirm: "Подтверждает",
  refute: "Опровергает",
  topic: "По теме",
};

export const NO_SUPPORT_TEXT: Record<Position, string> = {
  confirm: "Прямого подтверждения в Ветхом Завете и Евангелиях не найдено. Ниже — ближайшие по смыслу стихи.",
  refute: "Прямого опровержения в Ветхом Завете и Евангелиях не найдено. Ниже — ближайшие по смыслу стихи.",
  both: "Опоры для одной из сторон в Ветхом Завете и Евангелиях не найдено.",
};

export const SENSITIVE_TEXT =
  "Стихи приведены без изменений и с обеих сторон. Нормы Писания даны в своём историческом контексте; приложение не даёт вероучительной оценки — прочитайте контекст.";

export const FALLBACK_TEXT = "Упрощённый подбор: цитаты найдены по темам и ключевым словам, без ИИ.";

export const EMPTY_TEXT = "Не удалось найти подходящий стих. Попробуйте описать ситуацию другими словами.";
