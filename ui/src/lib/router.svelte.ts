// Hash routing: #/, #/progress, #/map, #/roadmaps, #/roadmaps/<slug>, #/lesson/<slug>, #/topics, #/topics/<slug>?c=<concept>, #/log, #/log/<session>, #/praxis, #/praxis/<mission>.

export type Route =
  | { page: 'now' }
  | { page: 'progress' }
  | { page: 'map' }
  | { page: 'roadmaps' }
  | { page: 'roadmap'; slug: string }
  | { page: 'topics' }
  | { page: 'topic'; slug: string; concept?: string }
  | { page: 'lesson'; slug: string }
  | { page: 'log' }
  | { page: 'session'; id: string }
  | { page: 'praxis' }
  | { page: 'mission'; id: string };

function parse(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query);
  if (parts[0] === 'topics' && parts[1]) return { page: 'topic', slug: parts[1], concept: params.get('c') ?? undefined };
  if (parts[0] === 'topics') return { page: 'topics' };
  if (parts[0] === 'lesson' && parts[1]) return { page: 'lesson', slug: parts[1] };
  if (parts[0] === 'roadmaps' && parts[1]) return { page: 'roadmap', slug: parts[1] };
  if (parts[0] === 'roadmaps') return { page: 'roadmaps' };
  if (parts[0] === 'log' && parts[1]) return { page: 'session', id: parts[1] };
  if (parts[0] === 'log') return { page: 'log' };
  if (parts[0] === 'praxis' && parts[1]) return { page: 'mission', id: parts[1] };
  if (parts[0] === 'praxis') return { page: 'praxis' };
  if (parts[0] === 'progress') return { page: 'progress' };
  if (parts[0] === 'map') return { page: 'map' };
  return { page: 'now' };
}

class Router {
  route = $state<Route>(parse(location.hash));
  readonly parse = parse;

  constructor() {
    addEventListener('hashchange', () => {
      this.route = parse(location.hash);
      scrollTo({ top: 0 });
    });
  }
}

export const router = new Router();

export const link = {
  now: () => '#/',
  progress: () => '#/progress',
  map: () => '#/map',
  roadmaps: () => '#/roadmaps',
  roadmap: (slug: string) => `#/roadmaps/${encodeURIComponent(slug)}`,
  topics: () => '#/topics',
  topic: (slug: string, concept?: string) => `#/topics/${encodeURIComponent(slug)}${concept ? `?c=${encodeURIComponent(concept)}` : ''}`,
  /** The class itself: every step so far, readable without starting anything. */
  lesson: (slug: string) => `#/lesson/${encodeURIComponent(slug)}`,
  log: () => '#/log',
  session: (id: string) => `#/log/${encodeURIComponent(id)}`,
  praxis: () => '#/praxis',
  mission: (id: string) => `#/praxis/${encodeURIComponent(id)}`,
};
