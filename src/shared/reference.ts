import { BOOKS, type BookMeta } from "./corpus/books";

/** Ссылка на один стих или диапазон стихов в пределах одной главы. */
export interface Ref {
  /** id книги из BOOKS */
  book: string;
  chapter: number;
  verseFrom: number;
  verseTo: number;
}

export type RefError =
  | "unrecognized" // не удалось разобрать строку или книгу
  | "out_of_corpus" // книга Писания, но вне корпуса (Послания, Сирах и т. п.)
  | "no_chapter" // нет такой главы
  | "no_verse" // нет такого стиха
  | "bad_range" // конец диапазона раньше начала
  | "range_too_long"; // больше MAX_VERSES стихов

export const REF_ERROR_TEXT: Record<RefError, string> = {
  unrecognized: "ссылка не распознана",
  out_of_corpus: "книга вне корпуса",
  no_chapter: "глава не существует",
  no_verse: "стих не существует",
  bad_range: "неверный диапазон",
  range_too_long: "слишком длинный диапазон",
};

export type RefResult = { ok: true; ref: Ref } | { ok: false; error: RefError };

/** Максимум стихов в одной цитате (scripture-corpus: «Максимальная длина цитаты»). */
export const MAX_VERSES = 5;

// Книги Писания вне корпуса: остальной Новый Завет и неканонические книги ВЗ.
// Нужны, чтобы отличать «вне корпуса» от «не распознано».
const OUT_OF_CORPUS = [
  "Деян", "Деяния", "Деяния апостолов",
  "Иак", "Иакова", "Послание Иакова",
  "1 Пет", "2 Пет", "1 Петра", "2 Петра",
  "1 Ин", "2 Ин", "3 Ин", "1 Иоанна", "2 Иоанна", "3 Иоанна", "1 Иоан", "2 Иоан", "3 Иоан",
  "Иуд", "Иуды", "Послание Иуды",
  "Рим", "Римлянам", "К Римлянам",
  "1 Кор", "2 Кор", "1 Коринфянам", "2 Коринфянам",
  "Гал", "Галатам", "Еф", "Ефесянам", "Флп", "Фил", "Филиппийцам",
  "Кол", "Колоссянам", "1 Фес", "2 Фес", "1 Фессалоникийцам", "2 Фессалоникийцам",
  "1 Тим", "2 Тим", "1 Тимофею", "2 Тимофею", "Тит", "Титу", "Флм", "Филимону",
  "Евр", "Евреям", "К Евреям",
  "Откр", "Откровение", "Апокалипсис", "Откровение Иоанна",
  "Сир", "Сирах", "Сираха", "Премудрость Иисуса сына Сирахова",
  "Прем", "Премудрость Соломона", "Премудрости Соломона",
  "Тов", "Товит", "Товита", "Иудифь", "Иудифи", "Вар", "Варух", "Варуха",
  "1 Мак", "2 Мак", "3 Мак", "1 Маккавейская", "2 Маккавейская", "3 Маккавейская",
  "2 Езд", "3 Езд", "2 Ездры", "3 Ездры",
  "Посл Иер", "Послание Иеремии", "Молитва Манассии",
];

/** Нормализация названия книги: регистр, «ё», точки, порядковые «1-я», пробелы. */
export function normalizeBookName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[.,]/g, " ")
    .replace(/^\s*(книга|кн)\s+/, "")
    .replace(/^\s*([1-4])\s*-?\s*(я|е|ое|ая|й)?\s+/, "$1 ")
    .replace(/^([1-4]) /, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const bookByName = new Map<string, BookMeta>();
for (const b of BOOKS) {
  for (const n of [b.id, b.abbr, b.name, ...b.aliases]) bookByName.set(normalizeBookName(n), b);
}
const outOfCorpusNames = new Set(OUT_OF_CORPUS.map(normalizeBookName));
const bookById = new Map(BOOKS.map((b) => [b.id, b]));

export function getBook(id: string): BookMeta | undefined {
  return bookById.get(id);
}

const REF_RE = /^(.+?)\s*(\d{1,3})\s*[:.,]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?\s*$/;

/** Разбирает и проверяет ссылку вида «Притч 15:1-2» или «Евангелие от Иоанна 13:34». */
export function parseRef(input: string): RefResult {
  const m = REF_RE.exec(input.trim());
  if (!m) return { ok: false, error: "unrecognized" };
  const name = normalizeBookName(m[1]);
  const book = bookByName.get(name);
  if (!book) return { ok: false, error: outOfCorpusNames.has(name) ? "out_of_corpus" : "unrecognized" };
  const verseFrom = Number(m[3]);
  const ref: Ref = {
    book: book.id,
    chapter: Number(m[2]),
    verseFrom,
    verseTo: m[4] ? Number(m[4]) : verseFrom,
  };
  const error = validateRef(ref);
  return error ? { ok: false, error } : { ok: true, ref };
}

/** Проверяет существование ссылки по метаданным корпуса. null — ссылка действительна. */
export function validateRef(ref: Ref): RefError | null {
  const book = bookById.get(ref.book);
  if (!book) return "out_of_corpus";
  const count = book.verseCounts[ref.chapter - 1];
  if (!Number.isInteger(ref.chapter) || count === undefined) return "no_chapter";
  if (ref.verseTo < ref.verseFrom) return "bad_range";
  if (ref.verseFrom < 1 || ref.verseTo > count) return "no_verse";
  if (ref.verseTo - ref.verseFrom + 1 > MAX_VERSES) return "range_too_long";
  return null;
}

/** «Притч 15:1–2» — каноническое сокращение, короткое тире в диапазоне. */
export function formatRef(ref: Ref): string {
  const abbr = bookById.get(ref.book)?.abbr ?? ref.book;
  const verses = ref.verseTo > ref.verseFrom ? `${ref.verseFrom}–${ref.verseTo}` : `${ref.verseFrom}`;
  return `${abbr} ${ref.chapter}:${verses}`;
}

/** Стабильный ключ для сравнения и дедупликации. */
export function refKey(ref: Ref): string {
  return `${ref.book}.${ref.chapter}.${ref.verseFrom}-${ref.verseTo}`;
}

/** Пересекаются ли два диапазона. */
export function refsOverlap(a: Ref, b: Ref): boolean {
  return a.book === b.book && a.chapter === b.chapter && a.verseFrom <= b.verseTo && b.verseFrom <= a.verseTo;
}
