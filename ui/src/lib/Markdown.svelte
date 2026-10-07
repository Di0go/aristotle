<script lang="ts" module>
  /** Diagrams drawn so far, by look (theme and accent) and source, so a step revisited shows them at once. */
  const diagrams = new Map<string, string>();
  /** The look Mermaid was last set up for. */
  let mermaidLook = '';
  /** Ids for Mermaid's drawings, unique on the page. */
  let drawn = 0;
</script>

<script lang="ts">
  // Renders lesson Markdown and brings it to life: mermaid diagrams, sequences, explorables and the visual kit's figures.
  import { getContext, mount, unmount } from 'svelte';
  import { EXPLORABLES, explorable } from './explorables/index.ts';
  import { feed } from './feed.svelte.ts';
  import { splitRef } from './library.ts';
  import { renderInline, renderMarkdown } from './markdown.ts';
  import { link } from './router.svelte.ts';
  import { theme } from './theme.svelte.ts';
  import { whileVisible } from './visible.ts';
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

  let { source, inline = false }: { source: string; inline?: boolean } = $props();

  let el = $state<HTMLElement>();

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

  // Animated drawings (SMIL) get Play/Pause and Replay; with reduced motion they start paused. Out of sight (scrolled
  // away, or the tab hidden) they pause by themselves and carry on when seen again, unless he paused them.
  $effect(() => {
    void html;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stops: (() => void)[] = [];
    for (const svg of el?.querySelectorAll<SVGSVGElement>('svg') ?? []) {
      if (!svg.querySelector('animate, animateTransform, animateMotion, set') || svg.closest('.kit') || svg.parentElement?.closest('svg'))
        continue;
      let frame = svg.closest('figure') as HTMLElement | null;
      if (!frame) {
        frame = document.createElement('figure');
        svg.replaceWith(frame);
        frame.append(svg);
      }
      frame.querySelector('.figure-tools')?.remove();
      let paused = still;
      let seen = false;
      const tools = document.createElement('div');
      tools.className = 'figure-tools';
      const play = document.createElement('button');
      const replay = document.createElement('button');
      replay.textContent = 'Replay';
      const apply = () => {
        if (paused || !seen) svg.pauseAnimations();
        else svg.unpauseAnimations();
        play.textContent = paused ? 'Play' : 'Pause';
      };
      play.onclick = () => {
        paused = !paused;
        apply();
      };
      replay.onclick = () => {
        svg.setCurrentTime(0);
        paused = false;
        apply();
      };
      apply();
      tools.append(play, replay);
      svg.after(tools);
      stops.push(
        whileVisible(svg, (visible) => {
          seen = visible;
          apply();
        }),
      );
    }
    return () => {
      for (const stop of stops) stop();
    };
  });

  // Draw ```mermaid blocks once the HTML is in the page. Mermaid is large, so it loads on first use. A diagram
  // drawn before in this look is put in at once; a new one holds its space while it is drawn. When the theme or the
  // accent changes, the diagrams are drawn again in the new colours.
  $effect(() => {
    void html;
    const look = `${theme.value}|${theme.accent}`;
    const todo: { at: HTMLElement; source: string }[] = [];
    for (const code of el?.querySelectorAll<HTMLElement>('pre > code.language-mermaid') ?? []) {
      todo.push({ at: code.parentElement!, source: code.textContent ?? '' });
    }
    for (const figure of el?.querySelectorAll<HTMLElement>('figure.diagram[data-source]') ?? []) {
      if (figure.dataset.look !== look) todo.push({ at: figure, source: figure.dataset.source ?? '' });
    }
    if (todo.length === 0) return;
    let gone = false;
    const pending: { at: HTMLElement; source: string }[] = [];
    for (const d of todo) {
      const svg = diagrams.get(`${look}\n${d.source}`);
      if (svg) d.at.replaceWith(diagram(svg, d.source, look));
      else if (d.at.tagName === 'PRE') {
        // The space it will take, roughly, so the page doesn't jump when it is drawn.
        const hold = document.createElement('div');
        hold.className = 'figure-loading diagram-loading';
        d.at.replaceWith(hold);
        pending.push({ at: hold, source: d.source });
      } else pending.push(d);
    }
    if (pending.length === 0) return;
    void (async () => {
      const { default: mermaid } = await import('mermaid');
      if (gone) return;
      if (mermaidLook !== look) {
        mermaid.initialize(mermaidConfig());
        mermaidLook = look;
      }
      for (const d of pending) {
        try {
          const { svg } = await mermaid.render(`mermaid-${++drawn}`, d.source);
          diagrams.set(`${look}\n${d.source}`, svg);
          if (gone) return;
          d.at.replaceWith(diagram(svg, d.source, look));
        } catch {
          if (gone) return;
          const pre = document.createElement('pre');
          const code = document.createElement('code');
          code.textContent = d.source;
          pre.append(code);
          pre.classList.add('diagram-error');
          d.at.replaceWith(pre);
        }
      }
    })();
    return () => {
      gone = true;
    };
  });

  /** A drawn diagram, carrying its source and look so it can be drawn again when the look changes. */
  function diagram(svg: string, source: string, look: string): HTMLElement {
    const figure = document.createElement('figure');
    figure.className = 'diagram';
    figure.dataset.source = source;
    figure.dataset.look = look;
    figure.innerHTML = svg;
    return figure;
  }

  /** Mermaid in the app's colours, read from the tokens. A diagram can't change them (or add CSS) from its own text. */
  function mermaidConfig() {
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
    return {
      startOnLoad: false,
      securityLevel: 'strict' as const,
      secure: [
        'secure',
        'securityLevel',
        'startOnLoad',
        'maxTextSize',
        'suppressErrorRendering',
        'maxEdges',
        'theme',
        'themeCSS',
        'themeVariables',
        'darkMode',
        'fontFamily',
        'altFontFamily',
      ],
      theme: 'base' as const,
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
