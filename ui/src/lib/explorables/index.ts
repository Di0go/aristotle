// The hand-built interactive figures: what each is, which topics it belongs to, and how to load it.
// Lessons place one with ```explorable {"id": ...}; a class page offers its topic's figures to open any time.

export interface Explorable {
  id: string;
  title: string;
  /** One line: what playing with it shows. */
  blurb: string;
  topics: string[];
  /** The concepts it explains: in a class it appears right after the step that teaches one of them. */
  concepts: string[];
  load: () => Promise<{ default: unknown }>;
}

export const EXPLORABLES: Explorable[] = [
  {
    id: 'heart-rate',
    title: 'Brake, accelerator and your heart',
    blurb: 'Drag the vagal brake and the sympathetic accelerator and feel which one is fast.',
    topics: ['the-stress-response'],
    concepts: ['heart-rate-control'],
    load: () => import('./HeartRate.svelte'),
  },
  {
    id: 'stress-hormones',
    title: 'Two hours after a stressor',
    blurb: 'Heart rate, adrenaline and cortisol over time, with a second round if you want one.',
    topics: ['the-stress-response'],
    concepts: ['stress-timeline', 'tired-but-wired'],
    load: () => import('./StressHormones.svelte'),
  },
];

export const explorable = (id: string) => EXPLORABLES.find((e) => e.id === id);
export const explorablesFor = (topic: string) => EXPLORABLES.filter((e) => e.topics.includes(topic));

/**
 * Where each of a topic's figures belongs in a class: after the first teaching step on one of its concepts,
 * unless a step already shows it. Returns item id -> figures to place after that item.
 */
export function placeFigures(
  topic: string,
  items: { id: string; type: string; kind?: string; concept?: string; markdown?: string }[],
): Record<string, Explorable[]> {
  const out: Record<string, Explorable[]> = {};
  for (const e of explorablesFor(topic)) {
    const shown = items.some((i) => i.markdown?.includes('```explorable') && new RegExp(`"id"\\s*:\\s*"${e.id}"`).test(i.markdown));
    if (shown) continue;
    const at = items.find((i) => i.type === 'block' && i.kind === 'step' && i.concept && e.concepts.includes(i.concept));
    if (at) (out[at.id] ??= []).push(e);
  }
  return out;
}
