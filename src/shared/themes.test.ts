import { describe, expect, it } from "vitest";
import { THEMES } from "./themes";
import { parseRef } from "./reference";

describe("тематический указатель", () => {
  it("не меньше 40 тем с уникальными id", () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(40);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length);
  });

  it.each(THEMES.map((t) => [t.id, t] as const))("%s: ≥ 4 действительных ссылки, триггеры заданы", (_, theme) => {
    expect(theme.refs.length).toBeGreaterThanOrEqual(4);
    expect(theme.triggers.length).toBeGreaterThan(0);
    expect(theme.claimWords.length).toBeGreaterThan(0);
    for (const { ref } of theme.refs) {
      const r = parseRef(ref);
      expect(r.ok ? "ok" : `${ref}: ${r.error}`).toBe("ok");
    }
  });
});
