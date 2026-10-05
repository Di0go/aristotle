<script lang="ts">
  // Click an image or a drawing in a lesson to see it large: images in Markdown, the plate of a ```plate
  // (with its numbered markers), inline SVG drawings and Mermaid diagrams. Escape, a click outside or × closes it.
  // Interactive figures from the kit are left alone: they are meant to be used where they are.

  let shown = $state<{ node: HTMLElement | SVGElement; caption: string } | null>(null);
  let holder = $state<HTMLElement>();
  let closer = $state<HTMLButtonElement>();
  let returnTo: HTMLElement | null = null;

  /** What a click opens, if anything: the element to show and its caption. */
  function target(el: Element): { node: HTMLElement | SVGElement; caption: string } | null {
    if (el.closest('a, button, .lightbox')) return null;
    const plate = el.closest<HTMLElement>('.kit-plate .plate');
    if (plate) {
      const fig = plate.closest('figure');
      return { node: plate, caption: fig?.querySelector('.kit-title')?.textContent ?? plate.querySelector('img')?.alt ?? '' };
    }
    if (el.closest('.kit, .explorable')) return null;
    const img = el.closest<HTMLImageElement>('.md img');
    if (img) return { node: img, caption: img.closest('figure')?.querySelector('figcaption')?.textContent ?? img.alt };
    const svg = el.closest<SVGSVGElement>('.md svg');
    if (svg && !svg.closest('.kit, .figure-tools') && svg.ownerSVGElement === null && svg.getBoundingClientRect().width > 120) {
      return { node: svg, caption: svg.closest('figure')?.querySelector('figcaption')?.textContent ?? '' };
    }
    return null;
  }

  function onClick(e: MouseEvent) {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || !(e.target instanceof Element)) return;
    const t = target(e.target);
    if (!t) return;
    e.preventDefault();
    returnTo = document.activeElement as HTMLElement | null;
    shown = t;
  }

  // A copy of the figure goes in the box, sized to the window; the original stays in the lesson.
  $effect(() => {
    if (!shown || !holder) return;
    const copy = shown.node.cloneNode(true) as HTMLElement | SVGElement;
    // Ids stay: a Mermaid diagram's styles are scoped to its own id.
    copy.classList.add('lightbox-content');
    if (copy instanceof SVGSVGElement) {
      copy.removeAttribute('width');
      copy.removeAttribute('height');
      copy.style.maxWidth = 'none';
    }
    holder.replaceChildren(copy);
    closer?.focus();
  });

  function close() {
    shown = null;
    returnTo?.focus?.();
  }

  function onKey(e: KeyboardEvent) {
    if (shown && e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }
</script>

<svelte:document onclickcapture={onClick} />
<svelte:window onkeydowncapture={onKey} />

{#if shown}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="lightbox" role="dialog" tabindex="-1" aria-modal="true" aria-label={shown.caption || 'Figure'} onclick={(e) => e.target === e.currentTarget && close()}>
    <button class="x" bind:this={closer} onclick={close} aria-label="Close">×</button>
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <figure onclick={(e) => e.target === e.currentTarget && close()}>
      <div class="holder" bind:this={holder}></div>
      {#if shown.caption}<figcaption>{shown.caption}</figcaption>{/if}
    </figure>
  </div>
{/if}

<style>
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: grid;
    place-items: center;
    padding: 48px 24px 24px;
    background: color-mix(in srgb, var(--b0) 88%, transparent);
    backdrop-filter: blur(6px);
    animation: in 0.16s var(--ease);
  }

  @keyframes in {
    from {
      opacity: 0;
    }
  }

  figure {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    max-width: 100%;
    max-height: 100%;
    margin: 0;
  }

  .holder {
    display: grid;
    place-items: center;
    max-width: min(92vw, 1400px);
    max-height: calc(100vh - 120px);
    padding: 16px;
    background: var(--b0);
    border: 1px solid var(--rule);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
    overflow: auto;
  }

  .holder :global(img.lightbox-content) {
    display: block;
    max-width: 100%;
    max-height: calc(100vh - 152px);
    width: auto;
    height: auto;
    object-fit: contain;
  }

  .holder :global(svg.lightbox-content) {
    display: block;
    width: min(88vw, 1300px);
    height: auto;
    max-height: calc(100vh - 152px);
    color: var(--fg-2);
  }

  /* A plate keeps its markers: they are placed in percent, so they scale with it. */
  .holder :global(.plate.lightbox-content) {
    width: min(88vw, calc((100vh - 152px) * 1.1), 1100px);
    max-width: none;
  }

  figcaption {
    max-width: 60rem;
    font-size: 0.88rem;
    line-height: 1.5;
    text-align: center;
    color: var(--muted);
  }

  .x {
    position: fixed;
    top: 12px;
    right: 16px;
    width: 36px;
    height: 36px;
    padding: 0;
    font-size: 1.4rem;
    line-height: 1;
    color: var(--muted);
    background: var(--b1);
    border: 1px solid var(--rule);
    border-radius: 50%;
    cursor: pointer;
  }

  .x:hover {
    color: var(--fg);
  }
</style>
