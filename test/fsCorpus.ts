// Только для тестов: читатель корпуса из public/corpus через файловую систему.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createFetchCorpusReader, type CorpusReader } from "../src/shared/corpus";

const corpusDir = join(import.meta.dirname, "..", "public", "corpus");

export function fsCorpusReader(): CorpusReader {
  return createFetchCorpusReader(async (url) => {
    try {
      const body = await readFile(join(corpusDir, url.replace(/^\/corpus\//, "")), "utf8");
      return new Response(body, { status: 200 });
    } catch {
      return new Response("not found", { status: 404 });
    }
  });
}
