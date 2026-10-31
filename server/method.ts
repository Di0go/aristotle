// The method, for every tutor: the core's (@organon/core/server/method) on Aristotle's skills
// (.claude/skills/<name>/SKILL.md), its helpers' instructions (.claude/agents/<name>.md) and the rules every sitting
// keeps (the "When teaching" part of AGENTS.md). Claude Code loads the skills itself; any other agent reads them
// through the MCP tool `method` or the MCP prompts (server/mcp.ts), and Aristotle's own tutor on a model API
// (tutor-api.ts) through the same tool. One copy of the method, whoever teaches.

import { createMethod } from '@organon/core/server/method';
import { ROOT } from './config.ts';

export const method = createMethod({
  root: ROOT,
  section: 'When teaching',
  // How to read a skill written for Claude Code when you are another tutor: what its Claude Code names stand for.
  otherAgents:
    'This method was written for Claude Code; where it names something you lack, do this instead. ' +
    '"The terminal" is wherever the learner talks to you outside Aristotle. ' +
    'The `researcher` subagent: check the fact yourself with a web search if you have one (two sources, an authoritative one among them), or read `method` with "researcher" and follow it. ' +
    'The `illustrator` subagent: read `method` with "illustrator" and draw the SVG yourself, checking it with `preview_svg`. ' +
    'ToolSearch and `mcp__aristotle__…` names: the tools are the ones named here, however your client prefixes them.',
  prompts: ['teach', 'review', 'train', 'roadmap', 'praxis'],
  tool: {
    title: 'Read the method',
    description:
      'How to teach in Aristotle. Before a sitting, read the skill it needs, unless your client has already given it to you as a skill: ' +
      'teach (a lesson, or continuing one), review (what is fading), train (problems at the edge of their level), roadmap (planning a course), ' +
      'praxis (designing a mission, or reviewing one). researcher and illustrator say how to check a fact and how to draw a figure.',
    name: 'teach, review, train, roadmap, praxis, researcher or illustrator',
  },
  prompt: {
    title: 'Aristotle',
    request: 'What the learner asked for, in their words',
    entry: "The learner's request",
    empty: 'Start: the learner has not said more.',
  },
});

export const { skills, skill, essentials } = method;
export type { Skill } from '@organon/core/server/method';
