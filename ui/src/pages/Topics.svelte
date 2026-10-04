<script lang="ts">
  import { feed } from '../lib/feed.svelte.ts';
  import { link } from '../lib/router.svelte.ts';
  import { ago, plural } from '../lib/format.ts';
  import StatusBar from '../lib/StatusBar.svelte';
  import StartPanel from '../lib/StartPanel.svelte';
  import type { TopicSummary } from '../../../shared/types.ts';

  let topics = $state<TopicSummary[] | null>(null);
  let adding = $state(false);

  $effect(() => {
    void feed.topicVersion;
    void fetch('/api/topics')
      .then((r) => r.json())
      .then((t: TopicSummary[]) => (topics = t));
  });
</script>

<div class="page">
  <header class="page-head with-action">
    <div>
      <h1>Topics</h1>
      <p>Everything you've worked on, and how much of each map is solid.</p>
    </div>
    <button class="primary" onclick={() => (adding = !adding)} aria-expanded={adding}>New topic</button>
  </header>

  {#if adding || topics?.length === 0}
    <div class="start-wrap"><StartPanel compact onstarted={() => (adding = false)} /></div>
  {/if}

  {#if topics === null}
    <p class="muted">Loading…</p>
  {:else if topics.length}
    <div class="topic-grid">
      {#each topics as t (t.slug)}
        {@const total = t.counts.solid + t.counts.shaky + t.counts.unknown}
        <a class="card topic-card" href={link.topic(t.slug)}>
          <h2>{t.title}</h2>
          <p class="goal">{t.goal}</p>
          <StatusBar counts={t.counts} fading={t.fading} />
          <p class="meta">
            {t.counts.solid}/{total} solid{t.fading ? ` (${t.fading} fading)` : ''} · {plural(t.sessions, 'session')} · {ago(t.updated)}{t.trainingLevel ? ` · level ${t.trainingLevel}` : ''}
          </p>
          {#if t.handoff}<p class="next"><span class="label">Next</span> {t.handoff.next}</p>{/if}
        </a>
      {/each}
    </div>
  {/if}
</div>
