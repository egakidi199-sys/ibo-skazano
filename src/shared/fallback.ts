// Подбор цитат без LLM (fallback-search, design D6). Одна реализация для сервера и браузера;
// различается только CorpusReader и то, разрешён ли поиск по всему корпусу (fullSearch):
// на сервере он запрещён из-за лимита CPU Workers и выполняется клиентом.

import { BOOKS } from "./corpus/books";
import { getQuoteText, type CorpusReader } from "./corpus";
import { formatRef, parseRef, refsOverlap, type Ref } from "./reference";
import { checkSafety } from "./safety";
import { contentStems, countMatches, normalizeWord, stem, stemsMatch, tokenize } from "./stem";
import { THEMES, type Theme, type ThemeStance } from "./themes";
import { LIMITS, type Position, type Quote, type QuoteRequest, type QuoteResponse, type QuoteStance } from "./types";

export interface FallbackOptions {
  /** Разрешён ли шаг 2 — поиск по ключевым словам во всём корпусе (только в браузере). */
  fullSearch: boolean;
}

interface PreparedTheme {
  theme: Theme;
  triggerStems: string[];
  claimStems: string[];
  refs: { ref: Ref; stance: ThemeStance }[];
}

const PREPARED: PreparedTheme[] = THEMES.map((theme) => ({
  theme,
  triggerStems: unique(theme.triggers.flatMap((t) => tokenize(t).map(stem))),
  claimStems: unique(theme.claimWords.flatMap((t) => tokenize(t).map(stem))),
  refs: theme.refs.flatMap(({ ref, stance }) => {
    const r = parseRef(ref);
    return r.ok ? [{ ref: r.ref, stance }] : [];
  }),
}));

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** Темы, найденные в запросе, по убыванию числа совпавших триггеров. */
export function matchThemes(text: string): Theme[] {
  const query = contentStems(text);
  return PREPARED.map((p) => ({ p, hits: countMatches(p.triggerStems, query, { prefix: false }) }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .map((x) => x.p.theme);
}

// --- согласие тезиса пользователя с утверждением темы ---

// Слова перед утверждением, переворачивающие его смысл: «нельзя мстить», «не прощать», «перестать злиться».
const INVERT_BEFORE = new Set([
  "не", "ни", "нельзя", "незачем", "нет", "никогда", "без", "перестать", "прекратить", "отказаться",
  "избегать", "сдерживать", "сдержать", "бороться", "запрещено",
]);
// Оценки и глаголы после утверждения: «мстить нельзя», «завидовать — грех», «гнев нужно сдерживать».
const INVERT_AFTER = new Set([
  "нельзя", "грех", "грешно", "плохо", "вредно", "недопустимо", "запрещено", "не",
  "сдерживать", "сдержать", "избегать", "обуздать", "обуздывать", "подавлять", "преодолеть",
]);
const WINDOW = 3;

export type Agreement = "agrees" | "negated" | "unknown";

/** Согласен ли текст с утверждением темы: ищем слова утверждения и отрицания рядом с ними. */
export function agreement(theme: Theme, text: string): Agreement {
  const prepared = PREPARED.find((p) => p.theme === theme);
  if (!prepared) return "unknown";
  const words = tokenize(normalizeWord(text));
  const found = new Set<boolean>();
  words.forEach((w, i) => {
    if (w.length < 3) return;
    const s = stem(w);
    if (!prepared.claimStems.some((c) => stemsMatch(c, s, { prefix: false }))) return;
    const before = words.slice(Math.max(0, i - WINDOW), i);
    const after = words.slice(i + 1, i + 1 + WINDOW);
    found.add(before.some((x) => INVERT_BEFORE.has(x)) || after.some((x) => INVERT_AFTER.has(x)));
  });
  if (found.size !== 1) return "unknown";
  return found.has(true) ? "negated" : "agrees";
}

function relation(stance: ThemeStance, agr: Agreement): QuoteStance {
  if (agr === "agrees") return stance;
  if (agr === "negated") return stance === "confirm" ? "refute" : "confirm";
  return "topic";
}

interface Candidate {
  ref: Ref;
  stance: QuoteStance;
  explanation: string;
}

/** Отбор до quotesMax цитат по позиции; кандидаты уже упорядочены по релевантности. */
function selectByPosition(
  byTheme: Candidate[][],
  position: Position,
): { picked: Candidate[]; noDirectSupport: boolean } {
  const all = byTheme.flat();
  const hasKnown = all.some((c) => c.stance !== "topic");
  const picked: Candidate[] = [];
  // Берём по одной цитате из каждой темы по кругу — для разнообразия.
  const take = (pred: (c: Candidate) => boolean, limit: number) => {
    const lists = byTheme.map((list) => list.filter(pred));
    const cursor = lists.map(() => 0);
    while (picked.length < limit) {
      let progressed = false;
      lists.forEach((list, i) => {
        if (picked.length >= limit) return;
        while (cursor[i] < list.length && picked.some((p) => refsOverlap(p.ref, list[cursor[i]].ref))) cursor[i]++;
        if (cursor[i] < list.length) {
          picked.push(list[cursor[i]++]);
          progressed = true;
        }
      });
      if (!progressed) break;
    }
  };

  const max = LIMITS.quotesMax;
  if (position === "both") {
    take((c) => c.stance === "confirm", 1);
    take((c) => c.stance === "refute", 2);
    take(() => true, max);
    const noSide = hasKnown && (!all.some((c) => c.stance === "confirm") || !all.some((c) => c.stance === "refute"));
    return { picked, noDirectSupport: noSide };
  }
  take((c) => c.stance === position, max);
  const noDirectSupport = hasKnown && picked.length === 0;
  if (picked.length === 0) take((c) => c.stance !== position, max); // ближайшие по теме, с честной пометкой
  return { picked, noDirectSupport };
}

// --- шаг 2: ключевые слова по всему корпусу ---

const MAX_QUERY_STEMS = 12;

async function keywordSearch(text: string, reader: CorpusReader, excluded: Ref[]): Promise<Candidate[]> {
  const query = contentStems(text).slice(0, MAX_QUERY_STEMS);
  if (query.length === 0) return [];
  const need = query.length >= 2 ? 2 : 1;
  const prefixes = query.map((q) => q.slice(0, 3));
  const books = await Promise.all(BOOKS.map((b) => reader.getBook(b.id)));

  const hits: { ref: Ref; score: number; length: number; order: number }[] = [];
  let order = 0;
  for (const book of books) {
    book.chapters.forEach((verses, ci) => {
      verses.forEach((raw, vi) => {
        order++;
        const lower = normalizeWord(raw);
        if (!prefixes.some((p) => lower.includes(p))) return; // дешёвый префильтр
        // Стеммим только слова с теми же первыми буквами, что у слов запроса.
        const stems = tokenize(lower)
          .filter((w) => prefixes.some((p) => w.startsWith(p)))
          .map(stem);
        const score = query.filter((q) => stems.some((s) => stemsMatch(q, s))).length;
        if (score >= need) {
          hits.push({ ref: { book: book.id, chapter: ci + 1, verseFrom: vi + 1, verseTo: vi + 1 }, score, length: raw.length, order });
        }
      });
    });
  }
  hits.sort((a, b) => b.score - a.score || a.length - b.length || a.order - b.order);
  const out: Candidate[] = [];
  for (const h of hits) {
    if (excluded.some((e) => refsOverlap(e, h.ref))) continue;
    out.push({ ref: h.ref, stance: "topic", explanation: "Найдено по ключевым словам запроса." });
    if (out.length >= LIMITS.quotesMax) break;
  }
  return out;
}

// --- точка входа ---

export async function fallbackSelect(
  req: QuoteRequest,
  reader: CorpusReader,
  { fullSearch }: FallbackOptions,
): Promise<QuoteResponse> {
  const safety = checkSafety(req.situation, req.thesis ?? "");
  if (safety !== "none") return { kind: "refusal", reason: safety };

  const thesis = req.thesis?.trim() ?? "";
  const queryText = `${req.situation} ${thesis}`;
  const polarityText = thesis || req.situation;
  const excluded = (req.exclude ?? []).flatMap((s) => {
    const r = parseRef(s);
    return r.ok ? [r.ref] : [];
  });

  const themes = matchThemes(queryText);
  let picked: Candidate[];
  let noDirectSupport = false;
  let thesisOut: string;

  if (themes.length > 0) {
    const byTheme = themes.map((theme) => {
      const agr = agreement(theme, polarityText);
      const prepared = PREPARED.find((p) => p.theme === theme)!;
      return prepared.refs
        .filter((x) => !excluded.some((e) => refsOverlap(e, x.ref)))
        .map((x) => ({ ref: x.ref, stance: relation(x.stance, agr), explanation: `Тема «${theme.title}».` }));
    });
    ({ picked, noDirectSupport } = selectByPosition(byTheme, req.position));
    thesisOut = thesis || `Темы: ${themes.map((t) => t.title.toLowerCase()).join(", ")}`;
  } else {
    picked = [];
    thesisOut = thesis || "Поиск по ключевым словам";
  }

  if (picked.length === 0 && themes.length === 0) {
    if (!fullSearch) return { kind: "empty", source: "fallback", needsClientSearch: true };
    picked = await keywordSearch(queryText, reader, excluded);
  }
  if (picked.length === 0) return { kind: "empty", source: "fallback" };

  const quotes: Quote[] = await Promise.all(
    picked.map(async (c) => ({
      ref: formatRef(c.ref),
      text: await getQuoteText(reader, c.ref),
      stance: c.stance,
      explanation: c.explanation,
    })),
  );
  return { kind: "quotes", source: "fallback", thesis: thesisOut, quotes, noDirectSupport };
}
