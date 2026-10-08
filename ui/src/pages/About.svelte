<script lang="ts">
  // About you (#/about): what he does, his projects, his sport or work, what he wants, in his own words. Claude reads
  // it (read_about) before planning a course or designing a mission, so both fit his life; saved as he types.
  import { feed } from '../lib/feed.svelte.ts';

  let text = $state('');
  let saved = $state<'saved' | 'saving' | ''>('');
  let loaded = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  // His saved words, once they arrive; never over what he is typing.
  $effect(() => {
    if (loaded || !feed.loaded) return;
    text = feed.about;
    loaded = true;
  });

  function onInput() {
    saved = 'saving';
    clearTimeout(timer);
    const body = text;
    timer = setTimeout(async () => {
      await fetch('/api/about', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: body }) });
      saved = 'saved';
    }, 700);
  }
</script>

<div class="page about">
  <header class="page-head">
    <h1 class="page-title">About you</h1>
    <p class="page-lede">
      What you do, what you're working on, what you want. Your tutor reads this before it plans a course with you or designs a mission, so
      what you learn lands in your own life.
    </p>
  </header>

  <div class="sheet">
    <div class="head">
      <label for="about-text">In your words</label>
      <span class="muted">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : ''}</span>
    </div>
    <textarea
      id="about-text"
      bind:value={text}
      oninput={onInput}
      rows="16"
      placeholder={'What I do: …\nWhat I’m working on (projects, training, work): …\nWhat I want to get better at: …\nWhat I enjoy, and how I like to learn: …'}
    ></textarea>
  </div>
</div>

<style>
  .about {
    max-width: 52rem;
  }

  .sheet {
    padding: 18px 20px;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 8px;
    font-size: 0.86rem;
  }

  .head label {
    font-weight: 600;
    color: var(--fg-2);
  }

  textarea {
    width: 100%;
    resize: vertical;
    padding: 12px 14px;
    background: var(--b1);
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    color: var(--fg);
    font: 0.95rem/1.65 var(--sans);
  }

  textarea:focus {
    outline: none;
    border-color: var(--acc);
  }
</style>
