<script lang="ts">
  // During a review session: what has been practised so far, and what is still fading.
  import { feed } from './feed.svelte.ts';
  import { link } from './router.svelte.ts';
  import type { ReviewQueue } from '../../../shared/types.ts';

  let { onclose }: { onclose: () => void } = $props();

  let queue = $state<ReviewQueue | null>(null);

  $effect(() => {
    void feed.topicVersion;
    void feed.session?.id;
    void fetch('/api/reviews')
      .then((r) => r.json())
      .then((q: ReviewQueue) => (queue = q));
  });

  const MARK: Record<string, { mark: string; cls: string }> = {
    right: { mark: '✓', cls: 'right' },
    partial: { mark: '~', cls: 'partial' },
    wrong: { mark: '✗', cls: 'wrong' },
  };
</script>

<header>
  <a href={link.progress()}>Review</a>
  <button class="close" onclick={onclose} aria-label="Close">×</button>
</header>
{#if queue}
  {#if queue.practised.length}
    <h3 class="panel-title">Practised this session</h3>
    <ul class="review-list">
      {#each queue.practised as p (p.topic + p.id)}
        <li>
          <span class="mark {MARK[p.result]?.cls ?? 'neutral'}">{MARK[p.result]?.mark ?? '·'}</span>
          <a href={link.topic(p.topic, p.id)}>{p.label}</a>
        </li>
      {/each}
    </ul>
  {/if}
  <h3 class="panel-title">Still fading <span class="muted">{queue.fading.length}</span></h3>
  {#if queue.fading.length}
    <ul class="review-list">
      {#each queue.fading as f (f.topic + f.id)}
        <li>
          <i class="dot fading"></i>
          <a href={link.topic(f.topic, f.id)}>{f.label}</a>
          <span class="muted">{f.topicTitle} · ~{Math.round(f.recall * 100)}%</span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted">All caught up. {queue.upcoming ? `${queue.upcoming} come due in the next 7 days.` : ''}</p>
  {/if}
{:else}
  <p class="muted">Loading…</p>
{/if}
