<script lang="ts">
  // A drag handle on a pane's edge. It sets a width (a CSS variable on <html>) and remembers it here.
  import { onMount } from 'svelte';

  let {
    name,
    side,
    min,
    max,
    initial,
    label,
  }: {
    /** The CSS variable to set, e.g. "--files-w". */
    name: string;
    /** Which edge of its pane the handle sits on: the pane grows away from it. */
    side: 'right' | 'left';
    min: number;
    max: number;
    initial: number;
    label: string;
  } = $props();

  const key = $derived(`mind-gym.width${name}`);
  let width = $state(0);
  let dragging = $state(false);

  function set(w: number, save = true) {
    width = Math.round(Math.min(max, Math.max(min, w)));
    document.documentElement.style.setProperty(name, `${width}px`);
    if (!save) return;
    try {
      localStorage.setItem(key, String(width));
    } catch {
      // Not essential.
    }
  }

  onMount(() => {
    let saved = NaN;
    try {
      saved = Number(localStorage.getItem(key));
    } catch {
      // Use the default.
    }
    set(Number.isFinite(saved) && saved > 0 ? saved : initial, false);
  });

  function down(e: PointerEvent) {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const x0 = e.clientX;
    const w0 = width;
    dragging = true;
    document.body.classList.add('resizing');
    const move = (ev: PointerEvent) => set(side === 'right' ? w0 + (ev.clientX - x0) : w0 - (ev.clientX - x0));
    const up = () => {
      dragging = false;
      document.body.classList.remove('resizing');
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }

  function key_(e: KeyboardEvent) {
    const d = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0;
    if (!d) return;
    e.preventDefault();
    set(width + (side === 'right' ? d : -d));
  }
</script>

<!-- A focusable separator is a widget (a splitter): it takes keys and drags. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="grip {side}"
  class:dragging
  role="separator"
  aria-orientation="vertical"
  aria-label={label}
  aria-valuemin={min}
  aria-valuemax={max}
  aria-valuenow={width}
  tabindex="0"
  onpointerdown={down}
  ondblclick={() => set(initial)}
  onkeydown={key_}
></div>

<style>
  .grip {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 5;
    width: 8px;
    cursor: col-resize;
    touch-action: none;
  }

  .grip.right {
    right: -4px;
  }

  .grip.left {
    left: -4px;
  }

  .grip::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 3px;
    width: 2px;
    background: transparent;
    transition: background-color 0.12s;
  }

  .grip:hover::after,
  .grip.dragging::after,
  .grip:focus-visible::after {
    background: var(--acc);
  }

  .grip:focus-visible {
    outline: none;
  }

  @media (max-width: 960px) {
    .grip {
      display: none;
    }
  }
</style>
