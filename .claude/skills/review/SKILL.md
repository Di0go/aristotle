---
name: review
description: Spaced review in Aristotle. Practises the concepts that are fading (solid once, now due) across all of Diogo's topics, by making him recall and apply them in writing. Use when he types /review, asks to review or practise what he has learned, or asks what is fading.
---

# Review

Concepts he once held solidly fade unless he retrieves them. Recalling a concept just as it starts to fade is what makes it last, and the effort of recalling is the training. A review session finds what is fading and makes him pull it back out of memory.

## Start

1. `collect_answers` first (answers he gave after the last session ended; judge and record them), then `start_session` with kind `review` and a goal like "Review what's fading". The result lists the fading concepts (`topic/concept`), least likely to be recalled first. If he named a topic (`/review differential-forms`), review only that topic's: `due_reviews` with `topic`. If nothing is fading, say so in one line, mention what comes due soon, and stop (or offer `/train` or a lesson).
2. Work through the list, worst-remembered first. A session doesn't have to clear it: he stops when he likes.
3. If you need a concept's context (its summary, prerequisites, notes), call `get_topic` for its topic.

## For each concept

1. **Ask him to produce it, not recognise it.** Use `ask` with kind `recall` or `problem`, and `concept` set to `topic/id`. Good review questions make him explain the idea in his own words, use it on a fresh small case, or say why it holds. A bare definition prompt is the weakest kind; prefer one where the concept has to do work. Vary the angle from the way it was taught, so he retrieves the idea and not a memorised sentence.
2. **Judge the answer honestly**: right (he has it, unaided), partial (the core is there but something is missing or wrong), or wrong (he couldn't, or it's a misconception).
3. **Feedback** with `show` (kind `feedback`): what was right, what was missing, and the corrected version. Keep it short when he got it right.
4. **Record it** with `record_practice` (`kind: "recall"` or `"problem"`). This moves the review schedule; a wrong answer makes a solid concept shaky.
5. **If it went wrong**, repair it on the spot: re-teach the missing piece in one or two `show` steps, built on what he still holds, then check again with a fresh question. If he gets the re-check right, mark it solid again with `update_map` (pass `topic`). If the gap is bigger than a quick repair, leave it shaky and say it will be picked up in a lesson on that topic.

Interleave topics rather than finishing one before the next: mixing makes each retrieval harder, and so stronger.

## Ending

When he stops or the list is done: `end_session` with what held (`locked`), what slipped (`shaky`), and what to do next (`next`: a lesson to repair something, or nothing).

Everything else follows the `teach` skill: he reads in Aristotle, terminal replies are one line, maths in LaTeX, verify anything you're unsure of.
