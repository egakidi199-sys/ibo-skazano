import { describe, expect, it } from "vitest";
import { createFetchCorpusReader, getContext, getQuoteText } from "./corpus";
import { parseRef, type Ref } from "./reference";
import { BOOKS } from "./corpus/books";
import { fsCorpusReader } from "../../test/fsCorpus";

const reader = fsCorpusReader();

function ref(s: string): Ref {
  const r = parseRef(s);
  if (!r.ok) throw new Error(`${s}: ${r.error}`);
  return r.ref;
}

describe("getQuoteText", () => {
  it("дословный текст из корпуса", async () => {
    expect(await getQuoteText(reader, ref("Мф 5:9"))).toContain(
      "Блаженны миротворцы, ибо они будут наречены сынами Божиими",
    );
  });

  it("синодальная нумерация Псалтири", async () => {
    expect(await getQuoteText(reader, ref("Пс 22:1"))).toContain("Господь — Пастырь мой");
    expect(await getQuoteText(reader, ref("Пс 50:3"))).toContain("Помилуй меня, Боже");
  });

  it("диапазон склеивается через пробел", async () => {
    const text = await getQuoteText(reader, ref("Притч 15:1-2"));
    expect(text).toContain("Кроткий ответ отвращает гнев");
    expect(text).toContain(" Язык мудрых");
  });
});

describe("getContext", () => {
  it("начало главы: Мф 7:1 → стихи 1–4, стих 1 — цитата", async () => {
    const ctx = await getContext(reader, ref("Мф 7:1"));
    expect(ctx.verses.map((v) => v.verse)).toEqual([1, 2, 3, 4]);
    expect(ctx.verses.filter((v) => v.isQuote).map((v) => v.verse)).toEqual([1]);
    expect(ctx.heading).toBeUndefined();
  });

  it("конец главы: следующая глава не подтягивается", async () => {
    const last = BOOKS.find((b) => b.id === "matt")!.verseCounts[6];
    const ctx = await getContext(reader, ref(`Мф 7:${last}`));
    expect(ctx.verses.map((v) => v.verse)).toEqual([last - 3, last - 2, last - 1, last]);
  });

  it("надписание псалма показывается, если контекст включает стих 1", async () => {
    expect((await getContext(reader, ref("Пс 22:1"))).heading).toBe("Псалом Давида.");
    expect((await getContext(reader, ref("Пс 22:6"))).heading).toBeUndefined();
  });
});

describe("createFetchCorpusReader", () => {
  it("кеширует успешную загрузку и повторяет неудачную", async () => {
    let calls = 0;
    const r = createFetchCorpusReader(async () => {
      calls++;
      return calls === 1 ? new Response("", { status: 500 }) : Response.json({ id: "x", chapters: [["a"]] });
    });
    await expect(r.getBook("x")).rejects.toThrow();
    await r.getBook("x");
    await r.getBook("x");
    expect(calls).toBe(2);
  });
});
