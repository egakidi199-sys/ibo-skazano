import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import type { Quote } from "../shared/types";
import { POSTCARD_CSS_HEIGHT, POSTCARD_CSS_WIDTH } from "../lib/postcard";

// Открытка 1080×1350 (захват ×4 с 270×337.5 CSS-px). Инлайновые стили, а не Tailwind:
// html-to-image захватывает computed styles, инлайн надёжнее (урок AstroStrikeBack).
// Цвета фиксированы (светлая тема) — открытка не зависит от темы устройства.

const PAPER = "#f6f1e7";
const INK = "#2b2118";
const MUTED = "#6b5e4e";
const ACCENT = "#8c2f1b";

const MAX_FONT = 19;
// Самая длинная допустимая цитата — Есф 4:13–17 (~4000 знаков) — помещается только при ~4 px.
const MIN_FONT = 4;

interface Props {
  quote: Quote;
  siteUrl: string;
}

/** Размер шрифта подбирается так, чтобы цитата целиком поместилась (до 5 длинных стихов). */
export const PostcardCard = forwardRef<HTMLDivElement, Props>(function PostcardCard({ quote, siteUrl }, ref) {
  const textRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(MAX_FONT);

  useLayoutEffect(() => {
    setFontSize(MAX_FONT);
  }, [quote.text]);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight && fontSize > MIN_FONT) setFontSize((f) => Math.max(MIN_FONT, f - (f > 10 ? 0.5 : 0.25)));
  }, [fontSize, quote.text]);

  return (
    <div
      ref={ref}
      style={{
        width: POSTCARD_CSS_WIDTH,
        height: POSTCARD_CSS_HEIGHT,
        background: PAPER,
        color: INK,
        padding: 18,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        fontFamily: '"PT Serif", Georgia, serif',
      }}
    >
      <div
        style={{
          flex: 1,
          border: `1px solid ${ACCENT}`,
          outline: `0.5px solid ${ACCENT}`,
          outlineOffset: 3,
          padding: "16px 14px 12px",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
        }}
      >
        <div style={{ fontSize: 9, lineHeight: 1, color: ACCENT, textAlign: "center", letterSpacing: 4 }}>— ◆ —</div>
        <div
          ref={textRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            fontSize,
            // На мелком шрифте (очень длинные цитаты) плотнее — иначе не помещается Есф 4:13–17.
            lineHeight: fontSize < 8 ? 1.2 : 1.4,
            textAlign: "center",
            padding: fontSize < 8 ? "4px 0" : "8px 0",
          }}
        >
          <div>«{quote.text}»</div>
        </div>
        <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: ACCENT, letterSpacing: 0.3 }}>{quote.ref}</div>
      </div>
      <div
        style={{
          marginTop: 8,
          textAlign: "center",
          fontSize: 7,
          color: MUTED,
          fontFamily: '"Manrope Variable", system-ui, sans-serif',
          letterSpacing: 0.4,
        }}
      >
        Синодальный перевод · {siteUrl}
      </div>
    </div>
  );
});
