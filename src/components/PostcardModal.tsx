import { useEffect, useRef } from "react";
import { Download, Share2, X } from "lucide-react";

interface PostcardModalProps {
  imageUrl: string;
  blob: Blob;
  onClose: () => void;
}

const canShareFiles =
  typeof navigator !== "undefined" && typeof navigator.canShare === "function";

const FOCUSABLE_SELECTOR = 'button, a[href], [tabindex]:not([tabindex="-1"])';

export function PostcardModal({ imageUrl, blob, onClose }: PostcardModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleShare() {
    const file = new File([blob], "ibo-skazano.png", { type: "image/png" });
    if (!navigator.canShare?.({ files: [file] })) return;
    try {
      await navigator.share({ files: [file], title: "Ибо сказано" });
    } catch {
      // пользователь отменил шеринг — не ошибка
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Открытка"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-paper/95 px-4 py-8"
    >
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        aria-label="Закрыть"
        className="absolute right-4 top-4 rounded-full border border-line bg-surface p-2 text-muted transition-colors hover:text-ink"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>

      <img
        src={imageUrl}
        alt="Открытка с цитатой"
        className="max-h-[70vh] w-auto rounded-2xl border border-line shadow-2xl"
      />

      <div className="flex w-full max-w-xs gap-2">
        <a
          href={imageUrl}
          download="ibo-skazano.png"
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3 text-sm font-semibold text-surface"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Скачать
        </a>
        {canShareFiles && (
          <button
            type="button"
            onClick={handleShare}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-medium text-muted transition-colors hover:text-ink"
          >
            <Share2 className="h-4 w-4" aria-hidden="true" />
            Поделиться
          </button>
        )}
      </div>
    </div>
  );
}
