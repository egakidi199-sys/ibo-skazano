import { describe, expect, it } from "vitest";
import { contentStems, countMatches, stem, stemsMatch } from "./stem";

const same = (a: string, b: string) => stemsMatch(stem(a), stem(b));

describe("stem (Snowball Russian)", () => {
  it("эталонные основы Snowball", () => {
    expect(stem("красивейший")).toBe("красив");
    expect(stem("бегавшая")).toBe("бега");
    expect(stem("одеваться")).toBe("одева");
    expect(stem("блаженны")).toBe("блажен");
    expect(stem("врагов")).toBe("враг");
  });

  it("«ё» и знак ударения не мешают", () => {
    expect(stem("Отдаёт")).toBe(stem("отдает"));
    expect(stem("та́к")).toBe(stem("так"));
  });
});

describe("stemsMatch", () => {
  it("прощать / прости / прощение", () => {
    expect(same("прощать", "прости")).toBe(true);
    expect(same("прощать", "прощение")).toBe(true);
    expect(same("прощайте", "простит")).toBe(true);
  });

  it("долг / долги / должник", () => {
    expect(same("долг", "долги")).toBe(true);
    expect(same("долг", "должник")).toBe(true);
    expect(same("должников", "долгов")).toBe(true);
  });

  it("разные слова с общим коротким началом не совпадают", () => {
    expect(same("бог", "богатство")).toBe(false);
    expect(same("свет", "светильник")).toBe(false);
    expect(same("мир", "мирра")).toBe(false);
  });
});

describe("contentStems / countMatches", () => {
  it("отбрасывает служебные и частые слова", () => {
    expect(contentStems("Брат занял денег и не отдаёт, стоит ли простить долг?")).toEqual([
      "брат",
      "заня",
      "денег",
      "отда",
      "прост",
      "долг",
    ]);
    expect(contentStems("И сказал Господь Бог")).toEqual([]);
  });

  it("считает совпадения основ запроса с текстом", () => {
    const verse = contentStems("и прости нам долги наши, как и мы прощаем должникам нашим");
    expect(countMatches(contentStems("простить долг"), verse)).toBe(2);
    expect(countMatches(contentStems("пастырь нуждаться"), verse)).toBe(0);
  });
});
