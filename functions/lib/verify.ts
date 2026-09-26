// Конвейер проверки кандидатов от LLM (design D5). Главный инвариант: показываемый
// текст стиха берётся только из корпуса; ссылка, которую нельзя подтвердить, отбрасывается.

import { getQuoteText, type BookText, type CorpusReader } from "../../src/shared/corpus";
import { formatRef, getBook, parseRef, refsOverlap, validateRef, type Ref } from "../../src/shared/reference";
import { FREQUENT_STEMS } from "../../src/shared/corpus/frequent";
import { contentStems, countMatches } from "../../src/shared/stem";
import { LIMITS, type Position, type Quote } from "../../src/shared/types";
import { MAX_CANDIDATES, type LlmCandidate } from "./schema";

type Stance = "confirm" | "refute";

interface Verified {
  ref: Ref;
  stance: Stance;
  explanation: string;
}

export interface VerifyInput {
  candidates: readonly LlmCandidate[];
  position: Position;
  exclude: readonly string[];
}

/** Проверенная цитата: текст уже из корпуса, направленность — confirm/refute. */
export type VerifiedQuote = Quote & { stance: Stance };

export interface VerifyResult {
  quotes: Quote[];
  /** Среди проверенных нет цитат нужной направленности */
  noDirectSupport: boolean;
}

// Синодальные номера стихов не меньше западных: вставки по греческому тексту
// (Притчи) и надписания псалмов, считающиеся стихами. Поэтому сдвиг ищем только вперёд.
const FORWARD_SHIFTS = [1, 2];
const TEMPLATE_EXPLANATION = "Стих подобран по смыслу ситуации.";

function verseText(book: BookText, ref: Ref): string {
  return (book.chapters[ref.chapter - 1] ?? []).slice(ref.verseFrom - 1, ref.verseTo).join(" ");
}

function keywordScore(keywordStems: string[], text: string): number {
  return countMatches(keywordStems, contentStems(text));
}

interface Shifted {
  ref: Ref;
  /** Псалом n−1 со сдвигом 0..+1 — систематическое соответствие западной нумерации */
  psalmMapping: boolean;
}

/** Куда модель могла «промахнуться»: +1..+2 стиха; в Псалтири — псалом n−1 со сдвигом 0..+2. */
function shiftedCandidates(ref: Ref): Shifted[] {
  const span = ref.verseTo - ref.verseFrom;
  const at = (chapter: number, d: number): Ref => ({ book: ref.book, chapter, verseFrom: ref.verseFrom + d, verseTo: ref.verseFrom + d + span });
  const out: Shifted[] = FORWARD_SHIFTS.map((d) => ({ ref: at(ref.chapter, d), psalmMapping: false }));
  if (ref.book === "ps" && ref.chapter > 1) {
    for (const d of [0, ...FORWARD_SHIFTS]) out.push({ ref: at(ref.chapter - 1, d), psalmMapping: d <= 1 });
  }
  return out.filter((x) => validateRef(x.ref) === null);
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^а-яa-z0-9]+/g, " ").trim();

/**
 * Пояснение: не длиннее лимита и без длинных выдуманных цитат — текст Писания
 * показывается только из корпуса. Длинная цитата допустима, только если она дословно
 * есть в тексте стиха (verseText); иначе пояснение заменяется шаблоном.
 */
export function sanitizeExplanation(s: string, verseText = ""): string {
  const text = s.replace(/\s+/g, " ").trim();
  const quoted = text.match(/[«"„“][^»"“”]*[»"“”]/g) ?? [];
  const verse = norm(verseText);
  const invented = quoted.some((q) => q.split(" ").length >= 8 && !(verse && verse.includes(norm(q))));
  if (!text || invented) return TEMPLATE_EXPLANATION;
  return text.length > LIMITS.explanationMax ? `${text.slice(0, LIMITS.explanationMax - 1).trimEnd()}…` : text;
}

async function verifyOne(c: LlmCandidate, reader: CorpusReader): Promise<Verified | null> {
  const parsed = parseRef(c.ref);
  if (!parsed.ok) return null;
  // Частые основы («сын», «земля») ничего не доказывают — проверяем по редким.
  const keywordStems = contentStems(c.keywords.join(" ")).filter((s) => !FREQUENT_STEMS.has(s));
  if (keywordStems.length === 0) return null; // нечем проверить — не рискуем

  const book = await reader.getBook(parsed.ref.book);
  const base = { stance: c.stance, explanation: sanitizeExplanation(c.explanation) };
  // Порядок решений (design D5):
  // 1) у исходной ссылки ≥ 2 совпадений (или все, если слово одно) — принимаем;
  // 2) сдвинутая вперёд ссылка набрала ≥ 2 и строго больше исходной — берём её;
  // 3) Псалтирь: исходная пуста, а псалом n−1 (сдвиг 0..+1) дал хоть одно совпадение — берём;
  // 4) у исходной одно совпадение — оставляем (частые основы уже отсеяны);
  // иначе ссылка отбрасывается.
  const need = Math.min(2, keywordStems.length);
  const own = keywordScore(keywordStems, verseText(book, parsed.ref));
  if (own >= need) return { ref: parsed.ref, ...base };

  let best: { ref: Ref; score: number } | null = null;
  let psalm: Ref | null = null;
  for (const { ref, psalmMapping } of shiftedCandidates(parsed.ref)) {
    const b = ref.chapter === parsed.ref.chapter ? book : await reader.getBook(ref.book);
    const score = keywordScore(keywordStems, verseText(b, ref));
    if (score >= need && score > own && (!best || score > best.score)) best = { ref, score };
    if (psalmMapping && own === 0 && score >= 1 && !psalm) psalm = ref;
  }
  if (best) return { ref: best.ref, ...base };
  if (psalm) return { ref: psalm, ...base };
  return own >= 1 ? { ref: parsed.ref, ...base } : null;
}

/** Отбор главной и запасных по позиции (для both — обе стороны, если есть). */
export function selectQuotes(verified: readonly VerifiedQuote[], position: Position): VerifyResult {
  const max = LIMITS.quotesMax;
  const picked: VerifiedQuote[] = [];
  const add = (v: VerifiedQuote | undefined) => {
    if (v && picked.length < max && !picked.includes(v)) picked.push(v);
  };

  if (position === "both") {
    add(verified[0]);
    add(verified.find((v) => v.stance === "confirm"));
    add(verified.find((v) => v.stance === "refute"));
    verified.forEach(add);
    const sides = new Set(verified.map((v) => v.stance));
    return { quotes: picked, noDirectSupport: sides.size < 2 };
  }
  verified.filter((v) => v.stance === position).forEach(add);
  const noDirectSupport = picked.length === 0;
  if (noDirectSupport) verified.forEach(add); // ближайшие по теме с честной направленностью
  return { quotes: picked, noDirectSupport };
}

/** Сверка всех кандидатов по корпусу; порядок модели сохраняется, текст — из корпуса. */
export async function verifyAll(
  input: Omit<VerifyInput, "position">,
  reader: CorpusReader,
): Promise<VerifiedQuote[]> {
  const excluded = input.exclude.flatMap((s) => {
    const r = parseRef(s);
    return r.ok ? [r.ref] : [];
  });
  const candidates = input.candidates.slice(0, MAX_CANDIDATES);

  // Загружаем нужные книги параллельно заранее (только те, что есть в корпусе).
  const ids = new Set(candidates.flatMap((c) => {
    const r = parseRef(c.ref);
    return r.ok && getBook(r.ref.book) ? [r.ref.book] : [];
  }));
  await Promise.all([...ids].map((id) => reader.getBook(id)));

  const results = await Promise.all(candidates.map((c) => verifyOne(c, reader).catch(() => null)));
  const verified: Verified[] = [];
  for (const v of results) {
    if (!v) continue;
    if (excluded.some((e) => refsOverlap(e, v.ref))) continue;
    if (verified.some((x) => refsOverlap(x.ref, v.ref))) continue;
    verified.push(v);
  }
  return Promise.all(
    verified.map(async (v) => ({
      ref: formatRef(v.ref),
      text: await getQuoteText(reader, v.ref),
      stance: v.stance,
      explanation: v.explanation,
    })),
  );
}

/** Сверка и отбор в одном шаге (без второго прохода). */
export async function verifyCandidates(input: VerifyInput, reader: CorpusReader): Promise<VerifyResult | null> {
  const verified = await verifyAll(input, reader);
  return verified.length ? selectQuotes(verified, input.position) : null;
}
