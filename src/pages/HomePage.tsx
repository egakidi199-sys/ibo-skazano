import { useRef, useState } from "react";
import type { Position, QuoteRequest, QuoteResponse } from "../shared/types";
import { LIMITS } from "../shared/types";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { InputError, requestQuotes } from "../lib/api";
import { copyText } from "../lib/clipboard";
import { EMPTY_TEXT, quoteForCopy } from "../lib/format";
import { renderPostcardPng } from "../lib/postcard";
import { QuoteForm } from "../components/QuoteForm";
import { ResultView } from "../components/ResultView";
import { PostcardCard } from "../components/PostcardCard";
import { PostcardModal } from "../components/PostcardModal";
import { Toast } from "../components/Toast";

type Quotes = Extract<QuoteResponse, { kind: "quotes" }>;

const SITE_URL = "ibo-skazano.pages.dev";

export function HomePage() {
  const [situation, setSituation] = useState("");
  const [thesis, setThesis] = useState("");
  const [position, setPosition] = useLocalStorage<Position>("ibo-skazano:position", "confirm");

  const [result, setResult] = useState<Quotes | null>(null);
  const [resultPosition, setResultPosition] = useState<Position>("confirm");
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Уже показанные для этого запроса ссылки — чтобы «Ещё вариант» их не повторял.
  const shownRef = useRef<{ key: string; refs: string[] }>({ key: "", refs: [] });

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const postcardRef = useRef<HTMLDivElement>(null);
  const [postcard, setPostcard] = useState<{ url: string; blob: Blob } | null>(null);
  const [isRenderingPostcard, setIsRenderingPostcard] = useState(false);

  function showToast(text: string) {
    window.clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = window.setTimeout(() => setToast(null), 2000);
  }

  async function run(more: boolean) {
    const req: QuoteRequest = { situation: situation.trim(), thesis: thesis.trim() || undefined, position };
    const key = JSON.stringify([req.situation, req.thesis, req.position]);
    if (shownRef.current.key !== key) shownRef.current = { key, refs: [] };
    if (more) req.exclude = shownRef.current.refs.slice(-LIMITS.excludeMax);

    (more ? setIsLoadingMore : setIsLoading)(true);
    setMessage(null);
    try {
      const res = await requestQuotes(req);
      if (res.kind === "quotes") {
        setResult(res);
        setResultPosition(req.position);
        shownRef.current.refs.push(...res.quotes.map((q) => q.ref));
      } else {
        setResult(null);
        setMessage(more ? "Других подходящих стихов не найдено." : EMPTY_TEXT);
      }
    } catch (err) {
      setResult(null);
      setMessage(err instanceof InputError ? err.message : EMPTY_TEXT);
    } finally {
      (more ? setIsLoadingMore : setIsLoading)(false);
    }
  }

  function selectMain(index: number) {
    if (!result) return;
    const quotes = [...result.quotes];
    const [picked] = quotes.splice(index, 1);
    setResult({ ...result, quotes: [picked, ...quotes] });
  }

  async function handleCopy() {
    if (!result) return;
    if (await copyText(quoteForCopy(result.quotes[0]))) showToast("Скопировано");
    else showToast("Не удалось скопировать — выделите текст вручную");
  }

  async function handleShare() {
    if (!result) return;
    try {
      await navigator.share({ text: quoteForCopy(result.quotes[0]) });
    } catch {
      // пользователь отменил — не ошибка
    }
  }

  async function handlePostcard() {
    if (!result || isRenderingPostcard) return;
    setIsRenderingPostcard(true);
    try {
      await document.fonts.ready;
      // узел смонтирован заранее; ждём кадр, чтобы подбор шрифта успел примениться
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const node = postcardRef.current;
      if (!node) throw new Error("Открытка не готова");
      const blob = await renderPostcardPng(node);
      setPostcard({ url: URL.createObjectURL(blob), blob });
    } catch {
      showToast("Не удалось сделать открытку");
    } finally {
      setIsRenderingPostcard(false);
    }
  }

  function closePostcard() {
    if (postcard) URL.revokeObjectURL(postcard.url);
    setPostcard(null);
  }

  return (
    <>
      <header className="space-y-2">
        <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">Ибо сказано</h1>
        <p className="text-sm leading-relaxed text-muted">
          Опишите ситуацию — и получите подлинную цитату из Ветхого Завета и Евангелий с точной ссылкой. Текст — дословно из
          Синодального перевода.
        </p>
      </header>

      <QuoteForm
        situation={situation}
        thesis={thesis}
        position={position}
        isLoading={isLoading}
        onSituationChange={setSituation}
        onThesisChange={setThesis}
        onPositionChange={setPosition}
        onSubmit={() => run(false)}
      />

      {message && (
        <p role="status" className="animate-reveal rounded-2xl border bg-surface px-4 py-3 text-sm text-muted">
          {message}
        </p>
      )}

      {result && (
        <ResultView
          thesis={result.thesis}
          quotes={result.quotes}
          position={resultPosition}
          source={result.source}
          noDirectSupport={result.noDirectSupport}
          sensitive={result.sensitive}
          isLoadingMore={isLoadingMore}
          isRenderingPostcard={isRenderingPostcard}
          onSelectMain={selectMain}
          onCopy={handleCopy}
          onShare={handleShare}
          onMore={() => run(true)}
          onPostcard={handlePostcard}
        />
      )}

      {result && (
        <div style={{ position: "fixed", top: 0, left: -10000 }} aria-hidden="true">
          <PostcardCard ref={postcardRef} quote={result.quotes[0]} siteUrl={SITE_URL} />
        </div>
      )}

      {postcard && <PostcardModal imageUrl={postcard.url} blob={postcard.blob} onClose={closePostcard} />}
      <Toast message={toast ?? ""} visible={toast !== null} />
    </>
  );
}
