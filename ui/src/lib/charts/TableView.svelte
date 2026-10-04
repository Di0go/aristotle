<script lang="ts">
  // Every chart's values, readable without hovering.
  let { columns, rows }: { columns: string[]; rows: (string | number)[][] } = $props();
</script>

<details class="table-view">
  <summary>Show as a table</summary>
  <table>
    <thead>
      <tr>{#each columns as c (c)}<th>{c}</th>{/each}</tr>
    </thead>
    <tbody>
      {#each rows as row, i (i)}
        <tr>{#each row as cell, j (j)}<td>{cell}</td>{/each}</tr>
      {/each}
    </tbody>
  </table>
</details>
