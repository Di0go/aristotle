<script lang="ts">
  // The class for one topic, open to read: every step, figure and answer from all its sessions, in order.
  // Nothing starts by going here. Claude starts only when he interacts: writes in the box at the foot, or
  // presses Continue. If a lesson on this topic is running right now, this is that live lesson.
  // Each session is split into parts (sections.ts) that fold to one line, with a contents list at the top,
  // so a long class reads as an outline: only where to pick up and the last summary start open.
  import { setContext, tick } from 'svelte';
  import { actions } from '../lib/actions.ts';
  import { claude } from '../lib/claude.svelte.ts';
  import { classes } from '../lib/classes.svelte.ts';
  import { placeFigures } from '../lib/explorables/index.ts';
  import { feed, topicSessions } from '../lib/feed.svelte.ts';
  import { formatDay, formatTime } from '../lib/format.ts';
  import { countsOf, placeOf } from '../lib/library.ts';
  import { link } from '../lib/router.svelte.ts';
  import { openByDefault, sectionsOf, stepsIn } from '../lib/sections.ts';
  import Grip from '../lib/Grip.svelte';
  import LessonBench from '../lib/LessonBench.svelte';
  import LessonPart from '../lib/LessonPart.svelte';
  import Now from './Now.svelte';
  import type { PublicItem, Session } from '../../../shared/types.ts';

  let { slug, part }: { slug: string; part?: string } = $props();

  let sessions = $state<{ session: Session; items: PublicItem[] }[] | null>(null);
  let text = $state('');
  let benchOpen = $state(false);
  /** Which parts are open; set once the class loads, then only by him. */
  let opened = $state<Set<string> | null>(null);
  /** Counts session fetches, so only the latest may write and a slow older reply can't overwrite a newer one. */
  let request = 0;

  const live = $derived(feed.liveSlug === slug);
  const topic = $derived(feed.topics[slug] ?? null);
  const place = $derived(placeOf(slug, feed.roadmapList));
  const step = $derived(place ? place.roadmap.steps[place.index] : null);
  const title = $derived(topic?.title ?? step?.title ?? slug);
  const counts = $derived(countsOf(topic ?? undefined));
  const started = $derived(Boolean(topic));
  /** The "class" line under the title. */
  const classNote = $derived(
    started
      ? `${sessions?.length ?? '…'} ${sessions?.length === 1 ? 'session' : 'sessions'} so far. Reading it starts nothing.`
      : 'Not started yet.',
  );
  /** Each figure placed once, after the first step (in any session) on a concept it explains. */
  const figures = $derived(
    placeFigures(
      slug,
      (sessions ?? []).flatMap((s) => s.items as { id: string; type: string }[]),
    ),
  );
  /** Each session's parts, with steps numbered on across the whole class. */
  const parts = $derived.by(() => {
    let before = 0;
    return (sessions ?? []).map((s) => {
      const sections = sectionsOf(s.items, before);
      before += stepsIn(s.items);
      return { session: s.session, sections };
    });
  });
  const allSections = $derived(parts.flatMap((p) => p.sections));

  setContext('topic-slug', () => slug);

  // Every session on this topic in full, oldest first.
  $effect(() => {
    void feed.topicVersion;
    if (live) return;
    const mine = ++request;
    void (async () => {
      const all = (await topicSessions(slug)).reverse();
      const records = await Promise.all(
        all.map(
          async (s) =>
            (await (await fetch(`/api/sessions/${encodeURIComponent(s.id)}`)).json()) as { session: Session; items: PublicItem[] },
        ),
      );
      if (mine === request) sessions = records.filter((r) => r.session);
    })();
  });

  $effect(() => {
    if (opened === null && sessions) opened = openByDefault(allSections);
  });

  // A part picked in the library tree: open it and bring it into view, here or in the live lesson.
  // Once per pick, so folding and unfolding afterwards never scrolls him back to it.
  let shown: string | undefined;
  $effect(() => {
    if (!part || part === shown) return;
    if (live) {
      shown = part;
      classes.reveal = part;
    } else if (opened && allSections.some((s) => s.key === part)) {
      shown = part;
      void jump(part);
    }
  });

  function isOpen(key: string): boolean {
    return opened?.has(key) ?? false;
  }

  function toggle(key: string) {
    const next = new Set(opened);
    if (!next.delete(key)) next.add(key);
    opened = next;
  }

  function setAll(open: boolean) {
    opened = new Set(open ? allSections.map((s) => s.key) : []);
  }

  /** What a session's divider adds after its date: what kind of sitting it was, unless a plain lesson. */
  function kindNote(kind: Session['kind']): string {
    return kind === 'train' ? ' · training' : kind === 'review' ? ' · review' : '';
  }

  /** From the contents: open the part and bring it into view. */
  async function jump(key: string) {
    if (!isOpen(key)) toggle(key);
    await tick();
    document.getElementById(`part-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Interacting is what starts the class: his words go to Claude as the first thing it hears. */
  function begin(said = '') {
    if (started) actions.continueTopic(slug, said);
    else if (place) actions.startStep(place.roadmap, place.index, said);
    // Neither a topic nor a roadmap step (an old link, or a step since removed): start a lesson on it anyway.
    else actions.learn(title, said);
    text = '';
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      begin(text);
    }
  }
</script>

{#if live}
  <Now />
{:else}
  <div class="lesson" class:with-bench={topic}>
    <div class="lesson-main">
      <!-- Header -->
      <header class="lesson-head">
        <nav class="crumbs" aria-label="Where this is">
          {#if place}
            <a href={link.roadmap(place.roadmap.slug)}>{place.roadmap.title}</a>
            <span class="sep">/</span>
            <span>Step {place.index + 1} of {place.roadmap.steps.length}</span>
          {:else}
            <a href={link.roadmaps()}>Library</a>
          {/if}
        </nav>
        <h1 class="page-title">{title}</h1>
        <dl class="props">
          <dt>class</dt>
          <dd>{classNote}</dd>
          {#if topic?.goal || step?.goal}<dt>goal</dt>
            <dd>{topic?.goal ?? step?.goal}</dd>{/if}
          {#if counts.total}<dt>progress</dt>
            <dd>{counts.solid} of {counts.total} concepts solid</dd>{/if}
        </dl>
        {#if topic}<button class="ghost small bench-toggle" onclick={() => (benchOpen = true)}>Outline and graph</button>{/if}
      </header>

      {#if !started}
        <div class="not-begun">
          {#if step?.why}<p>{step.why}</p>{/if}
          <p class="muted">
            This class hasn't begun. When it does, it opens with the big picture, then finds out what you already know before teaching
            anything.
          </p>
        </div>
      {:else if sessions === null}
        <p class="muted center">Loading the class…</p>
      {:else}
        <!-- Contents -->
        <nav class="contents" aria-label="Contents">
          <div class="contents-head">
            <span>Contents</span>
            <button class="link" onclick={() => setAll(true)}>Open all</button>
            <button class="link" onclick={() => setAll(false)}>Fold all</button>
          </div>
          {#each parts as p, i (p.session.id)}
            {#if parts.length > 1}<p class="contents-session">Session {i + 1}</p>{/if}
            <ol>
              {#each p.sections as sec (sec.key)}
                <li class:todo={sec.checks.unanswered > 0}>
                  <button class="link" onclick={() => jump(sec.key)}>
                    <span class="c-label">{sec.label}</span>{#if sec.title}<span class="c-title">{sec.title}</span>{/if}
                  </button>
                </li>
              {/each}
            </ol>
          {/each}
        </nav>

        <!-- The class, session by session -->
        {#each parts as p, i (p.session.id)}
          <div class="session-divider">
            <span>Session {i + 1}</span>
            <span class="muted">{formatDay(p.session.startedAt)}, {formatTime(p.session.startedAt)}{kindNote(p.session.kind)}</span>
          </div>
          {#each p.sections as sec (sec.key)}
            <LessonPart section={sec} open={isOpen(sec.key)} ontoggle={() => toggle(sec.key)} {figures} />
          {/each}
        {/each}
      {/if}

      <!-- Where he starts or picks it up -->
      <div class="composer resume">
        <p class="resume-h">{started ? 'Pick up the class' : 'Begin the class'}</p>
        {#if topic?.handoff}<p class="resume-next"><span class="muted">Next time:</span> {topic.handoff.next}</p>{/if}
        <div class="composer-row">
          <textarea
            bind:value={text}
            onkeydown={onKey}
            rows="1"
            placeholder={started ? 'Ask about anything above, or just say “go”…' : 'Say what you want from it, or just “go”…'}
            aria-label="Your first words to Claude"></textarea>
          <button class="primary" onclick={() => begin(text)}>{started ? 'Continue' : 'Start'}</button>
        </div>
        {#if feed.starting}
          <p class="composer-off picking-up"><span class="spinner" aria-hidden="true"></span>Claude is picking up the class…</p>
        {:else}
          <p class="composer-off">{claude.running ? 'Claude picks it up from here.' : 'This starts Claude here in Aristotle.'}</p>
        {/if}
      </div>
    </div>

    <!-- Bench -->
    {#if topic}
      <aside class="bench" class:open={benchOpen} aria-label="Where this class sits">
        <LessonBench {topic} onclose={() => (benchOpen = false)} />
        <Grip name="--side-w" side="left" min={220} max={480} initial={280} label="Resize the sidebar" />
      </aside>
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="bench-scrim" class:open={benchOpen} onclick={() => (benchOpen = false)}></div>
    {/if}
  </div>
{/if}

<style>
  .not-begun {
    max-width: var(--measure);
    margin: 0 auto 32px;
    line-height: 1.65;
  }

  .center {
    max-width: var(--measure);
    margin: 0 auto;
  }

  .contents {
    max-width: var(--measure);
    margin: 0 auto 40px;
    font-size: 0.86rem;
  }

  .contents-head {
    display: flex;
    gap: 14px;
    align-items: baseline;
    margin-bottom: 8px;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--muted);
  }

  .contents-head span {
    margin-right: auto;
  }

  .contents-head .link {
    font-weight: 400;
  }

  .contents-session {
    margin: 10px 0 4px;
    font-size: 0.78rem;
    color: var(--faint);
  }

  .contents ol {
    margin: 0;
    padding: 0;
    list-style: none;
    columns: 2 18rem;
    column-gap: 32px;
  }

  .contents li {
    break-inside: avoid;
  }

  .contents li .link {
    display: flex;
    gap: 8px;
    width: 100%;
    padding: 3px 0;
    color: var(--fg-2);
    text-align: left;
    text-decoration: none;
  }

  .contents li .link:hover .c-title {
    color: var(--acc);
  }

  .c-label {
    flex: none;
    min-width: 4.5em;
    color: var(--faint);
  }

  .c-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .contents li.todo .c-label {
    color: var(--acc);
  }

  .picking-up {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .picking-up .spinner {
    width: 12px;
    height: 12px;
  }

  /* On a class you are reading, the box waits at the end instead of following you down the page. */
  .resume {
    position: static;
    margin-top: 24px;
    padding: 28px 0 64px;
    background: none;
    border-top: 1px solid var(--rule);
  }

  .resume-h {
    margin: 0 0 8px;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--fg-2);
  }

  .resume-next {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    margin: 0 0 10px;
    font-size: 0.86rem;
    line-height: 1.55;
    color: var(--fg-2);
  }

  .resume .composer-off {
    margin-top: 6px;
  }
</style>
