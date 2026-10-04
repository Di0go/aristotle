<script lang="ts">
  import { feed } from '../lib/feed.svelte.ts';
  import { link } from '../lib/router.svelte.ts';
  import { duration, formatDay, formatTime, plural } from '../lib/format.ts';
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
    <h1>Log</h1>
    <p>Every session, newest first.</p>
  </header>

  {#if sessions === null}
    <p class="muted">Loading…</p>
  {:else if sessions.length === 0}
    <div class="empty">
      <h1>No sessions yet</h1>
      <p>They appear here as soon as you start one.</p>
    </div>
  {:else}
    {#each days as d (d.day)}
      <section class="log-day">
        <h2 class="section-title">{d.day}</h2>
        <ul class="session-list">
          {#each d.sessions as s (s.id)}
            <li>
              <a class="card session-row" href={link.session(s.id)}>
                <span class="when">{formatTime(s.startedAt)}</span>
                <span class="what">
                  <strong>{s.topic}</strong>
                  <span>{s.goal}</span>
                  {#if s.handoff}<span class="muted">Next: {s.handoff.next}</span>{/if}
                </span>
                <span class="stats muted">
                  {duration(s.startedAt, s.lastAt)}
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
