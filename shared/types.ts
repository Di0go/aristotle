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

export interface Session {
  id: string;
  /** The topic's title. */
  topic: string;
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
  item: string;
  kind: 'quiz' | 'ask';
  /** Quiz answers only. */
  result?: 'right' | 'wrong' | 'dont-know';
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
  evidence: Evidence[];
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
  sessions: number;
  handoff?: Handoff;
}

export interface SessionSummary {
  id: string;
  topic: string;
  topicSlug: string;
  goal: string;
  startedAt: string;
  lastAt: string;
  endedAt?: string;
  steps: number;
  quizRight: number;
  quizTotal: number;
  asks: number;
  handoff?: Handoff;
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
