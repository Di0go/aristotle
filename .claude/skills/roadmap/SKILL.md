---
name: roadmap
description: Plan a roadmap with the learner in Aristotle: an ordered path of topics towards something bigger, each with its own goal, agreed with them before any of it is taught. Use when they type /roadmap, ask for a roadmap, a learning path, a curriculum or "what order should I learn X in", or want to change an existing roadmap.
---

# Roadmap

A roadmap is the order of topics; each topic is still taught by the `teach` skill, one map and one reasoning step at a time. Your job here is the shape of the path: which topics, in which order, and why that order. Nothing gets taught in this skill.

The roadmap lives in Aristotle (the Roadmaps page), and `save_roadmap` puts it there the moment you call it, so they read the draft there while you talk it through in the terminal. Keep terminal replies short and point them at the page.

## Steps

1. **Pin down what it's for.** `read_about` (what they wrote about themselves), `list_roadmaps` and `list_topics` first: they may be changing a roadmap that exists, or have topics that already cover part of the path. Then ask what they want at the end, concretely: what they will be able to do, explain or decide. "Neuroscience" is a field; "understand what my brain does under pressure in a fight, well enough to train it" is a goal. Ask in the terminal, one or two questions at a time. Ask too **where they will use it** (their sport, their job, a project, their days), unless About you already says: save that as `use` on the roadmap. The course's final mission is built from it. If they have notes elsewhere that bear on it (they may point you to them), read them.
2. **Scope the field** with the `researcher` subagent: the main areas, which ones rest on which, the standard way the field is taught, and where the evidence is weak or contested. Don't plan from memory.
3. **Draft the path**, 3 to 8 steps. Each step is one topic: big enough to need a few sessions and its own map, small enough to have one clear goal. For each step:
   - `title`: the topic's name, as it will appear in Topics. Plain, specific, no numbering.
   - `goal`: what they will be able to do or explain when it's done. Testable, not "learn about".
   - `why`: what it builds on and what it unlocks. A step with no reason to sit where it is should move.
   Order by dependency first, then by what they care about most. Put a step that pays off in their life early when the order allows it, so the path earns its keep.
   If a topic they already have covers a step, use it: pass its slug as `topic`.
4. **Save it as a draft** (`save_roadmap`, status `draft`) and tell them it's on the Roadmaps page. Ask what to change: order, a step to add or drop, a goal that's wrong.
5. **Revise** with `save_roadmap` and the roadmap's slug, until they approve. Then save it with status `active`.
6. **Hand over.** Tell them the first step can be started from its Start button on the roadmap page (or say "start it" and you run `teach` on it with the step's title and goal).

## Changing a roadmap later

Same tool, same slug. Read it first with `get_roadmap`. Keep the titles of steps that have been started, since the title is how a step finds its topic; to rename one, pass its existing slug as `topic`. Dropping a step never deletes its topic or what they learned in it.

## Principles

- Every course ends in practice: its **final mission** (a capstone, to the `praxis` skill) is the last item of every course, designed on its own as soon as the last class is done. A mission for a single step only when they ask. When choosing steps, favour ones that can be put to work where they said they'll use it; the `why` can say where.
- A roadmap is a plan, not a contract. They hop in and out; there are no dates, deadlines or schedules on it.
- Fewer, sharper steps beat a long syllabus. If it needs more than 8, it's two roadmaps.
- Be honest about the field: if part of it is shaky science (much of pop psychology is), say so in that step's `why`, and plan to teach it as contested.
