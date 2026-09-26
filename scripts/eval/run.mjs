// Прогон эталонных ситуаций через работающий /api/quote (задачи 7.1–7.2).
// Запуск: сервер `npx wrangler pages dev dist --port 8788`, затем
//   node scripts/eval/run.mjs [метка] [id,id,...]
// Пауза между запросами — из-за лимита Groq 8000 токенов в минуту.
// Автоматически проверяет формальные критерии; направленность и уместность пояснений
// оцениваются вручную по отчёту (колонка «Оценка»).

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const BASE = process.env.EVAL_BASE ?? "http://127.0.0.1:8788";
const PAUSE_MS = Number(process.env.EVAL_PAUSE_MS ?? 22000);
const label = process.argv[2] ?? "run";
const only = process.argv[3] ? new Set(process.argv[3].split(",").map(Number)) : null;

const cases = JSON.parse(readFileSync(join(here, "cases.json"), "utf8")).filter((c) => !only || only.has(c.id));

// Метаданные книг — из сгенерированного books.ts (JSON внутри).
const booksSrc = readFileSync(join(root, "src", "shared", "corpus", "books.ts"), "utf8");
const BOOKS = JSON.parse(booksSrc.slice(booksSrc.indexOf("= [") + 2, booksSrc.lastIndexOf("];") + 1));
const byAbbr = new Map(BOOKS.map((b) => [b.abbr, b.id]));
const corpus = new Map(readdirSync(join(root, "public", "corpus")).map((f) => [f.replace(".json", ""), JSON.parse(readFileSync(join(root, "public", "corpus", f), "utf8"))]));

/** Текст по отформатированной ссылке «Abbr ch:v–v» — для проверки инварианта. */
function corpusText(ref) {
  const m = /^(.+) (\d+):(\d+)(?:–(\d+))?$/.exec(ref);
  if (!m) return null;
  const book = corpus.get(byAbbr.get(m[1]));
  const ch = book?.chapters[Number(m[2]) - 1];
  if (!ch) return null;
  return ch.slice(Number(m[3]) - 1, Number(m[4] ?? m[3])).join(" ");
}

async function ask(c) {
  const t = Date.now();
  const res = await fetch(`${BASE}/api/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ situation: c.situation, thesis: c.thesis, position: c.position }),
  });
  return { status: res.status, ms: Date.now() - t, body: await res.json() };
}

const rows = [];
const stats = { total: 0, llm: 0, withQuote: 0, invariant: 0, refusals: 0, sensitiveOk: 0, sensitiveTotal: 0, againstOk: 0, againstTotal: 0, bothOk: 0, bothTotal: 0 };

for (const [i, c] of cases.entries()) {
  if (i) await new Promise((r) => setTimeout(r, PAUSE_MS));
  const { status, ms, body } = await ask(c);
  const tags = c.tags ?? [];
  const quotes = body.kind === "quotes" ? body.quotes : [];
  const issues = [];

  stats.total++;
  if (body.kind === "refusal") (stats.refusals++, issues.push("ОТКАЗ"));
  if (body.source === "llm") stats.llm++;
  if (body.source === "llm" && quotes.length > 0) stats.withQuote++;
  const bad = quotes.filter((q) => corpusText(q.ref) !== q.text);
  if (bad.length) issues.push(`текст не из корпуса: ${bad.map((q) => q.ref).join(", ")}`);
  else stats.invariant++;

  const sides = new Set(quotes.map((q) => q.stance));
  const hasBoth = sides.has("confirm") && sides.has("refute");
  if (tags.includes("sensitive")) {
    stats.sensitiveTotal++;
    if (body.sensitive && hasBoth) stats.sensitiveOk++;
    else issues.push(`sensitive=${body.sensitive}, обе стороны=${hasBoth}`);
  } else if (body.sensitive) issues.push("ложно помечен sensitive");
  if (tags.includes("against")) {
    stats.againstTotal++;
    if (body.noDirectSupport) stats.againstOk++;
    else issues.push("нет пометки «опоры нет»");
  }
  if (c.position === "both" && !tags.includes("sensitive")) {
    stats.bothTotal++;
    if (hasBoth || body.noDirectSupport) stats.bothOk++;
    else issues.push("нет обеих сторон и нет пометки");
  }

  rows.push({ c, status, ms, body, quotes, issues });
  process.stdout.write(`#${c.id} ${status} ${body.source ?? body.kind} ${ms}мс ${issues.join("; ")}\n`);
}

const pct = (a, b) => (b ? `${a}/${b} (${Math.round((100 * a) / b)}%)` : "—");
const md = [
  `# Эталонный прогон «${label}» — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
  "",
  `- Ответ от ИИ с хотя бы одной проверенной цитатой: ${pct(stats.withQuote, stats.total)} (цель ≥ 80%)`,
  `- Все цитаты совпадают с корпусом: ${pct(stats.invariant, stats.total)} (цель 100%)`,
  `- Отказов: ${stats.refusals} (цель 0)`,
  `- Чувствительные: помечены и обе стороны: ${pct(stats.sensitiveOk, stats.sensitiveTotal)}`,
  `- «Против Писания»: пометка «опоры нет»: ${pct(stats.againstOk, stats.againstTotal)}`,
  `- «Обе стороны»: обе стороны или честная пометка: ${pct(stats.bothOk, stats.bothTotal)}`,
  "",
  "Направленность и уместность пояснений — ручная оценка (✓ / ✗ с причиной) в колонке «Оценка».",
  "",
];
for (const { c, status, ms, body, quotes, issues } of rows) {
  md.push(`## #${c.id} [${c.position}] ${c.thesis ?? "(без тезиса)"}`);
  md.push(`Ситуация: ${c.situation}  `);
  md.push(`HTTP ${status}, ${ms} мс, источник: ${body.source ?? body.kind}, sensitive: ${body.sensitive}, опоры нет: ${body.noDirectSupport}  `);
  md.push(`Понятый тезис: ${body.thesis ?? "—"}  `);
  if (issues.length) md.push(`**Автопроверка:** ${issues.join("; ")}  `);
  md.push("", "| Ссылка | Пометка | Текст (начало) | Пояснение | Оценка |", "|---|---|---|---|---|");
  for (const q of quotes) md.push(`| ${q.ref} | ${q.stance} | ${q.text.slice(0, 90).replace(/\|/g, "/")}… | ${q.explanation.replace(/\|/g, "/")} | |`);
  md.push("");
}

const outDir = join(here, "reports");
mkdirSync(outDir, { recursive: true });
const file = join(outDir, `${new Date().toISOString().slice(0, 10)}-${label}.md`);
writeFileSync(file, md.join("\n"));
console.log(`\n${md.slice(2, 8).join("\n")}\nОтчёт: ${file}`);
