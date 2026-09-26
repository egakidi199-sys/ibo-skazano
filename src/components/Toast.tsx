interface ToastProps {
  message: string;
  visible: boolean;
}

export function Toast({ message, visible }: ToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink shadow-lg">
        {message}
      </div>
    </div>
  );
}
