import { createFetchCorpusReader } from "../shared/corpus";

/** Корпус в браузере: /corpus/<id>.json той же сборки, кеш на время жизни страницы. */
export const clientCorpus = createFetchCorpusReader((url) => fetch(url));
