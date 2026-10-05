<script lang="ts">
  // Progress: what is solid over time, activity by week, and what is fading.
  import { actions } from '../lib/actions.ts';
  import { longDay, shortDay, weekLabel } from '../lib/charts/scale.ts';
  import { feed } from '../lib/feed.svelte.ts';
  import { ago, dayKey, plural } from '../lib/format.ts';
  import { link } from '../lib/router.svelte.ts';
  import StackedColumns from '../lib/charts/StackedColumns.svelte';
  import StepChart from '../lib/charts/StepChart.svelte';
  import TableView from '../lib/charts/TableView.svelte';
  import type { FadingConcept, Progress } from '../../../shared/types.ts';

  const RESULT_SERIES = [
    { key: 'right', label: 'Right', color: 'var(--right)' },
    { key: 'partial', label: 'Partly right', color: 'var(--shaky)' },
    { key: 'wrong', label: "Wrong or didn't know", color: 'var(--wrong)' },
  ];
  const KIND_SERIES = [
    { key: 'learn', label: 'Lessons', color: 'var(--series-1)' },
    { key: 'review', label: 'Reviews', color: 'var(--series-2)' },
    { key: 'train', label: 'Training', color: 'var(--series-3)' },
  ];

  let progress = $state<Progress | null>(null);

  const solidNow = $derived(progress?.solid.at(-1)?.count ?? 0);
  /** Solid concepts gained over the last seven days. */
  const solidDelta = $derived.by(() => {
    if (!progress) return 0;
    const key = dayKey(new Date(Date.now() - 7 * 86_400_000));
    const before = [...progress.solid].reverse().find((p) => p.day <= key)?.count ?? 0;
    return solidNow - before;
  });
  /** Minutes this week, counted only if the last row is this week's (weeks start on Monday). */
  const thisWeekMinutes = $derived.by(() => {
    const row = progress?.minutes.at(-1);
    if (!row) return 0;
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return row.week === dayKey(monday) ? row.learn + row.review + row.train : 0;
  });
  const fadingByTopic = $derived.by(() => {
    const groups = new Map<string, { title: string; concepts: FadingConcept[] }>();
    for (const f of progress?.fading ?? []) {
      const g = groups.get(f.topic) ?? { title: f.topicTitle, concepts: [] };
      g.concepts.push(f);
      groups.set(f.topic, g);
    }
    return [...groups].map(([slug, g]) => ({ slug, ...g }));
  });
  /** This week's answers in a sentence, for before there are two weeks to chart. */
  const answersSoFar = $derived.by(() => {
    const a = progress?.answers[0];
    return a ? ` This week: ${a.right} right, ${a.partial} partly right, ${a.wrong} wrong.` : '';
  });

  $effect(() => {
    void feed.topicVersion;
    void fetch('/api/progress')
      .then((r) => r.json())
      .then((p: Progress) => (progress = p));
  });

  function hours(min: number): string {
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
  }
</script>

<div class="page progress-page">
  <header class="page-head">
    <h1 class="page-title">Progress</h1>
    <p class="page-lede">What you hold, what's fading, and how you've been training.</p>
  </header>

  {#if progress}
    <!-- Headline numbers -->
    <div class="tiles">
      <div class="tile">
        <span class="tile-label">Solid concepts</span>
        <span class="tile-value">{solidNow}</span>
        <span class="tile-sub" class:up={solidDelta > 0}>{solidDelta > 0 ? `+${solidDelta}` : 'No change'} in the last 7 days</span>
      </div>
      <div class="tile">
        <span class="tile-label">Fading now</span>
        <span class="tile-value">{progress.fading.length}</span>
        <span class="tile-sub">{progress.fading.length ? 'Due for practice' : 'Nothing to review'}</span>
      </div>
      <div class="tile">
        <span class="tile-label">Due in the next 7 days</span>
        <span class="tile-value">{progress.upcoming}</span>
        <span class="tile-sub">More come due as you learn</span>
      </div>
      <div class="tile">
        <span class="tile-label">Time this week</span>
        <span class="tile-value">{hours(thisWeekMinutes)}</span>
        <span class="tile-sub">Active time only</span>
      </div>
    </div>

    <!-- Fading -->
    <section>
      <h2 class="section-title">Fading</h2>
      {#if fadingByTopic.length === 0}
        <p class="muted">
          Nothing is fading. {progress.upcoming ? `${plural(progress.upcoming, 'concept')} come due in the next 7 days.` : ''}
        </p>
      {:else}
        <div class="fading-intro">
          <p class="muted">Solid once, now due for practice. Recalling them just as they fade is what makes them last.</p>
          <button class="primary" onclick={() => actions.review()}>Review now</button>
        </div>
        <div class="fading-groups">
          {#each fadingByTopic as g (g.slug)}
            <div class="sheet fading-group">
              <h3><a href={link.lesson(g.slug)}>{g.title}</a></h3>
              <ul>
                {#each g.concepts as f (f.id)}
                  <li>
                    <a href={link.topic(f.topic, f.id)}><i class="dot fading"></i>{f.label}</a>
                    <span class="muted"
                      >~{Math.round(f.recall * 100)}% recall{f.lastPractised ? `, practised ${ago(f.lastPractised)}` : ''}</span
                    >
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Charts -->
    <section>
      <h2 class="section-title">Solid concepts over time</h2>
      {#if progress.solid.length >= 2}
        <div class="sheet chart-card">
          <StepChart points={progress.solid} label="Solid concepts" />
          <TableView columns={['Day', 'Solid concepts']} rows={progress.solid.map((p) => [longDay(p.day), p.count])} />
        </div>
      {:else}
        <p class="muted">The line starts after your second day with Aristotle.</p>
      {/if}
    </section>

    <div class="chart-pair">
      <section>
        <h2 class="section-title">Answers per week</h2>
        {#if progress.answers.length >= 2}
          <div class="sheet chart-card">
            <StackedColumns
              label="Answers per week by result"
              series={RESULT_SERIES}
              rows={progress.answers.map((a) => ({
                key: a.week,
                label: shortDay(a.week),
                values: { right: a.right, partial: a.partial, wrong: a.wrong },
              }))}
            />
            <TableView
              columns={['Week', 'Right', 'Partly right', "Wrong or didn't know"]}
              rows={progress.answers.map((a) => [weekLabel(a.week), a.right, a.partial, a.wrong])}
            />
          </div>
        {:else}
          <p class="muted">
            Weekly charts start after your second week.{answersSoFar}
          </p>
        {/if}
      </section>

      <section>
        <h2 class="section-title">Time per week</h2>
        {#if progress.minutes.length >= 2}
          <div class="sheet chart-card">
            <StackedColumns
              label="Minutes per week by kind of session"
              series={KIND_SERIES}
              unit="min"
              rows={progress.minutes.map((m) => ({
                key: m.week,
                label: shortDay(m.week),
                values: { learn: m.learn, review: m.review, train: m.train },
              }))}
            />
            <TableView
              columns={['Week', 'Lessons (min)', 'Reviews (min)', 'Training (min)']}
              rows={progress.minutes.map((m) => [weekLabel(m.week), m.learn, m.review, m.train])}
            />
          </div>
        {:else}
          <p class="muted">Weekly charts start after your second week.</p>
        {/if}
      </section>
    </div>

    <!-- Training levels -->
    {#if progress.training.length}
      <section>
        <h2 class="section-title">Training level</h2>
        <p class="muted">The difficulty <code>/train</code> pitches problems at. It rises as you solve them cleanly.</p>
        <ul class="levels">
          {#each progress.training as t (t.topic)}
            <li>
              <a href={link.lesson(t.topic)}>{t.title}</a>
              <span
                class="meter"
                role="meter"
                aria-valuemin="1"
                aria-valuemax="10"
                aria-valuenow={t.level}
                aria-label="Training level for {t.title}"
              >
                <span style:width="{t.level * 10}%"></span>
              </span>
              <span class="muted">{t.level}/10</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {:else}
    <p class="muted">Loading…</p>
  {/if}
</div>

<style>
  .progress-page section {
    margin-top: 56px;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    border-top: 1.5px solid var(--fg);
    border-bottom: 1px solid var(--rule);
  }

  .tile {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 20px 22px 22px 0;
  }

  .tile + .tile {
    padding-left: 22px;
    border-left: 1px solid var(--rule);
  }

  .tile-label {
    font-size: 0.81rem;
    color: var(--muted);
  }

  .tile-value {
    font: 400 2rem/1.1 var(--sans);
    font-variant-numeric: lining-nums;
    letter-spacing: -0.02em;
  }

  .tile-sub {
    font-size: 0.8rem;
    color: var(--muted);
  }

  .tile-sub.up {
    color: var(--solid);
  }

  .fading-intro {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .fading-intro p {
    margin: 0;
    font-family: var(--sans);
    font-size: 0.9rem;
  }

  .fading-groups {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
    margin-top: 16px;
  }

  .fading-group {
    padding: 18px 22px;
  }

  .fading-group h3 {
    margin: 0 0 10px;
    font-size: 0.9rem;
  }

  .fading-group h3 a,
  .fading-group li a {
    color: var(--fg);
    text-decoration: none;
  }

  .fading-group ul {
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 0.89rem;
  }

  .fading-group li {
    display: flex;
    flex-direction: column;
    padding: 4px 0;
  }

  .fading-group li a {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .fading-group .muted {
    padding-left: 18px;
    font-size: 0.78rem;
  }

  .chart-pair {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr));
    gap: 0 28px;
  }

  .chart-pair > section {
    min-width: 0;
  }

  .chart-card {
    padding: 20px 22px 14px;
  }

  .levels {
    list-style: none;
    max-width: 560px;
    margin: 12px 0 0;
    padding: 0;
  }

  .levels li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 160px 48px;
    align-items: center;
    gap: 14px;
    padding: 6px 0;
  }

  .meter {
    display: block;
    height: 6px;
    background: var(--cyan-soft);
    border-radius: 1px;
    overflow: hidden;
  }

  .meter span {
    display: block;
    height: 100%;
    background: var(--acc);
  }
</style>
