<script lang="ts">
  // The panel beside a step, in plain words: what this step teaches, what it builds on (and whether he holds those),
  // what it leads to; then his own notebook for the step, kept with it. It folds away to give the step the width.
  import { bench } from './bench.svelte.ts';
  import { feed } from './feed.svelte.ts';
  import { markOf, splitRef } from './library.ts';
  import { link } from './router.svelte.ts';
  import { pageLabel, type ClassPage } from './steps.ts';
  import type { Concept, Topic } from '../../../shared/types.ts';

  let { topic, page = null, onclose }: { topic: Topic; page?: ClassPage | null; onclose?: () => void } = $props();

  type Ref = { slug: string; concept: Concept | null; id: string };

  let text = $state('');
  let saved = $state<'saved' | 'saving' | ''>('');
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** The step this notebook belongs to, so a late save never lands on the next step's page. */
  let shownFor = '';

  /** The step's own block: its concept, and the id its notes are kept under. */
  const block = $derived(page?.items.find((i) => i.type === 'block' && i.kind === 'step') ?? null);
  const stepId = $derived(block?.id ?? '');
  /** What this step teaches: the concept its block names, or the one the class is on. */
  const taught = $derived.by((): Concept | null => {
    const ref = block && block.type === 'block' ? block.concept : undefined;
    const id = ref ? splitRef(ref).concept : topic.focus;
    return topic.concepts.find((c) => c.id === id) ?? null;
  });
  const buildsOn = $derived(taught ? taught.deps.map(resolve) : []);
  const leadsTo = $derived(
    taught
      ? topic.concepts.filter((c) =>
          c.deps.some((d) => {
            const r = resolve(d);
            return r.slug === topic.slug && r.id === taught.id;
          }),
        )
      : [],
  );
  const note = $derived(feed.notes.find((n) => n.topic === topic.slug && n.step === stepId) ?? null);

  // The notebook shows what is saved for this step, until he starts typing in it.
  $effect(() => {
    const key = `${topic.slug}/${stepId}`;
    if (key !== shownFor) {
      clearTimeout(timer);
      shownFor = key;
      text = note?.text ?? '';
      saved = '';
    }
  });

  /** A dependency, "id" in this class or "class/id" in another, with its concept when it is on a map. */
  function resolve(dep: string): Ref {
    const { topic: slug = topic.slug, concept: id } = splitRef(dep);
    return { slug, id, concept: feed.topics[slug]?.concepts.find((c) => c.id === id) ?? null };
  }

  /** Saved a moment after he stops typing. */
  function onInput() {
    saved = 'saving';
    clearTimeout(timer);
    const [slug, step, body] = [topic.slug, stepId, text];
    const title = page ? `${pageLabel(page)}${page.title ? ` · ${page.title}` : ''}` : undefined;
    timer = setTimeout(async () => {
      await fetch('/api/notes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: slug, step, text: body, title }),
      });
      if (shownFor === `${slug}/${step}`) saved = 'saved';
    }, 600);
  }
</script>

<div class="bench-inner">
  <div class="panel-head">
    {#if onclose}<button class="close bench-close" onclick={onclose} aria-label="Close">×</button>{/if}
    <button class="link fold" onclick={() => bench.toggle(true)} title="Hide this panel">Hide »</button>
  </div>

  {#if taught}
    <section class="bench-section">
      <h3 class="bench-title">This step teaches</h3>
      <p class="taught"><a href={link.topic(topic.slug, taught.id)} data-concept="{topic.slug}/{taught.id}">{taught.label}</a></p>
      {#if taught.summary}<p class="taught-sum">{taught.summary}</p>{/if}
    </section>

    {#if buildsOn.length}
      <section class="bench-section">
        <h3 class="bench-title">It builds on</h3>
        <ul class="chips">
          {#each buildsOn as d (`${d.slug}/${d.id}`)}
            {@const mark = d.concept ? markOf(d.concept) : 'unknown'}
            <li>
              <a
                class="chip {mark}"
                href={link.topic(d.slug, d.id)}
                data-concept="{d.slug}/{d.id}"
                title={mark === 'solid' ? 'You hold this' : 'Not solid yet'}>{d.concept?.label ?? d.id.replace(/-/g, ' ')}</a
              >
            </li>
          {/each}
        </ul>
        <p class="legend">Green: you hold it.</p>
      </section>
    {/if}

    {#if leadsTo.length}
      <section class="bench-section">
        <h3 class="bench-title">It leads to</h3>
        <ul class="chips">
          {#each leadsTo as c (c.id)}
            <li><a class="chip {markOf(c)}" href={link.topic(topic.slug, c.id)} data-concept="{topic.slug}/{c.id}">{c.label}</a></li>
          {/each}
        </ul>
      </section>
    {/if}
  {/if}

  {#if stepId}
    <section class="bench-section">
      <div class="bench-row">
        <h3 class="bench-title">Your notes</h3>
        <span class="bench-count">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : ''}</span>
      </div>
      <textarea
        class="notebook-box"
        bind:value={text}
        oninput={onInput}
        rows="8"
        placeholder="Anything you want to keep from this step, in your words. It stays here, with the step."
        aria-label="Your notes on this step"></textarea>
    </section>
  {/if}
</div>

<style>
  .panel-head {
    display: flex;
    justify-content: flex-end;
    margin: -6px -4px 4px 0;
  }

  .fold {
    font-size: 0.8rem;
    color: var(--faint);
  }

  .fold:hover {
    color: var(--fg);
    text-decoration: none;
  }

  .taught {
    margin: 0;
    font-size: 1.02rem;
    font-weight: 600;
  }

  .taught a {
    color: var(--fg);
    text-decoration: none;
  }

  .taught a:hover {
    color: var(--acc);
  }

  .taught-sum {
    margin: 4px 0 0;
    color: var(--fg-2);
    line-height: 1.55;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .chip {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 99px;
    background: var(--b2);
    color: var(--fg-2);
    font-size: 0.8rem;
    line-height: 1.4;
    text-decoration: none;
  }

  .chip:hover {
    color: var(--fg);
  }

  .chip.solid {
    background: color-mix(in srgb, var(--solid) 16%, transparent);
    color: var(--solid);
  }

  .chip.fading,
  .chip.shaky {
    background: color-mix(in srgb, var(--shaky) 16%, transparent);
    color: var(--shaky);
  }

  .legend {
    margin: 6px 0 0;
    font-size: 0.74rem;
    color: var(--faint);
  }

  .notebook-box {
    width: 100%;
    min-height: 140px;
    resize: vertical;
    padding: 10px 12px;
    background: var(--b0);
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    color: var(--fg);
    font: 0.88rem/1.55 var(--sans);
  }

  .notebook-box:focus {
    outline: none;
    border-color: var(--acc);
  }
</style>
