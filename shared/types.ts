// Types shared by the server and the interface.

export type BlockKind = 'step' | 'plan' | 'summary' | 'feedback' | 'note';
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

export function isInteractive<T extends { type: string }>(item: T): item is T & { type: 'quiz' | 'ask' } {
  return item.type === 'quiz' || item.type === 'ask';
}

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

// Knowledge maps

export type ConceptStatus = 'unknown' | 'shaky' | 'solid';

export interface Evidence {
  at: string;
  session: string;
  /** The feed item it came from, if any. */
  item?: string;
  /** quiz and ask: checks during a lesson; practice: reviews and training problems. */
  kind: 'quiz' | 'ask' | 'practice';
  /** Quiz answers and practice. */
  result?: 'right' | 'partial' | 'wrong' | 'dont-know';
  practice?: 'recall' | 'problem';
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

/** Solid, but due for review. */
export function isFading(concept: Pick<Concept, 'status' | 'review'>, now = Date.now()): boolean {
  return concept.status === 'solid' && Boolean(concept.review) && Date.parse(concept.review!.due) <= now;
}

/** What a session leaves for the next one ("done for now"). */
export interface Handoff {
  at: string;
  session: string;
  locked: string;
  shaky: string;
  next: string;
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

/** An unanswered quiz reaches the interface without its answer key. */
export type PublicQuestion = Omit<QuizQuestion, 'correct' | 'explanation'> &
  Partial<Pick<QuizQuestion, 'correct' | 'explanation'>>;
export type PublicQuizItem = Omit<QuizItem, 'questions'> & { questions: PublicQuestion[] };
export type PublicItem = BlockItem | PublicQuizItem | AskItem | MapItem;

export interface FeedState {
  session: Session | null;
  items: PublicItem[];
}

export type FeedEvent =
  | { type: 'session'; session: Session }
  | { type: 'item'; item: PublicItem }
  | { type: 'topic'; topic: Topic };

export interface QuizAnswerBody {
  id: string;
  picks: { choice: number | null; note?: string }[];
}

export interface AskAnswerBody {
  id: string;
  text: string;
}
