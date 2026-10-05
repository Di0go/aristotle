<script lang="ts">
  // The log: every session, grouped by day, each linking to its full record.
  import { feed } from '../lib/feed.svelte.ts';
  import { link } from '../lib/router.svelte.ts';
  import { formatDay, formatTime, plural } from '../lib/format.ts';
  import type { SessionSummary } from '../../../shared/types.ts';

  let sessions = $state<SessionSummary[] | null>(null);

  $effect(() => {
    void feed.topicVersion;
    void feed.items.length;
    void fetch('/api/sessions')
      .then((r) => r.json())
      .then((s: SessionSummary[]) => (sessions = s));
  });

  const days = $derived.by(() => {
    const out: { day: string; sessions: SessionSummary[] }[] = [];
    for (const s of sessions ?? []) {
      const day = formatDay(s.startedAt);
      if (out.at(-1)?.day === day) out.at(-1)!.sessions.push(s);
      else out.push({ day, sessions: [s] });
    }
    return out;
  });
</script>

<div class="page">
  <header class="page-head">
    <h1 class="page-title">Log</h1>
    <p class="page-lede">Every session, newest first. Open one to reread it.</p>
  </header>

  {#if sessions === null}
    <p class="muted">Loading…</p>
  {:else if sessions.length === 0}
    <div class="empty-state">
      <h2>No sessions yet</h2>
      <p>They appear here as soon as you start one.</p>
    </div>
  {:else}
    {#each days as d (d.day)}
      <section class="log-day">
        <h2 class="section-title">{d.day}</h2>
        <ul class="session-list">
          {#each d.sessions as s (s.id)}
            <li>
              <a class="session-row" href={link.session(s.id)}>
                <span class="when">{formatTime(s.startedAt)}</span>
                <span class="what">
                  <strong>{s.kind === 'train' ? `Training: ${s.topic}` : s.topic}</strong>
                  <span>{s.goal}</span>
                  {#if s.handoff}<span class="muted">Next: {s.handoff.next}</span>{/if}
                </span>
                <span class="stats muted">
                  {s.activeMinutes ? `${s.activeMinutes} min` : 'under a minute'}
                  {#if s.steps}<br />{plural(s.steps, 'step')}{/if}
                  {#if s.quizTotal}<br />quizzes {s.quizRight}/{s.quizTotal}{/if}
                  {#if s.asks}<br />{plural(s.asks, 'written answer')}{/if}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</div>

<style>
  .log-day {
    margin-bottom: 40px;
  }

  .log-day .section-title {
    font-size: 0.9rem;
    margin-bottom: 8px;
    color: var(--graphite);
  }

  .session-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-width: 60rem;
  }

  .session-row {
    display: grid;
    grid-template-columns: 70px minmax(0, 1fr) 150px;
    gap: 20px;
    padding: 18px 0;
    border-top: 1px solid var(--rule);
    color: var(--ink);
    text-decoration: none;
  }

  .session-row:hover strong {
    color: var(--cyan-ink);
  }

  .when {
    font: 0.83rem var(--sans);
    color: var(--graphite);
    padding-top: 3px;
  }

  .what {
    display: grid;
    gap: 3px;
    font: 0.9rem/1.65 var(--sans);
  }

  .what strong {
    font-weight: 560;
    font-size: 0.9rem;
  }

  .what .muted {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    font-size: 0.91rem;
  }

  .stats {
    font-size: 0.78rem;
    line-height: 1.6;
    text-align: right;
  }

  @media (max-width: 700px) {
    .session-row {
      grid-template-columns: 56px minmax(0, 1fr);
    }

    .stats {
      display: none;
    }
  }
</style>
