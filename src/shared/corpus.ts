import type { Ref } from "./reference";

/** Содержимое /corpus/<id>.json (см. scripts/build-corpus.mjs). */
export interface BookText {
  id: string;
  /** chapters[глава-1][стих-1] */
  chapters: string[][];
  /** Нецитируемые надписания по номеру главы */
  headings?: Record<string, string>;
}

/** Доступ к тексту корпуса; реализации — для браузера и для Pages Function. */
export interface CorpusReader {
  getBook(id: string): Promise<BookText>;
}

type FetchLike = (url: string) => Promise<Response>;

/**
 * Читатель корпуса поверх fetch с кешем в памяти. В браузере — обычный fetch
 * по "/corpus/", в функции — env.ASSETS.fetch с абсолютным базовым URL.
 */
export function createFetchCorpusReader(fetchFn: FetchLike, base = "/corpus/"): CorpusReader {
  const cache = new Map<string, Promise<BookText>>();
  return {
    getBook(id) {
      let p = cache.get(id);
      if (!p) {
        p = fetchFn(`${base}${id}.json`).then((res) => {
          if (!res.ok) throw new Error(`corpus ${id}: HTTP ${res.status}`);
          return res.json() as Promise<BookText>;
        });
        // Неудачную загрузку не кешируем — следующий вызов попробует снова.
        p.catch(() => cache.delete(id));
        cache.set(id, p);
      }
      return p;
    },
  };
}

/** Дословные стихи ссылки (ссылка должна быть заранее проверена validateRef). */
export async function getVerses(reader: CorpusReader, ref: Ref): Promise<string[]> {
  const book = await reader.getBook(ref.book);
  const chapter = book.chapters[ref.chapter - 1] ?? [];
  return chapter.slice(ref.verseFrom - 1, ref.verseTo);
}

/** Текст цитаты для показа и копирования: стихи через пробел. */
export async function getQuoteText(reader: CorpusReader, ref: Ref): Promise<string> {
  return (await getVerses(reader, ref)).join(" ");
}

export interface ContextVerse {
  verse: number;
  text: string;
  isQuote: boolean;
}

export interface QuoteContext {
  /** Надписание главы — только если контекст начинается со стиха 1 */
  heading?: string;
  verses: ContextVerse[];
}

export const CONTEXT_RADIUS = 3;

/** Цитата ± CONTEXT_RADIUS стихов в пределах той же главы. */
export async function getContext(reader: CorpusReader, ref: Ref, radius = CONTEXT_RADIUS): Promise<QuoteContext> {
  const book = await reader.getBook(ref.book);
  const chapter = book.chapters[ref.chapter - 1] ?? [];
  const from = Math.max(1, ref.verseFrom - radius);
  const to = Math.min(chapter.length, ref.verseTo + radius);
  const verses: ContextVerse[] = [];
  for (let v = from; v <= to; v++) {
    verses.push({ verse: v, text: chapter[v - 1], isQuote: v >= ref.verseFrom && v <= ref.verseTo });
  }
  const heading = from === 1 ? book.headings?.[String(ref.chapter)] : undefined;
  return heading ? { heading, verses } : { verses };
}
