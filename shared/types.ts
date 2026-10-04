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
  response?: string;
  answeredAt?: string;
  delivered?: boolean;
}

export type Item = BlockItem | QuizItem | AskItem;

export interface Session {
  id: string;
  topic: string;
  goal: string;
  startedAt: string;
}

/** An unanswered quiz reaches the interface without its answer key. */
export type PublicQuestion = Omit<QuizQuestion, 'correct' | 'explanation'> &
  Partial<Pick<QuizQuestion, 'correct' | 'explanation'>>;
export type PublicQuizItem = Omit<QuizItem, 'questions'> & { questions: PublicQuestion[] };
export type PublicItem = BlockItem | PublicQuizItem | AskItem;

export interface FeedState {
  session: Session | null;
  items: PublicItem[];
}

export type FeedEvent = { type: 'session'; session: Session } | { type: 'item'; item: PublicItem };

export interface QuizAnswerBody {
  id: string;
  picks: { choice: number | null; note?: string }[];
}

export interface AskAnswerBody {
  id: string;
  text: string;
}
