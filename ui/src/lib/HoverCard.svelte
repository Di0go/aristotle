<script lang="ts">
  // One hover card for the whole app: the core's (@organon/core/ui/HoverCard.svelte: point at, or focus, a term with a
  // definition and a small card says what it is, a paragraph per blank line, as wide as it needs up to a limit). What
  // is Aristotle's comes through it: a glossed phrase shows its gloss (with a picture, if it has one), and anything
  // carrying data-concept="topic/id" (links in lessons, the library tree, the outline, the graph) the concept's
  // summary, state, prerequisites and review date. A gloss just asked for is pinned by PinnedGloss.svelte.
  import CoreHoverCard from '@organon/core/ui/HoverCard.svelte';
  import { feed } from './feed.svelte.ts';
  import { formatDay, onDay } from './format.ts';
  import { glossing } from './gloss.svelte.ts';
  import { splitRef } from './library.ts';
  import { renderInline, renderMarkdown } from './markdown.ts';
  import PinnedGloss from './PinnedGloss.svelte';
  import { isFading, type Concept, type Gloss, type Topic } from '../../../shared/types.ts';

  const STATE = { solid: 'Solid', shaky: 'Shaky', unknown: 'Not yet' } as const;

  /** The card an element of Aristotle's gets: "gloss:<id>", "concept:<topic/id>", or "missing:<ref>" for a broken link. */
  function entityOf(el: HTMLElement): string | undefined {
    if (el.matches('.gloss[data-gloss]'))
      return feed.glosses.some((g) => g.id === el.dataset.gloss) ? `gloss:${el.dataset.gloss}` : undefined;
    const ref = el.dataset.concept ?? '';
    if (conceptOf(ref)) return `concept:${ref}`;
    return el.classList.contains('concept-link') ? `missing:${ref}` : undefined;
  }

  function conceptOf(ref: string): { topic: Topic; concept: Concept } | undefined {
    const { topic: slug = '', concept: id } = splitRef(ref);
    const topic = feed.topics[slug];
    const concept = topic?.concepts.find((c) => c.id === id);
    return topic && concept ? { topic, concept } : undefined;
  }

  /** The labels of what a concept builds on, looked up across topics. */
  function deps(topic: Topic, c: Concept): string[] {
    return c.deps.map((d) => {
      const { topic: slug = topic.slug, concept: id } = splitRef(d);
      return feed.topics[slug]?.concepts.find((x) => x.id === id)?.label ?? id;
    });
  }

  /** The state tag's colour: solid or shaky (fading is still solid, as on the map); not-yet stays plain. */
  function tagClass(c: Concept): string {
    return c.status === 'unknown' ? '' : c.status;
  }
</script>

{#snippet glossBody(gloss: Gloss)}
  <p class="hc-title">{gloss.text}</p>
  {#if gloss.image}
    <figure class="hc-image">
      <img src={gloss.image.src} alt={gloss.image.alt} loading="lazy" />
      <figcaption><a href={gloss.image.page} target="_blank" rel="noreferrer">{gloss.image.credit}</a></figcaption>
    </figure>
  {/if}
  <div class="hc-body hc-gloss md-box">{@html renderMarkdown(gloss.gloss)}</div>
  <p class="hc-meta hc-foot">
    <span>Glossed {onDay(gloss.at)}</span>
    <button
      class="link"
      onclick={() => {
        void glossing.remove(gloss.id);
      }}
      title="Forget this gloss: the phrase goes back to plain text">Forget</button
    >
  </p>
{/snippet}

<CoreHoverCard targets=".gloss[data-gloss], [data-concept]" {entityOf} inline={renderInline}>
  {#snippet entity(key: string)}
    {@const kind = key.slice(0, key.indexOf(':'))}
    {@const rest = key.slice(key.indexOf(':') + 1)}
    {#if kind === 'gloss'}
      {@const gloss = feed.glosses.find((g) => g.id === rest)}
      {#if gloss}{@render glossBody(gloss)}{/if}
    {:else if kind === 'concept'}
      {@const found = conceptOf(rest)}
      {#if found}
        {@const card = found}
        {@const c = card.concept}
        {@const fading = isFading(c)}
        <div class="hc-head">
          <p class="hc-title">{c.label}</p>
          <span class="tag {tagClass(c)}">{fading ? 'Fading' : STATE[c.status]}</span>
        </div>
        <p class="hc-where">{card.topic.title}{c.goal ? ' · a goal of this topic' : ''}</p>
        {#if c.summary}<p class="hc-body">{c.summary}</p>{/if}
        {#if c.note && c.status !== 'solid'}<p class="hc-note">{c.note}</p>{/if}
        {#if c.deps.length}<p class="hc-meta">Builds on {deps(card.topic, c).join(', ')}</p>{/if}
        {#if c.status === 'solid' && c.review}
          <p class="hc-meta">{fading ? `Due for review since ${formatDay(c.review.due)}` : `Next review ${onDay(c.review.due)}`}</p>
        {:else if c.evidence.length}
          <p class="hc-meta">Last checked {onDay(c.evidence.at(-1)!.at)}</p>
        {/if}
      {/if}
    {:else}
      <p class="hc-title">{rest.split('/').at(-1)?.replace(/-/g, ' ')}</p>
      <p class="hc-meta">Not on any map yet.</p>
    {/if}
  {/snippet}
</CoreHoverCard>

<PinnedGloss />

<style>
  .hc-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  .hc-title {
    margin: 0;
    font-weight: 600;
    font-size: 0.92rem;
    color: var(--fg);
  }

  .hc-where {
    margin: 0 0 6px;
    font-size: 0.78rem;
    color: var(--faint);
  }

  .hc-body {
    margin: 4px 0 0;
    color: var(--fg-2);
  }

  .hc-note {
    margin: 8px 0 0;
    padding: 6px 10px;
    border-radius: 6px;
    background: var(--shaky-soft);
    color: var(--fg-2);
    font-size: 0.82rem;
  }

  .hc-meta {
    margin: 8px 0 0;
    font-size: 0.78rem;
    color: var(--faint);
  }

  .hc-gloss :global(p) {
    margin: 0 0 6px;
  }

  .hc-gloss :global(p:last-child) {
    margin-bottom: 0;
  }

  .hc-image {
    margin: 8px 0 6px;
  }

  .hc-image img {
    display: block;
    width: 100%;
    max-height: 180px;
    object-fit: contain;
    border-radius: var(--radius);
    background: var(--b1);
  }

  .hc-image figcaption {
    margin-top: 3px;
    font-size: 0.7rem;
    line-height: 1.3;
  }

  .hc-image figcaption a {
    color: var(--faint);
  }

  .hc-foot {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }

  .hc-foot .link {
    font-size: inherit;
    color: var(--faint);
  }

  .hc-foot .link:hover {
    color: var(--fg-2);
  }
</style>
