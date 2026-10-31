// The web, for Aristotle's own tutor on a model API (tutor-api.ts), which has no search of its own: the core's
// (@organon/core/server/web), reading as "Aristotle-tutor". `web_search` (DuckDuckGo's plain HTML results, or
// Wikipedia's search when that fails) and `read_page` (a page as plain text). Accuracy comes first in teaching, so the
// tutor checks facts with these. Only public addresses are fetched: never this machine or the local network.

import { readPage as coreReadPage, webSearch as coreWebSearch } from '@organon/core/server/web';

export { isPublic, PAGE_CHARS, type SearchResult, WebError } from '@organon/core/server/web';

/** Who reads, at the end of the user agent. */
const AGENT = { agent: 'Aristotle-tutor' };

export function webSearch(query: string, limit = 8): ReturnType<typeof coreWebSearch> {
  return coreWebSearch(query, limit, AGENT);
}

export function readPage(address: string, offset = 0): ReturnType<typeof coreReadPage> {
  return coreReadPage(address, offset, AGENT);
}
