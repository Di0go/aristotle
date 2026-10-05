<script lang="ts">
  // One Praxis mission: why it matters, what to do, when it's done, the concepts it uses; then his debrief
  // and Claude's review. He writes the debrief here; the review comes back here.
  import { setContext } from 'svelte';
  import { actions } from '../lib/actions.ts';
  import { feed } from '../lib/feed.svelte.ts';
  import { formatDay } from '../lib/format.ts';
  import { markOf, missionSource, SCOPE_LABEL, STATUS_LABEL, STATUS_TONE, splitRef, VERDICT_LABEL } from '../lib/library.ts';
  import { link } from '../lib/router.svelte.ts';
  import Markdown from '../lib/Markdown.svelte';

  let { id }: { id: string } = $props();

  let text = $state('');
  let writing = $state(false);
  let sending = $state(false);
  let error = $state<string | null>(null);

  const mission = $derived(feed.missions?.[id] ?? null);
  /** The roadmap it came from, when it came from one that still exists. */
  const roadmap = $derived(mission?.roadmap ? (feed.roadmaps?.[mission.roadmap] ?? null) : null);
  /** The box is open for a first debrief, or when he chose to write a new one. */
  const boxOpen = $derived(Boolean(mission && mission.status !== 'dropped' && (mission.status === 'open' || writing)));
  /** Its concepts, written "topic/concept" or just "concept" for the mission's own topic, with his mark on each. */
  const concepts = $derived(
    (mission?.concepts ?? []).map((ref) => {
      const { topic = mission?.topic ?? '', concept: id } = splitRef(ref);
      const concept = feed.topics[topic]?.concepts.find((c) => c.id === id);
      return { topic, id, label: concept?.label ?? id, mark: concept ? markOf(concept) : 'unknown' };
    }),
  );

  setContext('topic-slug', () => mission?.topic);

  function rewrite() {
    text = mission?.debrief?.text ?? '';
    writing = true;
  }

  async function send() {
    if (!mission || !text.trim() || sending) return;
    sending = true;
    error = await feed.mission(mission.id, { action: 'debrief', text });
    sending = false;
    if (!error) {
      writing = false;
      text = '';
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void send();
    }
  }

  async function drop(dropped: boolean) {
    if (mission) error = await feed.mission(mission.id, { action: dropped ? 'drop' : 'restore' });
  }
</script>

<div class="page">
  {#if mission}
    <header class="page-head">
      <nav class="crumbs">
        <a href={link.praxis()}>Missions</a><span class="sep">/</span>
        {#if roadmap}
          <a href={link.roadmap(roadmap.slug)}>{roadmap.title}</a><span class="sep">/</span>
        {/if}
        <span>{SCOPE_LABEL[mission.scope]}</span>
      </nav>
      <h1 class="page-title">{mission.title}</h1>
      <p class="page-lede">{mission.why}</p>
      <div class="facts">
        <span class="tag {STATUS_TONE[mission.status]}">{STATUS_LABEL[mission.status]}</span>
        <span><span class="muted">Where</span> {mission.arena}</span>
        <span><span class="muted">From</span> {missionSource(mission, feed.roadmaps ?? {}, feed.topics)}</span>
        <span class="muted">Set {formatDay(mission.created)}</span>
      </div>
    </header>

    <div class="cols">
      <article class="brief">
        <h2 class="section-title">The mission</h2>
        <Markdown source={mission.brief} />

        <h2 class="section-title done-when">Done when</h2>
        <ul class="criteria">
          {#each mission.criteria as c, i (i)}
            <li><span class="box" aria-hidden="true"></span><Markdown source={c} inline /></li>
          {/each}
        </ul>
      </article>

      <aside class="side">
        {#if concepts.length}
          <p class="kicker">Puts to work</p>
          <ul class="concepts">
            {#each concepts as c (`${c.topic}/${c.id}`)}
              <li><a href={link.topic(c.topic, c.id)} data-concept="{c.topic}/{c.id}"><i class="dot {c.mark}"></i>{c.label}</a></li>
            {/each}
          </ul>
        {/if}
        <div class="side-actions">
          {#if mission.status === 'dropped'}
            <button class="ghost small" onclick={() => drop(false)}>Bring it back</button>
          {:else if mission.status !== 'reviewed'}
            <button class="ghost small" onclick={() => drop(true)}>Drop it</button>
          {/if}
        </div>
      </aside>
    </div>

    <section class="debrief">
      <h2 class="section-title">Debrief</h2>
      {#if mission.debrief && !writing}
        <div class="said">
          <p class="kicker">You wrote, {formatDay(mission.debrief.at)}</p>
          <Markdown source={mission.debrief.text} />
        </div>
      {/if}

      {#if boxOpen}
        <p class="muted prompt">
          What did you do, what happened, and against each "done when", where did you land? Numbers, links, file paths and commits help
          Claude check it. What surprised you?
        </p>
        <textarea bind:value={text} onkeydown={onKey} rows="9" placeholder="What happened…"></textarea>
        <footer class="foot">
          {#if error}<span class="error">{error}</span>{/if}
          {#if writing}<button class="ghost" onclick={() => (writing = false)}>Cancel</button>{/if}
          <button class="primary" disabled={!text.trim() || sending} onclick={send}>Send debrief <kbd>Ctrl</kbd><kbd>Enter</kbd></button>
        </footer>
      {:else if mission.status === 'debriefed'}
        <div class="foot">
          <button class="ghost" onclick={rewrite}>Edit</button>
          <button class="primary" onclick={() => actions.reviewMission(mission.id)}>Ask Claude to review it</button>
        </div>
      {/if}

      {#if mission.review && !writing}
        <div class="review verdict-{mission.review.verdict}">
          <p class="kicker">Claude's review, {formatDay(mission.review.at)} · <strong>{VERDICT_LABEL[mission.review.verdict]}</strong></p>
          <Markdown source={mission.review.markdown} />
          {#if mission.status === 'reviewed'}
            <div class="foot"><button class="ghost small" onclick={rewrite}>Try again and write a new debrief</button></div>
          {/if}
        </div>
      {/if}
    </section>
  {:else if feed.missions}
    <div class="empty-state">
      <h2>No such mission</h2>
      <p><a href={link.praxis()}>Back to missions</a></p>
    </div>
  {:else}
    <p class="muted">Loading…</p>
  {/if}
</div>

<style>
  .facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 18px;
    margin-top: 18px;
    font-size: 0.86rem;
  }

  .cols {
    display: grid;
    grid-template-columns: minmax(0, 46rem) minmax(200px, 16rem);
    gap: 48px;
    align-items: start;
  }

  .brief :global(.md) {
    font-size: 1rem;
    line-height: 1.7;
  }

  .done-when {
    margin-top: 32px;
  }

  .criteria {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .criteria li {
    display: flex;
    gap: 12px;
    padding: 7px 0;
    line-height: 1.6;
  }

  .box {
    flex: none;
    width: 14px;
    height: 14px;
    margin-top: 0.3em;
    border: 1.5px solid var(--rule-strong);
    border-radius: 3px;
  }

  .side {
    position: sticky;
    top: 24px;
  }

  .concepts {
    list-style: none;
    margin: 0 0 20px;
    padding: 0;
    font-size: 0.88rem;
  }

  .concepts a {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    color: var(--fg-2);
    text-decoration: none;
  }

  .concepts a:hover {
    color: var(--acc);
  }

  .debrief {
    max-width: 46rem;
    margin-top: 48px;
    padding-top: 28px;
    border-top: 1px solid var(--rule);
  }

  .prompt {
    margin: 0 0 12px;
    font-size: 0.9rem;
    line-height: 1.6;
  }

  textarea {
    width: 100%;
    min-height: 12rem;
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }

  .said {
    margin-bottom: 20px;
  }

  .review {
    margin-top: 28px;
    padding: 4px 0 4px 18px;
    border-left: 2px solid var(--rule-strong);
  }

  .review.verdict-achieved {
    border-left-color: var(--solid);
  }

  .review.verdict-partly {
    border-left-color: var(--shaky);
  }

  .review.verdict-missed {
    border-left-color: var(--wrong);
  }

  .review .foot {
    justify-content: flex-start;
  }

  @media (max-width: 900px) {
    .cols {
      grid-template-columns: minmax(0, 1fr);
      gap: 24px;
    }

    .side {
      position: static;
    }
  }
</style>
