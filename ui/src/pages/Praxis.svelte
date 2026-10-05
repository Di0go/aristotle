<script lang="ts">
  // Praxis: what he learned, put to work. Missions waiting for a review first, then the ones to do, then the
  // closed ones; above them, the finished steps and roadmaps that are ready for a mission.
  import { feed } from '../lib/feed.svelte.ts';
  import { link } from '../lib/router.svelte.ts';
  import { actions } from '../lib/actions.ts';
  import { ago } from '../lib/format.ts';
  import { missionsDue, missionSource, SCOPE_LABEL, VERDICT_LABEL } from '../lib/library.ts';
  import type { Mission, MissionStatus } from '../../../shared/types.ts';

  const missions = $derived(feed.missionList);
  const due = $derived(missionsDue(feed.roadmapList, feed.topics, missions));
  const by = (status: MissionStatus) => missions.filter((m) => m.status === status);

  const SECTIONS = [
    { status: 'debriefed', title: 'Waiting for review', note: 'You reported back. Ask Claude to look at it.' },
    { status: 'open', title: 'To do', note: 'Out there, not in here. Come back with a debrief.' },
    { status: 'reviewed', title: 'Done', note: '' },
  ] as const;
</script>

{#snippet row(m: Mission)}
  <li class="mission {m.status}">
    <a href={link.mission(m.id)}>
      <span class="m-title">{m.title}</span>
      <span class="m-meta">
        <span>{SCOPE_LABEL[m.scope]}</span><span class="sep">·</span><span>{m.arena}</span><span class="sep">·</span><span class="src">{missionSource(m, feed.roadmaps ?? {}, feed.topics)}</span>
      </span>
    </a>
    <span class="m-side">
      {#if m.review}<span class="tag {m.review.verdict === 'achieved' ? 'solid' : m.review.verdict === 'partly' ? 'shaky' : ''}">{VERDICT_LABEL[m.review.verdict]}</span>{/if}
      <span class="muted when">{ago(m.updated)}</span>
    </span>
  </li>
{/snippet}

<div class="page">
  <header class="page-head">
    <h1 class="page-title">Praxis</h1>
    <p class="page-lede">
      What you understand, put to work. Each finished step gets a mission in your own projects, your training or your days (or anywhere, when
      nothing of yours fits), and each roadmap ends with a bigger one. Do it out there, then write what happened.
    </p>
  </header>

  {#if due.length}
    <section class="due">
      <h2 class="section-title">Ready for a mission</h2>
      <ul>
        {#each due as d (`${d.roadmap.slug}:${d.index}`)}
          <li>
            <span class="due-what">
              {#if d.index === null}<span class="tag cyan">Capstone</span> {d.roadmap.title}{:else}<span class="muted">{d.roadmap.title} · step {d.index + 1}</span> {d.title}{/if}
            </span>
            <button class="ghost small" onclick={() => (d.index === null ? actions.capstone(d.roadmap) : actions.stepMission(d.roadmap, d.index!))}>
              Design it with Claude
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if !feed.missions}
    <p class="muted">Loading…</p>
  {:else if missions.length === 0}
    <div class="empty-state">
      <h2>No missions yet</h2>
      <p>
        When every goal concept of a roadmap step is solid, it shows up above, ready for a mission. You can also ask for one at any time: open Claude and
        type <code>/praxis</code> with a topic.
      </p>
    </div>
  {:else}
    {#each SECTIONS as s (s.status)}
      {@const list = by(s.status)}
      {#if list.length}
        <section class="group">
          <h2 class="section-title">{s.title} <span class="count">{list.length}</span></h2>
          {#if s.note}<p class="muted note">{s.note}</p>{/if}
          <ul class="missions">
            {#each list as m (m.id)}{@render row(m)}{/each}
          </ul>
        </section>
      {/if}
    {/each}
    {#if by('dropped').length}
      <details class="group">
        <summary class="muted">Dropped ({by('dropped').length})</summary>
        <ul class="missions">
          {#each by('dropped') as m (m.id)}{@render row(m)}{/each}
        </ul>
      </details>
    {/if}
  {/if}
</div>

<style>
  .due {
    max-width: 52rem;
    margin-bottom: 40px;
    padding: 18px 22px;
    background: var(--b1);
    border-left: 3px solid var(--acc);
    border-radius: 0 var(--radius) var(--radius) 0;
  }

  .due ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .due li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 6px 0;
  }

  .due-what {
    font-size: 0.92rem;
  }

  .group {
    max-width: 52rem;
    margin-bottom: 36px;
  }

  .count {
    margin-left: 6px;
    font-weight: 500;
    font-size: 0.85rem;
    color: var(--faint);
  }

  .note {
    margin: -8px 0 12px;
    font-size: 0.88rem;
  }

  summary {
    cursor: pointer;
    font-size: 0.9rem;
  }

  .missions {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--rule);
  }

  .mission {
    display: flex;
    align-items: center;
    gap: 16px;
    border-bottom: 1px solid var(--rule);
  }

  .mission > a {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 4px;
    color: var(--fg);
    text-decoration: none;
  }

  .mission > a:hover .m-title {
    color: var(--acc);
  }

  .m-title {
    font-weight: 550;
  }

  .m-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 6px;
    font-size: 0.82rem;
    color: var(--muted);
  }

  .m-meta .sep {
    color: var(--faint);
  }

  .m-side {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: none;
  }

  .when {
    font-size: 0.8rem;
  }

  .mission.dropped .m-title {
    color: var(--muted);
    text-decoration: line-through;
  }

  @media (max-width: 640px) {
    .due li,
    .mission {
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }

    .m-side {
      padding: 0 4px 10px;
    }
  }
</style>
