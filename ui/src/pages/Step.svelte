<script lang="ts">
  // One page of a class, as linked from the library tree and from Previous / Next: #/lesson/<slug>/<number>.
  import ClassPage from '../lib/ClassPage.svelte';

  let { slug, number }: { slug: string; number: number } = $props();
</script>

<ClassPage {slug} {number} />
