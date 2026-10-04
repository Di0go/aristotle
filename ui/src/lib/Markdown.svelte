<script lang="ts">
  import { getContext, mount, unmount } from 'svelte';
  import { feed } from './feed.svelte.ts';
  import { link } from './router.svelte.ts';
  import { EXPLORABLES, explorable } from './explorables/index.ts';
  import { renderMarkdown, renderInline } from './markdown.ts';
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

  let { source, inline = false }: { source: string; inline?: boolean } = $props();

  const html = $derived(inline ? renderInline(source) : renderMarkdown(source));
  let el = $state<HTMLElement>();

  let diagramCount = 0;

  /** The topic a lesson's text belongs to, so a bare [[concept]] can be found. */
  const topicOf = getContext<(() => string | undefined) | undefined>('topic-slug');

  // Point [[concept]] links at their concept, label them with its name, and mark the ones not on any map.
  $effect(() => {
    void html;
    const topics = feed.topics;
    for (const a of el?.querySelectorAll<HTMLAnchorElement>('a.concept-link') ?? []) {
      const ref = a.dataset.ref ?? a.dataset.concept ?? '';
      a.dataset.ref = ref;
      const [slug, id] = ref.includes('/') ? ref.split('/') : [topicOf?.() ?? feed.session?.topicSlug ?? '', ref];
      const concept = topics[slug]?.concepts.find((c) => c.id === id);
      a.dataset.concept = `${slug}/${id}`;
      a.href = link.topic(slug, id);
      a.classList.toggle('missing', !concept);
      if (!a.dataset.label) a.textContent = concept?.label ?? id.replace(/-/g, ' ');
    }
  });

  // Step-through sequences, explorables and the visual kit's figures become live components.
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
        host.className = '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      frame.append(tools);
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
</script>

{#if inline}
  <span class="md-inline">{@html html}</span>
{:else}
  <div class="md" bind:this={el}>{@html html}</div>
{/if}
