// Aristotle's own tutor, on a model behind an OpenAI-compatible API (llm.ts), for anyone who would rather teach with
// another model than Claude, a local one included: the core's (@organon/core/server/tutor-api: the conversation, the
// loop that runs tool calls through Aristotle's own MCP server in process, a web search to check facts, the context
// kept to the model's size, the transcript the drawer shows, kept in the state folder so a restart picks it up). What
// it is told it is and how it works here, what each of Aristotle's tools says in the drawer, how long a question may
// wait for the learner, and the words it uses are Aristotle's.

import type { ApiTutorOptions } from '@organon/core/server/tutor-api';
import { WAIT_MS } from './config.ts';
import type { Gym } from './gym.ts';
import { IDENTITY } from './llm.ts';
import { createMcpServer } from './mcp.ts';
import { method } from './method.ts';

/** How it works for a tutor that is not Claude Code: said in its instructions, after the rules every sitting keeps. */
const HERE =
  'How it works here, since you are not Claude Code:\n' +
  '- The learner talks to you in Aristotle\'s tutor panel, and the app\'s buttons send you requests in words ("Use the teach skill to teach me: …"). ' +
  'Your replies there are a line or two: everything you teach goes through `show`, `quiz` and `ask`.\n' +
  "- Before you start a sitting, read its skill with `method` and follow it. Where it names Claude Code's subagents: check facts with `web_search` and `read_page` " +
  '(verify anything you are not sure of before you teach it); for a figure the visual kit can\'t draw, read `method` "illustrator" and draw it yourself. "The terminal" is this panel.\n' +
  "- Files are out of your reach: the learner's profile is the `profile` tool, their About you page `read_about`.\n" +
  "- Call the tools that belong together in one response, in order: a step's `show`, then its `quiz` or `ask`. Never put teaching in your reply instead of `show`.\n" +
  '- `quiz` and `ask` wait for the learner and return their answers. When one returns "No answer yet", do what it says, then stop: no further tool calls.';

/** For a model that can't see: what it does instead of the tools that return pictures. */
const BLIND =
  "You can't see images: preview_svg and view_image are not available to you. Prefer the visual kit's blocks (balance, timeline, flow, " +
  'sequence, mermaid) to hand-drawn SVG, and for a plate use find_images and place markers only where its title and description make the position certain.';

/** Put before a conversation shortened to fit the model's context. */
const DROPPED =
  "(Earlier parts of this conversation were dropped to fit the model's context. What happened is saved in Aristotle: list_topics, get_topic and start_session say where things stand.)";

/** One line for the drawer: what the call was about. */
function summarize(name: string, a: Record<string, unknown>): string | undefined {
  const s = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
  const short = (v: string, n = 90) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);
  const count = (v: unknown, one: string) => (Array.isArray(v) ? `${v.length} ${one}${v.length === 1 ? '' : 's'}` : '');
  switch (name) {
    case 'show':
      return short(s(a.title) || s(a.markdown).replace(/^#+\s*/, '')) + (a.kind && a.kind !== 'step' ? ` (${s(a.kind)})` : '');
    case 'quiz':
      return count(a.questions, 'question');
    case 'ask':
      return short(s(a.prompt));
    case 'update_map':
      return [
        count(a.concepts, 'concept'),
        Array.isArray(a.remove) && a.remove.length ? `${a.remove.length} removed` : '',
        s(a.focus) && `focus ${s(a.focus)}`,
      ]
        .filter(Boolean)
        .join(', ');
    case 'start_session':
      return [s(a.kind) || 'learn', s(a.topic)].filter(Boolean).join(' · ');
    case 'record_practice':
      return count(a.results, 'result');
    case 'read_page':
      return short(s(a.url));
    default: {
      const first = Object.values(a).find((v) => typeof v === 'string' && v.trim());
      return short(s(first));
    }
  }
}

/** The API tutor, as the core's drawer (server/tutor.ts) runs it over this gym. */
export function apiTutor(gym: Gym): Omit<ApiTutorOptions, 'app' | 'settings'> {
  return {
    method,
    mcp: () => createMcpServer(gym, { client: 'aristotle' }),
    intro:
      "You are the tutor in Aristotle, a personal tutor for one learner, named after the one who taught Alexander. You teach through Aristotle's tools; the learner reads and answers in the app.",
    here: HERE,
    dropped: DROPPED,
    summarize,
    // quiz and ask hold the call while the learner thinks: the drawer says so.
    activity: (name, args) =>
      name === 'quiz' || name === 'ask' || (name === 'collect_answers' && args.wait) ? 'waiting for you' : undefined,
    // A tool call may wait for the learner this long in all (quiz and ask), plus a margin.
    toolTimeoutMs: WAIT_MS + 10 * 60_000,
    blind: { tools: ['preview_svg', 'view_image'], say: BLIND },
    identity: IDENTITY,
    webAgent: 'Aristotle-tutor',
    words: {
      stoppedBefore: 'Not run: the learner stopped you first.',
      stoppedDuring:
        'Stopped by the learner while it ran. If it was a quiz or ask, the question stays open: collect_answers gets the answer later.',
      noTools: "Aristotle's tutor needs a model that can call tools: pick another in Settings.",
      skills: 'The skills (read one with `method` before a sitting of its kind):',
      search:
        'Use it before teaching any fact, name, date, number or formula you are not certain of, then read the best sources with read_page.',
    },
  };
}
