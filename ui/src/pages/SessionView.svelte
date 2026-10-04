<script lang="ts">
  import { feed } from '../lib/feed.svelte.ts';
  import { link } from '../lib/router.svelte.ts';
  import { duration, formatDay, formatTime } from '../lib/format.ts';
  import FeedList from '../lib/FeedList.svelte';
  import type { Handoff, PublicItem, Session } from '../../../shared/types.ts';

  let { id }: { id: string } = $props();

  let record = $state<{ session: Session; items: PublicItem[]; handoff?: Handoff } | null>(null);
  let missing = $state(false);

  const live = $derived(feed.session?.id === id);

  $effect(() => {
    missing = false;
    record = null;
    void fetch(`/api/sessions/${encodeURIComponent(id)}`).then(async (r) => {
      if (r.ok) record = await r.json();
      else missing = true;
    });
  });

  const items = $derived(live ? feed.items : (record?.items ?? []));
  const lastAt = $derived(items.at(-1)?.at ?? record?.session.startedAt ?? '');
</script>

<div class="page session-page">
  {#if record}
    <header class="page-head">
      <a class="eyebrow" href={link.log()}>Log</a>
      <h1>{record.session.goal}</h1>
      <p>
        <a href={link.topic(record.session.topicSlug)}>{record.session.topic}</a> ·
        {formatDay(record.session.startedAt)}, {formatTime(record.session.startedAt)} ·
        {duration(record.session.startedAt, lastAt)}
      </p>
      {#if live}<p><a href={link.now()}>This is the current session: open it in Now</a></p>{/if}
    </header>
    <div class="session-feed">
      <FeedList {items} readonly={!live} pendingId={live ? (feed.pending?.id ?? null) : null} />
    </div>
  {:else if missing}
    <div class="empty">
      <h1>No such session</h1>
      <p><a href={link.log()}>Back to the log</a></p>
    </div>
  {:else}
    <p class="muted">Loading…</p>
  {/if}
</div>
