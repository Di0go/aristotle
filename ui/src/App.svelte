<script lang="ts">
  import { tick } from 'svelte';
  import { feed } from './lib/feed.svelte.ts';
  import Block from './lib/Block.svelte';
  import Quiz from './lib/Quiz.svelte';
  import Ask from './lib/Ask.svelte';

  feed.start();

  let count = 0;

  // Follow the lesson as it grows, unless the learner has scrolled back up to reread.
  $effect(() => {
    const n = feed.items.length;
    if (n <= count) {
      count = n;
      return;
    }
    const first = count === 0;
    count = n;
    const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 400;
    if (!first && !nearBottom && !feed.pending) return;
    void tick().then(() => {
      const target = feed.pending ? document.getElementById(`item-${feed.pending.id}`) : null;
      if (target) target.scrollIntoView({ behavior: first ? 'instant' : 'smooth', block: 'start' });
      else window.scrollTo({ top: document.body.scrollHeight, behavior: first ? 'instant' : 'smooth' });
    });
  });
</script>

<header class="topbar">
  <div class="brand"><span class="mark" aria-hidden="true"></span>Mind Gym</div>
  {#if feed.session}
    <div class="session">
      <strong>{feed.session.topic}</strong>
      <span>{feed.session.goal}</span>
    </div>
  {/if}
  <div class="status">
    {#if !feed.connected}
      <span class="pill offline">Offline</span>
    {:else if feed.pending}
      <span class="pill your-turn">Your turn</span>
    {/if}
  </div>
</header>

<main>
  {#if feed.items.length === 0}
    <div class="empty">
      <h1>Nothing here yet</h1>
      <p>Open Claude Code in <code>~/Projects/Learn</code> and say what you want to learn.</p>
    </div>
  {:else}
    {#each feed.items as item (item.id)}
      <div id="item-{item.id}" class="item">
        {#if item.type === 'block'}
          <Block {item} />
        {:else if item.type === 'quiz'}
          <Quiz {item} active={feed.pending?.id === item.id} />
        {:else}
          <Ask {item} active={feed.pending?.id === item.id} />
        {/if}
      </div>
    {/each}
    {#if !feed.pending}
      <p class="hint">Questions and comments go to Claude in the terminal.</p>
    {/if}
  {/if}
</main>
