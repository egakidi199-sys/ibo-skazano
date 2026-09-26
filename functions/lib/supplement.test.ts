import { describe, expect, it } from "vitest";
import { hasBothSides, supplementSides } from "./supplement";
import type { Quote, QuoteStance } from "../../src/shared/types";

const q = (ref: string, stance: QuoteStance): Quote => ({ ref, text: "…", stance, explanation: "…" });

describe("supplementSides", () => {
  it("добавляет недостающую сторону, если есть место", () => {
    const out = supplementSides([q("Лев 19:18", "refute")], [q("Притч 23:13–14", "confirm")]);
    expect(out.map((x) => x.ref)).toEqual(["Лев 19:18", "Притч 23:13–14"]);
    expect(hasBothSides(out)).toBe(true);
  });

  it("при трёх цитатах одной стороны вытесняет последнюю, главная остаётся", () => {
    const out = supplementSides(
      [q("Лев 19:18", "refute"), q("Мф 5:44", "refute"), q("Пс 10:5", "refute")],
      [q("Притч 23:13–14", "confirm")],
    );
    expect(out.map((x) => x.ref)).toEqual(["Лев 19:18", "Мф 5:44", "Притч 23:13–14"]);
  });

  it("не добавляет пересекающуюся ссылку и темы «по теме»", () => {
    const out = supplementSides([q("Притч 23:13", "refute")], [q("Притч 23:13–14", "confirm"), q("Мф 7:1", "topic")]);
    expect(out.map((x) => x.ref)).toEqual(["Притч 23:13"]);
  });

  it("обе стороны уже есть — без изменений", () => {
    const quotes = [q("Пс 103:15", "confirm"), q("Притч 20:1", "refute")];
    expect(supplementSides(quotes, [q("Еккл 9:7", "confirm")])).toEqual(quotes);
  });
});
