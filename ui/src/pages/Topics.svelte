<script lang="ts">
  import { feed } from '../lib/feed.svelte.ts';
  import { link } from '../lib/router.svelte.ts';
  import { ago, plural } from '../lib/format.ts';
  import StatusBar from '../lib/StatusBar.svelte';
  import type { TopicSummary } from '../../../shared/types.ts';

  let topics = $state<TopicSummary[] | null>(null);

  $effect(() => {
    void feed.topicVersion;
    void fetch('/api/topics')
      .then((r) => r.json())
      .then((t: TopicSummary[]) => (topics = t));
  });
</script>

<div class="page">
  <header class="page-head">
    <h1>Topics</h1>
    <p>Everything you've worked on, and how much of each map is solid.</p>
  </header>

  {#if topics === null}
    <p class="muted">Loading…</p>
  {:else if topics.length === 0}
    <div class="empty">
      <h1>No topics yet</h1>
      <p>Start one from Claude Code: <code>/teach</code> and whatever you want to learn.</p>
    </div>
  {:else}
    <div class="topic-grid">
      {#each topics as t (t.slug)}
        {@const total = t.counts.solid + t.counts.shaky + t.counts.unknown}
        <a class="card topic-card" href={link.topic(t.slug)}>
          <h2>{t.title}</h2>
          <p class="goal">{t.goal}</p>
          <StatusBar counts={t.counts} />
          <p class="meta">
            {t.counts.solid}/{total} solid · {plural(t.sessions, 'session')} · {ago(t.updated)}
          </p>
          {#if t.handoff}<p class="next"><span class="label">Next</span> {t.handoff.next}</p>{/if}
        </a>
      {/each}
    </div>
  {/if}
</div>
