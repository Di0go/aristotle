<script lang="ts">
  // A real image (an anatomical plate, a photo) with numbered markers: point at one, or at its line in the
  // key, and both light up with its label. Written as a ```plate block of JSON.
  interface Marker {
    x: number;
    y: number;
    label: string;
    detail?: string;
  }
  interface Spec {
    title?: string;
    src: string;
    alt: string;
    credit?: string;
    license?: string;
    /** The file's page, e.g. on Wikimedia Commons. */
    source?: string;
    markers?: Marker[];
  }

  let { spec }: { spec: Spec } = $props();

  let on = $state<number | null>(null);
  let failed = $state(false);
  const markers = $derived(spec.markers ?? []);
</script>

<figure class="kit kit-plate">
  {#if spec.title}<p class="kit-title">{spec.title}</p>{/if}
  {#if failed}
    <p class="kit-note">The image could not be loaded ({spec.alt}).</p>
  {:else}
    <div class="plate">
      <img src={spec.src} alt={spec.alt} loading="lazy" onerror={() => (failed = true)} />
      {#each markers as m, i (i)}
        <button
          class="pin"
          class:on={on === i}
          style:left="{m.x}%"
          style:top="{m.y}%"
          onpointerenter={() => (on = i)}
          onpointerleave={() => (on = null)}
          onfocus={() => (on = i)}
          onblur={() => (on = null)}
          aria-label="{i + 1}: {m.label}"
        >{i + 1}</button>
        {#if on === i}
          <span class="pin-label" style:left="{m.x}%" style:top="{m.y}%">{m.label}</span>
        {/if}
      {/each}
    </div>
  {/if}
  {#if markers.length}
    <ol class="key">
      {#each markers as m, i (i)}
        <li class:on={on === i} onpointerenter={() => (on = i)} onpointerleave={() => (on = null)}>
          <span class="n">{i + 1}</span>
          <span><b>{m.label}</b>{#if m.detail}<span class="d"> {m.detail}</span>{/if}</span>
        </li>
      {/each}
    </ol>
  {/if}
  {#if spec.credit || spec.source}
    <p class="credit">
      {spec.credit ?? ''}{#if spec.license && !(spec.credit ?? '').includes(spec.license)}{spec.credit ? ', ' : ''}{spec.license}{/if}
      {#if spec.source && /^https:\/\//.test(spec.source)}<a href={spec.source} target="_blank" rel="noopener noreferrer">source</a>{/if}
    </p>
  {/if}
</figure>

<style>
  .plate {
    position: relative;
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
  }

  /* Plates are drawn for paper: a transparent one (dark labels, no ground) gets white behind it in dark mode too. */
  .plate img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 8px;
    background: #fff;
  }

  .pin {
    position: absolute;
    transform: translate(-50%, -50%);
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 2px solid var(--b0);
    border-radius: 50%;
    background: var(--fg);
    color: var(--b0);
    font: 700 11px var(--sans);
    cursor: pointer;
    box-shadow: 0 2px 6px rgb(0 0 0 / 0.3);
    transition: transform 0.15s var(--ease), background-color 0.15s;
  }

  .pin.on,
  .pin:hover {
    background: var(--acc);
    color: var(--on-acc);
    transform: translate(-50%, -50%) scale(1.15);
  }

  .pin-label {
    position: absolute;
    transform: translate(16px, -50%);
    padding: 3px 8px;
    border-radius: 6px;
    background: var(--b0);
    color: var(--fg);
    font: 600 12px var(--sans);
    white-space: nowrap;
    box-shadow: var(--shadow);
    pointer-events: none;
  }

  .key {
    list-style: none;
    display: grid;
    gap: 4px;
    margin: 14px 0 0;
    padding: 0;
    text-align: left;
  }

  .key li {
    display: flex;
    gap: 10px;
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 0.88rem;
  }

  .key li.on {
    background: var(--acc-soft);
  }

  .key .n {
    flex: none;
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--b2);
    font: 700 10.5px var(--sans);
  }

  .key .d {
    margin-left: 6px;
    color: var(--muted);
  }

  .credit {
    margin: 10px 0 0;
    font-size: 0.75rem;
    color: var(--faint);
  }

  .credit a {
    margin-left: 4px;
    color: var(--muted);
    text-decoration: underline;
  }
</style>
