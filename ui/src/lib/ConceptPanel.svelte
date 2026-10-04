<script lang="ts">
  import { isFading, type Concept, type Evidence, type Topic } from '../../../shared/types.ts';
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

<section class="card concept-panel">
  <header>
    <span class="chip {fading ? 'fading' : concept.status}">{word}</span>
    {#if concept.goal}<span class="chip goal">Goal</span>{/if}
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
            <a href={link.topic(id.split('/')[0], id.split('/')[1])}>{id.replace('/', ' / ')}</a>
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
