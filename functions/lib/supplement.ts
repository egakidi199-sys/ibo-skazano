import { parseRef, refsOverlap } from "../../src/shared/reference";
import { LIMITS, type Quote } from "../../src/shared/types";

const SIDES = ["confirm", "refute"] as const;

function overlaps(a: Quote, b: Quote): boolean {
  const x = parseRef(a.ref);
  const y = parseRef(b.ref);
  return x.ok && y.ok && refsOverlap(x.ref, y.ref);
}

/**
 * Для «обеих сторон» и чувствительных тезисов (design D7): если модель не дала одну из
 * сторон, добавляет её из запасных цитат (тематический указатель). Не больше quotesMax:
 * при переполнении вытесняется последняя цитата стороны, которая представлена дважды.
 */
export function supplementSides(quotes: readonly Quote[], extra: readonly Quote[]): Quote[] {
  const out = [...quotes];
  for (const side of SIDES) {
    if (out.some((q) => q.stance === side)) continue;
    const add = extra.find((e) => e.stance === side && !out.some((q) => overlaps(q, e)));
    if (!add) continue;
    if (out.length < LIMITS.quotesMax) {
      out.push(add);
      continue;
    }
    const other = side === "confirm" ? "refute" : "confirm";
    const idx = out.map((q) => q.stance).lastIndexOf(other);
    if (idx > 0 && out.filter((q) => q.stance === other).length > 1) out[idx] = add;
  }
  return out;
}

export function hasBothSides(quotes: readonly Quote[]): boolean {
  return SIDES.every((s) => quotes.some((q) => q.stance === s));
}
