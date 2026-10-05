<script lang="ts">
  // Renders lesson Markdown and brings it to life: mermaid diagrams, sequences, explorables and the visual kit's figures.
  import { getContext, mount, unmount } from 'svelte';
  import { EXPLORABLES, explorable } from './explorables/index.ts';
  import { feed } from './feed.svelte.ts';
  import { splitRef } from './library.ts';
  import { renderInline, renderMarkdown } from './markdown.ts';
  import { link } from './router.svelte.ts';
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
  const SKIP = 'pre, code, .katex, svg, a, button, .term, .figure-live, .figure-loading, .kit, .diagram, script, style';

  let { source, inline = false }: { source: string; inline?: boolean } = $props();

  let el = $state<HTMLElement>();
  /** Diagrams drawn by this component, for ids Mermaid needs to be unique. */
  let diagramCount = 0;

  const html = $derived(inline ? renderInline(source) : renderMarkdown(source));
  /** The topic a lesson's text belongs to, so a bare [[concept]] can be found. */
  const topicOf = getContext<(() => string | undefined) | undefined>('topic-slug');

  // Point [[concept]] links at their concept, label them with its name, and mark the ones not on any map.
  $effect(() => {
    void html;
    const topics = feed.topics;
    for (const a of el?.querySelectorAll<HTMLAnchorElement>('a.concept-link') ?? []) {
      const ref = a.dataset.ref ?? a.dataset.concept ?? '';
      a.dataset.ref = ref;
      const { topic: slug = topicOf?.() ?? feed.session?.topicSlug ?? '', concept: id } = splitRef(ref);
      const concept = topics[slug]?.concepts.find((c) => c.id === id);
      a.dataset.concept = `${slug}/${id}`;
      a.href = link.topic(slug, id);
      a.classList.toggle('missing', !concept);
      if (!a.dataset.label) a.textContent = concept?.label ?? id.replace(/-/g, ' ');
    }
  });

  // Glossed phrases: wherever one appears in plain text, it becomes a hover term with its gloss. Code, maths,
  // drawings, links, other terms and live figures are left alone. Glosses forgotten since go back to plain text.
  $effect(() => {
    void html;
    const glosses = feed.glosses;
    if (!el) return;
    const ids = new Set(glosses.map((g) => g.id));
    for (const span of el.querySelectorAll<HTMLElement>('span.gloss')) {
      if (ids.has(span.dataset.gloss ?? '')) continue;
      const parent = span.parentElement;
      span.replaceWith(...span.childNodes);
      parent?.normalize();
    }
    if (glosses.length) markGlosses(el, glosses);
  });

  // Step-through sequences, explorables and the visual kit's figures become live components. Each replaces its
  // code block with a placeholder at once, and mounts there when its code arrives (unless the HTML has moved on).
  $effect(() => {
    void html;
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
    for (const code of el?.querySelectorAll<HTMLElement>('pre > code.language-sequence') ?? []) {
      place(code.parentElement!, Sequence, { source: code.textContent ?? '' });
    }
    for (const code of el?.querySelectorAll<HTMLElement>('pre > code.language-explorable') ?? []) {
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
      for (const code of el?.querySelectorAll<HTMLElement>(`pre > code.language-${lang}`) ?? []) {
        const pre = code.parentElement!;
        const spec = json(pre, code, `${lang} figure`);
        if (spec) place(pre, load, { spec });
      }
    }
    return () => {
      gone = true;
      for (const m of mounted) void unmount(m);
    };
  });

  // Animated drawings (SMIL) get a replay button; with reduced motion they start paused.
  $effect(() => {
    void html;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const svg of el?.querySelectorAll<SVGSVGElement>('svg') ?? []) {
      if (!svg.querySelector('animate, animateTransform, animateMotion, set') || svg.closest('.kit')) continue;
      let frame = svg.closest('figure') as HTMLElement | null;
      if (!frame) {
        frame = document.createElement('figure');
        svg.replaceWith(frame);
        frame.append(svg);
      }
      if (frame.querySelector('.figure-tools')) continue;
      const tools = document.createElement('div');
      tools.className = 'figure-tools';
      const play = document.createElement('button');
      const replay = document.createElement('button');
      replay.textContent = 'Replay';
      const label = () => (play.textContent = svg.animationsPaused() ? 'Play' : 'Pause');
      play.onclick = () => {
        if (svg.animationsPaused()) svg.unpauseAnimations();
        else svg.pauseAnimations();
        label();
      };
      replay.onclick = () => {
        svg.setCurrentTime(0);
        svg.unpauseAnimations();
        label();
      };
      if (still) svg.pauseAnimations();
      label();
      tools.append(play, replay);
      svg.after(tools);
    }
  });

  // Draw ```mermaid blocks once the HTML is in the page. Mermaid is large, so it loads on first use.
  $effect(() => {
    void html;
    const blocks = el?.querySelectorAll<HTMLElement>('pre > code.language-mermaid') ?? [];
    if (blocks.length === 0) return;
    void (async () => {
      const { default: mermaid } = await import('mermaid');
      const dark = document.documentElement.dataset.theme === 'dark';
      const css = getComputedStyle(document.documentElement);
      const v = (name: string) => css.getPropertyValue(name).trim();
      const soft = mix(v('--acc'), v('--b0'), dark ? 0.72 : 0.84);
      // Timelines colour their sections from cScale0…11: the accent, softened, with plain text on it.
      const scale = Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [
          [`cScale${i}`, i % 2 ? mix(soft, v('--b0'), 0.35) : soft],
          [`cScaleLabel${i}`, v('--fg')],
          [`cScaleInv${i}`, v('--acc')],
        ]).flat(),
      );
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        themeVariables: {
          darkMode: dark,
          fontFamily: v('--sans'),
          fontSize: '14px',
          background: v('--b0'),
          primaryColor: v('--b1'),
          primaryBorderColor: v('--rule-strong'),
          primaryTextColor: v('--fg'),
          secondaryColor: v('--b2'),
          tertiaryColor: v('--b1'),
          lineColor: v('--muted'),
          textColor: v('--fg'),
          edgeLabelBackground: v('--b0'),
          clusterBkg: v('--b1'),
          clusterBorder: v('--rule-strong'),
          noteBkgColor: v('--b2'),
          noteBorderColor: v('--rule-strong'),
          ...scale,
          // Charts (xychart): lines and bars in the accent, then the semantic colours.
          xyChart: {
            plotColorPalette: [v('--acc'), v('--shaky'), v('--solid'), v('--muted')].join(', '),
            titleColor: v('--fg'),
            xAxisLabelColor: v('--muted'),
            yAxisLabelColor: v('--muted'),
            xAxisTitleColor: v('--muted'),
            yAxisTitleColor: v('--muted'),
            xAxisLineColor: v('--rule-strong'),
            yAxisLineColor: v('--rule-strong'),
            xAxisTickColor: v('--rule-strong'),
            yAxisTickColor: v('--rule-strong'),
          },
        },
      });
      for (const code of blocks) {
        const pre = code.parentElement!;
        try {
          const { svg } = await mermaid.render(`mermaid-${crypto.randomUUID()}-${diagramCount++}`, code.textContent ?? '');
          const figure = document.createElement('figure');
          figure.className = 'diagram';
          figure.innerHTML = svg;
          pre.replaceWith(figure);
        } catch {
          pre.classList.add('diagram-error');
        }
      }
    })();
  });

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

  /** a blended toward b by t (0-1), for hex colours: Mermaid needs plain colours, not color-mix(). */
  function mix(a: string, b: string, t: number): string {
    const [x, y] = [rgb(a), rgb(b)];
    const channels = x.map((c, i) =>
      Math.round(c + (y[i] - c) * t)
        .toString(16)
        .padStart(2, '0'),
    );
    return `#${channels.join('')}`;
  }

  /** "#abc" or "#aabbcc" as [r, g, b]. */
  function rgb(hex: string): number[] {
    if (hex.length === 4) return [...hex.slice(1)].map((c) => parseInt(c + c, 16));
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }
</script>

{#if inline}
  <span class="md-inline">{@html html}</span>
{:else}
  <div class="md" bind:this={el}>{@html html}</div>
{/if}
