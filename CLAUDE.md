# CLAUDE.md

«Ибо сказано» (ibo-skazano) — веб-приложение: по описанию ситуации и тезису подбирает подлинную цитату из Синодального перевода (39 книг ВЗ + 4 Евангелия) в подтверждение или опровержение.

**Источник истины по требованиям — OpenSpec:** `openspec/changes/ibo-skazano-mvp/` (proposal, specs, design, tasks), после архивации — `openspec/specs/`. Читать перед любой задачей, кроме чистого багфикса. Прогресс реализации — чекбоксы в `tasks.md`.

Прообраз архитектуры — `C:\Claude\AstroStrikeBack` (не трогать его).

## Главный инвариант

**Текст, показываемый как текст Писания, берётся только из корпуса `public/corpus/`.** LLM возвращает только ссылки, ключевые слова, направленность и пояснение — поля для текста стиха в её схеме нет. Любое изменение, затрагивающее цитаты, проверять на этот инвариант.

**Без цензуры (решение пользователя, design D7).** Приложение не отказывает в подборе и не скрывает стихи ни по какой теме, кризисной обработки нет. Тезис, оправдывающий насилие над другими, лишь помечается `sensitive`: принудительно «обе стороны», раскрытый контекст, нейтральная оговорка.

## Commands

```bash
npm install
npm run dev                  # только Vite, localhost:5173; /api/quote там нет (404) → клиентский fallback
npm run dev:full             # wrangler pages dev --proxy 5173, полный стек на 127.0.0.1:8788 (нужен .dev.vars)
npm run build                # tsc -b (только src/) && vite build
npm run lint                 # ESLint
npm test                     # Vitest (src/shared, functions, scripts)
npm run typecheck:functions  # отдельный tsc для functions/ (Workers-типы), НЕ часть build
npm run build:corpus         # data/rst/*.dat → public/corpus/*.json + src/shared/corpus/books.ts, с проверкой эталонов
```

Live: https://ibo-skazano.pages.dev · Repo: https://github.com/egakidi199-sys/ibo-skazano (public). KV для рейт-лимита — отдельный namespace `ibo-skazano-rate-limit` (не путать с `RATE_LIMIT_KV` проекта Astro). Секрет в Pages: `GROQ_API_KEY`.

Деплой ручной: `npm run build && npx wrangler pages deploy dist --project-name ibo-skazano --branch main`. `wrangler login` в этой среде не работает — только `CLOUDFLARE_API_TOKEN`. Секреты: `printf '%s' '...' | npx wrangler pages secret put GROQ_API_KEY --project-name ibo-skazano` (из Bash, не PowerShell); вступают в силу со следующим деплоем. `git push` и деплой — только после подтверждения пользователя.

## Architecture

- **Два рантайма.** `src/` — браузер (Vite/React), `functions/` — Cloudflare Pages Function (Workers), тайпчекается отдельно. `src/shared/` — чистый TS без браузерных/Workers API, импортируется с обеих сторон **относительными путями** (без алиасов).
- **Лимит CPU Workers (~10 мс на запрос на бесплатном тарифе).** Сервер никогда не грузит весь корпус: только книги, на которые есть ссылки (через `env.ASSETS.fetch`). Поиск по ключевым словам во всём корпусе — только в браузере.
- **Корпус.** Источник — `bibleonline/rst`, каталог `parsed/`, закреплён на коммите `2de3062` и лежит в `data/rst/` (см. `data/rst/SOURCE.md`). Нумерация синодальная. «Стих 0» источника — нецитируемое надписание (`headings`). Квадратные скобки — вставки по греческому тексту, сохраняются.
- **Одна реализация fallback** (`src/shared/fallback.ts`) с абстракцией `CorpusReader` для сервера и клиента.
- **TypeScript закреплён на 6.x** — `typescript-eslint@8` не поддерживает 7.

## Подводные камни среды (Windows)

- **Зависшие `wrangler pages dev`.** Остановка фоновой задачи не убивает дочерние `node`/`workerd`: старый сервер продолжает держать порт 8788, а новый молча не стартует — тесты идут в старый код. Перед перезапуском завершать процессы: `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` с `wrangler*pages dev` в CommandLine + `workerd` из `node_modules` проекта; проверять `Get-NetTCPConnection -LocalPort 8788`.
- **Кириллица в curl из Git Bash** уходит не в UTF-8 — запросы к API слать из файла или скриптом (Python/Node).
- **Groq за Cloudflare** отвечает 403 (1010) на User-Agent `Python-urllib` — задавать свой заголовок.
- **`*.pages.dev` заблокирован у провайдера пользователя** (ошибка «Не удаётся получить доступ к серверу»); на рабочем ПК сайт открывается только через AmneziaVPN. Решение пользователя (2026-09-27): оставить Cloudflare Pages, пользоваться через VPN. Запасные варианты, если понадобится доступ без VPN: VPS в Латвии (как у family-budget-bot) с адресом `*.sslip.io`, или свой домен.
- **Лимит Groq**: 8000 токенов в минуту — при ручных прогонах делать паузы ~20 с между запросами, иначе ответы уходят в fallback (429 в логе).
