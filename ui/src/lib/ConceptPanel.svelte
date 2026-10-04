<script lang="ts">
  import { isFading, type Concept, type Evidence, type Topic } from '../../../shared/types.ts';
  import { feed } from './feed.svelte.ts';
  import { formatDay, formatTime, onDay } from './format.ts';
  import { link } from './router.svelte.ts';

  let {
    topic,
    concept,
    onselect,
    onclose,
  }: { topic: Topic; concept: Concept; onselect: (id: string) => void; onclose: () => void } = $props();

  const byId = $derived(new Map(topic.concepts.map((c) => [c.id, c])));
  const leadsTo = $derived(topic.concepts.filter((c) => c.deps.includes(concept.id)));
  const history = $derived([...concept.evidence].reverse());
  const fading = $derived(isFading(concept));
  const word = $derived(fading ? 'Fading' : { solid: 'Solid', shaky: 'Shaky', unknown: 'Not yet' }[concept.status]);

  function describe(e: Evidence): { mark: string; cls: string; text: string } {
    const r = e.result;
    const cls = r === 'right' ? 'right' : r === 'wrong' ? 'wrong' : r === 'partial' ? 'partial' : 'neutral';
    if (e.kind === 'ask') return { mark: '✎', cls: 'neutral', text: 'Wrote an answer' };
    if (e.kind === 'quiz') {
      const text = r === 'right' ? 'Right on a quiz' : r === 'wrong' ? 'Wrong on a quiz' : "Didn't know on a quiz";
      return { mark: r === 'right' ? '✓' : r === 'wrong' ? '✗' : '?', cls, text };
    }
    const mark = r === 'right' ? '✓' : r === 'partial' ? '~' : '✗';
    if (e.practice === 'problem') {
      const level = e.difficulty ? ` (level ${e.difficulty})` : '';
      const text = r === 'right' ? 'Solved a problem' : r === 'partial' ? 'Partly solved a problem' : 'Missed a problem';
      return { mark, cls, text: text + level };
    }
    return { mark, cls, text: r === 'right' ? 'Recalled it' : r === 'partial' ? 'Partly recalled it' : 'Forgot it' };
  }

  function inDays(iso: string): string {
    const days = Math.round((Date.parse(iso) - Date.now()) / 86_400_000);
    if (days <= 0) return 'due now';
    if (days === 1) return 'tomorrow';
    if (days < 60) return `in ${days} days`;
    return `in ${Math.round(days / 30)} months`;
  }
</script>

<section class="sheet concept-panel">
  <header>
    <span class="tag {fading ? 'solid' : concept.status === 'unknown' ? '' : concept.status}">{word}</span>
    {#if concept.goal}<span class="tag cyan">Goal</span>{/if}
    <button class="close" onclick={onclose} aria-label="Close">×</button>
  </header>
  <h2>{concept.label}</h2>
  {#if concept.summary}<p>{concept.summary}</p>{/if}
  {#if concept.note}<p class="concept-note">{concept.note}</p>{/if}
  {#if concept.status === 'solid' && concept.review}
    <p class="review-line">
      {#if fading}
        Due for review since {formatDay(concept.review.due)}.
      {:else}
        Next review {inDays(concept.review.due)}{concept.review.reps > 1 ? `, after ${concept.review.reps} reviews` : ''}.
      {/if}
    </p>
  {/if}

  {#if concept.deps.length}
    <h3>Builds on</h3>
    <ul class="links">
      {#each concept.deps as id (id)}
        {@const dep = byId.get(id)}
        <li>
          {#if dep}
            <button class="link-button" onclick={() => onselect(id)}><i class="dot {isFading(dep) ? 'fading' : dep.status}"></i>{dep.label}</button>
          {:else if id.includes('/')}
            {@const [slug, cid] = id.split('/')}
            {@const ext = feed.topics[slug]?.concepts.find((c) => c.id === cid)}
            <a href={link.topic(slug, cid)}>
              {#if ext}<i class="dot {isFading(ext) ? 'fading' : ext.status}"></i>{ext.label}{:else}{cid}{/if}
            </a>
            <span class="muted">in {feed.topics[slug]?.title ?? slug}</span>
          {:else}
            <span class="muted">{id}</span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if leadsTo.length}
    <h3>Leads to</h3>
    <ul class="links">
      {#each leadsTo as c (c.id)}
        <li><button class="link-button" onclick={() => onselect(c.id)}><i class="dot {isFading(c) ? 'fading' : c.status}"></i>{c.label}</button></li>
      {/each}
    </ul>
  {/if}

  <h3>History</h3>
  <ul class="history">
    {#each history as e, i (i)}
      {@const d = describe(e)}
      <li>
        <a href={link.session(e.session)}>
          <span class="mark {d.cls}">{d.mark}</span>{d.text}
          <span class="when">{formatDay(e.at)}, {formatTime(e.at)}</span>
        </a>
      </li>
    {/each}
    <li class="muted">
      Added to the map {onDay(concept.firstSeen)}{concept.solidSince && concept.status === 'solid'
        ? `; solid since ${onDay(concept.solidSince).replace(/^on /, '')}`
        : ''}
    </li>
  </ul>
</section>

<style>
  .concept-panel {
    padding: 22px 26px 24px;
  }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  header .close {
    margin-left: auto;
  }

  h2 {
    margin: 10px 0 6px;
    font-size: 1.15rem;
    line-height: 1.2;
  }

  p {
    margin: 0 0 10px;
    font: 0.9rem/1.65 var(--sans);
    color: var(--ink-2);
  }

  .concept-note {
    padding: 10px 14px;
    border-left: 3px solid var(--shaky);
    background: var(--shaky-soft);
    border-radius: 0 var(--radius) var(--radius) 0;
    font-size: 0.95rem;
    color: var(--ink);
  }

  .review-line {
    font: 0.83rem var(--sans);
    color: var(--graphite);
  }

  h3 {
    margin: 20px 0 8px;
    font: 500 0.8rem var(--sans);
    color: var(--graphite);
  }

  .links,
  .history {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .links li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 3px 0;
    font-size: 0.91rem;
  }

  .links :global(.link-button),
  .links a {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .history li {
    font-size: 0.85rem;
  }

  .history li + li {
    margin-top: 2px;
  }

  .history a {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 4px 0;
    color: var(--ink-2);
    text-decoration: none;
  }

  .history a:hover {
    color: var(--ink);
  }

  .history .when {
    margin-left: auto;
    font: 0.72rem var(--sans);
    color: var(--graphite);
  }

  .history li.muted {
    padding-top: 8px;
    font-size: 0.78rem;
  }

  .mark {
    display: inline-block;
    width: 1em;
    font-weight: 600;
    color: var(--graphite);
  }

  .mark.right {
    color: var(--solid);
  }

  .mark.wrong {
    color: var(--wrong);
  }

  .mark.partial {
    color: var(--shaky);
  }
</style>
