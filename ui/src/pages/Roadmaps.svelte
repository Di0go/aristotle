<script lang="ts">
  // The library: what you have, at a glance. Roadmaps as compact cards (progress per step, the next step),
  // then every topic in one table you can filter and sort. New roadmaps and topics start from the header.
  import { actions } from '../lib/actions.ts';
  import { claude } from '../lib/claude.svelte.ts';
  import { feed } from '../lib/feed.svelte.ts';
  import { ago, plural } from '../lib/format.ts';
  import { countsOf, placeOf, stepsOf } from '../lib/library.ts';
  import { link } from '../lib/router.svelte.ts';
  import StatusBar from '../lib/StatusBar.svelte';
  import type { Topic } from '../../../shared/types.ts';

  type Sort = 'recent' | 'name' | 'progress';
  const SORTS: [Sort, string][] = [
    ['recent', 'Recent'],
    ['name', 'Name'],
    ['progress', 'Progress'],
  ];

  /** The words on the form for each thing he can start. */
  const MAKER = {
    roadmap: {
      title: 'Plan a course',
      help: 'Name a field or a big goal. Claude asks what you want from it, checks the field, and drafts its classes on the course page for you to change. Nothing is taught until you approve it.',
      what: 'e.g. sports psychology',
      whatLabel: 'Field or goal',
      goal: 'Where you want to end up (optional)',
      submit: 'Plan it',
    },
    topic: {
      title: 'Start a class',
      help: 'One subject, taught straight away. It starts with the big picture, then finds where your knowledge ends.',
      what: 'e.g. how sleep consolidates memory',
      whatLabel: 'Subject',
      goal: 'What you want to be able to do (optional)',
      submit: 'Start',
    },
  } as const;

  let making = $state<'roadmap' | 'topic' | null>(null);
  let what = $state('');
  let goal = $state('');
  let filter = $state('');
  let sort = $state<Sort>('recent');
  let input = $state<HTMLInputElement>();

  const q = $derived(filter.trim().toLowerCase());
  /** The topic of the lesson running right now, if any. */
  const roadmaps = $derived(
    feed.roadmapList.filter((r) => !q || r.title.toLowerCase().includes(q) || r.steps.some((s) => s.title.toLowerCase().includes(q))),
  );
  const topics = $derived.by(() => {
    const list = Object.values(feed.topics).filter(
      (t) => !q || t.title.toLowerCase().includes(q) || t.concepts.some((c) => c.label.toLowerCase().includes(q)),
    );
    const share = (t: Topic) => {
      const c = countsOf(t);
      return c.total ? c.solid / c.total : 0;
    };
    return list.sort((a, b) =>
      sort === 'name' ? a.title.localeCompare(b.title) : sort === 'progress' ? share(b) - share(a) : b.updated.localeCompare(a.updated),
    );
  });
  const totals = $derived.by(() => {
    let concepts = 0;
    let solid = 0;
    for (const t of Object.values(feed.topics)) {
      const c = countsOf(t);
      concepts += c.total;
      solid += c.solid;
    }
    return { concepts, solid };
  });

  function open(kind: 'roadmap' | 'topic') {
    making = making === kind ? null : kind;
    what = '';
    goal = '';
    queueMicrotask(() => input?.focus());
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!what.trim()) {
      input?.focus();
      return;
    }
    if (making === 'roadmap') actions.planRoadmap(what, goal);
    else actions.learn(what, goal);
    making = null;
  }

  /** The tooltip on one step of a card's strip. */
  function stepTip(s: ReturnType<typeof stepsOf>[number]): string {
    const state = s.state === 'not-started' ? 'not started' : s.state === 'started' ? `${s.counts.solid}/${s.counts.total} solid` : 'done';
    return `${s.index + 1}. ${s.title}: ${state}`;
  }
</script>

<div class="page library">
  <!-- Header, and the form for a new roadmap or topic -->
  <header class="lib-head">
    <div>
      <h1 class="page-title">Library</h1>
      <p class="lib-count">
        {plural(feed.roadmapList.length, 'course')} · {plural(Object.keys(feed.topics).length, 'class', 'classes')} started · {totals.solid} of
        {plural(totals.concepts, 'concept')} solid
      </p>
    </div>
    <div class="lib-actions">
      <button class="ghost" class:on={making === 'topic'} onclick={() => open('topic')} aria-expanded={making === 'topic'}>New class</button
      >
      <button class="primary" class:on={making === 'roadmap'} onclick={() => open('roadmap')} aria-expanded={making === 'roadmap'}
        >Plan a course</button
      >
    </div>
  </header>

  {#if making}
    {@const m = MAKER[making]}
    <form class="maker" onsubmit={submit}>
      <p class="maker-h">{m.title}</p>
      <p class="maker-help muted">{m.help}</p>
      <div class="maker-row">
        <input class="field" bind:this={input} bind:value={what} autocomplete="off" placeholder={m.what} aria-label={m.whatLabel} />
        <input class="field" bind:value={goal} autocomplete="off" placeholder={m.goal} aria-label="Goal" />
        <button class="primary" type="submit">{m.submit}</button>
      </div>
      <p class="maker-foot muted">
        {claude.running ? 'Claude switches to it.' : 'Starts Claude here.'}
        <button type="button" class="link" onclick={() => (making = null)}>Cancel</button>
      </p>
    </form>
  {/if}

  <div class="lib-tools">
    <input class="field filter" type="search" bind:value={filter} placeholder="Filter courses, classes and concepts" aria-label="Filter" />
  </div>

  <!-- Roadmaps -->
  <section class="lib-section">
    <div class="sec-head">
      <h2 class="section-title">Courses</h2>
      <span class="muted">{roadmaps.length}</span>
    </div>
    {#if feed.roadmaps === null}
      <p class="muted">Loading…</p>
    {:else if roadmaps.length}
      <ul class="cards">
        {#each roadmaps as r (r.slug)}
          {@const steps = stepsOf(r, feed.topics)}
          {@const done = steps.filter((s) => s.state === 'done').length}
          {@const next = steps.find((s) => s.state !== 'done')}
          <li class="card-r">
            <div class="card-top">
              <a class="card-title" href={link.roadmap(r.slug)}>{r.title}</a>
              {#if r.status === 'draft'}<span class="tag">draft</span>{:else}<span class="card-n">{done}/{steps.length}</span>{/if}
            </div>
            <p class="card-goal">{r.goal}</p>
            <ol class="strip" aria-label="Classes">
              {#each steps as s (s.index)}
                <li class={s.state} title={stepTip(s)}>
                  {#if s.state === 'started' && s.counts.total}<i style:width="{(s.counts.solid / s.counts.total) * 100}%"></i>{/if}
                </li>
              {/each}
            </ol>
            <div class="card-foot">
              {#if r.status === 'draft'}
                <span class="muted">Still being planned</span>
                <a class="ghost small" href={link.roadmap(r.slug)}>Open</a>
              {:else if next}
                <a class="card-next" href={link.lesson(next.slug)}><span class="muted">Next</span> {next.index + 1} · {next.title}</a>
                <a class="primary small" href={link.lesson(next.slug)}>Go</a>
              {:else}
                <span class="muted">Every class done</span>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {:else if q}
      <p class="muted">No course matches “{filter}”.</p>
    {:else}
      <p class="muted empty-line">
        No courses yet. <button class="link" onclick={() => open('roadmap')}>Plan your first</button>: tell Claude what you want to get good
        at and plan the path together.
      </p>
    {/if}
  </section>

  <!-- Topics -->
  <section class="lib-section">
    <div class="sec-head">
      <h2 class="section-title">Classes</h2>
      <span class="muted">{topics.length}</span>
      <div class="sort" role="group" aria-label="Sort classes">
        {#each SORTS as [k, label] (k)}
          <button class:on={sort === k} onclick={() => (sort = k)}>{label}</button>
        {/each}
      </div>
    </div>
    {#if topics.length}
      <div class="table-wrap">
        <table class="topics">
          <thead>
            <tr><th>Class</th><th>Course</th><th>Progress</th><th class="r">Last studied</th></tr>
          </thead>
          <tbody>
            {#each topics as t (t.slug)}
              {@const c = countsOf(t)}
              {@const place = placeOf(t.slug, feed.roadmapList)}
              <tr>
                <td>
                  <a class="t-name" href={link.lesson(t.slug)}>{t.title}</a>
                  {#if feed.liveSlug === t.slug}<span class="live">being taught now</span>{/if}
                </td>
                <td class="muted"
                  >{#if place}<a href={link.roadmap(place.roadmap.slug)}>{place.roadmap.title}</a>, topic {place.index + 1}{:else}—{/if}</td
                >
                <td>
                  <div class="t-prog">
                    <StatusBar counts={c} fading={c.fading} />
                    <span class="muted">{c.solid}/{c.total}{c.fading ? `, ${c.fading} fading` : ''}</span>
                  </div>
                </td>
                <td class="r muted">{ago(t.updated)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if q}
      <p class="muted">No class matches “{filter}”.</p>
    {:else}
      <p class="muted empty-line">
        No classes yet. Start one from a course, or <button class="link" onclick={() => open('topic')}>start a class</button> on its own.
      </p>
    {/if}
  </section>
</div>

<style>
  .lib-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
  }

  .lib-count {
    margin: 6px 0 0;
    font-size: 0.88rem;
    color: var(--muted);
  }

  .lib-actions {
    display: flex;
    gap: 8px;
  }

  .maker {
    margin-bottom: 28px;
    padding: 18px 20px;
    background: var(--b1);
    border-radius: var(--radius-lg);
  }

  .maker-h {
    margin: 0;
    font-weight: 600;
  }

  .maker-help {
    margin: 4px 0 12px;
    font-size: 0.88rem;
    line-height: 1.5;
    max-width: 60ch;
  }

  .maker-row {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) auto;
    gap: 8px;
  }

  .maker-foot {
    margin: 10px 0 0;
    font-size: 0.8rem;
  }

  @media (max-width: 720px) {
    .maker-row {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .lib-tools {
    margin-bottom: 30px;
  }

  .filter {
    max-width: 380px;
    padding: 8px 12px;
    font-size: 0.9rem;
    background: var(--b1);
    border-color: var(--rule);
  }

  .lib-section {
    margin-bottom: 44px;
  }

  .sec-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 14px;
  }

  .sec-head .section-title {
    margin: 0;
  }

  .sec-head .muted {
    font-size: 0.85rem;
  }

  .sort {
    display: flex;
    gap: 2px;
    margin-left: auto;
    padding: 2px;
    background: var(--b1);
    border-radius: var(--radius);
  }

  .sort button {
    padding: 3px 10px;
    border: 0;
    border-radius: 5px;
    background: none;
    font-size: 0.8rem;
    color: var(--muted);
    cursor: pointer;
  }

  .sort button.on {
    background: var(--b0);
    color: var(--fg);
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
  }

  .cards {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr));
    gap: 14px;
    margin: 0;
    padding: 0;
  }

  .card-r {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 18px;
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    transition: border-color 0.15s;
  }

  .card-r:hover {
    border-color: var(--rule-strong);
  }

  .card-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  .card-title {
    color: var(--fg);
    font-weight: 600;
    font-size: 1.02rem;
  }

  .card-n {
    font-size: 0.8rem;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }

  .card-goal {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    margin: 0;
    font-size: 0.86rem;
    line-height: 1.5;
    color: var(--muted);
  }

  .strip {
    list-style: none;
    display: flex;
    gap: 3px;
    margin: 0;
    padding: 0;
  }

  .strip li {
    position: relative;
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--b2);
    overflow: hidden;
  }

  .strip li.started {
    background: color-mix(in srgb, var(--acc) 25%, var(--b2));
  }

  .strip li.started i {
    position: absolute;
    inset: 0 auto 0 0;
    background: var(--acc);
  }

  .strip li.done {
    background: var(--acc);
  }

  .card-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 0.85rem;
  }

  .card-next {
    color: var(--fg);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .table-wrap {
    overflow-x: auto;
  }

  .topics {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .topics th {
    padding: 0 12px 8px 0;
    text-align: left;
    font-weight: 500;
    font-size: 0.78rem;
    color: var(--faint);
    border-bottom: 1px solid var(--rule);
  }

  .topics td {
    padding: 11px 12px 11px 0;
    border-bottom: 1px solid var(--rule);
    vertical-align: middle;
  }

  .topics tr:hover td {
    background: color-mix(in srgb, var(--hover) 50%, transparent);
  }

  .topics .r {
    text-align: right;
    padding-right: 0;
    white-space: nowrap;
  }

  .t-name {
    color: var(--fg);
    font-weight: 500;
  }

  .live {
    margin-left: 8px;
    font-size: 0.75rem;
    color: var(--acc);
  }

  .t-prog {
    display: grid;
    grid-template-columns: minmax(80px, 160px) auto;
    align-items: center;
    gap: 10px;
    font-size: 0.8rem;
  }

  .empty-line {
    font-size: 0.9rem;
  }
</style>
