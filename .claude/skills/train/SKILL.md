---
name: train
description: Training sets in Aristotle. Gives Diogo problems on a topic just above what he holds solidly, to solve without help, then critiques them; difficulty rises as he solves them cleanly (progressive overload). Use when he types /train, asks for practice problems or exercises, or wants to work a topic harder.
---

# Train

Lessons build understanding; training builds the ability to use it. A training set is problems pitched just past what he can comfortably do, solved without help, and then critiqued. The struggle is the point: a problem he can do without effort trains nothing, and one far out of reach only frustrates. Keep him at the edge, and move the edge up.

## Start

1. Pick the topic (he names it, or ask; `list_topics` shows the options), `collect_answers` (answers he gave after the last session ended; judge them first), and `start_session` with kind `train`.
2. `get_topic`: note the **training level** (1-10; it starts at 1), the solid concepts, and the frontier: solid concepts whose dependents are still shaky or not yet, plus anything shaky.
3. Problems use solid concepts and lean on the frontier. Never set a problem that needs a concept he hasn't learned yet. If the map has too little that is solid to train on, say so and suggest a lesson instead.

## Difficulty

The scale is per topic. Roughly:

- **1-3**: one concept, applied directly in a familiar setting.
- **4-6**: two or three concepts combined, or one used in an unfamiliar setting.
- **7-8**: several steps where he has to choose the approach, or work backwards from the answer.
- **9-10**: open-ended, proof or design problems, or ones that need a connection nobody pointed out.

Pitch each problem at the current level, or one above it when he is on a run.

## For each problem

1. **Set it** with `ask` (kind `problem`), `concept` set to the main concept it exercises. State it fully and unambiguously. No hints in the prompt.
2. **He solves it alone.** If he asks for a hint in the terminal, give the smallest one that unblocks him and count the result as `partial` at best.
3. **Critique** with `show` (kind `feedback`): whether the answer is right; where the reasoning was sound; the first place it went wrong, if it did; and a clean worked solution. When the reasoning was right but the arithmetic slipped, say so: that is a different problem from a wrong idea.
4. **Record it** with `record_practice`: every concept the problem exercised, with `kind: "problem"`, and `difficulty` set to the level you pitched it at. Clean solves at or above the level raise it; a miss lowers it.
5. **If a miss shows a real gap**, not a slip, repair it briefly (one or two `show` steps), or note it as shaky with `update_map` for a lesson later. Don't turn a training set into a lesson.

Vary the concepts and problem types across a set, and mix in an older solid concept now and then: varied, interleaved practice transfers better than doing the same kind of problem five times.

## Ending

When he stops: `end_session` with what he can now do (`locked`), where he struggled (`shaky`), and what to train or learn next (`next`).

Everything else follows the `teach` skill: he reads in Aristotle, terminal replies are one line, maths in LaTeX, verify anything you're unsure of.
