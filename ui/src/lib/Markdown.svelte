<script lang="ts">
  import { renderMarkdown, renderInline } from './markdown.ts';

  let { source, inline = false }: { source: string; inline?: boolean } = $props();

  const html = $derived(inline ? renderInline(source) : renderMarkdown(source));
  let el = $state<HTMLElement>();

  let diagramCount = 0;

  // Draw ```mermaid blocks once the HTML is in the page. Mermaid is large, so it loads on first use.
  $effect(() => {
    void html;
    const blocks = el?.querySelectorAll<HTMLElement>('pre > code.language-mermaid') ?? [];
    if (blocks.length === 0) return;
    void (async () => {
      const { default: mermaid } = await import('mermaid');
      const dark = matchMedia('(prefers-color-scheme: dark)').matches;
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'neutral' });
      for (const code of blocks) {
        const pre = code.parentElement!;
        try {
          const { svg } = await mermaid.render(`mermaid-${crypto.randomUUID()}-${diagramCount++}`, code.textContent ?? '');
          const figure = document.createElement('figure');
          figure.className = 'diagram';
          figure.innerHTML = svg;
          pre.replaceWith(figure);
        } catch {
          pre.classList.add('diagram-error');
        }
      }
    })();
  });
</script>

{#if inline}
  <span class="md-inline">{@html html}</span>
{:else}
  <div class="md" bind:this={el}>{@html html}</div>
{/if}
