// Graph layout shared by the topic maps and the map of everything.

import dagre from '@dagrejs/dagre';
import type { Concept, Topic } from '../../../shared/types.ts';

export const NODE_H = 34;
const CHAR_W = 7.1;
const MAX_CHARS = 26;

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
  text: string;
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

export function labelBox(label: string): { w: number; text: string } {
  const text = label.length > MAX_CHARS ? `${label.slice(0, MAX_CHARS - 1)}…` : label;
  return { w: Math.max(64, Math.round(text.length * CHAR_W + 26)), text };
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
    nodesep: direction === 'LR' ? 14 : 18,
    ranksep: direction === 'LR' ? 44 : 36,
    marginx: 10,
    marginy: 10,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const nodes = new Map<string, Omit<PlacedNode, 'x' | 'y'>>();
  for (const c of topic.concepts) nodes.set(c.id, { key: c.id, concept: c, h: NODE_H, ...labelBox(c.label) });

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
            h: NODE_H,
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

export interface PlacedTopic {
  topic: Topic;
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 18;
const LABEL_H = 34;

/**
 * The map of everything: each topic laid out on its own inside a box, the boxes arranged left to
 * right so a topic comes after the topics it builds on, and links between topics drawn concept to concept.
 */
export function layoutAll(topics: Topic[]): { topics: PlacedTopic[]; layout: Layout } {
  const inner = new Map(topics.map((t) => [t.slug, layoutTopic(t, 'TB', {}, false)]));
  const outer = new dagre.graphlib.Graph();
  outer.setGraph({ rankdir: 'LR', nodesep: 36, ranksep: 90, marginx: 24, marginy: 24 });
  outer.setDefaultEdgeLabel(() => ({}));
  for (const t of topics) {
    const l = inner.get(t.slug)!;
    outer.setNode(t.slug, { width: Math.max(l.width, 180) + PAD * 2, height: l.height + PAD + LABEL_H });
  }
  const bySlug = new Map(topics.map((t) => [t.slug, t]));
  const cross: { from: string; to: string }[] = [];
  for (const t of topics) {
    for (const c of t.concepts) {
      for (const dep of c.deps) {
        const [slug, id] = dep.split('/');
        if (id === undefined || !bySlug.has(slug) || !bySlug.get(slug)!.concepts.some((x) => x.id === id)) continue;
        cross.push({ from: dep, to: `${t.slug}/${c.id}` });
        if (slug !== t.slug) outer.setEdge(slug, t.slug);
      }
    }
  }
  dagre.layout(outer);

  const placedTopics: PlacedTopic[] = [];
  const nodes: PlacedNode[] = [];
  const edges: PlacedEdge[] = [];
  for (const t of topics) {
    const box = outer.node(t.slug);
    const x0 = box.x - box.width / 2;
    const y0 = box.y - box.height / 2;
    placedTopics.push({ topic: t, x: x0, y: y0, w: box.width, h: box.height });
    const l = inner.get(t.slug)!;
    const dx = x0 + PAD + (box.width - PAD * 2 - l.width) / 2;
    const dy = y0 + LABEL_H;
    for (const n of l.nodes) nodes.push({ ...n, key: `${t.slug}/${n.key}`, x: n.x + dx, y: n.y + dy });
    for (const e of l.edges) {
      edges.push({ key: `${t.slug}:${e.key}`, from: `${t.slug}/${e.from}`, to: `${t.slug}/${e.to}`, d: translate(e.d, dx, dy) });
    }
  }

  const at = new Map(nodes.map((n) => [n.key, n]));
  for (const c of cross) {
    const a = at.get(c.from);
    const b = at.get(c.to);
    if (!a || !b) continue;
    // Leave from the right side of the prerequisite and arrive at the left side of what builds on it.
    const x1 = a.x + a.w;
    const y1 = a.y + a.h / 2;
    const x2 = b.x;
    const y2 = b.y + b.h / 2;
    const bend = Math.max(40, Math.abs(x2 - x1) / 2);
    edges.push({ key: `x:${c.from}->${c.to}`, from: c.from, to: c.to, d: `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}` });
  }
  const graph = outer.graph();
  return {
    topics: placedTopics,
    layout: { nodes, edges, width: Math.ceil(graph.width ?? 0), height: Math.ceil(graph.height ?? 0) },
  };
}

function translate(d: string, dx: number, dy: number): string {
  return d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${+x + dx},${+y + dy}`);
}
