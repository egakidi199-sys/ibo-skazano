import { Link, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { AboutPage } from "./pages/AboutPage";

export function App() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 pb-8 pt-6 sm:pt-10">
      <main className="flex flex-1 flex-col gap-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </main>
      <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-xs text-muted">
        <span>Синодальный перевод · ВЗ и Евангелия</span>
        <Link to="/about" className="underline-offset-2 hover:text-ink hover:underline">
          О приложении
        </Link>
      </footer>
    </div>
  );
}
