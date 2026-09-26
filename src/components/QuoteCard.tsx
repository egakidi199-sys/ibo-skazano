import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Quote, QuoteStance } from "../shared/types";
import { STANCE_LABEL } from "../lib/format";
import { QuoteContext } from "./QuoteContext";

const STANCE_CLASS: Record<QuoteStance, string> = {
  confirm: "text-confirm border-confirm/40",
  refute: "text-refute border-refute/40",
  topic: "text-topic border-topic/40",
};

export function StanceBadge({ stance }: { stance: QuoteStance }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${STANCE_CLASS[stance]}`}>
      {STANCE_LABEL[stance]}
    </span>
  );
}

interface Props {
  quote: Quote;
  /** Контекст раскрыт сразу (чувствительный ответ, quote-ui) */
  contextOpen?: boolean;
}

/** Главная цитата: крупный текст, ссылка, направленность, пояснение, контекст. */
export function QuoteCard({ quote, contextOpen = false }: Props) {
  const [open, setOpen] = useState(contextOpen);
  const contextId = `ctx-${quote.ref.replace(/\W+/g, "-")}`;

  return (
    <article className="animate-reveal space-y-4 rounded-3xl border bg-surface p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <StanceBadge stance={quote.stance} />
        <span className="text-sm font-semibold text-accent">{quote.ref}</span>
      </div>
      <blockquote className="font-serif text-xl leading-relaxed sm:text-[22px]">«{quote.text}»</blockquote>
      <p className="text-sm leading-relaxed text-muted">{quote.explanation}</p>
      <div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contextId}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-sm font-medium text-accent"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          {open ? "Скрыть контекст" : "Показать контекст"}
        </button>
        {open && (
          <div id={contextId} className="mt-3">
            <QuoteContext refText={quote.ref} />
          </div>
        )}
      </div>
    </article>
  );
}

/** Запасная цитата — компактная карточка; нажатие делает её главной. */
export function AltQuoteCard({ quote, onSelect }: { quote: Quote; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full space-y-2 rounded-2xl border bg-surface/60 p-4 text-left transition-colors hover:border-accent/50"
      aria-label={`Сделать главной: ${quote.ref}`}
    >
      <div className="flex items-center justify-between gap-2">
        <StanceBadge stance={quote.stance} />
        <span className="text-sm font-semibold text-accent">{quote.ref}</span>
      </div>
      <p className="line-clamp-3 font-serif text-[15px] leading-relaxed">«{quote.text}»</p>
    </button>
  );
}
