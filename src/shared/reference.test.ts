import { describe, expect, it } from "vitest";
import { formatRef, parseRef, refsOverlap, validateRef, type Ref } from "./reference";

function ok(input: string): Ref {
  const r = parseRef(input);
  if (!r.ok) throw new Error(`${input}: ${r.error}`);
  return r.ref;
}

describe("parseRef", () => {
  it("разбирает диапазон и форматирует с тире", () => {
    const ref = ok("Притч 15:1-2");
    expect(ref).toEqual({ book: "prov", chapter: 15, verseFrom: 1, verseTo: 2 });
    expect(formatRef(ref)).toBe("Притч 15:1–2");
  });

  it("нормализует полное название книги", () => {
    expect(formatRef(ok("Евангелие от Иоанна 13:34"))).toBe("Ин 13:34");
  });

  it("понимает точки, регистр и «ё»", () => {
    expect(formatRef(ok("мф. 5:9"))).toBe("Мф 5:9");
    expect(formatRef(ok("Исход 20:13"))).toBe("Исх 20:13");
  });

  it("различает 1–4 Царств и протестантские названия", () => {
    expect(formatRef(ok("1 Цар 16:7"))).toBe("1 Цар 16:7");
    expect(formatRef(ok("1Цар 16:7"))).toBe("1 Цар 16:7");
    expect(formatRef(ok("1 Самуила 16:7"))).toBe("1 Цар 16:7");
    expect(formatRef(ok("1 Царей 3:9"))).toBe("3 Цар 3:9");
    expect(formatRef(ok("1-я книга Царств 16:7"))).toBe("1 Цар 16:7");
  });

  it("не путает Ин и 1 Ин", () => {
    expect(formatRef(ok("Ин 3:16"))).toBe("Ин 3:16");
    expect(parseRef("1 Ин 4:8")).toEqual({ ok: false, error: "out_of_corpus" });
  });

  it("книги вне корпуса", () => {
    expect(parseRef("Рим 12:19")).toEqual({ ok: false, error: "out_of_corpus" });
    expect(parseRef("Сир 1:1")).toEqual({ ok: false, error: "out_of_corpus" });
  });

  it("нераспознанное", () => {
    expect(parseRef("Хроники Нарнии 1:1")).toEqual({ ok: false, error: "unrecognized" });
    expect(parseRef("Пс 22")).toEqual({ ok: false, error: "unrecognized" });
  });

  it("несуществующий стих и глава", () => {
    expect(parseRef("Ин 3:99")).toEqual({ ok: false, error: "no_verse" });
    expect(parseRef("Мф 29:1")).toEqual({ ok: false, error: "no_chapter" });
  });

  it("слишком длинный диапазон", () => {
    expect(parseRef("Мф 5:3-12")).toEqual({ ok: false, error: "range_too_long" });
    expect(parseRef("Мф 5:3-7").ok).toBe(true);
  });

  it("обратный диапазон", () => {
    expect(parseRef("Мф 5:9-3")).toEqual({ ok: false, error: "bad_range" });
  });
});

describe("validateRef / refsOverlap", () => {
  it("синодальные главы: Малахия — 4 главы, Псалтирь — 151 нет", () => {
    expect(validateRef({ book: "mal", chapter: 4, verseFrom: 1, verseTo: 1 })).toBeNull();
    expect(validateRef({ book: "ps", chapter: 151, verseFrom: 1, verseTo: 1 })).toBe("no_chapter");
  });

  it("пересечение диапазонов", () => {
    expect(refsOverlap(ok("Мф 5:3-5"), ok("Мф 5:5"))).toBe(true);
    expect(refsOverlap(ok("Мф 5:3-5"), ok("Мф 5:6"))).toBe(false);
  });
});
