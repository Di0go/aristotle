<script lang="ts">
  // The mark: the peripatos, the covered walk of the Lyceum where Aristotle's school taught (and, the story goes,
  // walked as it talked). A path that turns inward to a point. The path follows the text colour, the point the accent.
  // Drawn heavier when small, so it holds up at sidebar and favicon sizes.
  let { size = 20, class: cls = '' }: { size?: number; class?: string } = $props();
  const small = $derived(size <= 28);
</script>

<svg class="logo {cls}" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
  <path d={LOGO_PATH} fill="none" stroke="currentColor" stroke-width={small ? 4.4 : 3.2} stroke-linecap="round" />
  <circle cx="8" cy="38" r={small ? 3.6 : 3} fill="currentColor" />
  <circle cx="29" cy="22" r={small ? 5.4 : 4.4} fill="var(--acc)" />
</svg>

<script module lang="ts">
  export const LOGO_PATH = 'M8 38 C8 22 18 10 30 12 C40 14 41 30 30 32 C22 33.5 21 22 28 22';

  /** The mark as a favicon: on a rounded tile in the theme's ground, with the accent point. */
  export function faviconHref(dark: boolean, accent: string): string {
    const ground = dark ? '#1e1e1e' : '#ffffff';
    const ink = dark ? '#dcddde' : '#222222';
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><rect width='48' height='48' rx='11' fill='${ground}'/>` +
      `<g transform='translate(2 2) scale(0.92)'><path d='${LOGO_PATH}' fill='none' stroke='${ink}' stroke-width='5' stroke-linecap='round'/>` +
      `<circle cx='8' cy='38' r='4' fill='${ink}'/><circle cx='29' cy='22' r='6' fill='${accent}'/></g></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }
</script>
