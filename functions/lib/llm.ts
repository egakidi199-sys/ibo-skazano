export interface LlmEnv {
  LLM_PROVIDER?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateParams {
  systemPrompt: string;
  /** Few-shot: пары вопрос — ответ перед userPrompt */
  examples?: readonly ChatMessage[];
  userPrompt: string;
  /** JSON Schema ответа (structured output) */
  schema: object;
  signal: AbortSignal;
}

// Выбор ссылок — задача на точность, а не на творчество.
const TEMPERATURE = 0.3;

/**
 * Провайдер выбирается через env.LLM_PROVIDER, чтобы смена провайдера
 * при исчерпании квоты была правкой одной переменной окружения, а не кода.
 */
export async function generate(env: LlmEnv, params: GenerateParams): Promise<unknown> {
  const provider = (env.LLM_PROVIDER ?? "groq").toLowerCase();

  switch (provider) {
    case "groq":
      return generateOpenAiCompatible({
        url: "https://api.groq.com/openai/v1/chat/completions",
        apiKey: requireKey(env.GROQ_API_KEY, "GROQ_API_KEY"),
        model: env.GROQ_MODEL || "openai/gpt-oss-120b",
        ...params,
      });
    case "openrouter":
      return generateOpenAiCompatible({
        url: "https://openrouter.ai/api/v1/chat/completions",
        apiKey: requireKey(env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY"),
        model: env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free",
        ...params,
      });
    case "gemini":
      return generateGemini({
        apiKey: requireKey(env.GEMINI_API_KEY, "GEMINI_API_KEY"),
        model: env.GEMINI_MODEL || "gemini-flash-latest",
        ...params,
      });
    default:
      throw new Error(`Неизвестный LLM_PROVIDER: ${provider}`);
  }
}

function requireKey(key: string | undefined, name: string): string {
  if (!key) throw new Error(`${name} не задан в окружении`);
  return key;
}

interface GeminiParams extends GenerateParams {
  apiKey: string;
  model: string;
}

async function generateGemini({ apiKey, model, systemPrompt, examples = [], userPrompt, schema, signal }: GeminiParams): Promise<unknown> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [
        ...examples.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        { role: "user", parts: [{ text: userPrompt }] },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: TEMPERATURE,
        // "thinking" съедает время сверх таймаута (design D8).
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini HTTP ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("Gemini: ответ без текста");
  }
  return JSON.parse(text);
}

interface OpenAiCompatibleParams extends GenerateParams {
  url: string;
  apiKey: string;
  model: string;
}

async function generateOpenAiCompatible({
  url,
  apiKey,
  model,
  systemPrompt,
  examples = [],
  userPrompt,
  schema,
  signal,
}: OpenAiCompatibleParams): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    signal,
    body: JSON.stringify({
      model,
      temperature: TEMPERATURE,
      // gpt-oss — рассуждающая модель: немного рассуждения помогает выбрать стих,
      // но латентность важнее (design D8).
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
      messages: [
        { role: "system", content: systemPrompt },
        ...examples,
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        // Без strict: со strict Groq отвечает 400 на любой сбой генерации, а так неверные
        // кандидаты отсеиваются по одному (lenientArray в schema.ts).
        json_schema: { name: "quote_candidates", schema },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`${new URL(url).host} HTTP ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error(`${new URL(url).host}: ответ без текста`);
  }
  return JSON.parse(text);
}
