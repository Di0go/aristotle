<script lang="ts">
  import type { Concept, Topic } from '../../../shared/types.ts';
  import { formatDay, formatTime, onDay } from './format.ts';
  import { link } from './router.svelte.ts';

  let {
    topic,
    concept,
    onselect,
    onclose,
  }: { topic: Topic; concept: Concept; onselect: (id: string) => void; onclose: () => void } = $props();

  const WORD = { solid: 'Solid', shaky: 'Shaky', unknown: 'Not yet' } as const;

  const byId = $derived(new Map(topic.concepts.map((c) => [c.id, c])));
  const needs = $derived(concept.deps);
  const leadsTo = $derived(topic.concepts.filter((c) => c.deps.includes(concept.id)));
  const history = $derived([...concept.evidence].reverse());

  const RESULT = {
    right: { mark: '✓', text: 'Right on a quiz' },
    wrong: { mark: '✗', text: 'Wrong on a quiz' },
    'dont-know': { mark: '?', text: "Didn't know on a quiz" },
  } as const;
</script>

<section class="card concept-panel">
  <header>
    <span class="chip {concept.status}">{WORD[concept.status]}</span>
    {#if concept.goal}<span class="chip goal">Goal</span>{/if}
    <button class="close" onclick={onclose} aria-label="Close">×</button>
  </header>
  <h2>{concept.label}</h2>
  {#if concept.summary}<p>{concept.summary}</p>{/if}
  {#if concept.note}<p class="concept-note">{concept.note}</p>{/if}

  {#if needs.length}
    <h3>Builds on</h3>
    <ul class="links">
      {#each needs as id (id)}
        {@const dep = byId.get(id)}
        <li>
          {#if dep}
            <button class="link-button" onclick={() => onselect(id)}><i class="dot {dep.status}"></i>{dep.label}</button>
          {:else if id.includes('/')}
            <a href={link.topic(id.split('/')[0], id.split('/')[1])}>{id}</a>
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
        <li><button class="link-button" onclick={() => onselect(c.id)}><i class="dot {c.status}"></i>{c.label}</button></li>
      {/each}
    </ul>
  {/if}

  <h3>History</h3>
  <ul class="history">
    {#each history as e (e.item)}
      <li>
        <a href={link.session(e.session)}>
          {#if e.kind === 'quiz' && e.result}
            <span class="mark {e.result}">{RESULT[e.result].mark}</span>{RESULT[e.result].text}
          {:else}
            <span class="mark written">✎</span>Wrote an answer
          {/if}
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
