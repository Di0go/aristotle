// The Aristotle server: the core's serve() (@organon/core/server/http: loopback only, HTTP and HTTPS for
// aristotle.test, this user's connections only, the exact Host and Origin, the CSP and the other headers, JSON bodies,
// the built interface with the install's accent, /api/health and /api/state, the pid file, a clean stop) with
// Aristotle's own: its routes, the live feed, the MCP endpoint Claude Code connects to, and the drawer's WebSocket.

import type http from 'node:http';
import { json, type Route, readJson, serve } from '@organon/core/server/http';
import { settingsRoutes } from '@organon/core/server/settings-routes';
import { EventHub } from '@organon/core/server/events';
import { AnswerError, publicItem } from './feed.ts';
import { AsideError } from './asides.ts';
import { GlossError } from './glosses.ts';
import { Gym } from './gym.ts';
import { MissionError } from './missions.ts';
import { Search } from './search.ts';
import { agentLaunch } from './agents.ts';
import { createTutor } from './tutor.ts';
import { leanTopic } from './topics.ts';
import { chatRoutes } from './chat.ts';
import { app } from './config.ts';
import { IDENTITY } from './llm.ts';
import { onPath, settings } from './settings.ts';
import { warnings } from './warnings.ts';
import type { AskAnswerBody, AsideBody, GlossBody, QuizAnswerBody } from '../shared/types.ts';

const gym = await Gym.load();
const feed = gym.feed;
const search = new Search(gym);
const tutor = createTutor(gym);
// The live feed: every change of the sitting, sent to every open page as a server-sent event (the core's EventHub: a
// retry of 2 s, a ping every 20 s the page can see, and a page that stops reading let go).
const events = new EventHub();
feed.events.on('event', (event) => events.send(event));
/** Settings (the core's routes): what the interface reads and changes, the models the API offers, asked as Aristotle. */
const settingsApi = settingsRoutes(settings, { view: settingsView, identity: IDENTITY });
/** The chat's routes (the core's), each message told where he is and what is on his screen (chatContext). */
const chats = chatRoutes(gym.chats, { context: (thread, b) => chatContext(thread, b.where, b.page, b.step, b.mentions) });

/**
 * The MCP endpoint (POST only): the core's handler with Aristotle's tools (mcp.ts), which says when it serves the
 * tutor in the drawer (whose core tools then load up front) and which client it serves.
 */
async function handleMcp(req: http.IncomingMessage, res: http.ServerResponse) {
  const { mcpHandler } = await mcpModule();
  mcpServe ??= mcpHandler(gym);
  await mcpServe(req, res);
}
let mcpServe: ((req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>) | undefined;

/**
 * The tools, loaded once on first use rather than at start (a sixth of a second the interface need not wait for);
 * warmed up just after the server starts listening.
 */
let mcpLoading: Promise<typeof import('./mcp.ts')> | undefined;
function mcpModule() {
  mcpLoading ??= import('./mcp.ts');
  return mcpLoading;
}

/** The interface's JSON API. Every route is listed in docs/architecture.md (generated from the checks below). */
async function routes(...[req, res, route, params]: Parameters<Route>): Promise<boolean> {
  /** The part of the route after `prefix`: a slug or an id. */
  const tail = (prefix: string) => decodeURIComponent(route.slice(prefix.length));
  // The live session
  if (req.method === 'GET' && route === '/api/events') return events.stream(req, res);
  // He is at the page working on an open question: the page counts the sitting as going on (feed.svelte.ts
  // inProgress), so his answer is handed to the tutor still holding it rather than to a fresh one.
  if (req.method === 'POST' && route === '/api/presence') return json(res, 200, { ok: true });
  // He asked for another sitting (continuing another class) while the tutor waits on a question here: wake it.
  if (req.method === 'POST' && route === '/api/leave') return json(res, 200, { released: feed.release() });
  if (req.method === 'POST' && route === '/api/answer') {
    const body = (await readJson(req)) as Partial<QuizAnswerBody & AskAnswerBody> | null;
    if (!body || typeof body.id !== 'string') return json(res, 400, { error: 'Missing id' });
    if (Array.isArray(body.picks) && !body.picks.every(isPick)) return json(res, 400, { error: 'Malformed picks' });
    try {
      // Whether Claude hears this answer now (a quiz or ask call is waiting), or has to be told to collect it. An
      // answer in another sitting is heard too when a call was waiting in this one: it is woken with where he went.
      const heard = feed.awaited(body.id);
      const waiting = feed.waiting();
      const before = feed.session?.id;
      const item = Array.isArray(body.picks)
        ? await gym.answerQuiz(body.id, body.picks)
        : await gym.answerAsk(body.id, String(body.text ?? ''));
      const moved = waiting && feed.session?.id !== before;
      res.setHeader('X-Aristotle-Heard', heard || moved ? 'yes' : 'no');
      // The session the answer went to: an earlier one, when answering it picked that sitting up again.
      res.setHeader('X-Aristotle-Session', feed.session?.id ?? '');
      return json(res, 200, publicItem(item));
    } catch (err) {
      if (err instanceof AnswerError) return json(res, 400, { error: err.message });
      throw err;
    }
  }

  // Topics, roadmaps and missions
  if (req.method === 'GET' && route === '/api/topics') return json(res, 200, gym.topics.list());
  if (req.method === 'GET' && route.startsWith('/api/topics/')) {
    const topic = gym.topics.get(tail('/api/topics/'));
    return topic ? json(res, 200, topic) : json(res, 404, { error: 'No such topic' });
  }
  // The live map: each concept's newest evidence only (topics.ts leanTopic); /api/topics/<slug> has all of it.
  if (req.method === 'GET' && route === '/api/map') return json(res, 200, gym.topics.all().map(leanTopic));
  if (req.method === 'GET' && route === '/api/roadmaps') return json(res, 200, gym.roadmaps.all());
  if (req.method === 'GET' && route.startsWith('/api/roadmaps/')) {
    const roadmap = gym.roadmaps.get(tail('/api/roadmaps/'));
    return roadmap ? json(res, 200, roadmap) : json(res, 404, { error: 'No such roadmap' });
  }
  if (req.method === 'GET' && route === '/api/missions') return json(res, 200, gym.missions.all());
  if (req.method === 'POST' && route.startsWith('/api/missions/')) {
    const id = tail('/api/missions/');
    const body = (await readJson(req)) as { action?: string; text?: unknown } | null;
    try {
      if (body?.action === 'debrief') {
        const text = String(body.text ?? '').trim();
        if (!text) return json(res, 400, { error: 'Write what happened first' });
        return json(res, 200, await gym.missions.debrief(id, text));
      }
      if (body?.action === 'drop' || body?.action === 'restore')
        return json(res, 200, await gym.missions.setDropped(id, body.action === 'drop'));
      return json(res, 400, { error: 'Unknown action' });
    } catch (err) {
      if (err instanceof MissionError) return json(res, 400, { error: err.message });
      throw err;
    }
  }

  // Glosses: explaining a phrase runs Claude Code, so the request waits a few seconds for the answer.
  if (req.method === 'GET' && route === '/api/glosses') return json(res, 200, gym.glosses.all());
  if (req.method === 'POST' && route === '/api/glosses') {
    const body = (await readJson(req)) as Partial<GlossBody> | null;
    if (typeof body?.text !== 'string') return json(res, 400, { error: 'Missing text' });
    const topic = str(body.topic);
    try {
      const gloss = await gym.glosses.explain(
        { text: body.text, context: str(body.context), topic },
        topic && gym.topics.get(topic)?.title,
      );
      return json(res, 200, gloss);
    } catch (err) {
      if (err instanceof GlossError) return json(res, 400, { error: err.message });
      throw err;
    }
  }
  if (req.method === 'DELETE' && route.startsWith('/api/glosses/')) {
    const removed = await gym.glosses.remove(tail('/api/glosses/'));
    return removed ? json(res, 200, { ok: true }) : json(res, 404, { error: 'No such gloss' });
  }

  // His questions on a passage: answered by Claude Code, so the request waits for the answer.
  if (req.method === 'GET' && route === '/api/asides') return json(res, 200, gym.asides.all());
  if (req.method === 'POST' && route === '/api/asides') {
    const body = (await readJson(req)) as Partial<AsideBody> | null;
    if (typeof body?.question !== 'string') return json(res, 400, { error: 'Missing question' });
    const topic = str(body.topic);
    const item = str(body.item);
    const step = item ? gym.feed.stepTitleOf(item) : undefined;
    try {
      const aside = await gym.asides.ask(
        { question: body.question, passage: str(body.passage) ?? '', context: str(body.context), topic, item },
        { topicTitle: topic ? gym.topics.get(topic)?.title : undefined, step },
      );
      return json(res, 200, aside);
    } catch (err) {
      if (err instanceof AsideError) return json(res, 400, { error: err.message });
      throw err;
    }
  }
  if (req.method === 'DELETE' && route.startsWith('/api/asides/')) {
    const removed = await gym.asides.remove(tail('/api/asides/'));
    return removed ? json(res, 200, { ok: true }) : json(res, 404, { error: 'No such question' });
  }

  // His own words: a notebook per step, and his About you page.
  if (req.method === 'GET' && route === '/api/notes') return json(res, 200, gym.notes.all());
  if (req.method === 'PUT' && route === '/api/notes') {
    const body = (await readJson(req)) as { topic?: unknown; step?: unknown; text?: unknown; title?: unknown } | null;
    if (typeof body?.topic !== 'string' || typeof body.step !== 'string' || typeof body.text !== 'string') {
      return json(res, 400, { error: 'Missing topic, step or text' });
    }
    const title = typeof body.title === 'string' ? body.title : undefined;
    // A topic slug and a step id are short; anything longer is not one.
    if (body.topic.length > 200 || body.step.length > 200) return json(res, 400, { error: 'Unknown topic or step' });
    return json(res, 200, { note: await gym.notes.write(body.topic, body.step, body.text, title) });
  }
  if (req.method === 'GET' && route === '/api/about') return json(res, 200, { text: gym.notes.about() });
  if (req.method === 'PUT' && route === '/api/about') {
    const body = (await readJson(req)) as { text?: unknown } | null;
    if (typeof body?.text !== 'string') return json(res, 400, { error: 'Missing text' });
    await gym.notes.setAbout(body.text);
    return json(res, 200, { text: gym.notes.about() });
  }

  // The chat beside a lesson: his message, with where he is; the answer streams over the live feed as it is written.
  if (await chats(req, res, route, params)) return true;

  // Who teaches (the core's settings routes): the interface reads and changes it; the API key only ever goes in.
  if (await settingsApi(req, res, route, params)) return true;

  // History, progress and search
  if (req.method === 'GET' && route === '/api/sessions') return json(res, 200, await gym.listSessions(params.get('topic') ?? undefined));
  if (req.method === 'GET' && route.startsWith('/api/sessions/')) {
    const record = await gym.readSession(tail('/api/sessions/'));
    if (!record?.session) return json(res, 404, { error: 'No such session' });
    return json(res, 200, { session: record.session, items: record.items.map(publicItem), handoff: record.handoff });
  }
  if (req.method === 'GET' && route === '/api/progress') return json(res, 200, await gym.progress());
  if (req.method === 'GET' && route === '/api/reviews') return json(res, 200, gym.reviewQueue());
  if (req.method === 'GET' && route === '/api/search') return json(res, 200, await search.query(params.get('q') ?? ''));
  if (req.method === 'GET' && route === '/api/backup') return json(res, 200, gym.backup.state());

  return false;
}

/** The settings as the interface sees them, with whether each agent's command is on this machine. */
function settingsView() {
  return settings.view((id) => onPath(agentLaunch(id).file));
}

/**
 * What the chat is told with each of his messages: where he is, what is on his screen, what he holds in the class,
 * his notes on the step and what he says about himself. Fresh every time, so it is never out of date.
 */
function chatContext(thread: string, where?: string, page?: string, step?: string, mentions?: string): string {
  const topic = gym.topics.get(thread);
  const parts = [`Where they are now: ${where ?? (topic ? `the class ${topic.title}` : 'outside any class (Home, the map…)')}`];
  if (topic) {
    const by = (s: string) => topic.concepts.filter((c) => c.status === s).map((c) => c.label);
    parts.push(
      `The class: ${topic.title}. Its goal: ${topic.goal}`,
      `On its map: solid: ${by('solid').join(', ') || 'none yet'}; shaky: ${by('shaky').join(', ') || 'none'}; not yet: ${by('unknown').join(', ') || 'none'}.`,
    );
  }
  if (page) parts.push(`What is on their screen:\n${page}`);
  if (mentions) parts.push(`What they tagged with @ in their message:\n${mentions.slice(0, 8000)}`);
  const note = step && topic ? gym.notes.of(topic.slug).find((n) => n.step === step) : undefined;
  if (note) parts.push(`Their own notes on this step:\n${note.text}`);
  const about = gym.notes.about().trim();
  if (about) parts.push(`About them, in their words:\n${about}`);
  return parts.join('\n\n');
}

/** A body field that should be a string: itself, or undefined when it is anything else. */
function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** One quiz pick as the interface sends it: an option index (or null for "I don't know") and an optional note. */
function isPick(p: unknown): p is { choice: number | null; note?: string } {
  if (typeof p !== 'object' || p === null) return false;
  const { choice, note } = p as { choice?: unknown; note?: unknown };
  return (choice === null || typeof choice === 'number') && (note === undefined || typeof note === 'string');
}

await serve(app, {
  warnings,
  state: () => ({ ...feed.state() }),
  accent: () => settings.accent,
  // Figures from Wikimedia Commons (find_images, glosses): the one host besides its own the pages show images from.
  images: ['https://upload.wikimedia.org'],
  mcp: handleMcp,
  api: routes,
  // The drawer runs the tutor (Claude Code, another agent, or the API tutor), so it is only ever reachable from
  // Aristotle's own pages: the core lets an upgrade through only with this server's Host, one of its own Origins and
  // not cross-site, and the drawer takes /api/terminal (at most eight at once, 1 MB frames).
  upgrade: tutor.upgrade,
  // A release restarts the server mid-lesson: the streams close, the tutor stops, the stores finish writing.
  stop: async () => {
    events.close();
    tutor.stop();
    await gym.idle();
  },
});
setImmediate(() => {
  void mcpModule();
  // Every session log read into the index now, a few at a time, rather than on the first Home, Progress or search.
  void gym.warm();
});
