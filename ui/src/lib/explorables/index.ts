// The hand-built interactive figures: what each is, which topics it belongs to, and how to load it.
// Lessons place one with ```explorable {"id": ...}; a class page offers its topic's figures to open any time.

export interface Explorable {
  id: string;
  title: string;
  /** One line: what playing with it shows. */
  blurb: string;
  topics: string[];
  load: () => Promise<{ default: unknown }>;
}

export const EXPLORABLES: Explorable[] = [
  {
    id: 'heart-rate',
    title: 'Brake, accelerator and your heart',
    blurb: 'Drag the vagal brake and the sympathetic accelerator and feel which one is fast.',
    topics: ['the-stress-response'],
    load: () => import('./HeartRate.svelte'),
  },
  {
    id: 'stress-hormones',
    title: 'Two hours after a stressor',
    blurb: 'Heart rate, adrenaline and cortisol over time, with a second round if you want one.',
    topics: ['the-stress-response'],
    load: () => import('./StressHormones.svelte'),
  },
];

export const explorable = (id: string) => EXPLORABLES.find((e) => e.id === id);
export const explorablesFor = (topic: string) => EXPLORABLES.filter((e) => e.topics.includes(topic));
