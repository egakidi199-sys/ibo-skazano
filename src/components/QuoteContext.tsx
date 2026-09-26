import { useEffect, useState } from "react";
import { getContext, type QuoteContext as Ctx } from "../shared/corpus";
import { parseRef } from "../shared/reference";
import { clientCorpus } from "../lib/corpus";

/** Соседние стихи (±3 в пределах главы) с выделенной цитатой — scripture-corpus «Контекст цитаты». */
export function QuoteContext({ refText }: { refText: string }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const parsed = parseRef(refText);
    if (!parsed.ok) return;
    let cancelled = false;
    getContext(clientCorpus, parsed.ref)
      .then((c) => !cancelled && setCtx(c))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [refText]);

  if (failed) return <p className="text-sm text-muted">Не удалось загрузить контекст.</p>;
  if (!ctx) return <p className="text-sm text-muted">Загружаем контекст…</p>;

  return (
    <div className="space-y-1.5 border-l-2 pl-3 font-serif text-[15px] leading-relaxed">
      {ctx.heading && <p className="text-sm italic text-muted">{ctx.heading}</p>}
      {ctx.verses.map((v) => (
        <p key={v.verse} className={v.isQuote ? "text-ink" : "text-muted"}>
          <sup className="mr-1 font-sans text-[10px] text-muted">{v.verse}</sup>
          {v.isQuote ? <mark className="bg-accent-soft text-ink">{v.text}</mark> : v.text}
        </p>
      ))}
    </div>
  );
}
