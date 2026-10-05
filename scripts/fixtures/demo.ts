// The demo library the dev instance starts with (pnpm seed): a roadmap, one lesson taught through it with a
// quiz and a written answer, a map, a handoff and a mission. It is a script of MCP calls, replayed by
// scripts/seed.ts through the same tools Claude Code uses, so it stays valid whatever the data format becomes.
// `answer` is what the learner does in the interface when a quiz or ask is waiting.
//
// To add a fixture: write another file like this one and pass its name, `pnpm seed <name>`.

export type Step =
  | { tool: string; args: Record<string, unknown> }
  | { answer: { picks: { choice: number | null; note?: string }[] } | { text: string } };

export const steps: Step[] = [
  {
    tool: 'save_roadmap',
    args: {
      title: 'How stress works',
      goal: 'Understand what the body does under stress, fast and slow, well enough to use it in training and at work.',
      status: 'active',
      steps: [
        {
          title: 'The stress response',
          goal: 'Explain the fast nervous response and the slow hormonal one, and why they feel different.',
          why: 'Everything else builds on the two timescales.',
        },
        {
          title: 'Sleep and recovery',
          goal: 'Explain how a late stressor delays sleep, and what helps it settle.',
          why: 'Uses the slow, hormonal arm of the response.',
        },
      ],
    },
  },
  {
    tool: 'start_session',
    args: { kind: 'learn', topic: 'The stress response', goal: 'See the two arms of the stress response and their timescales.' },
  },
  {
    tool: 'update_map',
    args: {
      concepts: [
        {
          id: 'autonomic-nervous-system',
          label: 'Autonomic nervous system',
          summary: 'The two branches that run the organs without asking',
          status: 'solid',
        },
        {
          id: 'heart-rate-control',
          label: 'Heart rate control',
          summary: 'A fast vagal brake and a slower sympathetic accelerator on the pacemaker',
          deps: ['autonomic-nervous-system'],
        },
        {
          id: 'hpa-axis',
          label: 'HPA axis',
          summary: 'Hypothalamus, pituitary, adrenal cortex: the hormonal arm',
          deps: ['autonomic-nervous-system'],
        },
        {
          id: 'stress-timeline',
          label: 'Stress timeline',
          summary: 'Seconds for nerves, tens of minutes for cortisol',
          deps: ['heart-rate-control', 'hpa-axis'],
        },
        {
          id: 'tired-but-wired',
          label: 'Tired but wired',
          summary: 'Why a late stressor keeps you awake',
          deps: ['stress-timeline'],
          goal: true,
        },
      ],
    },
  },
  {
    tool: 'show',
    args: {
      kind: 'orient',
      title: 'Two arms, two clocks',
      markdown:
        'Under stress the body answers twice: once through **nerves**, in seconds, and once through **hormones**, over tens of minutes.\n\n' +
        '```mermaid\nflowchart LR\n  S[Stressor] --> N[Sympathetic nerves<br/>seconds]\n  S --> H[HPA axis<br/>minutes]\n  N --> HR[Heart rate up]\n  H --> C[Cortisol up]\n```\n\n' +
        'Key terms: {{vagus|the main parasympathetic nerve to the heart}}, {{HPA axis|hypothalamus, pituitary and adrenal cortex}}.',
    },
  },
  {
    tool: 'show',
    args: {
      kind: 'step',
      title: 'A brake and an accelerator',
      concept: 'heart-rate-control',
      markdown:
        "The heart's pacemaker would beat at around 100 a minute on its own. At rest the **vagus nerve** holds it below that: a brake that acts within a beat or two.\n\n" +
        'The **sympathetic** nerves push the other way, but their effect builds over several seconds.\n\n' +
        '> [!idea] So the quickest way to raise the heart rate is to release the brake, not to press the accelerator.',
    },
  },
  {
    tool: 'quiz',
    args: {
      questions: [
        {
          question: 'You stand up suddenly and your heart rate jumps within a second. What did most of that first jump?',
          options: [
            'Vagal tone was withdrawn',
            'Adrenaline reached the heart',
            'Cortisol was released',
            'Noradrenaline from sympathetic nerves',
          ],
          correct: 0,
          explanation: 'Only the vagal brake acts within a beat; sympathetic and hormonal effects take seconds to minutes to build.',
          concept: 'heart-rate-control',
        },
      ],
    },
  },
  { answer: { picks: [{ choice: 0 }] } },
  {
    tool: 'ask',
    args: {
      kind: 'explain',
      concept: 'hpa-axis',
      prompt: 'In your own words: why does cortisol peak tens of minutes after a stressor, when the heart reacts in seconds?',
    },
  },
  {
    answer: {
      text: 'Because it is a chain of hormones: the hypothalamus signals the pituitary, which signals the adrenal cortex, which then has to make cortisol. Each link takes time, and it travels in the blood rather than along a nerve.',
    },
  },
  {
    tool: 'show',
    args: {
      kind: 'feedback',
      concept: 'hpa-axis',
      markdown:
        'Right on both counts: a three-link chain, and the blood as the messenger. Cortisol is also *made* on demand rather than stored, which adds to the delay.',
    },
  },
  {
    tool: 'update_map',
    args: {
      concepts: [
        { id: 'heart-rate-control', status: 'solid' },
        { id: 'hpa-axis', status: 'solid' },
        { id: 'stress-timeline', status: 'shaky', note: 'Not yet checked on its own' },
      ],
      focus: 'stress-timeline',
    },
  },
  {
    tool: 'end_session',
    args: {
      locked: 'Heart rate control (vagal brake vs sympathetic accelerator) and the HPA axis as a slow hormonal chain.',
      shaky: 'The combined timeline: not checked yet.',
      next: 'Stress timeline: put both arms on one clock, then tired-but-wired.',
    },
  },
  {
    tool: 'save_mission',
    args: {
      title: 'Catch your own vagal brake',
      scope: 'step',
      roadmap: 'how-stress-works',
      topic: 'the-stress-response',
      arena: 'anywhere',
      why: 'Seeing the fast arm in your own pulse makes it something you can use, not just something you read.',
      brief:
        'With a heart-rate monitor or a finger on your pulse, lie down for two minutes, then stand up. Note the rate before, in the first few seconds, and after a minute.',
      criteria: ['Three readings, with times', 'Which arm explains each change, in a sentence each'],
      concepts: ['the-stress-response/heart-rate-control'],
    },
  },
];
