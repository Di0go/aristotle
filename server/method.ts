// The method, for every tutor: the skills (.claude/skills/<name>/SKILL.md) and the helpers' instructions
// (.claude/agents/<name>.md), and the rules every sitting keeps (the "When teaching" part of AGENTS.md). Claude Code
// loads the skills itself; any other agent reads them through the MCP tool `method` or the MCP prompts, and
// Aristotle's own tutor on a model API (tutor-api.ts) through the same tool. One copy of the method, whoever teaches.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.ts';

export interface Skill {
  name: string;
  /** What it is for and when to use it (its front matter's description). */
  description: string;
  /** The instructions themselves, without the front matter. */
  body: string;
  kind: 'skill' | 'helper';
}

const SKILLS_DIR = path.join(ROOT, '.claude', 'skills');
const AGENTS_DIR = path.join(ROOT, '.claude', 'agents');

/** Every skill, then the helpers (researcher, illustrator), read fresh: they are a few kilobytes, and change with a release. */
export function skills(): Skill[] {
  const list: Skill[] = [];
  for (const dir of names(SKILLS_DIR)) {
    const skill = parse(path.join(SKILLS_DIR, dir, 'SKILL.md'), dir, 'skill');
    if (skill) list.push(skill);
  }
  for (const file of names(AGENTS_DIR).filter((f) => f.endsWith('.md'))) {
    const helper = parse(path.join(AGENTS_DIR, file), file.slice(0, -3), 'helper');
    if (helper) list.push(helper);
  }
  return list;
}

export function skill(name: string): Skill | undefined {
  const wanted = name.trim().replace(/^\//, '').toLowerCase();
  return skills().find((s) => s.name === wanted);
}

/**
 * How to read a skill written for Claude Code when you are another tutor: what its Claude Code names stand for.
 * Said once, before the skill.
 */
export const OTHER_AGENTS =
  'This method was written for Claude Code; where it names something you lack, do this instead. ' +
  '"The terminal" is wherever the learner talks to you outside Aristotle. ' +
  'The `researcher` subagent: check the fact yourself with a web search if you have one (two sources, an authoritative one among them), or read `method` with "researcher" and follow it. ' +
  'The `illustrator` subagent: read `method` with "illustrator" and draw the SVG yourself, checking it with `preview_svg`. ' +
  'ToolSearch and `mcp__aristotle__…` names: the tools are the ones named here, however your client prefixes them.';

/** The "When teaching" section of AGENTS.md: the rules that hold whichever skill is running. */
export function essentials(): string {
  try {
    const text = readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
    const start = text.indexOf('## When teaching');
    if (start === -1) return '';
    const end = text.indexOf('\n## ', start + 3);
    return text.slice(start, end === -1 ? undefined : end).trim();
  } catch {
    return '';
  }
}

function names(dir: string): string[] {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

function parse(file: string, fallback: string, kind: Skill['kind']): Skill | undefined {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  const fields = Object.fromEntries([...(fm?.[1] ?? '').matchAll(/^(\w+):\s*(.*)$/gm)].map(([, k, v]) => [k, (v ?? '').trim()]));
  return {
    name: (fields.name || fallback).toLowerCase(),
    description: fields.description ?? '',
    body: (fm ? text.slice(fm[0].length) : text).trim(),
    kind,
  };
}
