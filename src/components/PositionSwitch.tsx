import type { Position } from "../shared/types";

const OPTIONS: { value: Position; label: string }[] = [
  { value: "confirm", label: "Подтвердить" },
  { value: "refute", label: "Опровергнуть" },
  { value: "both", label: "Обе стороны" },
];

interface Props {
  value: Position;
  onChange: (value: Position) => void;
}

export function PositionSwitch({ value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Что найти" className="grid grid-cols-3 gap-1 rounded-2xl border bg-surface p-1">
      {OPTIONS.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`whitespace-nowrap rounded-xl px-1 py-2.5 text-[13px] font-medium transition-colors sm:text-sm ${
              active ? "bg-accent text-surface" : "text-muted hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
