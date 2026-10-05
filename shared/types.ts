// Types shared by the server and the interface: the records kept in data/ and what the API sends and accepts.

// Sessions and their feed: what Claude shows and asks, and what he answers.

/** learn: a lesson on one topic; review: fading concepts across topics; train: problems on one topic. */
export type SessionKind = 'learn' | 'review' | 'train';

export interface Session {
  id: string;
  kind?: SessionKind;
  /** The topic's title ("Review" for a review session). */
  topic: string;
  /** Empty for a review session, which spans topics. */
  topicSlug: string;
  goal: string;
  startedAt: string;
  endedAt?: string;
}

/** What a session leaves for the next one ("done for now"). */
export interface Handoff {
  at: string;
  session: string;
  locked: string;
  shaky: string;
  next: string;
}

export type BlockKind = 'orient' | 'step' | 'plan' | 'summary' | 'feedback' | 'note';
export type AskKind = 'problem' | 'explain' | 'recall' | 'open';

export interface QuizQuestion {
  question: string;
  options: string[];
  /** Index into `options` (after shuffling). */
  correct: number;
  explanation: string;
  strand?: string;
  /** The map concept this question tests. */
  concept?: string;
}

export interface QuizResponse {
  /** Index into `options`, or null for "I don't know". */
  choice: number | null;
  note?: string;
  correct: boolean;
}

interface ItemBase {
  id: string;
  at: string;
}

export interface BlockItem extends ItemBase {
  type: 'block';
  kind: BlockKind;
  title?: string;
  markdown: string;
  /** The map concept this step teaches. */
  concept?: string;
}

export interface QuizItem extends ItemBase {
  type: 'quiz';
  questions: QuizQuestion[];
  responses?: QuizResponse[];
  answeredAt?: string;
  /** The answer has been handed back to Claude. */
  delivered?: boolean;
}

export interface AskItem extends ItemBase {
  type: 'ask';
  kind: AskKind;
  prompt: string;
  placeholder?: string;
  /** The map concept this question tests. */
  concept?: string;
  response?: string;
  answeredAt?: string;
  delivered?: boolean;
}

/** A note in the feed that the knowledge map changed. */
export interface MapItem extends ItemBase {
  type: 'map';
  topic: string;
  changes: MapChange[];
}

export type Item = BlockItem | QuizItem | AskItem | MapItem;
export type InteractiveItem = QuizItem | AskItem;

/** Quizzes and asks: the items he answers. */
export function isInteractive<T extends { type: string }>(item: T): item is T & { type: 'quiz' | 'ask' } {
  return item.type === 'quiz' || item.type === 'ask';
}

/** An unanswered quiz reaches the interface without its answer key. */
export type PublicQuestion = Omit<QuizQuestion, 'correct' | 'explanation'> & Partial<Pick<QuizQuestion, 'correct' | 'explanation'>>;
export type PublicQuizItem = Omit<QuizItem, 'questions'> & { questions: PublicQuestion[] };
export type PublicItem = BlockItem | PublicQuizItem | AskItem | MapItem;

export interface FeedState {
  session: Session | null;
  items: PublicItem[];
}

/** What the live feed (/api/events) sends: a change to the session, or to any stored record. */
export type FeedEvent =
  | { type: 'session'; session: Session }
  | { type: 'item'; item: PublicItem }
  | { type: 'topic'; topic: Topic }
  | { type: 'roadmap'; roadmap: Roadmap }
  | { type: 'mission'; mission: Mission }
  /** Every gloss, after one is added or removed. */
  | { type: 'glosses'; glosses: Gloss[] }
  /** Every question he asked on a passage, after one is added or removed. */
  | { type: 'asides'; asides: Aside[] };

// Knowledge maps

export type ConceptStatus = 'unknown' | 'shaky' | 'solid';

export interface Concept {
  /** Kebab-case, unique within the topic. */
  id: string;
  label: string;
  /** One line: what it is. */
  summary?: string;
  status: ConceptStatus;
  /** Prerequisites: ids in this topic, or "other-topic/id". */
  deps: string[];
  /** One of the things the topic is aiming at. */
  goal?: boolean;
  /** Something to watch, such as a misconception. */
  note?: string;
  firstSeen: string;
  updated: string;
  /** When it last became solid. */
  solidSince?: string;
  /** Spaced-review schedule, from the first time it became solid. */
  review?: ReviewState;
  evidence: Evidence[];
}

export interface Evidence {
  at: string;
  session: string;
  /** The feed item it came from, if any. */
  item?: string;
  /** quiz and ask: checks during a lesson; practice: reviews and training problems. */
  kind: 'quiz' | 'ask' | 'practice';
  /** Quiz answers and practice. */
  result?: 'right' | 'partial' | 'wrong' | 'dont-know';
  /** mission: a Praxis mission, used for real outside the app. */
  practice?: 'recall' | 'problem' | 'mission';
  /** Training problems: difficulty on the topic's 1-10 scale. */
  difficulty?: number;
}

/** An FSRS review card, stored with ISO dates. */
export interface ReviewState {
  due: string;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: number;
  last?: string;
}

/** Solid, but due for review. */
export function isFading(concept: Pick<Concept, 'status' | 'review'>, now = Date.now()): boolean {
  return concept.status === 'solid' && Boolean(concept.review) && Date.parse(concept.review!.due) <= now;
}

export interface Topic {
  slug: string;
  title: string;
  goal: string;
  created: string;
  updated: string;
  concepts: Concept[];
  /** The concept being taught right now. */
  focus?: string;
  handoff?: Handoff;
  sessions: string[];
  /** Difficulty of training problems, 1-10, raised as he solves them. */
  training?: { level: number; updated: string };
}

export interface MapChange {
  id: string;
  label: string;
  from?: ConceptStatus;
  to?: ConceptStatus;
  added?: boolean;
  removed?: boolean;
}

// Roadmaps: an ordered path of topics, planned with him before any of them is taught.

export interface RoadmapStep {
  /** The topic this step becomes: the slug of its title. */
  topic: string;
  title: string;
  /** What he should be able to do once the step is done. */
  goal: string;
  /** Why it comes here, and what it builds on. */
  why?: string;
}

export interface Roadmap {
  slug: string;
  title: string;
  /** What the whole path is for. */
  goal: string;
  /** draft: still being planned with him; active: approved, being followed. */
  status: 'draft' | 'active';
  created: string;
  updated: string;
  steps: RoadmapStep[];
}

/** not-started: no topic yet; started: a topic with a map; done: every goal concept on its map is solid. */
export type StepState = 'not-started' | 'started' | 'done';

/** A roadmap step's state, read off its topic's map. */
export function stepState(topic: Pick<Topic, 'concepts'> | undefined): StepState {
  if (!topic) return 'not-started';
  const goals = topic.concepts.filter((c) => c.goal);
  return goals.length > 0 && goals.every((c) => c.status === 'solid') ? 'done' : 'started';
}

// Praxis: missions that take what he learned out of the app and into his life (his projects, his training,
// his computer, or anywhere else), each closed by his debrief and Claude's review.

/** step: after a roadmap step; capstone: the end of a roadmap; topic: a topic outside any roadmap. */
export type MissionScope = 'step' | 'capstone' | 'topic';
/** open: to do; debriefed: he reported back, waiting for Claude's review; reviewed: closed; dropped: abandoned. */
export type MissionStatus = 'open' | 'debriefed' | 'reviewed' | 'dropped';
export type MissionVerdict = 'achieved' | 'partly' | 'missed';

export interface Mission {
  id: string;
  title: string;
  scope: MissionScope;
  roadmap?: string;
  topic?: string;
  /** Where it happens: one of his projects, his training, his computer, or "anywhere". */
  arena: string;
  /** What to do, in Markdown. */
  brief: string;
  /** What it gets him: the advantage of being able to do this. */
  why: string;
  /** Done when: observable results he can report on. */
  criteria: string[];
  /** The concepts it puts to use, as "topic/id". */
  concepts: string[];
  status: MissionStatus;
  created: string;
  updated: string;
  debrief?: { at: string; text: string };
  review?: { at: string; verdict: MissionVerdict; markdown: string };
}

// What the API returns and accepts beyond the stored records

export interface TopicSummary {
  slug: string;
  title: string;
  goal: string;
  updated: string;
  counts: Record<ConceptStatus, number>;
  /** Solid concepts due for review. */
  fading: number;
  sessions: number;
  handoff?: Handoff;
  trainingLevel?: number;
}

export interface SessionSummary {
  id: string;
  kind: SessionKind;
  topic: string;
  topicSlug: string;
  goal: string;
  startedAt: string;
  lastAt: string;
  endedAt?: string;
  steps: number;
  /** Time actually spent: gaps over 15 minutes between events don't count. */
  activeMinutes: number;
  quizRight: number;
  quizTotal: number;
  asks: number;
  handoff?: Handoff;
}

export interface FadingConcept {
  topic: string;
  topicTitle: string;
  id: string;
  label: string;
  summary?: string;
  due: string;
  /** Estimated chance he'd recall it now, 0 to 1. */
  recall: number;
  lastPractised?: string;
}

export interface ReviewQueue {
  fading: FadingConcept[];
  /** Concepts practised in the current session, in order. */
  practised: { topic: string; id: string; label: string; result: string; at: string }[];
  upcoming: number;
}

export interface Progress {
  /** Solid concepts across all topics at the end of each day with activity. */
  solid: { day: string; count: number }[];
  /** Answers per week (weeks start on Monday), by result. */
  answers: { week: string; right: number; partial: number; wrong: number }[];
  /** Minutes per week, by session kind. */
  minutes: { week: string; learn: number; review: number; train: number }[];
  fading: FadingConcept[];
  /** Due within the next seven days. */
  upcoming: number;
  training: { topic: string; title: string; level: number }[];
}

/** POST /api/answer for a quiz: one pick per question. */
export interface QuizAnswerBody {
  id: string;
  picks: { choice: number | null; note?: string }[];
}

/** POST /api/answer for an open question. */
export interface AskAnswerBody {
  id: string;
  text: string;
}

export type SearchKind = 'roadmap' | 'step' | 'topic' | 'concept' | 'mission' | 'session';

export interface SearchHit {
  kind: SearchKind;
  title: string;
  /** Where it sits, e.g. the roadmap of a step or the topic of a concept. */
  context?: string;
  /** Text around the first match. */
  snippet?: string;
  /** Roadmap, topic or session id. */
  slug?: string;
  /** Concept id, with the topic in `slug`. */
  concept?: string;
  /** Mission id. */
  id?: string;
}

// Glosses

/**
 * A phrase he selected in a lesson because he didn't know it, with a short explanation Claude wrote for it.
 * Wherever the phrase appears afterwards, it carries a hover card with the explanation.
 */
export interface Gloss {
  /** The phrase as a slug: one gloss per phrase. */
  id: string;
  /** The phrase, as he selected it. */
  text: string;
  /** The explanation, Markdown (inline maths allowed). */
  gloss: string;
  /** The sentence or paragraph he selected it in. */
  context?: string;
  /** The topic he was reading, by slug. */
  topic?: string;
  /** A picture from Wikimedia Commons, when the phrase names something seen better than described. */
  image?: GlossImage;
  at: string;
}

export interface GlossImage {
  /** A hotlinkable rendition. */
  src: string;
  /** The file's page on Commons. */
  page: string;
  /** Author and licence, shown under it. */
  credit: string;
  alt: string;
}

/** POST /api/glosses: a phrase to explain, with where it was found. */
export interface GlossBody {
  text: string;
  context?: string;
  topic?: string;
}

// Questions on a passage

/**
 * A question he asked about a passage of a lesson ("Ask about this"), answered by Claude Code on the spot, beside
 * the step, without interrupting the class. Kept with the step it was asked on.
 */
export interface Aside {
  id: string;
  /** The topic he was reading, by slug. */
  topic?: string;
  /** The feed item (a step, a check, feedback) the passage is in, so the step's page can show it. */
  item?: string;
  /** The text he selected. */
  passage: string;
  question: string;
  /** Claude's answer, Markdown. */
  answer: string;
  at: string;
}

/** POST /api/asides. */
export interface AsideBody {
  passage: string;
  question: string;
  /** The paragraph the passage is in, so a few selected words are read in their sense. */
  context?: string;
  topic?: string;
  item?: string;
}
