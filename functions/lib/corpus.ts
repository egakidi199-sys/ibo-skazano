import { createFetchCorpusReader, type CorpusReader } from "../../src/shared/corpus";

export interface AssetsEnv {
  ASSETS: Fetcher;
}

/**
 * Читатель корпуса для Pages Function: статические /corpus/<id>.json того же деплоя
 * через env.ASSETS. Грузит только запрошенные книги — весь корпус на сервере
 * не разбирается (лимит CPU Workers, design D1).
 */
export function createAssetsCorpusReader(env: AssetsEnv, requestUrl: string): CorpusReader {
  return createFetchCorpusReader((path) => env.ASSETS.fetch(new URL(path, requestUrl).toString()));
}
