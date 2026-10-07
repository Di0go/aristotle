<script lang="ts">
  // One past session, read back in full: every step, check and answer, and its handoff.
  import { classes } from '../lib/classes.svelte.ts';
  import { setContext } from 'svelte';
  import { feed } from '../lib/feed.svelte.ts';
  import { duration, formatDay, formatTime } from '../lib/format.ts';
  import { link } from '../lib/router.svelte.ts';
  import FeedList from '../lib/FeedList.svelte';
  import type { Handoff, PublicItem, Session } from '../../../shared/types.ts';

  let { id }: { id: string } = $props();

  let record = $state<{ session: Session; items: PublicItem[]; handoff?: Handoff } | null>(null);
  let missing = $state(false);

  /** The session still running: read it from the feed, which stays current, rather than the record fetched once. */
  const live = $derived(feed.session?.id === id);
  const items = $derived(live ? feed.items : (record?.items ?? []));
  const lastAt = $derived(items.at(-1)?.at ?? record?.session.startedAt ?? '');
  /** When it was and how long it ran, for the crumbs. */
  const when = $derived(
    record
      ? `${formatDay(record.session.startedAt)}, ${formatTime(record.session.startedAt)}, ${duration(record.session.startedAt, lastAt)}`
      : '',
  );

  setContext('topic-slug', () => record?.session.topicSlug ?? feed.session?.topicSlug);

  $effect(() => {
    missing = false;
    record = null;
    void fetch(`/api/sessions/${encodeURIComponent(id)}`).then(async (r) => {
      if (r.ok) record = await r.json();
      else missing = true;
    });
  });
</script>

<div class="lesson-main session-page">
  {#if record}
    <header class="lesson-head">
      <nav class="crumbs">
        <a href={link.log()}>Log</a><span class="sep">/</span><span>{when}</span>
      </nav>
      <h1 class="page-title">
        {#if record.session.topicSlug}<a class="title-link" href={link.lesson(record.session.topicSlug)}>{record.session.topic}</a
          >{:else}{record.session.topic}{/if}
      </h1>
      <p class="page-lede">{record.session.goal}</p>
      {#if live}<p><a href={classes.sittingHref() ?? link.now()}>This is the session running now: open it</a></p>{/if}
    </header>
    <FeedList {items} readonly={!live} pendingId={live ? (feed.pending?.id ?? null) : null} />
  {:else if missing}
    <div class="empty-state">
      <h2>No such session</h2>
      <p><a href={link.log()}>Back to the log</a></p>
    </div>
  {:else}
    <p class="muted">Loading…</p>
  {/if}
</div>
