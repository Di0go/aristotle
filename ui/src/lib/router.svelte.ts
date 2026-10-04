// Hash routing: #/, #/progress, #/map, #/topics, #/topics/<slug>?c=<concept>, #/log, #/log/<session>.

export type Route =
  | { page: 'now' }
  | { page: 'progress' }
  | { page: 'map' }
  | { page: 'topics' }
  | { page: 'topic'; slug: string; concept?: string }
  | { page: 'log' }
  | { page: 'session'; id: string };

function parse(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query);
  if (parts[0] === 'topics' && parts[1]) return { page: 'topic', slug: parts[1], concept: params.get('c') ?? undefined };
  if (parts[0] === 'topics') return { page: 'topics' };
  if (parts[0] === 'log' && parts[1]) return { page: 'session', id: parts[1] };
  if (parts[0] === 'log') return { page: 'log' };
  if (parts[0] === 'progress') return { page: 'progress' };
  if (parts[0] === 'map') return { page: 'map' };
  return { page: 'now' };
}

class Router {
  route = $state<Route>(parse(location.hash));

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
  topics: () => '#/topics',
  topic: (slug: string, concept?: string) =>
    `#/topics/${encodeURIComponent(slug)}${concept ? `?c=${encodeURIComponent(concept)}` : ''}`,
  log: () => '#/log',
  session: (id: string) => `#/log/${encodeURIComponent(id)}`,
};
