import { describe, expect, it } from "vitest";
import { agreement, fallbackSelect, matchThemes } from "./fallback";
import { THEMES } from "./themes";
import type { QuoteRequest, QuoteResponse } from "./types";
import { fsCorpusReader } from "../../test/fsCorpus";

const reader = fsCorpusReader();
const theme = (id: string) => THEMES.find((t) => t.id === id)!;

async function run(req: QuoteRequest, fullSearch = false) {
  return fallbackSelect(req, reader, { fullSearch });
}

function quotes(res: QuoteResponse) {
  if (res.kind !== "quotes") throw new Error(`ожидались цитаты, получено ${JSON.stringify(res)}`);
  return res;
}

describe("matchThemes / agreement", () => {
  it("находит долги и прощение", () => {
    const ids = matchThemes("Брат занял денег и не отдаёт, стоит ли простить долг?").map((t) => t.id);
    expect(ids).toContain("debt");
    expect(ids).toContain("forgiveness");
  });

  it("нет ложных тем по началу слова: «постоянно» ≠ «пост»", () => {
    expect(matchThemes("Сосед постоянно шумит по ночам, мешает спать").map((t) => t.id)).not.toContain("gluttony");
  });

  it("отрицание до и после утверждения", () => {
    expect(agreement(theme("revenge"), "Нужно отомстить обидчику")).toBe("agrees");
    expect(agreement(theme("revenge"), "Нельзя мстить")).toBe("negated");
    expect(agreement(theme("revenge"), "Мстить — грех")).toBe("negated");
    expect(agreement(theme("anger"), "Гнев нужно сдерживать")).toBe("negated");
    expect(agreement(theme("revenge"), "Сосед сломал забор")).toBe("unknown");
  });
});

describe("fallbackSelect: шаг 1 — темы", () => {
  it("долги и прощение, позиция «Подтвердить»", async () => {
    const res = quotes(
      await run({ situation: "Брат занял денег и не отдаёт, стоит ли простить долг?", position: "confirm" }),
    );
    expect(res.source).toBe("fallback");
    expect(res.quotes.length).toBeGreaterThan(0);
    expect(res.quotes.every((q) => q.stance === "confirm")).toBe(true);
    expect(res.noDirectSupport).toBe(false);
  });

  it("тезис против Писания: честное «прямой опоры нет», Мф 5:44 — «опровергает»", async () => {
    const res = quotes(
      await run({ situation: "Спор с другом о том, как относиться к недругам", thesis: "Врагов нужно ненавидеть", position: "confirm" }),
    );
    expect(res.noDirectSupport).toBe(true);
    expect(res.quotes.find((q) => q.ref === "Мф 5:44")?.stance).toBe("refute");
    expect(res.quotes.some((q) => q.stance === "confirm")).toBe(false);
  });

  it("опровергнуть тезис о мести", async () => {
    const res = quotes(await run({ situation: "Сосед подставил меня на работе", thesis: "Нужно отомстить", position: "refute" }));
    expect(res.quotes.every((q) => q.stance === "refute")).toBe(true);
    expect(res.quotes.map((q) => q.ref)).toContain("Лев 19:18");
  });

  it("отрицание в тезисе переворачивает направленность", async () => {
    const res = quotes(await run({ situation: "Сосед подставил меня на работе", thesis: "Мстить нельзя", position: "confirm" }));
    expect(res.quotes.map((q) => q.ref)).toContain("Лев 19:18");
    expect(res.quotes.every((q) => q.stance === "confirm")).toBe(true);
  });

  it("обе стороны", async () => {
    const res = quotes(await run({ situation: "Друзья зовут выпить вина на празднике", thesis: "Выпивать допустимо", position: "both" }));
    expect(res.quotes.some((q) => q.stance === "confirm")).toBe(true);
    expect(res.quotes.some((q) => q.stance === "refute")).toBe(true);
    expect(res.noDirectSupport).toBe(false);
  });

  it("не больше 3 цитат, текст из корпуса, без пересечений", async () => {
    const res = quotes(await run({ situation: "Как быть с обидой на мать?", position: "confirm" }));
    expect(res.quotes.length).toBeLessThanOrEqual(3);
    expect(new Set(res.quotes.map((q) => q.ref)).size).toBe(res.quotes.length);
    expect(res.quotes.every((q) => q.text.length > 0)).toBe(true);
  });

  it("«Ещё вариант»: исключённые ссылки не повторяются", async () => {
    const req: QuoteRequest = { situation: "Сосед подставил меня на работе", thesis: "Нужно отомстить", position: "refute" };
    const first = quotes(await run(req));
    const second = quotes(await run({ ...req, exclude: first.quotes.map((q) => q.ref) }));
    for (const q of second.quotes) expect(first.quotes.map((x) => x.ref)).not.toContain(q.ref);
  });

  it("без отказов: тезис об оправдании вреда — обе стороны и признак sensitive", async () => {
    const res = quotes(await run({ situation: "Спорим о воспитании", thesis: "Детей нужно бить", position: "confirm" }));
    expect(res.sensitive).toBe(true);
    expect(res.quotes.some((q) => q.stance === "confirm")).toBe(true);
    expect(res.quotes.some((q) => q.stance === "refute")).toBe(true);
  });

  it("«Жену можно бить»: тема «Брак» не подтверждает тезис из-за совпадения основ", async () => {
    const res = quotes(await run({ situation: "Спорим о семье", thesis: "Жену можно бить за непослушание", position: "confirm" }));
    expect(res.sensitive).toBe(true);
    for (const q of res.quotes) {
      if (q.explanation.includes("Брак")) expect(q.stance).toBe("topic");
    }
  });

  it("тяжёлая личная ситуация — обычный подбор без особой обработки", async () => {
    const res = quotes(await run({ situation: "Не вижу надежды, хочется опустить руки и сдаться", position: "confirm" }));
    expect(res.sensitive).toBe(false);
    expect(res.quotes.length).toBeGreaterThan(0);
  });

  it("обычный тезис не помечается как чувствительный", async () => {
    const res = quotes(await run({ situation: "Брат ударил меня в детстве, стоит ли его простить?", position: "confirm" }));
    expect(res.sensitive).toBe(false);
  });

  it("без тем и без полного поиска — просьба к клиенту искать самому", async () => {
    expect(await run({ situation: "Хочу посадить виноградник у дома", position: "confirm" })).toEqual({
      kind: "empty",
      source: "fallback",
      needsClientSearch: true,
    });
  });
});

describe("fallbackSelect: шаг 2 — ключевые слова по корпусу", () => {
  it("виноградник → стихи со словом «виноградник», пометка «по теме»", async () => {
    const res = quotes(await run({ situation: "Хочу посадить виноградник у дома", position: "confirm" }, true));
    expect(res.quotes.length).toBeGreaterThan(0);
    expect(res.quotes.every((q) => q.stance === "topic")).toBe(true);
    expect(res.quotes.every((q) => /виноград/i.test(q.text))).toBe(true);
  });

  it("ничего не найдено → пустой ответ", async () => {
    expect(await run({ situation: "Ыыщщ фывапр олджэ жэхъз", position: "confirm" }, true)).toEqual({
      kind: "empty",
      source: "fallback",
    });
  });
});
