// KaTeX, loaded just after the first paint (or when first needed, if sooner) instead of on the startup
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
  /**
   * Loads KaTeX right after the first frame is painted (a task queued from the frame's callback runs after it), so it
   * stays off the startup path yet is almost always here before a lesson's text, which needs the feed and its sessions.
   */
  preload() {
    requestAnimationFrame(() => setTimeout(() => void maths.load(), 0));
  },
};
