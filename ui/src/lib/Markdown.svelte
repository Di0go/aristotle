<script lang="ts">
  // Renders lesson Markdown and brings it to life: the core's Markdown (@organon/core/ui/Markdown.svelte: mermaid
  // diagrams in the look's colours, animated drawings with Play/Pause, the lightbox's figures) with Aristotle's
  // renderer and three enhancers of its own, each in an effect of its own so that one following the learner's data
  // re-runs alone: [[concept]] links pointed at the map (again when the map changes), glossed phrases marked (again
  // when a gloss comes or goes), and sequences, explorables and the visual kit's figures mounted (never again mid-read).
  import CoreMarkdown from '@organon/core/ui/Markdown.svelte';
  import { getContext, mount, unmount } from 'svelte';
  import { EXPLORABLES, explorable } from './explorables/index.ts';
  import { feed } from './feed.svelte.ts';
  import { splitRef } from './library.ts';
  import { renderInline, renderMarkdown } from './markdown.ts';
  import { link } from './router.svelte.ts';
  import { theme } from './theme.svelte.ts';
  import type { Gloss } from '../../../shared/types.ts';

  // Figures load on first use, so a lesson without them never downloads them.
  type Loader = () => Promise<{ default: unknown }>;
  const Sequence: Loader = () => import('./Sequence.svelte');
  /** The visual kit: a fenced block in one of these languages becomes that component, filled from its JSON. */
  const KIT: Record<string, Loader> = {
    balance: () => import('./kit/Balance.svelte'),
    timeline: () => import('./kit/Timeline.svelte'),
    flow: () => import('./kit/Flow.svelte'),
    plate: () => import('./kit/Plate.svelte'),
  };

  /** Where glossed phrases are never marked: code, maths, drawings, links, other terms and live figures. */
  const SKIP = 'pre, code, .katex, .math-pending, svg, a, button, .term, .figure-live, .figure-loading, .kit, .diagram, script, style';

  /** `concept`: the map concept the text is about ("topic/id"), whose topic a bare [[concept]] falls back on. */
  let { source, inline = false, concept: about }: { source: string; inline?: boolean; concept?: string } = $props();

  /** The topic a lesson's text belongs to, so a bare [[concept]] can be found. */
  const topicOf = getContext<(() => string | undefined) | undefined>('topic-slug');

  /** Point [[concept]] links at their concept, label them with its name, and mark the ones not on any map. */
  function conceptLinks(root: HTMLElement) {
    const topics = feed.topics;
    for (const a of root.querySelectorAll<HTMLAnchorElement>('a.concept-link') ?? []) {
      const ref = a.dataset.ref ?? a.dataset.concept ?? '';
      a.dataset.ref = ref;
      // A bare id belongs to the page's topic; a review has none, so it falls back on the topic of what the text is about.
      const fallback = topicOf?.() || (about?.includes('/') ? splitRef(about).topic : '') || feed.session?.topicSlug || '';
      const { topic: slug = fallback, concept: id } = splitRef(ref);
      const concept = topics[slug]?.concepts.find((c) => c.id === id);
      a.dataset.concept = `${slug}/${id}`;
      a.href = link.topic(slug, id);
      a.classList.toggle('missing', !concept);
      if (!a.dataset.label) a.textContent = concept?.label ?? id.replace(/-/g, ' ');
    }
  }

  /**
   * Glossed phrases: wherever one appears in plain text, it becomes a hover term with its gloss. Code, maths, drawings,
   * links, other terms and live figures are left alone. Glosses forgotten since go back to plain text.
   */
  function glossed(root: HTMLElement) {
    const glosses = feed.glosses;
    const ids = new Set(glosses.map((g) => g.id));
    for (const span of root.querySelectorAll<HTMLElement>('span.gloss')) {
      if (ids.has(span.dataset.gloss ?? '')) continue;
      const parent = span.parentElement;
      span.replaceWith(...span.childNodes);
      parent?.normalize();
    }
    if (glosses.length) markGlosses(root, glosses);
  }

  /**
   * Step-through sequences, explorables and the visual kit's figures become live components. Each replaces its code
   * block with a placeholder at once, and mounts there when its code arrives (unless the HTML has moved on).
   */
  function figures(root: HTMLElement) {
    const mounted: ReturnType<typeof mount>[] = [];
    let gone = false;
    const place = (pre: HTMLElement, load: Loader, props: Record<string, unknown>) => {
      const host = document.createElement('div');
      host.className = 'figure-loading';
      pre.replaceWith(host);
      void load().then((m) => {
        if (gone) return;
        host.className = 'figure-live';
        // Picked by name at run time, so the component's props can't be typed here.
        mounted.push(mount(m.default as any, { target: host, props }));
      });
    };
    const json = (pre: HTMLElement, code: HTMLElement, what: string) => {
      try {
        return JSON.parse(code.textContent ?? '');
      } catch (err) {
        pre.classList.add('diagram-error');
        pre.title = `This ${what} could not be read: ${(err as Error).message}`;
        return undefined;
      }
    };
    for (const code of root.querySelectorAll<HTMLElement>('pre > code.language-sequence') ?? []) {
      place(code.parentElement!, Sequence, { source: code.textContent ?? '' });
    }
    for (const code of root.querySelectorAll<HTMLElement>('pre > code.language-explorable') ?? []) {
      const pre = code.parentElement!;
      const spec = json(pre, code, 'explorable');
      if (!spec) continue;
      const found = explorable(spec.id ?? '');
      if (!found) {
        pre.classList.add('diagram-error');
        pre.title = `No explorable called "${spec.id}". Available: ${EXPLORABLES.map((e) => e.id).join(', ')}`;
        continue;
      }
      place(pre, found.load, { spec });
    }
    for (const [lang, load] of Object.entries(KIT)) {
      for (const code of root.querySelectorAll<HTMLElement>(`pre > code.language-${lang}`) ?? []) {
        const pre = code.parentElement!;
        const spec = json(pre, code, `${lang} figure`);
        if (spec) place(pre, load, { spec });
      }
    }
    return () => {
      gone = true;
      for (const m of mounted) void unmount(m);
    };
  }

  /** Wraps each whole-word occurrence of a glossed phrase in el's plain text, longest phrases first. */
  function markGlosses(root: HTMLElement, glosses: Gloss[]) {
    const byText = new Map(glosses.map((g) => [g.text.toLowerCase(), g.id]));
    const phrases = [...byText.keys()]
      .sort((a, b) => b.length - a.length)
      .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'));
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${phrases.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement?.closest(SKIP) || !node.nodeValue?.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
      const value = node.nodeValue ?? '';
      const parts: (string | HTMLElement)[] = [];
      let last = 0;
      for (const m of value.matchAll(pattern)) {
        const id = byText.get(m[0].replace(/\s+/g, ' ').toLowerCase());
        if (!id) continue;
        parts.push(value.slice(last, m.index));
        const span = document.createElement('span');
        span.className = 'term gloss';
        span.tabIndex = 0;
        span.dataset.gloss = id;
        span.textContent = m[0];
        parts.push(span);
        last = m.index + m[0].length;
      }
      if (last === 0) continue;
      parts.push(value.slice(last));
      node.replaceWith(...parts.filter((p) => p !== ''));
    }
  }
</script>

<CoreMarkdown
  {source}
  {inline}
  markdown={{ renderMarkdown, renderInline }}
  look={theme}
  enhance={[conceptLinks, glossed, figures]}
  ownFigures=".kit"
/>
