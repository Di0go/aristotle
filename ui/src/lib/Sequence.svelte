<script lang="ts">
  // A process he steps through, one frame at a time: written as a ```sequence block, frames split by "---".
  import { renderMarkdown } from './markdown.ts';

  let { source }: { source: string } = $props();

  /** The frame on screen. */
  let at = $state(0);
  /** The furthest frame reached, so the ticks show how far he has been. */
  let seen = $state(0);

  const frames = $derived(
    source
      .split(/^\s*---\s*$/m)
      .map((f) => f.trim())
      .filter(Boolean)
      .map(renderMarkdown),
  );

  function go(i: number) {
    at = Math.max(0, Math.min(frames.length - 1, i));
    seen = Math.max(seen, at);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(at + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(at - 1);
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<section
  class="sequence"
  tabindex="0"
  onkeydown={onKey}
  aria-roledescription="sequence"
  aria-label="Step through, frame {at + 1} of {frames.length}"
>
  <div class="sequence-stage">
    {#each frames as html, i (i)}
      <div class="sequence-frame md" aria-hidden={i !== at}>{@html html}</div>
    {/each}
  </div>
  <div class="sequence-bar">
    <button class="ghost small" onclick={() => go(at - 1)} disabled={at === 0} aria-label="Previous frame">Back</button>
    <div class="sequence-ticks">
      {#each frames as _, i (i)}
        <button class:seen={i <= seen} aria-label="Frame {i + 1}" aria-current={i === at} onclick={() => go(i)}></button>
      {/each}
    </div>
    <span class="sequence-count">{at + 1}/{frames.length}</span>
    <button class="primary small" onclick={() => go(at + 1)} disabled={at === frames.length - 1}>Next</button>
  </div>
</section>
