<script lang="ts">
  // The foot of a running lesson: what is happening right now, so he never has to guess whether to wait.
  //   working        Claude is preparing the next step (a placeholder where it will appear)
  //   your turn      a question is waiting above (nothing to add here)
  //   waiting        Claude has finished and is waiting on him: what it said, and where to answer
  import { claude } from './claude.svelte.ts';
  import { feed } from './feed.svelte.ts';

  let now = $state(Date.now());

  const secs = $derived(claude.busy ? Math.max(0, Math.round((now - claude.busySince) / 1000)) : 0);
  const phase = $derived(feed.pending ? 'turn' : claude.busy ? 'working' : claude.running ? 'waiting' : 'off');
  /** " (pondering), 12 s": Claude Code's own word for it, and the seconds once there are a few. */
  const detail = $derived(`${claude.doing ? ` (${claude.doing.replace('…', '').toLowerCase()})` : ''}${secs >= 3 ? `, ${secs} s` : ''}`);

  // The clock only ticks while there is something to time.
  $effect(() => {
    if (!claude.busy) return;
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });
</script>

{#if phase === 'working'}
  <div class="activity working" aria-live="polite">
    <div class="ghost-card" aria-hidden="true">
      <span class="line w60"></span>
      <span class="line w90"></span>
      <span class="line w75"></span>
    </div>
    <p class="act-line">
      <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
      Claude is preparing the next step{detail}.
      {#if secs > 45}<span class="muted"> Longer steps can take a minute, especially with a figure.</span>{/if}
    </p>
  </div>
{:else if phase === 'waiting' && feed.items.length}
  <div class="activity waiting" aria-live="polite">
    <p class="act-line"><span class="idle" aria-hidden="true"></span>Claude is waiting for you.</p>
    {#if claude.lastSaid}<blockquote class="said">{claude.lastSaid}</blockquote>{/if}
    <p class="act-hint muted">Answer in the box below{claude.asking ? ', or open the terminal: it is asking something there' : ''}.</p>
  </div>
{/if}

<style>
  .activity {
    max-width: var(--measure);
    margin: -20px auto 24px;
    animation: settle 0.35s var(--ease) both;
  }

  .ghost-card {
    display: grid;
    gap: 10px;
    padding: 18px 20px;
    border-radius: var(--radius-lg);
    background: var(--b1);
    margin-bottom: 12px;
  }

  /* A sheen sweeps across: a gradient moved with transform, which the compositor animates without repainting. */
  .line {
    position: relative;
    display: block;
    height: 10px;
    overflow: hidden;
    border-radius: 5px;
    background: var(--b2);
  }

  .line::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, transparent 0%, var(--hover) 50%, transparent 100%);
    transform: translateX(-100%);
    animation: shimmer 1.6s ease-in-out infinite;
  }

  .w60 {
    width: 60%;
  }

  .w90 {
    width: 90%;
  }

  .w75 {
    width: 75%;
  }

  @keyframes shimmer {
    to {
      transform: translateX(100%);
    }
  }

  .act-line {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 4px 10px;
    margin: 0;
    font-size: 0.88rem;
    color: var(--fg-2);
  }

  .dots {
    display: inline-flex;
    gap: 3px;
    transform: translateY(-1px);
  }

  .dots i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--acc);
    animation: hop 1.2s var(--ease) infinite;
  }

  .dots i:nth-child(2) {
    animation-delay: 0.15s;
  }

  .dots i:nth-child(3) {
    animation-delay: 0.3s;
  }

  @keyframes hop {
    0%,
    60%,
    100% {
      opacity: 0.35;
      transform: none;
    }
    30% {
      opacity: 1;
      transform: translateY(-3px);
    }
  }

  .waiting {
    padding: 14px 16px;
    border: 1px dashed var(--rule-strong);
    border-radius: var(--radius-lg);
  }

  .idle {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--solid);
  }

  .said {
    margin: 10px 0 0;
    padding: 0 0 0 12px;
    border-left: 2px solid var(--rule-strong);
    color: var(--fg);
    font-size: 0.92rem;
    line-height: 1.55;
  }

  .act-hint {
    margin: 8px 0 0;
    font-size: 0.8rem;
  }
</style>
