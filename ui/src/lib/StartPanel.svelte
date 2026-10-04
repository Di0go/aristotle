<script lang="ts">
  // Start something without the terminal: a new topic, or carry on with what's there.
  import { actions } from './actions.ts';
  import { claude } from './claude.svelte.ts';
  import { feed } from './feed.svelte.ts';
  import { ago } from './format.ts';
  import type { TopicSummary } from '../../../shared/types.ts';

  let { compact = false, onstarted }: { compact?: boolean; onstarted?: () => void } = $props();

  let topic = $state('');
  let goal = $state('');
  let topics = $state<TopicSummary[]>([]);
  let input = $state<HTMLInputElement>();

  $effect(() => {
    void feed.topicVersion;
    void fetch('/api/topics')
      .then((r) => r.json())
      .then((t: TopicSummary[]) => (topics = t));
  });

  const fading = $derived(topics.reduce((n, t) => n + t.fading, 0));
  const recent = $derived(topics.slice(0, 3));
  const trainable = $derived(topics.filter((t) => t.counts.solid >= 2).slice(0, 2));

  function start(e: SubmitEvent) {
    e.preventDefault();
    if (!topic.trim()) {
      input?.focus();
      return;
    }
    actions.learn(topic, goal);
    topic = '';
    goal = '';
    onstarted?.();
  }

  function run(fn: () => void) {
    fn();
    onstarted?.();
  }
</script>

<section class="card start-panel" class:compact>
  <form onsubmit={start}>
    <label for="new-topic"><h2>What do you want to learn?</h2></label>
    <input
      id="new-topic"
      bind:this={input}
      bind:value={topic}
      autocomplete="off"
      placeholder="Anything: why the sky is blue, Rust lifetimes, the French Revolution…"
    />
    <textarea bind:value={goal} rows="2" placeholder="What do you want to get out of it? (optional)" aria-label="What you want from it"></textarea>
    <div class="start-row">
      <span class="muted">
        {claude.running ? 'Claude will switch to it.' : 'Starts Claude here in the gym.'}
      </span>
      <button class="primary" type="submit">Start a lesson</button>
    </div>
  </form>

  {#if recent.length || fading}
    <div class="quick">
      {#if fading}
        <button class="quick-action" onclick={() => run(() => actions.review())}>
          <span class="quick-verb">Review</span>
          <span>{fading} fading {fading === 1 ? 'concept' : 'concepts'}</span>
        </button>
      {/if}
      {#each recent as t (t.slug)}
        <button class="quick-action" onclick={() => run(() => actions.continueTopic(t.slug))}>
          <span class="quick-verb">Continue</span>
          <span><strong>{t.title}</strong> <span class="muted">· {ago(t.updated)}</span></span>
          {#if t.handoff}<span class="muted quick-next">Next: {t.handoff.next}</span>{/if}
        </button>
      {/each}
      {#each trainable as t (t.slug)}
        <button class="quick-action" onclick={() => run(() => actions.train(t.slug))}>
          <span class="quick-verb">Train</span>
          <span><strong>{t.title}</strong>{t.trainingLevel ? ` · level ${t.trainingLevel}` : ''}</span>
        </button>
      {/each}
    </div>
  {/if}
</section>
