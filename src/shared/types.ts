// Контракт между клиентом и POST /api/quote; общий для обеих сторон.

export type Position = "confirm" | "refute" | "both";

/** Отношение цитаты к тезису пользователя; "topic" — по теме, без утверждения направленности. */
export type QuoteStance = "confirm" | "refute" | "topic";

export interface QuoteRequest {
  situation: string;
  thesis?: string;
  position: Position;
  /** Ссылки, уже показанные для этого запроса («Ещё вариант») */
  exclude?: string[];
}

export interface Quote {
  /** Отформатированная ссылка, например «Притч 15:1–2» */
  ref: string;
  /** Дословный текст из корпуса */
  text: string;
  stance: QuoteStance;
  explanation: string;
}

export type QuoteSource = "llm" | "fallback";

export type QuoteResponse =
  | {
      kind: "quotes";
      source: QuoteSource;
      /** Понятый тезис */
      thesis: string;
      /** quotes[0] — главная, остальные — запасные */
      quotes: Quote[];
      /** Прямой опоры для выбранной позиции не найдено */
      noDirectSupport: boolean;
    }
  | { kind: "refusal"; reason: "harm" | "crisis" }
  | {
      kind: "empty";
      source: QuoteSource;
      /** Сервер не нашёл тем; поиск по всему корпусу должен выполнить клиент (design D6) */
      needsClientSearch?: boolean;
    };

export const LIMITS = {
  situationMin: 10,
  situationMax: 600,
  thesisMax: 200,
  explanationMax: 300,
  excludeMax: 30,
  quotesMax: 3,
} as const;
