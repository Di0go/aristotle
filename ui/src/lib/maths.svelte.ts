// KaTeX, loaded when first needed (or when the browser is idle after the first paint) instead of on the startup
// path. Until it arrives, maths renders as a quiet placeholder; reading `version` in a reactive context renders it
// again once KaTeX is here.

type Katex = typeof import('katex').default;

let katex: Katex | null = null;
let loading: Promise<void> | null = null;
const state = $state({ version: 0 });

export const maths = {
  /** KaTeX, or null until it has loaded. */
  get katex(): Katex | null {
    return katex;
  },
  /** Bumped when KaTeX arrives: whatever read it renders again, with the maths this time. */
  get version(): number {
    return state.version;
  },
  /** Starts loading KaTeX, once. */
  load(): Promise<void> {
    loading ??= import('katex').then(
      (m) => {
        katex = m.default;
        state.version++;
      },
      () => {
        // Try again next time it is needed (a missing chunk after a rebuild reloads the page anyway).
        loading = null;
      },
    );
    return loading;
  },
  /** Loads KaTeX once the browser has nothing better to do, so a page with maths rarely waits for it. */
  preload() {
    const go = () => void maths.load();
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 1500 });
    else setTimeout(go, 300);
  },
};
