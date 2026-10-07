// Tells animations when they can be seen: in or near the viewport, with the tab showing. Figures pause what moves
// while it is out of sight, so a lesson scrolled past (or a tab in the background) costs nothing. One shared
// IntersectionObserver for every figure on the page.

type Listener = (visible: boolean) => void;

/** How far outside the viewport a figure still counts as in view, so it is already moving when scrolled to. */
const MARGIN = '200px';

const watched = new Map<Element, { listener: Listener; inView: boolean | null }>();
let observer: IntersectionObserver | null = null;

/** Calls `listener` with whether `el` can be seen: once when first known, then on every change. Returns a stop function. */
export function whileVisible(el: Element, listener: Listener): () => void {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const w = watched.get(e.target);
        if (!w) continue;
        const before = w.inView === null ? null : w.inView && !document.hidden;
        w.inView = e.isIntersecting;
        const now = w.inView && !document.hidden;
        if (now !== before) w.listener(now);
      }
    },
    { rootMargin: MARGIN },
  );
  watched.set(el, { listener, inView: null });
  observer.observe(el);
  return () => {
    observer?.unobserve(el);
    watched.delete(el);
  };
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    for (const w of watched.values()) if (w.inView) w.listener(!document.hidden);
  });
}
