// What he has typed and not sent yet (an answer, a quiz note, a message), kept in the browser so leaving a step and
// coming back finds it where he left it. Cleared once sent; drafts nobody came back to are dropped after a while.

const PREFIX = 'aristotle.draft.';
/** A draft untouched this long is forgotten. */
const KEEP_MS = 60 * 24 * 60 * 60 * 1000;

type Saved<T> = { value: T; at: number };

export const drafts = {
  /** The draft kept under this key, or the fallback when there is none (or storage can't be read). */
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : (JSON.parse(raw) as Saved<T>).value;
    } catch {
      return fallback;
    }
  },

  /** Keeps a draft; an empty one is dropped instead. */
  set<T>(key: string, value: T, empty = false) {
    try {
      if (empty) localStorage.removeItem(PREFIX + key);
      else localStorage.setItem(PREFIX + key, JSON.stringify({ value, at: Date.now() } satisfies Saved<T>));
    } catch {
      // No storage (private window, full): the draft lives only as long as the page.
    }
  },

  /** Keeps a piece of text, dropping it when there is nothing but whitespace. */
  text(key: string, text: string) {
    this.set(key, text, !text.trim());
  },

  clear(key: string) {
    this.set(key, null, true);
  },
};

// Drafts from long ago (a question answered elsewhere, a step deleted) don't pile up.
try {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith(PREFIX)) continue;
    try {
      const { at } = JSON.parse(localStorage.getItem(key) ?? '') as Saved<unknown>;
      if (!(Date.now() - at < KEEP_MS)) localStorage.removeItem(key);
    } catch {
      localStorage.removeItem(key);
    }
  }
} catch {
  // No storage: nothing to tidy.
}
