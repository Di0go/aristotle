---
name: review
description: Spaced review in Aristotle. Practises the concepts that are fading (solid once, now due) across all of the learner's topics, by making them recall and apply them in writing. Use when they type /review, ask to review or practise what they have learned, or ask what is fading.
---

# Review

Concepts the learner once held solidly fade unless they retrieve them. Recalling a concept just as it starts to fade is what makes it last, and the effort of recalling is the training. A review session finds what is fading and makes them pull it back out of memory.

## Only what they have learned

A review never teaches anything new. They come to it trusting that everything in it is something they already know; one unfamiliar idea breaks that trust ("why teach new things here? I've never heard of this").

- Practise only concepts on the map that they have held: the fading list, and anything fading it rests on. A concept that is `unknown` on the map (never learned), or on no map at all, is not reviewed, even when it is the obvious next step after the ones you practised. `show`, `quiz` and `ask` refuse a `concept` like that in a review.
- Don't go on to "new ground" when the list is done or a pair of ideas suggests what comes next. Name it in `end_session`'s `next`, as a lesson (the `teach` skill), and stop.
- Untagged steps count too: a combining or extending step with no `concept` is still new material if they never learned it. When unsure, check the map with `get_topic`.
- A repair (step 5 below) re-teaches only the missing piece of the concept being reviewed, from what they still hold. It doesn't pull in the next concept on the map.
- A review has no topic of its own, so links name it: `[[topic/concept-id]]`, never a bare `[[concept-id]]` (a bare one is looked for in the topic of the step's `concept`). `show` says when a link finds nothing.

## Start

1. `start_session` with kind `review` and a goal like "Review what's fading". It also hands over answers they gave after the last session ended: judge and record them first. If the last review still had a question open, it picks that review up again instead of starting a new one and says so: don't ask that question again; wait for the answer with `collect_answers` and `wait: true`, judge it, and carry on in that review. The result lists the fading concepts (`topic/concept`), least likely to be recalled first. If they named a topic (`/review differential-forms`), review only that topic's: `due_reviews` with `topic`. If they named one concept (`/review differential-forms/wedge-product`, from the concept's own page), review that one, and anything fading it rests on. If nothing is fading, say so in one line, mention what comes due soon, and stop (or offer `/train` or a lesson).
2. Work through the list, worst-remembered first. A session doesn't have to clear it: they stop when they like.
3. If you need a concept's context (its summary, prerequisites, notes), call `get_topic` for its topic.

## For each concept

1. **Ask them to produce it, not recognise it.** Use `ask` with kind `recall` or `problem`, and `concept` set to `topic/id`. Good review questions make them explain the idea in their own words, use it on a fresh small case, or say why it holds. A bare definition prompt is the weakest kind; prefer one where the concept has to do work. Vary the angle from the way it was taught, so they retrieve the idea and not a memorised sentence.
2. **Judge the answer honestly**: right (they have it, unaided), partial (the core is there but something is missing or wrong), or wrong (they couldn't, or it's a misconception).
3. **Feedback** with `show` (kind `feedback`): what was right, what was missing, and the corrected version. Keep it short when they got it right.
4. **Record it** with `record_practice` (`kind: "recall"` or `"problem"`). This moves the review schedule; a wrong answer makes a solid concept shaky. Send it with your next call (the feedback `show` or the next question) in one message, not as a turn of its own.
5. **If it went wrong**, repair it on the spot: re-teach the missing piece in one or two `show` steps, built on what they still hold, then check again with a fresh question. If they get the re-check right, mark it solid again with `update_map` (pass `topic`). If the gap is bigger than a quick repair, leave it shaky and say it will be picked up in a lesson on that topic.

Interleave topics rather than finishing one before the next: mixing makes each retrieval harder, and so stronger.

## Ending

If `quiz` or `ask` returns "No answer yet", end your turn and leave the review open: their answer brings you back to `collect_answers`. When they say they are done or the list is done: `end_session` with what held (`locked`), what slipped (`shaky`), and what to do next (`next`: a lesson to repair something, or nothing).

Everything else follows the `teach` skill: they read in Aristotle, terminal replies are one line, maths in LaTeX, verify anything you're unsure of.
