<script lang="ts">
  // Start a lesson on anything, without the terminal.
  import { actions } from './actions.ts';
  import { claude } from './claude.svelte.ts';
  import { link } from './router.svelte.ts';

  let { onstarted }: { onstarted?: () => void } = $props();

  let topic = $state('');
  let goal = $state('');
  let input = $state<HTMLInputElement>();

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
</script>

<form class="start-form" onsubmit={start}>
  <label class="start-label" for="new-topic">One class, straight away</label>
  <input
    id="new-topic"
    class="field big"
    bind:this={input}
    bind:value={topic}
    autocomplete="off"
    placeholder="e.g. how sleep consolidates memory"
  />
  <textarea
    class="field"
    bind:value={goal}
    rows="2"
    placeholder="What do you want to be able to do or explain? (optional)"
    aria-label="What you want from it"></textarea>
  <div class="start-row">
    <span class="muted">
      {claude.running ? 'Claude switches to it.' : 'Starts Claude here.'} For a whole field, <a href={link.roadmaps()}>plan a course</a> instead.
    </span>
    <button class="primary" type="submit">Start the class</button>
  </div>
</form>

<style>
  .start-form {
    display: grid;
    gap: 10px;
  }

  .start-label {
    font: 500 0.83rem var(--sans);
    color: var(--muted);
  }

  .big {
    font-size: 0.98rem;
    padding: 12px 14px;
  }

  .start-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 4px;
    font-size: 0.85rem;
  }
</style>
