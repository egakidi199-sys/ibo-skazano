// Русский стеммер Snowball (Портер) + сравнение основ с учётом чередований.
// Используется для проверки ключевых слов LLM по тексту стиха и для поиска без LLM.

const VOWELS = "аеиоуыэюя";

const PERFECTIVE_GERUND_1 = ["вшись", "вши", "в"]; // после а/я
const PERFECTIVE_GERUND_2 = ["ившись", "ывшись", "ивши", "ывши", "ив", "ыв"];
const ADJECTIVE = [
  "ими", "ыми", "его", "ого", "ему", "ому",
  "ее", "ие", "ые", "ое", "ей", "ий", "ый", "ой", "ем", "им", "ым", "ом",
  "их", "ых", "ую", "юю", "ая", "яя", "ою", "ею",
];
const PARTICIPLE_1 = ["ем", "нн", "вш", "ющ", "щ"]; // после а/я
const PARTICIPLE_2 = ["ивш", "ывш", "ующ"];
const REFLEXIVE = ["ся", "сь"];
const VERB_1 = ["ете", "йте", "ешь", "нно", "ла", "на", "ли", "ем", "ло", "но", "ет", "ют", "ны", "ть", "й", "л", "н"]; // после а/я
const VERB_2 = [
  "ейте", "уйте", "ила", "ыла", "ена", "ите", "или", "ыли", "ило", "ыло", "ено", "ует", "уют", "ены", "ить", "ыть", "ишь",
  "ей", "уй", "ил", "ыл", "им", "ым", "ен", "ят", "ит", "ыт", "ую", "ю",
];
const NOUN = [
  "иями", "ями", "ами", "ией", "иям", "ием", "иях",
  "ев", "ов", "ие", "ье", "еи", "ии", "ей", "ой", "ий", "ям", "ем", "ам", "ом", "ах", "ях", "ию", "ью", "ия", "ья",
  "а", "е", "и", "й", "о", "у", "ы", "ь", "ю", "я",
];
const SUPERLATIVE = ["ейше", "ейш"];
const DERIVATIONAL = ["ость", "ост"];

const byLength = (xs: readonly string[]) => [...xs].sort((a, b) => b.length - a.length);
const PG1 = byLength(PERFECTIVE_GERUND_1);
const PG2 = byLength(PERFECTIVE_GERUND_2);
const ADJ = byLength(ADJECTIVE);
const PART1 = byLength(PARTICIPLE_1);
const PART2 = byLength(PARTICIPLE_2);
const REFL = byLength(REFLEXIVE);
const V1 = byLength(VERB_1);
const V2 = byLength(VERB_2);
const N = byLength(NOUN);
const SUP = byLength(SUPERLATIVE);
const DER = byLength(DERIVATIONAL);

/**
 * Удаляет самое длинное подходящее окончание. Окончания group1 снимаются только
 * после «а»/«я» (сама буква остаётся), окончания group2 — без условий.
 */
function strip(s: string, group1: readonly string[], group2: readonly string[] = []): string | null {
  const all = [...group1.map((suf) => [suf, true] as const), ...group2.map((suf) => [suf, false] as const)].sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [suf, afterAYa] of all) {
    if (!s.endsWith(suf)) continue;
    const rest = s.slice(0, -suf.length);
    if (afterAYa) {
      const prev = rest.at(-1);
      if (prev !== "а" && prev !== "я") continue;
    }
    return rest;
  }
  return null;
}

function regionStart(word: string, from: number): number {
  // Позиция после первой согласной, следующей за гласной, начиная с from.
  for (let i = from + 1; i < word.length; i++) {
    if (!VOWELS.includes(word[i]) && VOWELS.includes(word[i - 1])) return i + 1;
  }
  return word.length;
}

/** Нормализация слова: регистр, «ё», знак ударения. */
export function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/́/g, "").replace(/ё/g, "е");
}

/** Основа слова по Snowball (Russian). */
export function stem(input: string): string {
  const word = normalizeWord(input);
  let rv = 0;
  while (rv < word.length && !VOWELS.includes(word[rv])) rv++;
  rv = Math.min(rv + 1, word.length);
  const prefix = word.slice(0, rv);
  let s = word.slice(rv);
  const r2 = Math.max(0, regionStart(word, regionStart(word, 0) - 1) - rv);

  // Шаг 1
  let r = strip(s, PG1, PG2);
  if (r !== null) {
    s = r;
  } else {
    r = strip(s, [], REFL);
    if (r !== null) s = r;
    r = stripAdjectival(s);
    if (r !== null) {
      s = r;
    } else {
      r = strip(s, V1, V2);
      if (r !== null) s = r;
      else {
        r = strip(s, [], N);
        if (r !== null) s = r;
      }
    }
  }
  // Шаг 2
  if (s.endsWith("и")) s = s.slice(0, -1);
  // Шаг 3: словообразовательные — только в R2
  for (const suf of DER) {
    if (s.endsWith(suf) && s.length - suf.length >= r2) {
      s = s.slice(0, -suf.length);
      break;
    }
  }
  // Шаг 4
  if (s.endsWith("нн")) s = s.slice(0, -1);
  else {
    const sup = strip(s, [], SUP);
    if (sup !== null) {
      s = sup.endsWith("нн") ? sup.slice(0, -1) : sup;
    } else if (s.endsWith("ь")) s = s.slice(0, -1);
  }
  return prefix + s;
}

function stripAdjectival(s: string): string | null {
  for (const adj of ADJ) {
    if (!s.endsWith(adj)) continue;
    const rest = s.slice(0, -adj.length);
    for (const p of byLength([...PART1, ...PART2])) {
      if (!rest.endsWith(p)) continue;
      const before = rest.slice(0, -p.length);
      if (PART2.includes(p)) return before;
      const prev = before.at(-1);
      if (prev === "а" || prev === "я") return before;
    }
    return rest;
  }
  return null;
}

// --- сравнение основ ---

/** Сводит частые чередования согласных к одному виду: прощ→прост, долж→долг, уч→ук. */
function alternationKey(s: string): string {
  return s.replace(/щ/g, "ст").replace(/ж/g, "г").replace(/ч/g, "к").replace(/[аяеиоуыюь]+$/, "");
}

const MIN_PREFIX = 4;
const MAX_PREFIX_DIFF = 4;

/**
 * Совпадают ли основы: равны, либо после сведения чередований одна — начало другой
 * (короткая не меньше MIN_PREFIX букв, разница не больше MAX_PREFIX_DIFF).
 * «прощать/прости/прощение», «долг/долги/должник» — совпадают; «бог/богатство» — нет.
 */
export function stemsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const x = alternationKey(a);
  const y = alternationKey(b);
  if (x === y) return x.length >= 3;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= MIN_PREFIX && long.length - short.length <= MAX_PREFIX_DIFF && long.startsWith(short);
}

// --- токенизация и стоп-слова ---

/** Слова текста (кириллица/латиница), нормализованные, длиной от 2 букв. */
export function tokenize(text: string): string[] {
  return normalizeWord(text).match(/[а-яa-z]{2,}/g) ?? [];
}

// Служебные и слишком частые в Писании слова — не несут смысла для сопоставления.
const STOP_WORDS = [
  "и", "в", "во", "не", "на", "что", "он", "я", "с", "со", "как", "а", "то", "все", "всё", "она", "так", "его", "но", "да",
  "ты", "к", "ко", "у", "же", "вы", "за", "бы", "по", "только", "ее", "мне", "было", "вот", "от", "меня", "еще", "нет", "о",
  "об", "из", "ему", "теперь", "когда", "даже", "ну", "ли", "если", "уже", "или", "ни", "быть", "был", "него", "до", "вас",
  "опять", "уж", "вам", "ведь", "там", "потом", "себя", "ничего", "ей", "может", "они", "тут", "где", "есть", "надо", "ней",
  "для", "мы", "тебя", "их", "чем", "была", "сам", "чтоб", "без", "будто", "чего", "раз", "тоже", "себе", "под", "будет",
  "тогда", "кто", "этот", "того", "потому", "этого", "какой", "совсем", "ним", "здесь", "этом", "один", "почти", "мой",
  "тем", "чтобы", "нее", "сейчас", "были", "куда", "зачем", "всех", "никогда", "можно", "при", "два", "другой", "хоть",
  "после", "над", "больше", "тот", "через", "эти", "нас", "про", "всего", "них", "какая", "много", "разве", "три", "эту",
  "моя", "свою", "этой", "перед", "иногда", "лучше", "том", "нельзя", "такой", "им", "более", "всегда", "всю", "между",
  "ибо", "который", "которые", "которого", "сей", "сие", "сего", "свой", "свои", "весь", "вся", "твой", "твои", "наш",
  "ваш", "это", "эта", "мой", "господь", "господа", "господу", "бог", "бога", "богу", "сказал", "сказали", "говорит",
  "говорю", "стоит", "нужно", "должен", "должна", "очень",
];
const STOP_STEMS = new Set(STOP_WORDS.map(stem));

/** Основы значимых слов текста без повторов, в порядке появления. */
export function contentStems(text: string): string[] {
  const out: string[] = [];
  for (const w of tokenize(text)) {
    if (w.length < 3) continue;
    const s = stem(w);
    if (STOP_STEMS.has(s) || out.includes(s)) continue;
    out.push(s);
  }
  return out;
}

/** Сколько основ из query встречается среди основ текста. */
export function countMatches(query: readonly string[], textStems: readonly string[]): number {
  let n = 0;
  for (const q of query) if (textStems.some((t) => stemsMatch(q, t))) n++;
  return n;
}
