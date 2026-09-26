import { Copy, Image, RefreshCw, Share2 } from "lucide-react";
import type { Position, Quote } from "../shared/types";
import { FALLBACK_TEXT, NO_SUPPORT_TEXT, SENSITIVE_TEXT } from "../lib/format";
import { AltQuoteCard, QuoteCard } from "./QuoteCard";

const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

interface Props {
  thesis: string;
  quotes: Quote[];
  position: Position;
  source: "llm" | "fallback";
  noDirectSupport: boolean;
  sensitive: boolean;
  isLoadingMore: boolean;
  isRenderingPostcard: boolean;
  onSelectMain: (index: number) => void;
  onCopy: () => void;
  onShare: () => void;
  onMore: () => void;
  onPostcard: () => void;
}

function Notice({ children, tone = "muted" }: { children: string; tone?: "muted" | "accent" }) {
  return (
    <p
      className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
        tone === "accent" ? "border-accent/30 bg-accent-soft text-ink" : "bg-surface/60 text-muted"
      }`}
    >
      {children}
    </p>
  );
}

const actionClass =
  "flex items-center justify-center gap-2 rounded-2xl border bg-surface px-3 py-3 text-sm font-medium text-ink transition-colors hover:border-accent/50 disabled:opacity-60";

export function ResultView(props: Props) {
  const [main, ...alts] = props.quotes;
  const position = props.sensitive ? "both" : props.position;

  return (
    <section aria-label="Результат" className="space-y-4">
      {props.thesis && (
        <p className="text-sm text-muted">
          Тезис: <span className="text-ink">{props.thesis}</span>
        </p>
      )}
      {props.sensitive && <Notice tone="accent">{SENSITIVE_TEXT}</Notice>}
      {props.noDirectSupport && <Notice tone="accent">{NO_SUPPORT_TEXT[position]}</Notice>}
      {props.source === "fallback" && <Notice>{FALLBACK_TEXT}</Notice>}

      <QuoteCard key={main.ref} quote={main} contextOpen={props.sensitive} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button type="button" onClick={props.onCopy} className={`${actionClass} border-accent/60 text-accent`}>
          <Copy className="h-4 w-4" aria-hidden="true" />
          Скопировать
        </button>
        {canShare && (
          <button type="button" onClick={props.onShare} className={actionClass}>
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Поделиться
          </button>
        )}
        <button type="button" onClick={props.onMore} disabled={props.isLoadingMore} className={actionClass}>
          <RefreshCw className={`h-4 w-4 ${props.isLoadingMore ? "animate-spin" : ""}`} aria-hidden="true" />
          Ещё вариант
        </button>
        <button type="button" onClick={props.onPostcard} disabled={props.isRenderingPostcard} className={actionClass}>
          <Image className="h-4 w-4" aria-hidden="true" />
          Открытка
        </button>
      </div>

      {alts.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted">Ещё стихи</h2>
          {alts.map((q, i) => (
            <AltQuoteCard key={q.ref} quote={q} onSelect={() => props.onSelectMain(i + 1)} />
          ))}
        </div>
      )}
    </section>
  );
}
