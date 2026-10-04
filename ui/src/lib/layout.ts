// Graph layout shared by the topic maps and the map of everything.

import dagre from '@dagrejs/dagre';
import type { Concept, Roadmap, RoadmapStep, Topic } from '../../../shared/types.ts';

const LINE_H = 17;
const CHAR_W = 6.9;
const MAX_CHARS = 22;

export interface PlacedNode {
  /** "id" inside a topic layout; "topic/id" in the map of everything. */
  key: string;
  concept: Concept;
  /** Set for a concept from another topic shown as a prerequisite. */
  external?: { topic: string; topicTitle: string };
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
}

export interface PlacedEdge {
  key: string;
  from: string;
  to: string;
  d: string;
}

export interface Layout {
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  width: number;
  height: number;
}

/** Wraps a label onto at most two lines, and sizes the box to fit. */
export function labelBox(label: string): { w: number; h: number; lines: string[] } {
  const words = label.split(/\s+/);
  const lines: string[] = [''];
  for (const word of words) {
    const line = lines[lines.length - 1];
    if (!line) lines[lines.length - 1] = word;
    else if ((line + ' ' + word).length <= MAX_CHARS) lines[lines.length - 1] = `${line} ${word}`;
    else lines.push(word);
  }
  let out = lines.slice(0, 2);
  if (lines.length > 2) out[1] = `${out[1].slice(0, MAX_CHARS - 1)}…`;
  out = out.map((l) => (l.length > MAX_CHARS + 4 ? `${l.slice(0, MAX_CHARS + 3)}…` : l));
  const longest = Math.max(...out.map((l) => l.length));
  return { w: Math.max(72, Math.round(longest * CHAR_W + 30)), h: out.length * LINE_H + 18, lines: out };
}

/** A path through dagre's points, rounded at the bends. */
export function smooth(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const n = points[i + 1];
    d += ` Q${p.x},${p.y} ${(p.x + n.x) / 2},${(p.y + n.y) / 2}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last.x},${last.y}`;
}

/**
 * Lays out one topic. Prerequisites from other topics ("topic/id") become external nodes when
 * `others` knows them, so the map shows what this topic borrows.
 */
export function layoutTopic(topic: Topic, direction: 'LR' | 'TB', others: Record<string, Topic> = {}, withExternal = true): Layout {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: direction === 'LR' ? 16 : 22,
    ranksep: direction === 'LR' ? 56 : 44,
    marginx: 12,
    marginy: 12,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const nodes = new Map<string, Omit<PlacedNode, 'x' | 'y'>>();
  for (const c of topic.concepts) nodes.set(c.id, { key: c.id, concept: c, ...labelBox(c.label) });

  const edges: [string, string][] = [];
  for (const c of topic.concepts) {
    for (const dep of c.deps) {
      if (nodes.has(dep)) edges.push([dep, c.id]);
      else if (withExternal && dep.includes('/')) {
        const [slug, id] = dep.split('/');
        const other = others[slug]?.concepts.find((x) => x.id === id);
        if (!other) continue;
        if (!nodes.has(dep)) {
          nodes.set(dep, {
            key: dep,
            concept: other,
            external: { topic: slug, topicTitle: others[slug].title },
            ...labelBox(other.label),
          });
        }
        edges.push([dep, c.id]);
      }
    }
  }

  for (const [key, n] of nodes) g.setNode(key, { width: n.w, height: n.h });
  for (const [a, b] of edges) g.setEdge(a, b);
  dagre.layout(g);

  const placed: PlacedNode[] = [...nodes.values()].map((n) => {
    const p = g.node(n.key);
    return { ...n, x: p.x - n.w / 2, y: p.y - n.h / 2 };
  });
  const placedEdges: PlacedEdge[] = g.edges().map((e) => ({
    key: `${e.v}->${e.w}`,
    from: e.v,
    to: e.w,
    d: smooth(g.edge(e).points ?? []),
  }));
  const graph = g.graph();
  return { nodes: placed, edges: placedEdges, width: Math.ceil(graph.width ?? 0), height: Math.ceil(graph.height ?? 0) };
}

export interface PlacedBox {
  key: string;
  /** Set for a topic with a map; a step not started yet has only its roadmap step. */
  topic?: Topic;
  step?: RoadmapStep;
  number?: number;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedBand {
  key: string;
  title: string;
  roadmap?: Roadmap;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The route through the band's boxes, in step order. */
  route: string;
}

const PAD = 20;
const LABEL_H = 46;
const BOX_GAP = 44;
const BAND_LABEL = 56;
const BAND_GAP = 72;
const ROW_GAP = 40;
const ROW_WIDTH = 1700;
const GHOST = { w: 200, h: 76 };

/**
 * The map of everything, as the library is organised: a band per roadmap with its steps in order (wrapping
 * onto new rows), a box per topic with its concepts inside, steps not started as empty frames, and a last band
 * for topics on no roadmap. Links between topics are drawn concept to concept.
 */
export function layoutAtlas(roadmaps: Roadmap[], topicsBySlug: Record<string, Topic>): { bands: PlacedBand[]; boxes: PlacedBox[]; layout: Layout } {
  const groups: { key: string; title: string; roadmap?: Roadmap; items: { topic?: Topic; step?: RoadmapStep; number?: number; title: string }[] }[] = [];
  const used = new Set<string>();
  for (const r of roadmaps) {
    groups.push({
      key: r.slug,
      title: r.title,
      roadmap: r,
      items: r.steps.map((s, i) => {
        used.add(s.topic);
        const t = topicsBySlug[s.topic];
        return { topic: t?.concepts.length ? t : undefined, step: s, number: i + 1, title: s.title };
      }),
    });
  }
  const loose = Object.values(topicsBySlug).filter((t) => !used.has(t.slug) && t.concepts.length);
  if (loose.length) groups.push({ key: ':loose', title: 'Other topics', items: loose.map((t) => ({ topic: t, title: t.title })) });

  const inner = new Map<string, Layout>();
  const bands: PlacedBand[] = [];
  const boxes: PlacedBox[] = [];
  const nodes: PlacedNode[] = [];
  const edges: PlacedEdge[] = [];
  let y = 0;
  let width = 0;

  for (const g of groups) {
    const bandY = y;
    let x = PAD;
    let rowY = bandY + BAND_LABEL;
    let rowH = 0;
    const placed: PlacedBox[] = [];
    for (const item of g.items) {
      // An empty frame is as wide as its title (set in 15px serif, about 7.4px a character).
      let w = Math.min(440, Math.max(GHOST.w, Math.round(item.title.length * 7.6 + (item.number ? 64 : 40))));
      let h = GHOST.h;
      let l: Layout | undefined;
      if (item.topic) {
        l = layoutTopic(item.topic, 'TB', {}, false);
        inner.set(item.topic.slug, l);
        w = Math.max(l.width, 200) + PAD * 2;
        h = l.height + PAD + LABEL_H;
      }
      if (x > PAD && x + w > ROW_WIDTH) {
        x = PAD;
        rowY += rowH + ROW_GAP;
        rowH = 0;
      }
      const box: PlacedBox = { key: `${g.key}:${item.topic?.slug ?? item.step?.topic}`, topic: item.topic, step: item.step, number: item.number, title: item.title, x, y: rowY, w, h };
      placed.push(box);
      if (l && item.topic) {
        const dx = x + PAD + (w - PAD * 2 - l.width) / 2;
        const dy = rowY + LABEL_H;
        for (const n of l.nodes) nodes.push({ ...n, key: `${item.topic.slug}/${n.key}`, x: n.x + dx, y: n.y + dy });
        for (const e of l.edges) {
          edges.push({ key: `${item.topic.slug}:${e.key}`, from: `${item.topic.slug}/${e.from}`, to: `${item.topic.slug}/${e.to}`, d: translate(e.d, dx, dy) });
        }
      }
      x += w + BOX_GAP;
      rowH = Math.max(rowH, h);
      width = Math.max(width, x - BOX_GAP + PAD);
    }
    const bandH = rowY + rowH - bandY + PAD;
    // The route: from each box's top edge to the next one's, so the order of the steps reads at a glance.
    let route = '';
    if (g.roadmap) {
      for (let i = 0; i < placed.length; i++) {
        const b = placed[i];
        const cx = b.x + 22;
        const cy = b.y;
        if (i === 0) route = `M${cx},${cy}`;
        else {
          const prev = placed[i - 1];
          const px = prev.x + 22;
          const py = prev.y;
          // Along a row the route arcs over to the next box; a new row starts its own line.
          if (py === cy) route += ` M${px},${py} C${px},${py - 22} ${cx},${cy - 22} ${cx},${cy}`;
        }
      }
    }
    boxes.push(...placed);
    bands.push({ key: g.key, title: g.title, roadmap: g.roadmap, x: 0, y: bandY, w: 0, h: bandH, route });
    y = bandY + bandH + BAND_GAP;
  }
  for (const b of bands) b.w = width;

  // Links between topics.
  const at = new Map(nodes.map((n) => [n.key, n]));
  for (const t of Object.values(topicsBySlug)) {
    for (const c of t.concepts) {
      for (const dep of c.deps) {
        const [slug, id] = dep.split('/');
        if (id === undefined) continue;
        const a = at.get(dep);
        const b = at.get(`${t.slug}/${c.id}`);
        if (!a || !b) continue;
        const x1 = a.x + a.w;
        const y1 = a.y + a.h / 2;
        const x2 = b.x;
        const y2 = b.y + b.h / 2;
        const bend = Math.max(40, Math.abs(x2 - x1) / 2);
        edges.push({ key: `x:${slug}/${id}->${t.slug}/${c.id}`, from: dep, to: `${t.slug}/${c.id}`, d: `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}` });
      }
    }
  }
  return { bands, boxes, layout: { nodes, edges, width: Math.ceil(width), height: Math.ceil(Math.max(0, y - BAND_GAP)) } };
}

function translate(d: string, dx: number, dy: number): string {
  return d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${+x + dx},${+y + dy}`);
}
