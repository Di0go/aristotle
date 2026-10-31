<script lang="ts">
  // A figure, larger: the core's lightbox (@organon/core/ui/Lightbox.svelte: a click on an image or a drawing opens it
  // over the page, Escape or a click closes it), told Aristotle's own first: a plate opens whole, with its markers and
  // its title as the caption; the visual kit's other figures and the explorables never open (they are live).
  import CoreLightbox, { type Shown } from '@organon/core/ui/Lightbox.svelte';

  function figure(el: Element): Shown | false | undefined {
    const plate = el.closest<HTMLElement>('.kit-plate .plate');
    if (plate) {
      const fig = plate.closest('figure');
      return { node: plate, caption: fig?.querySelector('.kit-title')?.textContent ?? plate.querySelector('img')?.alt ?? '' };
    }
    if (el.closest('.kit, .explorable')) return false;
    return undefined;
  }
</script>

<CoreLightbox {figure} />

<style>
  /* A plate keeps its markers: they are placed in percent, so they scale with it. */
  :global(.lightbox .holder .plate.lightbox-content) {
    width: min(88vw, calc((100vh - 152px) * 1.1), 1100px);
    max-width: none;
  }
</style>
