<script lang="ts">
  // The interactive figures made for a topic, at the top of its class: closed until he opens one, and
  // open any time, before, during or after a lesson.
  import type { Component } from 'svelte';
  import { explorablesFor } from './explorables/index.ts';

  let { topic }: { topic: string } = $props();

  const items = $derived(explorablesFor(topic));
  let open = $state<Record<string, boolean>>({});
</script>

{#if items.length}
  <section class="explore" aria-label="Interactive figures">
    <p class="explore-h">Explore <span class="muted">interactive figures for this class</span></p>
    {#each items as e (e.id)}
      <details class="explore-item" ontoggle={(ev) => (open = { ...open, [e.id]: (ev.currentTarget as HTMLDetailsElement).open })}>
        <summary>
          <span class="t">{e.title}</span>
          <span class="b">{e.blurb}</span>
        </summary>
        {#if open[e.id]}
          {#await e.load()}
            <div class="figure-loading"></div>
          {:then m}
            {@const Figure = m.default as Component<{ spec: Record<string, unknown> }>}
            <Figure spec={{}} />
          {/await}
        {/if}
      </details>
    {/each}
  </section>
{/if}

<style>
  .explore {
    max-width: var(--measure);
    margin: 0 auto 72px;
  }

  .explore-h {
    margin: 0 0 12px;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--fg-2);
  }

  .explore-h .muted {
    font-weight: 400;
    margin-left: 6px;
  }

  .explore-item {
    border-top: 1px solid var(--rule);
  }

  .explore-item:last-child {
    border-bottom: 1px solid var(--rule);
  }

  summary {
    display: grid;
    gap: 2px;
    padding: 14px 4px 14px 28px;
    position: relative;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  summary::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 21px;
    width: 7px;
    height: 7px;
    border-right: 1.5px solid var(--muted);
    border-bottom: 1.5px solid var(--muted);
    transform: rotate(-45deg);
    transition: transform 0.15s var(--ease);
  }

  details[open] summary::before {
    transform: rotate(45deg);
  }

  summary:hover .t {
    color: var(--acc);
  }

  .t {
    font-weight: 600;
  }

  .b {
    font-size: 0.88rem;
    color: var(--muted);
  }

  details[open] :global(.kit) {
    margin-top: 4px;
  }
</style>
