<script lang="ts">
  import { feed } from '../lib/feed.svelte.ts';
  import { link } from '../lib/router.svelte.ts';
  import { ago, formatDay, formatTime, plural } from '../lib/format.ts';
  import MapGraph from '../lib/MapGraph.svelte';
  import StatusBar from '../lib/StatusBar.svelte';
  import ConceptPanel from '../lib/ConceptPanel.svelte';
  import { isFading, type ConceptStatus, type SessionSummary } from '../../../shared/types.ts';

  let { slug, concept = undefined }: { slug: string; concept?: string } = $props();

  let missing = $state(false);
  let selected = $state<string | null>(null);
  let sessions = $state<SessionSummary[]>([]);

  const topic = $derived(feed.topics[slug] ?? null);
  const counts = $derived.by(() => {
    const c: Record<ConceptStatus, number> = { unknown: 0, shaky: 0, solid: 0 };
    for (const x of topic?.concepts ?? []) c[x.status]++;
    return c;
  });
  const fading = $derived(topic?.concepts.filter((c) => isFading(c)).length ?? 0);
  const chosen = $derived(topic?.concepts.find((c) => c.id === selected) ?? null);
  const groups = $derived(
    (['solid', 'shaky', 'unknown'] as const).map((status) => ({
      status,
      concepts: (topic?.concepts ?? []).filter((c) => c.status === status),
    })),
  );

  $effect(() => {
    selected = concept ?? null;
  });

  $effect(() => {
    missing = false;
    void feed.loadTopic(slug).then((t) => (missing = !t));
  });

  // Load the topics this one borrows prerequisites from, so the map can show them.
  $effect(() => {
    const borrowed = new Set((topic?.concepts ?? []).flatMap((c) => c.deps.filter((d) => d.includes('/')).map((d) => d.split('/')[0])));
    for (const other of borrowed) if (!feed.topics[other]) void feed.loadTopic(other);
  });

  $effect(() => {
    void feed.topicVersion;
    void fetch('/api/sessions')
      .then((r) => r.json())
      .then((all: SessionSummary[]) => (sessions = all.filter((s) => s.topicSlug === slug)));
  });

  function select(id: string | null) {
    selected = id;
    history.replaceState(null, '', link.topic(slug, id ?? undefined));
  }

  const HEADINGS = { solid: 'Solid', shaky: 'Shaky', unknown: 'Not yet' } as const;
</script>

<div class="page topic-page">
  {#if topic}
    <header class="page-head">
      <a class="eyebrow" href={link.topics()}>Topics</a>
      <h1>{topic.title}</h1>
      <p>{topic.goal}</p>
      <div class="topic-stats">
        <StatusBar {counts} {fading} legend />
        <span class="muted">
          {plural(topic.sessions.length, 'session')} · last studied {ago(topic.updated)}{topic.training
            ? ` · training level ${topic.training.level}/10`
            : ''}
        </span>
      </div>
    </header>

    {#if topic.handoff}
      <section class="card handoff">
        <span class="label">Next time</span>
        <p class="next">{topic.handoff.next}</p>
        <p class="muted">Still shaky: {topic.handoff.shaky}</p>
      </section>
    {/if}

    <div class="map-area" class:with-panel={chosen}>
      <section class="card map-card">
        <MapGraph {topic} others={feed.topics} direction="TB" selected={selected} onselect={(id) => select(id === selected ? null : id)} />
        <p class="map-help muted">
          Each arrow runs from a concept to what builds on it. Green is solid, a dotted green outline is solid
          but fading (due for review), amber is shaky, dashed is not yet, and an inner ring marks a goal.
          Concepts from other topics have a grey double outline. Click a concept for its history.
        </p>
      </section>
      {#if chosen}
        <ConceptPanel {topic} concept={chosen} onselect={(id) => select(id)} onclose={() => select(null)} />
      {/if}
    </div>

    {#if topic.concepts.length}
      <section class="concept-lists">
        {#each groups as g (g.status)}
          {#if g.concepts.length}
            <div>
              <h2><i class="dot {g.status}"></i>{HEADINGS[g.status]} <span class="muted">{g.concepts.length}</span></h2>
              <ul>
                {#each g.concepts as c (c.id)}
                  <li>
                    <button class="link-button" onclick={() => select(c.id)}>{c.label}</button>
                    {#if c.summary}<span class="muted"> {c.summary}</span>{/if}
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        {/each}
      </section>
    {/if}

    {#if sessions.length}
      <section>
        <h2 class="section-title">Sessions</h2>
        <ul class="session-list">
          {#each sessions as s (s.id)}
            <li>
              <a class="card session-row" href={link.session(s.id)}>
                <span class="when">{formatDay(s.startedAt)} <span class="muted">{formatTime(s.startedAt)}</span></span>
                <span class="what">{s.goal}</span>
                <span class="stats muted">
                  {s.kind === 'train' ? 'training · ' : ''}{s.activeMinutes ? `${s.activeMinutes} min` : 'under a minute'}{s.quizTotal ? ` · quizzes ${s.quizRight}/${s.quizTotal}` : ''}{s.asks ? ` · ${plural(s.asks, 'written answer')}` : ''}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {:else if missing}
    <div class="empty">
      <h1>No such topic</h1>
      <p><a href={link.topics()}>All topics</a></p>
    </div>
  {:else}
    <p class="muted">Loading…</p>
  {/if}
</div>
