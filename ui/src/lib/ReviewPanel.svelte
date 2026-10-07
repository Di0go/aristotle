<script lang="ts">
  // During a review session: what has been practised so far, and what is still fading.
  import { refetching } from './feed.svelte.ts';
  import { link } from './router.svelte.ts';
  import type { ReviewQueue } from '../../../shared/types.ts';

  const MARK: Record<string, { mark: string; cls: string }> = {
    right: { mark: '✓', cls: 'right' },
    partial: { mark: '~', cls: 'partial' },
    wrong: { mark: '✗', cls: 'wrong' },
  };

  let { onclose }: { onclose: () => void } = $props();

  let queue = $state<ReviewQueue | null>(null);

  // Refetch once the feed settles after a map changes (a review was just recorded) or the session changes.
  refetching(
    async () => (await (await fetch('/api/reviews')).json()) as ReviewQueue,
    (q) => (queue = q),
  );
</script>

<button class="close bench-close" onclick={onclose} aria-label="Close">×</button>
{#if queue}
  {#if queue.practised.length}
    <section class="bench-section">
      <h3 class="bench-title">Practised this session</h3>
      <ul class="plan">
        {#each queue.practised as p (p.topic + p.id)}
          <li>
            <a href={link.topic(p.topic, p.id)}
              ><span class="mark {MARK[p.result]?.cls ?? 'neutral'}">{MARK[p.result]?.mark ?? '·'}</span><span>{p.label}</span></a
            >
          </li>
        {/each}
      </ul>
    </section>
  {/if}
  <section class="bench-section">
    <h3 class="bench-title">Still fading ({queue.fading.length})</h3>
    {#if queue.fading.length}
      <ul class="plan">
        {#each queue.fading as f (f.topic + f.id)}
          <li>
            <a href={link.topic(f.topic, f.id)}>
              <i class="dot fading"></i>
              <span>{f.label} <span class="muted">({f.topicTitle}, ~{Math.round(f.recall * 100)}%)</span></span>
            </a>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted">All caught up. {queue.upcoming ? `${queue.upcoming} come due in the next 7 days.` : ''}</p>
    {/if}
  </section>
{:else}
  <p class="muted">Loading…</p>
{/if}
