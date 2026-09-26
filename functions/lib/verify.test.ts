import { describe, expect, it } from "vitest";
import { sanitizeExplanation, verifyCandidates } from "./verify";
import type { LlmCandidate } from "./schema";
import type { Position } from "../../src/shared/types";
import { fsCorpusReader } from "../../test/fsCorpus";

const reader = fsCorpusReader();

const cand = (ref: string, keywords: string[], stance: "confirm" | "refute" = "confirm", explanation = "Пояснение."): LlmCandidate => ({
  ref,
  keywords,
  stance,
  explanation,
});

async function run(candidates: LlmCandidate[], position: Position = "confirm", exclude: string[] = []) {
  return verifyCandidates({ candidates, position, exclude }, reader);
}

describe("verifyCandidates: сверка по корпусу", () => {
  it("книги вне корпуса отбрасываются, остальные — с текстом из корпуса", async () => {
    const res = await run([
      cand("Рим 12:21", ["побеждай", "добром"]),
      cand("Притч 25:21", ["голоден", "враг", "накорми"]),
      cand("Мф 5:44", ["любите", "врагов"]),
    ]);
    expect(res?.quotes.map((q) => q.ref)).toEqual(["Притч 25:21", "Мф 5:44"]);
    expect(res?.quotes[1].text).toContain("любите врагов ваших");
  });

  it("текст от модели никогда не попадает в ответ: только из корпуса", async () => {
    const res = await run([cand("Мф 5:9", ["миротворцы"], "confirm", "Блаженны лентяи")]);
    expect(res?.quotes[0].text).toContain("Блаженны миротворцы");
    expect(res?.quotes[0].text).not.toContain("лентяи");
  });

  it("западная нумерация Псалтири: Пс 23:1 → Пс 22:1", async () => {
    const res = await run([cand("Пс 23:1", ["пастырь", "нуждаться"])]);
    expect(res?.quotes[0].ref).toBe("Пс 22:1");
  });

  it("сдвиг стиха в Притчах: Притч 13:20 (западная) → Притч 13:21", async () => {
    const res = await run([cand("Притч 13:20", ["общающийся", "мудрыми", "глупыми"])]);
    expect(res?.quotes[0].ref).toBe("Притч 13:21");
  });

  it("ключевые слова не совпали ни с исходным, ни с соседними стихами — отброшено", async () => {
    expect(await run([cand("Мф 5:9", ["виноградник", "колесница"])])).toBeNull();
  });

  it("одно совпавшее частое слово не спасает неверный стих (Лев 26:13 о «виноградниках»)", async () => {
    expect(await run([cand("Лев 26:13", ["виноградники", "земля", "урожай"])])).toBeNull();
  });

  it("живой случай: Притч 23:20–21 не «спасается» назад на 23:18–19 по случайным словам", async () => {
    const res = await run([cand("Притч 23:20-21", ["пьяницы", "потеряют", "мудрость", "беда"], "refute")]);
    expect(res?.quotes[0].ref).toBe("Притч 23:20–21");
  });

  it("живой случай: Пс 104:15 (западная) → Пс 103:15 по одному редкому слову «вино»", async () => {
    const res = await run([cand("Пс 104:15", ["вино", "радость", "сердце", "питие"])]);
    expect(res?.quotes[0].ref).toBe("Пс 103:15");
  });

  it("живой случай: Притч 20:1 с одним совпавшим редким словом остаётся", async () => {
    const res = await run([cand("Притч 20:1", ["вино", "пьяный", "мудрость", "запрет"], "refute")]);
    expect(res?.quotes[0].ref).toBe("Притч 20:1");
  });

  it("частые основы не считаются: «сын», «земля» не подтверждают Мф 5:9", async () => {
    expect(await run([cand("Мф 5:9", ["сыны", "земля"])])).toBeNull();
  });

  it("без ключевых слов проверить нельзя — отброшено", async () => {
    expect(await run([cand("Мф 5:9", ["Господь"])])).toBeNull();
  });

  it("несуществующий стих и слишком длинный диапазон отбрасываются", async () => {
    expect(await run([cand("Ин 3:99", ["любовь"]), cand("Мф 5:3-12", ["блаженны"])])).toBeNull();
  });

  it("исключённые и пересекающиеся ссылки не повторяются", async () => {
    const res = await run(
      [cand("Мф 5:44", ["любите", "врагов"]), cand("Мф 5:44-45", ["любите", "врагов"]), cand("Лк 6:27", ["любите", "врагов"])],
      "confirm",
      ["Лк 6:27"],
    );
    expect(res?.quotes.map((q) => q.ref)).toEqual(["Мф 5:44"]);
  });
});

describe("verifyCandidates: отбор по позиции", () => {
  const mixed = [
    cand("Лев 19:18", ["мсти", "люби", "ближнего"], "refute"),
    cand("Исх 21:24", ["глаз", "зуб"], "confirm"),
    cand("Притч 20:22", ["отплачу", "зло"], "refute"),
    cand("Притч 24:29", ["поступил", "воздам"], "refute"),
  ];

  it("confirm: сначала подтверждающие", async () => {
    const res = await run(mixed, "confirm");
    expect(res?.quotes.map((q) => q.stance)).toEqual(["confirm"]);
    expect(res?.noDirectSupport).toBe(false);
  });

  it("both: есть обе стороны, не больше 3 цитат", async () => {
    const res = await run(mixed, "both");
    expect(res?.quotes.length).toBe(3);
    expect(new Set(res?.quotes.map((q) => q.stance))).toEqual(new Set(["confirm", "refute"]));
  });

  it("нет нужной направленности — noDirectSupport и честные пометки", async () => {
    const res = await run([cand("Мф 5:44", ["любите", "врагов"], "refute")], "confirm");
    expect(res?.noDirectSupport).toBe(true);
    expect(res?.quotes[0].stance).toBe("refute");
  });
});

describe("sanitizeExplanation", () => {
  it("обрезает до 300 символов", () => {
    expect(sanitizeExplanation("а".repeat(400)).length).toBeLessThanOrEqual(300);
  });

  it("длинная цитата в пояснении заменяется шаблоном", () => {
    expect(sanitizeExplanation("Сказано: «Блаженны кроткие ибо они наследуют землю и всё прочее тут»")).toBe(
      "Стих подобран по смыслу ситуации.",
    );
    expect(sanitizeExplanation("Слова «не мсти» прямо относятся к ситуации.")).toBe("Слова «не мсти» прямо относятся к ситуации.");
  });
});

describe("LlmOutputSchema: неверные кандидаты отсеиваются по одному", () => {
  it("stance вне enum и пропущенное пояснение не роняют ответ", async () => {
    const { LlmOutputSchema } = await import("./schema");
    const out = LlmOutputSchema.parse({
      sensitive: true,
      thesis: "т",
      no_direct_support: false,
      candidates: [
        { ref: "Мф 5:44", keywords: ["любите"], explanation: "ок", stance: "refute" },
        { ref: "Притч 13:25", keywords: ["розги"], explanation: "x", stance: "neutral" },
        { ref: "Лев 19:18", keywords: ["мсти"], stance: "refute" },
      ],
    });
    expect(out.candidates.map((c) => c.ref)).toEqual(["Мф 5:44"]);
  });
});
