import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./rateLimit";

function fakeKv() {
  const store = new Map<string, string>();
  const kv = {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => void store.set(k, v),
  };
  return { kv: kv as unknown as KVNamespace, store };
}

describe("checkRateLimit", () => {
  it("20 запросов в час с одного IP проходят, 21-й — нет", async () => {
    const { kv } = fakeKv();
    const env = { RATE_LIMIT_KV: kv };
    for (let i = 0; i < 20; i++) expect(await checkRateLimit(env, "1.2.3.4")).toBe(true);
    expect(await checkRateLimit(env, "1.2.3.4")).toBe(false);
    expect(await checkRateLimit(env, "5.6.7.8")).toBe(true);
  });

  it("в хранилище только счётчики по IP, без текстов", async () => {
    const { kv, store } = fakeKv();
    await checkRateLimit({ RATE_LIMIT_KV: kv }, "1.2.3.4");
    expect([...store.keys()].every((k) => /^rl:1\.2\.3\.4:\d+$/.test(k))).toBe(true);
    expect([...store.values()]).toEqual(["1"]);
  });

  it("без привязки KV — fail-open", async () => {
    expect(await checkRateLimit({}, "1.2.3.4")).toBe(true);
  });
});
