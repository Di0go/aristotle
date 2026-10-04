<script lang="ts">
  import { feed } from '../lib/feed.svelte.ts';
  import { link } from '../lib/router.svelte.ts';
  import { ago, plural } from '../lib/format.ts';
  import StepChart from '../lib/charts/StepChart.svelte';
  import StackedColumns from '../lib/charts/StackedColumns.svelte';
  import TableView from '../lib/charts/TableView.svelte';
  import { longDay, shortDay, weekLabel } from '../lib/charts/scale.ts';
  import type { FadingConcept, Progress } from '../../../shared/types.ts';

  let progress = $state<Progress | null>(null);

  $effect(() => {
    void feed.topicVersion;
    void fetch('/api/progress')
      .then((r) => r.json())
      .then((p: Progress) => (progress = p));
  });

  const solidNow = $derived(progress?.solid.at(-1)?.count ?? 0);
  /** Solid concepts gained over the last seven days. */
  const solidDelta = $derived.by(() => {
    if (!progress) return 0;
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const key = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, '0')}-${String(weekAgo.getDate()).padStart(2, '0')}`;
    const before = [...progress.solid].reverse().find((p) => p.day <= key)?.count ?? 0;
    return solidNow - before;
  });
  const thisWeekMinutes = $derived.by(() => {
    const row = progress?.minutes.at(-1);
    if (!row) return 0;
    const monday = new Date();
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
    return row.week === key ? row.learn + row.review + row.train : 0;
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

  function hours(min: number): string {
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
  }
</script>

<div class="page progress-page">
  <header class="page-head">
    <h1>Progress</h1>
    <p>What you hold, what's fading, and how you've been training.</p>
  </header>

  {#if progress}
    <div class="tiles">
      <div class="card tile">
        <span class="tile-label">Solid concepts</span>
        <span class="tile-value">{solidNow}</span>
        <span class="tile-sub" class:up={solidDelta > 0}>{solidDelta > 0 ? `+${solidDelta}` : 'No change'} in the last 7 days</span>
      </div>
      <div class="card tile">
        <span class="tile-label">Fading now</span>
        <span class="tile-value">{progress.fading.length}</span>
        <span class="tile-sub">{progress.fading.length ? 'Run /review in Claude Code' : 'Nothing to review'}</span>
      </div>
      <div class="card tile">
        <span class="tile-label">Due in the next 7 days</span>
        <span class="tile-value">{progress.upcoming}</span>
        <span class="tile-sub">More come due as you learn</span>
      </div>
      <div class="card tile">
        <span class="tile-label">Time this week</span>
        <span class="tile-value">{hours(thisWeekMinutes)}</span>
        <span class="tile-sub">Active time only</span>
      </div>
    </div>

    <section>
      <h2 class="section-title">Fading</h2>
      {#if fadingByTopic.length === 0}
        <p class="muted">Nothing is fading. {progress.upcoming ? `${plural(progress.upcoming, 'concept')} come due in the next 7 days.` : ''}</p>
      {:else}
        <p class="muted">Solid once, now due for practice. Recalling them just as they fade is what makes them last. Type <code>/review</code> in Claude Code.</p>
        <div class="fading-groups">
          {#each fadingByTopic as g (g.slug)}
            <div class="card fading-group">
              <h3><a href={link.topic(g.slug)}>{g.title}</a></h3>
              <ul>
                {#each g.concepts as f (f.id)}
                  <li>
                    <a href={link.topic(f.topic, f.id)}><i class="dot fading"></i>{f.label}</a>
                    <span class="muted">~{Math.round(f.recall * 100)}% recall{f.lastPractised ? `, practised ${ago(f.lastPractised)}` : ''}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section>
      <h2 class="section-title">Solid concepts over time</h2>
      {#if progress.solid.length >= 2}
        <div class="card chart-card">
          <StepChart points={progress.solid} label="Solid concepts" />
          <TableView columns={['Day', 'Solid concepts']} rows={progress.solid.map((p) => [longDay(p.day), p.count])} />
        </div>
      {:else}
        <p class="muted">The line starts after your second day with the gym.</p>
      {/if}
    </section>

    <div class="chart-pair">
      <section>
        <h2 class="section-title">Answers per week</h2>
        {#if progress.answers.length >= 2}
          <div class="card chart-card">
            <StackedColumns
              label="Answers per week by result"
              series={RESULT_SERIES}
              rows={progress.answers.map((a) => ({ key: a.week, label: shortDay(a.week), values: { right: a.right, partial: a.partial, wrong: a.wrong } }))}
            />
            <TableView
              columns={['Week', 'Right', 'Partly right', "Wrong or didn't know"]}
              rows={progress.answers.map((a) => [weekLabel(a.week), a.right, a.partial, a.wrong])}
            />
          </div>
        {:else}
          <p class="muted">Weekly charts start after your second week.{progress.answers[0] ? ` This week: ${progress.answers[0].right} right, ${progress.answers[0].partial} partly right, ${progress.answers[0].wrong} wrong.` : ''}</p>
        {/if}
      </section>

      <section>
        <h2 class="section-title">Time per week</h2>
        {#if progress.minutes.length >= 2}
          <div class="card chart-card">
            <StackedColumns
              label="Minutes per week by kind of session"
              series={KIND_SERIES}
              unit="min"
              rows={progress.minutes.map((m) => ({ key: m.week, label: shortDay(m.week), values: { learn: m.learn, review: m.review, train: m.train } }))}
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

    {#if progress.training.length}
      <section>
        <h2 class="section-title">Training level</h2>
        <p class="muted">The difficulty <code>/train</code> pitches problems at. It rises as you solve them cleanly.</p>
        <ul class="levels">
          {#each progress.training as t (t.topic)}
            <li>
              <a href={link.topic(t.topic)}>{t.title}</a>
              <span class="meter" role="meter" aria-valuemin="1" aria-valuemax="10" aria-valuenow={t.level} aria-label="Training level for {t.title}">
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
