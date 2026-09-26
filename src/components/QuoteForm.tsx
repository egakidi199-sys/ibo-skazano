import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, Search } from "lucide-react";
import type { Position } from "../shared/types";
import { LIMITS } from "../shared/types";
import { PositionSwitch } from "./PositionSwitch";

const LOADING_LABELS = ["Листаем Писание…", "Сверяем главу и стих…", "Ищем подходящие слова…"];

interface Props {
  situation: string;
  thesis: string;
  position: Position;
  isLoading: boolean;
  onSituationChange: (v: string) => void;
  onThesisChange: (v: string) => void;
  onPositionChange: (v: Position) => void;
  onSubmit: () => void;
}

/** Смонтирован только во время загрузки — поэтому каждый раз начинает с первой подписи. */
function LoadingLabel() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setIndex((i) => (i + 1) % LOADING_LABELS.length), 1500);
    return () => window.clearInterval(id);
  }, []);
  return <span aria-live="polite">{LOADING_LABELS[index]}</span>;
}

function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className={`text-xs tabular-nums ${value.length > max * 0.9 ? "text-accent" : "text-muted"}`}>
      {value.length}/{max}
    </span>
  );
}

export function QuoteForm(props: Props) {
  const { situation, thesis, position, isLoading } = props;
  const [hint, setHint] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoading) return; // защита от двойного нажатия
    if (situation.trim().length < LIMITS.situationMin) {
      setHint("Опишите ситуацию чуть подробнее — хотя бы одним предложением.");
      return;
    }
    setHint(null);
    props.onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="situation" className="text-sm font-semibold">
            Ситуация
          </label>
          <Counter value={situation} max={LIMITS.situationMax} />
        </div>
        <textarea
          id="situation"
          value={situation}
          maxLength={LIMITS.situationMax}
          rows={4}
          onChange={(e) => props.onSituationChange(e.target.value)}
          placeholder="Например: брат занял денег и уже год не отдаёт. Стоит ли простить долг?"
          aria-describedby={hint ? "situation-hint" : undefined}
          className="w-full resize-y rounded-2xl border bg-surface px-4 py-3 text-base leading-relaxed placeholder:text-muted/70 focus:border-accent focus:outline-none"
        />
        {hint && (
          <p id="situation-hint" role="alert" className="text-sm text-accent">
            {hint}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="thesis" className="text-sm font-semibold">
            Тезис <span className="font-normal text-muted">— необязательно</span>
          </label>
          <Counter value={thesis} max={LIMITS.thesisMax} />
        </div>
        <input
          id="thesis"
          value={thesis}
          maxLength={LIMITS.thesisMax}
          onChange={(e) => props.onThesisChange(e.target.value)}
          placeholder="Например: долг нужно простить"
          className="w-full rounded-2xl border bg-surface px-4 py-3 text-base placeholder:text-muted/70 focus:border-accent focus:outline-none"
        />
      </div>

      <PositionSwitch value={position} onChange={props.onPositionChange} />

      <button
        type="submit"
        disabled={isLoading}
        aria-busy={isLoading}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3.5 text-base font-semibold text-surface transition-opacity disabled:opacity-80"
      >
        {isLoading ? (
          <>
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
            <LoadingLabel />
          </>
        ) : (
          <>
            <Search className="h-5 w-5" aria-hidden="true" />
            Найти в Писании
          </>
        )}
      </button>
    </form>
  );
}
