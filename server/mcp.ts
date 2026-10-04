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
import type { Gym } from './gym.ts';
import { describeTopic } from './topics.ts';
import type { AskItem, MapChange, QuizItem, QuizQuestion, TopicSummary } from '../shared/types.ts';

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

const text = (t: string): CallToolResult => ({ content: [{ type: 'text', text: t }] });
const error = (t: string): CallToolResult => ({ ...text(t), isError: true });

const MATH_AND_DIAGRAMS =
  'Markdown is rendered with LaTeX maths ($...$ inline, $$...$$ on its own lines; write a literal dollar as \\$), ' +
  '```mermaid code blocks as diagrams, and inline <svg> elements.';

const STATUSES =
  'Statuses: "unknown" = he has not shown he holds it; "shaky" = partly (needed help, inconsistent, or holds a misconception: say which in `note`); ' +
  '"solid" = he got a check on it right without help, ideally by producing or applying it rather than recognising it.';

const conceptParam = z
  .string()
  .optional()
  .describe('Id of the map concept this is about');

export function createMcpServer(gym: Gym): McpServer {
  const mcp = new McpServer(
    { name: 'mind-gym', version: '0.2.0' },
    {
      instructions:
        `The Mind Gym is the learner's interface at ${URL_CLEAN}. He reads and answers there, not in the terminal: ` +
        'teaching content goes in `show`, graded questions in `quiz`, open questions in `ask`, and what he knows goes on the map with `update_map` ' +
        '(the gym draws the map). Keep terminal replies to a line or two.',
    },
  );

  mcp.registerTool(
    'list_topics',
    {
      title: 'List topics',
      description: 'List every topic the learner has studied, with how much of each map is solid and where the last session left off.',
    },
    async () => {
      const topics = gym.topics.list();
      if (topics.length === 0) return text('No topics yet.');
      return text(topics.map(formatSummary).join('\n'));
    },
  );

  mcp.registerTool(
    'get_topic',
    {
      title: 'Read a topic',
      description:
        "Read a topic's knowledge map (every concept, its status, prerequisites, notes and check record), the last handoff, and recent sessions. " +
        'Read it before continuing a topic.',
      inputSchema: { topic: z.string().min(1).describe('Topic slug or title') },
    },
    async ({ topic }) => {
      const t = gym.topics.get(topic);
      if (!t) return error(`No topic "${topic}". Topics: ${gym.topics.list().map((x) => x.slug).join(', ') || 'none'}.`);
      const sessions = (await gym.listSessions(t.slug)).slice(0, 5);
      const recent = sessions.map(
        (s) =>
          `- ${s.startedAt.slice(0, 16).replace('T', ' ')}: ${s.goal} (${s.steps} steps, quizzes ${s.quizRight}/${s.quizTotal}, ${s.asks} written)`,
      );
      return text(`${describeTopic(t)}\n\nRecent sessions:\n${recent.join('\n') || '(none)'}`);
    },
  );

  mcp.registerTool(
    'start_session',
    {
      title: 'Start a session',
      description:
        'Start a learning session in the Mind Gym. Clears the "Now" view, opens a new session log and links it to a topic. ' +
        'Pass an existing topic slug to continue that topic (check `list_topics` first), or a new title to create one. ' +
        'Call it when a sitting starts and whenever the topic changes.',
      inputSchema: {
        topic: z.string().min(1).describe('Existing topic slug, or the title of a new topic, e.g. "Differential forms"'),
        goal: z.string().min(1).describe('What he wants from this session, in one sentence'),
        topic_goal: z.string().optional().describe("For a new topic: what he ultimately wants from it. Defaults to the session's goal"),
      },
    },
    async ({ topic, goal, topic_goal }) => {
      const { session, topic: t, created } = await gym.startSession(topic, goal, topic_goal);
      if (created) return text(`New topic "${t.title}" (${t.slug}) created; session ${session.id} started. The map is empty.`);
      const s = formatSummary(gym.topics.list().find((x) => x.slug === t.slug)!);
      return text(`Session ${session.id} started on an existing topic:\n${s}\nCall get_topic for the full map.`);
    },
  );

  mcp.registerTool(
    'update_map',
    {
      title: 'Update the knowledge map',
      description:
        "Add, change or remove concepts on the current topic's knowledge map, which the gym draws as a graph. " +
        'Concepts are nodes; `deps` are their prerequisites (edges). Use it to sketch the strands while probing, to lay out the plan, ' +
        'and to mark progress as each step locks in. Only the fields you pass change. ' +
        STATUSES,
      inputSchema: {
        concepts: z
          .array(
            z.object({
              id: z.string().min(1).describe('Short kebab-case id, stable across sessions, e.g. "line-integral"'),
              label: z.string().optional().describe('Display name; needed for a new concept'),
              summary: z.string().optional().describe('One line: what it is'),
              status: z.enum(['unknown', 'shaky', 'solid']).optional(),
              deps: z.array(z.string()).optional().describe('Prerequisite ids in this topic, or "other-topic/id". Replaces the list'),
              goal: z.boolean().optional().describe('True for what the topic is aiming at'),
              note: z.string().optional().describe('Something to watch, e.g. a misconception. An empty string clears it'),
            }),
          )
          .default([]),
        remove: z.array(z.string()).optional().describe('Ids of concepts to remove'),
        focus: z.string().optional().describe('Id of the concept being taught now; an empty string clears it'),
        topic: z.string().optional().describe("Topic slug; defaults to the current session's topic"),
      },
    },
    async ({ concepts, remove, focus, topic }) => {
      try {
        const changes = await gym.updateMap(concepts, remove ?? [], focus, topic);
        const t = topic ? gym.topics.get(topic) : gym.currentTopic();
        const ids = new Set(t?.concepts.map((c) => c.id));
        const dangling = [...new Set(t?.concepts.flatMap((c) => c.deps.filter((d) => !d.includes('/') && !ids.has(d))))];
        return text(
          `Map updated: ${changes.length ? changes.map(formatChange).join('; ') : 'no status changes'}.` +
            (dangling.length ? ` Prerequisites not on the map yet: ${dangling.join(', ')}.` : ''),
        );
      } catch (err) {
        return error((err as Error).message);
      }
    },
  );

  mcp.registerTool(
    'show',
    {
      title: 'Show the learner something',
      description:
        'Show content in the Mind Gym: one teaching step, the plan, a summary, or feedback on an answer. ' +
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
        concept: conceptParam.describe('Id of the map concept this step teaches; the map highlights it'),
      },
    },
    async ({ markdown, title, kind, concept }) => {
      if (!gym.feed.session) return error('No session: call start_session first.');
      await gym.feed.add({ type: 'block', kind, markdown, ...(title ? { title } : {}), ...(concept ? { concept } : {}) });
      if (concept) await gym.focus(concept);
      return text('Shown.');
    },
  );

  mcp.registerTool(
    'quiz',
    {
      title: 'Quiz the learner',
      description:
        'Ask one or more graded multiple-choice questions in the Mind Gym and wait for the answers. ' +
        'The interface shuffles the options, always adds "I don\'t know" and a note field, and shows right/wrong with your explanation as soon as he answers. ' +
        'Write every option as a bare claim of similar length and form, with no reasoning in it, so the right one cannot be spotted by its wording; ' +
        'put the reasoning in `explanation`. Each wrong option should be a mistake he might really make. ' +
        'Tag each question with its map `concept` so the answer is recorded on the map. ' +
        MATH_AND_DIAGRAMS,
      inputSchema: {
        questions: z
          .array(
            z.object({
              question: z.string().min(1),
              options: z.array(z.string().min(1)).min(2).max(6),
              correct: z.number().int().min(0).describe('Index of the right option in `options`'),
              explanation: z.string().min(1).describe('Why the right answer is right, shown after he answers'),
              concept: conceptParam,
              strand: z.string().optional().describe('A label to show above the question, a word or two'),
            }),
          )
          .min(1)
          .max(5),
      },
    },
    async ({ questions }, extra) => {
      if (!gym.feed.session) return error('No session: call start_session first.');
      for (const [i, q] of questions.entries()) {
        if (q.correct >= q.options.length) {
          return error(`Question ${i + 1}: correct is ${q.correct} but there are ${q.options.length} options.`);
        }
      }
      const item = await gym.feed.add({ type: 'quiz', questions: questions.map(shuffle) });
      const answered = await waitForLearner(gym, item.id, extra);
      if (answered?.type !== 'quiz') return notAnswered();
      await gym.feed.markDelivered(item.id);
      return text(formatQuiz(answered, gym));
    },
  );

  mcp.registerTool(
    'ask',
    {
      title: 'Ask an open question',
      description:
        'Ask the learner to write an answer in the Mind Gym and wait for it: a problem to solve without help, ' +
        'a concept to explain in his own words, or something to recall from memory. Producing an answer is a heavier, more telling check than recognising one. ' +
        'The interface gives him a text box with a live maths preview. Critique what he writes with `show` (kind "feedback"). ' +
        MATH_AND_DIAGRAMS,
      inputSchema: {
        prompt: z.string().min(1).describe('The question, in Markdown'),
        kind: z
          .enum(['problem', 'explain', 'recall', 'open'])
          .default('open')
          .describe('problem: solve it; explain: put it in your own words; recall: answer from memory; open: anything else'),
        concept: conceptParam,
        placeholder: z.string().optional().describe('Hint text shown in the empty box'),
      },
    },
    async ({ prompt, kind, concept, placeholder }, extra) => {
      if (!gym.feed.session) return error('No session: call start_session first.');
      const item = await gym.feed.add({
        type: 'ask',
        kind,
        prompt,
        ...(concept ? { concept } : {}),
        ...(placeholder ? { placeholder } : {}),
      });
      const answered = await waitForLearner(gym, item.id, extra);
      if (answered?.type !== 'ask') return notAnswered();
      await gym.feed.markDelivered(item.id);
      return text(formatAsk(answered));
    },
  );

  mcp.registerTool(
    'collect_answers',
    {
      title: 'Collect late answers',
      description:
        'Get answers the learner gave in the Mind Gym after a `quiz` or `ask` call stopped waiting, ' +
        'for example because he stepped away and came back. Call it when he says he is back or has answered.',
    },
    async () => {
      const late = gym.feed.undelivered();
      if (late.length === 0) return text('No new answers.');
      const parts: string[] = [];
      for (const item of late) {
        parts.push(item.type === 'quiz' ? formatQuiz(item, gym) : formatAsk(item));
        await gym.feed.markDelivered(item.id);
      }
      return text(parts.join('\n\n---\n\n'));
    },
  );

  mcp.registerTool(
    'end_session',
    {
      title: 'End the session',
      description:
        'Close the session with a handoff for next time: what locked in, what is still shaky, and the next step. ' +
        'Shown to him as a summary and read back by `get_topic` when he continues. Call it when he says he is done or stopping, ' +
        'after updating the map.',
      inputSchema: {
        locked: z.string().min(1).describe('What locked in this session (concept names and what he can now do)'),
        shaky: z.string().min(1).describe('What is still shaky or untested, or "nothing"'),
        next: z.string().min(1).describe('Where to pick up next time: the next concept and why'),
      },
    },
    async ({ locked, shaky, next }) => {
      try {
        await gym.endSession(locked, shaky, next);
        return text('Session ended; handoff saved.');
      } catch (err) {
        return error((err as Error).message);
      }
    },
  );

  return mcp;
}

/** Waits for the learner, sending progress notifications so the call doesn't look idle. */
async function waitForLearner(gym: Gym, id: string, extra: Extra) {
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
    return await gym.feed.waitFor(id, WAIT_MS, extra.signal);
  } finally {
    clearInterval(keepalive);
  }
}

function notAnswered(): CallToolResult {
  const minutes = Math.round(WAIT_MS / 60_000);
  return text(
    `No answer yet: he hasn't answered in the Mind Gym within ${minutes} minutes, so he has probably stepped away. ` +
      'The question stays open there and his answer will be saved. End your turn now without asking anything else. ' +
      'When he is back, call `collect_answers`.',
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

function formatQuiz(item: QuizItem, gym: Gym): string {
  const known = new Set(gym.currentTopic()?.concepts.map((c) => c.id));
  const missing = new Set<string>();
  const lines = item.questions.map((q, i) => {
    const r = item.responses?.[i];
    const tag = q.concept ?? q.strand;
    if (q.concept && !known.has(q.concept)) missing.add(q.concept);
    const label = `Q${i + 1}${tag ? ` [${tag}]` : ''}`;
    const right = `"${q.options[q.correct]}"`;
    let line: string;
    if (!r || r.choice === null) line = `${label}: said "I don't know". Right answer: ${right}.`;
    else if (r.correct) line = `${label}: right (${right}).`;
    else line = `${label}: wrong. Chose "${q.options[r.choice]}". Right answer: ${right}.`;
    return r?.note ? `${line}\n  His note: "${r.note}"` : line;
  });
  const score = item.responses?.filter((r) => r.correct).length ?? 0;
  return (
    `Quiz answered: ${score}/${item.questions.length} right. He has already seen the right answers and your explanations.\n${lines.join('\n')}` +
    (missing.size ? `\n(Not recorded on the map, no such concept: ${[...missing].join(', ')}.)` : '')
  );
}

function formatAsk(item: AskItem): string {
  return `He answered (${item.kind}${item.concept ? `, concept ${item.concept}` : ''}):\n\n${item.response ?? ''}`;
}

function formatSummary(t: TopicSummary): string {
  const { solid, shaky, unknown } = t.counts;
  const next = t.handoff ? ` | next: ${t.handoff.next}` : '';
  return `- ${t.slug}: "${t.title}" (${solid} solid, ${shaky} shaky, ${unknown} unknown; ${t.sessions} sessions; last ${t.updated.slice(0, 10)})${next}`;
}

function formatChange(c: MapChange): string {
  if (c.removed) return `removed ${c.id}`;
  if (c.added) return `added ${c.id} (${c.to})`;
  return `${c.id} ${c.from} → ${c.to}`;
}
