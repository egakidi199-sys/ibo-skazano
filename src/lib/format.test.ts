import { describe, expect, it } from "vitest";
import { quoteForCopy } from "./format";

describe("quoteForCopy", () => {
  it("формат «текст» (ссылка), без пояснения", () => {
    expect(quoteForCopy({ text: "Блаженны миротворцы, ибо они будут наречены сынами Божиими.", ref: "Мф 5:9" })).toBe(
      "«Блаженны миротворцы, ибо они будут наречены сынами Божиими.» (Мф 5:9)",
    );
  });
});
