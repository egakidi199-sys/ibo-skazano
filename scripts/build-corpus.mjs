// Сборка корпуса: data/rst/*.dat (bibleonline/rst, parsed/) →
//   public/corpus/<id>.json   — текст по книгам
//   src/shared/corpus/books.ts — метаданные (сокращения, алиасы, число стихов по главам)
// и проверка эталонов (design D2). При любом расхождении — ненулевой код выхода.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "data", "rst");
const outDir = join(root, "public", "corpus");
const booksTs = join(root, "src", "shared", "corpus", "books.ts");

// Порядок — синодальный. abbr — каноническое сокращение для показа.
// aliases — дополнительные написания для разбора ссылок (регистр, точки, «ё» и пробелы
// нормализует parseRef). Для 1–4 Царств учтены протестантские названия, которые
// часто выдаёт LLM: «1 Самуила» = 1 Цар, «1 Царей» = 3 Цар.
const BOOKS = [
  ["gen", "01-genesis", "Быт", "Бытие", ["Бт", "Книга Бытия", "Бытия"]],
  ["exod", "02-exodus", "Исх", "Исход", ["Книга Исход"]],
  ["lev", "03-leviticus", "Лев", "Левит", ["Левита"]],
  ["num", "04-numbers", "Чис", "Числа", ["Числ", "Книга Чисел"]],
  ["deut", "05-deuteronomy", "Втор", "Второзаконие", ["Второзакония"]],
  ["josh", "06-joshua", "Нав", "Иисус Навин", ["Книга Иисуса Навина", "Иисуса Навина", "Иис Нав", "ИисНав"]],
  ["judg", "07-judges", "Суд", "Судьи", ["Книга Судей", "Судей", "Судей Израилевых"]],
  ["ruth", "08-ruth", "Руф", "Руфь", ["Книга Руфи", "Руфи"]],
  ["1sam", "09-1samuel", "1 Цар", "1-я книга Царств", ["1 Царств", "1 Самуила", "1 Сам"]],
  ["2sam", "10-2samuel", "2 Цар", "2-я книга Царств", ["2 Царств", "2 Самуила", "2 Сам"]],
  ["1kgs", "11-1kings", "3 Цар", "3-я книга Царств", ["3 Царств", "1 Царей", "1 Цр"]],
  ["2kgs", "12-2kings", "4 Цар", "4-я книга Царств", ["4 Царств", "2 Царей", "2 Цр"]],
  ["1chr", "13-1chronicles", "1 Пар", "1-я книга Паралипоменон", ["1 Паралипоменон", "1 Лет", "1 Летопись"]],
  ["2chr", "14-2chronicles", "2 Пар", "2-я книга Паралипоменон", ["2 Паралипоменон", "2 Лет", "2 Летопись"]],
  ["ezra", "16-ezra", "Езд", "Ездра", ["Книга Ездры", "Ездры", "1 Езд", "1 Ездры"]],
  ["neh", "17-nehemiah", "Неем", "Неемия", ["Книга Неемии", "Неемии"]],
  ["esth", "21-esther", "Есф", "Есфирь", ["Книга Есфири", "Есфири", "Эсф", "Эсфирь"]],
  ["job", "22-job", "Иов", "Иов", ["Книга Иова", "Иова"]],
  ["ps", "23-psalms", "Пс", "Псалтирь", ["Псалом", "Псалмы", "Псалтырь", "Пслт"]],
  ["prov", "24-proverbs", "Притч", "Притчи", ["Притчи Соломона", "Прит", "Пр", "Притча"]],
  ["eccl", "25-ecclesiastes", "Еккл", "Екклесиаст", ["Екк", "Ек", "Екклезиаст", "Экклезиаст", "Книга Екклесиаста", "Екклесиаста"]],
  ["song", "26-songofsolomon", "Песн", "Песнь песней", ["Песнь Песней Соломона", "Песн Песн", "Песня Песней"]],
  ["isa", "29-isaiah", "Ис", "Исаия", ["Иса", "Книга пророка Исаии", "Исаии", "Исайя", "Исайи"]],
  ["jer", "30-jeremiah", "Иер", "Иеремия", ["Книга пророка Иеремии", "Иеремии"]],
  ["lam", "31-lamentations", "Плач", "Плач Иеремии", ["Плач Иер"]],
  ["ezek", "34-ezekiel", "Иез", "Иезекииль", ["Книга пророка Иезекииля", "Иезекииля", "Иезек"]],
  ["dan", "35-daniel", "Дан", "Даниил", ["Книга пророка Даниила", "Даниила"]],
  ["hos", "36-hosea", "Ос", "Осия", ["Осии"]],
  ["joel", "37-joel", "Иоил", "Иоиль", ["Иоиля", "Иол"]],
  ["amos", "38-amos", "Ам", "Амос", ["Амоса"]],
  ["obad", "39-obadiah", "Авд", "Авдий", ["Авдия"]],
  ["jonah", "40-jonah", "Ион", "Иона", ["Ионы"]],
  ["mic", "41-micah", "Мих", "Михей", ["Михея"]],
  ["nah", "42-nahum", "Наум", "Наум", ["Наума"]],
  ["hab", "43-habakkuk", "Авв", "Аввакум", ["Аввакума"]],
  ["zeph", "44-zephaniah", "Соф", "Софония", ["Софонии"]],
  ["hag", "45-haggai", "Агг", "Аггей", ["Аггея"]],
  ["zech", "46-zechariah", "Зах", "Захария", ["Захарии"]],
  ["mal", "47-malachi", "Мал", "Малахия", ["Малахии"]],
  ["matt", "52-matthew", "Мф", "Евангелие от Матфея", ["Матфей", "От Матфея", "Матфея", "Мат", "Матф", "Мтф", "Мт"]],
  ["mark", "53-mark", "Мк", "Евангелие от Марка", ["Марк", "От Марка", "Марка", "Мар", "Мрк"]],
  ["luke", "54-luke", "Лк", "Евангелие от Луки", ["Лука", "От Луки", "Луки", "Лук"]],
  ["john", "55-john", "Ин", "Евангелие от Иоанна", ["Иоанн", "От Иоанна", "Иоанна", "Иоан", "Ин."]],
];

const errors = [];
const fail = (msg) => errors.push(msg);

function normalizeText(s) {
  return s
    .replace(/<\/?i>/g, "")
    .replace(/&mdash;/g, "—")
    .replace(/&nbsp;/g, " ")
    .replace(/&#769;/g, "́")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBook(file) {
  const raw = readFileSync(join(srcDir, `${file}.dat`), "utf8");
  /** @type {Map<number, Map<number, string[]>>} */
  const chapters = new Map();
  for (const line of raw.split(/\r?\n/)) {
    if (line === "" || line === "#p#") continue;
    const m = /^#(\d+):(\d+)#(.*)$/.exec(line);
    if (!m) {
      fail(`${file}: неизвестная строка: ${line.slice(0, 60)}`);
      continue;
    }
    const [c, v, text] = [Number(m[1]), Number(m[2]), m[3]];
    if (!chapters.has(c)) chapters.set(c, new Map());
    const verses = chapters.get(c);
    // Одинаковый номер на нескольких строках — стих, разбитый на абзацы.
    if (!verses.has(v)) verses.set(v, []);
    verses.get(v).push(text);
  }

  const headings = {};
  // «0:0» (вступление Есфири) — надписание перед главой 1.
  if (chapters.has(0)) {
    const pre = chapters.get(0);
    if (pre.size !== 1 || !pre.has(0)) fail(`${file}: неожиданная глава 0`);
    headings["1"] = normalizeText(pre.get(0).join(" "));
    chapters.delete(0);
  }

  const numbers = [...chapters.keys()].sort((a, b) => a - b);
  numbers.forEach((n, i) => {
    if (n !== i + 1) fail(`${file}: пропуск главы перед ${n}`);
  });

  const out = numbers.map((c) => {
    const verses = chapters.get(c);
    if (verses.has(0)) {
      const h = normalizeText(verses.get(0).join(" "));
      headings[String(c)] = headings[String(c)] ? `${headings[String(c)]} ${h}` : h;
      verses.delete(0);
    }
    const vs = [...verses.keys()].sort((a, b) => a - b);
    vs.forEach((v, i) => {
      if (v !== i + 1) fail(`${file} ${c}: пропуск стиха перед ${v}`);
    });
    return vs.map((v) => normalizeText(verses.get(v).join(" ")));
  });

  for (const [ci, ch] of out.entries()) {
    for (const [vi, t] of ch.entries()) {
      if (/[<>&]/.test(t)) fail(`${file} ${ci + 1}:${vi + 1}: осталась разметка: ${t.slice(0, 60)}`);
      if (!t) fail(`${file} ${ci + 1}:${vi + 1}: пустой стих`);
    }
  }
  return { chapters: out, headings };
}

// --- сборка ---
const datFiles = readdirSync(srcDir).filter((f) => f.endsWith(".dat"));
if (datFiles.length !== BOOKS.length) fail(`ожидалось ${BOOKS.length} файлов .dat, найдено ${datFiles.length}`);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
mkdirSync(dirname(booksTs), { recursive: true });

const corpus = {};
const meta = [];
for (const [id, file, abbr, name, aliases] of BOOKS) {
  const { chapters, headings } = parseBook(file);
  corpus[id] = chapters;
  const book = { id, chapters };
  if (Object.keys(headings).length) book.headings = headings;
  writeFileSync(join(outDir, `${id}.json`), JSON.stringify(book));
  meta.push({ id, abbr, name, aliases, verseCounts: chapters.map((c) => c.length) });
}

// --- эталоны (design D2) ---
const bookById = Object.fromEntries(BOOKS.map(([id, , abbr]) => [abbr, id]));
function verse(abbr, c, v) {
  return corpus[bookById[abbr]]?.[c - 1]?.[v - 1] ?? "";
}
const plain = (s) => s.replace(/́/g, "");
const checks = [
  ["Пс", 22, 1, "Пастырь"],
  ["Пс", 50, 3, "Помилуй меня, Боже"],
  ["Дан", 3, 91, "Навуходоносор"],
  ["Ин", 3, 16, "Ибо так возлюбил Бог мир"],
  ["Мф", 5, 9, "Блаженны миротворцы"],
  ["Быт", 1, 1, "В начале сотворил Бог небо и землю"],
];
for (const [abbr, c, v, needle] of checks) {
  if (!plain(verse(abbr, c, v)).includes(needle)) fail(`эталон ${abbr} ${c}:${v} не содержит «${needle}»`);
}
if (corpus.mal.length !== 4) fail(`Мал: ожидалось 4 главы, найдено ${corpus.mal.length}`);
if (Object.keys(corpus).length !== 43) fail("ожидалось 43 книги");

if (errors.length) {
  console.error(`Сборка корпуса провалена (${errors.length}):\n` + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}

const header =
  "// Сгенерировано scripts/build-corpus.mjs — не править вручную.\n" +
  "// Источник: bibleonline/rst, parsed/, коммит 2de3062 (см. data/rst/SOURCE.md).\n\n";
const body =
  "export interface BookMeta {\n" +
  "  /** Идентификатор книги и имя файла в /corpus/<id>.json */\n" +
  "  id: string;\n" +
  "  /** Каноническое сокращение для показа (синодальное) */\n" +
  "  abbr: string;\n" +
  "  /** Полное название */\n" +
  "  name: string;\n" +
  "  /** Дополнительные написания для разбора ссылок */\n" +
  "  aliases: readonly string[];\n" +
  "  /** Число стихов в каждой главе (индекс 0 — глава 1), без надписаний */\n" +
  "  verseCounts: readonly number[];\n" +
  "}\n\n" +
  `export const BOOKS: readonly BookMeta[] = ${JSON.stringify(meta)};\n`;
writeFileSync(booksTs, header + body);

const verses = meta.reduce((n, b) => n + b.verseCounts.reduce((a, x) => a + x, 0), 0);
console.log(`Корпус собран: книг — ${meta.length}, стихов — ${verses}; эталоны пройдены.`);
