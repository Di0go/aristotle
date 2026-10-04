// The tools Claude Code uses to teach through the interface.

import { randomInt } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  CallToolResult,
  ServerNotification,
  ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod';
import { KEEPALIVE_MS, URL_CLEAN, WAIT_MS } from './config.ts';
import type { Feed } from './feed.ts';
import type { AskItem, QuizItem, QuizQuestion } from '../shared/types.ts';

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

const text = (t: string): CallToolResult => ({ content: [{ type: 'text', text: t }] });

const MATH_AND_DIAGRAMS =
  'Markdown is rendered with LaTeX maths ($...$ inline, $$...$$ on its own lines; write a literal dollar as \\$), ' +
  '```mermaid code blocks as diagrams, and inline <svg> elements.';

export function createMcpServer(feed: Feed): McpServer {
  const mcp = new McpServer(
    { name: 'mind-gym', version: '0.1.0' },
    {
      instructions:
        `The Mind Gym is the learner's interface at ${URL_CLEAN}. They read and answer there, not in the terminal: ` +
        'put all teaching content in `show`, all graded questions in `quiz`, and all open questions in `ask`. ' +
        'Keep your terminal replies to a line or two.',
    },
  );

  mcp.registerTool(
    'start_session',
    {
      title: 'Start a session',
      description:
        'Start a new learning session in the Mind Gym. Clears the "Now" view and opens a new session log. ' +
        'Call it once when a sitting starts, and again when the learner switches topic.',
      inputSchema: {
        topic: z.string().min(1).describe('The topic in a few words, e.g. "Differential forms"'),
        goal: z.string().min(1).describe('What the learner wants from this session, in one sentence'),
      },
    },
    async ({ topic, goal }) => {
      const session = await feed.startSession(topic, goal);
      return text(`Session "${session.topic}" started (${session.id}).`);
    },
  );

  mcp.registerTool(
    'show',
    {
      title: 'Show the learner something',
      description:
        'Show content in the Mind Gym: an explanation step, the plan, a summary, or feedback on an answer. ' +
        'Use one call per reasoning step rather than one long message. ' +
        MATH_AND_DIAGRAMS +
        ' Returns immediately.',
      inputSchema: {
        markdown: z.string().min(1).describe('The content, in Markdown'),
        title: z.string().optional().describe('A short heading'),
        kind: z
          .enum(['step', 'plan', 'summary', 'feedback', 'note'])
          .default('step')
          .describe('step: one teaching step; plan: the lesson plan; summary: a recap; feedback: a critique of an answer; note: anything else'),
      },
    },
    async ({ markdown, title, kind }) => {
      await feed.add({ type: 'block', kind, markdown, ...(title ? { title } : {}) });
      return text('Shown.');
    },
  );

  mcp.registerTool(
    'quiz',
    {
      title: 'Quiz the learner',
      description:
        'Ask one or more graded multiple-choice questions in the Mind Gym and wait for the answers. ' +
        'The interface shuffles the options, always adds "I don\'t know" and a note field, and shows right/wrong with your explanation as soon as they answer. ' +
        'Write every option as a bare claim of similar length and form, with no reasoning in it, so the right one cannot be spotted by its wording; ' +
        'put the reasoning in `explanation`. Each wrong option should be a mistake the learner might really make. ' +
        MATH_AND_DIAGRAMS,
      inputSchema: {
        questions: z
          .array(
            z.object({
              question: z.string().min(1),
              options: z.array(z.string().min(1)).min(2).max(6),
              correct: z.number().int().min(0).describe('Index of the right option in `options`'),
              explanation: z.string().min(1).describe('Why the right answer is right, shown after they answer'),
              strand: z.string().optional().describe('Which strand of the topic this tests, a word or two'),
            }),
          )
          .min(1)
          .max(5),
      },
    },
    async ({ questions }, extra) => {
      for (const [i, q] of questions.entries()) {
        if (q.correct >= q.options.length) {
          return { ...text(`Question ${i + 1}: correct is ${q.correct} but there are ${q.options.length} options.`), isError: true };
        }
      }
      const item = await feed.add({ type: 'quiz', questions: questions.map(shuffle) });
      const answered = await waitForLearner(feed, item.id, extra);
      if (answered?.type !== 'quiz') return notAnswered();
      await feed.markDelivered(item.id);
      return text(formatQuiz(answered));
    },
  );

  mcp.registerTool(
    'ask',
    {
      title: 'Ask an open question',
      description:
        'Ask the learner to write an answer in the Mind Gym and wait for it: a problem to solve without help, ' +
        'a concept to explain in their own words, or something to recall from memory. ' +
        'The interface gives them a text box with a live maths preview. Critique what they write with `show` (kind "feedback"). ' +
        MATH_AND_DIAGRAMS,
      inputSchema: {
        prompt: z.string().min(1).describe('The question, in Markdown'),
        kind: z
          .enum(['problem', 'explain', 'recall', 'open'])
          .default('open')
          .describe('problem: solve it; explain: put it in your own words; recall: answer from memory; open: anything else'),
        placeholder: z.string().optional().describe('Hint text shown in the empty box'),
      },
    },
    async ({ prompt, kind, placeholder }, extra) => {
      const item = await feed.add({ type: 'ask', kind, prompt, ...(placeholder ? { placeholder } : {}) });
      const answered = await waitForLearner(feed, item.id, extra);
      if (answered?.type !== 'ask') return notAnswered();
      await feed.markDelivered(item.id);
      return text(formatAsk(answered));
    },
  );

  mcp.registerTool(
    'collect_answers',
    {
      title: 'Collect late answers',
      description:
        'Get answers the learner gave in the Mind Gym after a `quiz` or `ask` call stopped waiting, ' +
        'for example because they stepped away and came back. Call it when they say they are back or have answered.',
    },
    async () => {
      const late = feed.undelivered();
      if (late.length === 0) return text('No new answers.');
      const parts: string[] = [];
      for (const item of late) {
        parts.push(item.type === 'quiz' ? formatQuiz(item) : formatAsk(item));
        await feed.markDelivered(item.id);
      }
      return text(parts.join('\n\n---\n\n'));
    },
  );

  return mcp;
}

/** Waits for the learner, sending progress notifications so the call doesn't look idle. */
async function waitForLearner(feed: Feed, id: string, extra: Extra) {
  const token = extra._meta?.progressToken;
  let ticks = 0;
  const keepalive =
    token === undefined
      ? undefined
      : setInterval(() => {
          extra
            .sendNotification({
              method: 'notifications/progress',
              params: { progressToken: token, progress: ++ticks, message: 'Waiting for the learner to answer' },
            })
            .catch(() => {});
        }, KEEPALIVE_MS);
  try {
    return await feed.waitFor(id, WAIT_MS, extra.signal);
  } finally {
    clearInterval(keepalive);
  }
}

function notAnswered(): CallToolResult {
  const minutes = Math.round(WAIT_MS / 60_000);
  return text(
    `No answer yet: the learner hasn't answered in the Mind Gym within ${minutes} minutes, so they have probably stepped away. ` +
      'The question stays open there and their answer will be saved. End your turn now without asking anything else. ' +
      'When they are back, call `collect_answers`.',
  );
}

function shuffle(q: QuizQuestion): QuizQuestion {
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { ...q, options: order.map((i) => q.options[i]), correct: order.indexOf(q.correct) };
}

function formatQuiz(item: QuizItem): string {
  const lines = item.questions.map((q, i) => {
    const r = item.responses?.[i];
    const tag = q.strand ? ` [${q.strand}]` : '';
    const right = `"${q.options[q.correct]}"`;
    let line: string;
    if (!r || r.choice === null) line = `Q${i + 1}${tag}: said "I don't know". Right answer: ${right}.`;
    else if (r.correct) line = `Q${i + 1}${tag}: right (${right}).`;
    else line = `Q${i + 1}${tag}: wrong. Chose "${q.options[r.choice]}". Right answer: ${right}.`;
    return r?.note ? `${line}\n  Their note: "${r.note}"` : line;
  });
  const score = item.responses?.filter((r) => r.correct).length ?? 0;
  return `Quiz answered: ${score}/${item.questions.length} right. They have already seen the right answers and your explanations.\n${lines.join('\n')}`;
}

function formatAsk(item: AskItem): string {
  return `The learner answered (${item.kind}):\n\n${item.response ?? ''}`;
}
