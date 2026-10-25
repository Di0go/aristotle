---
name: review
description: Spaced review in Aristotle. Practises today's share of the concepts that are fading (solid once, now due) across all of the learner's topics, briefly, by making them recall and apply them in writing. Use when they type /review, ask to review or practise what they have learned, or ask what is fading.
---

# Review

Concepts the learner once held solidly fade unless they retrieve them. Recalling a concept just as it starts to fade is what makes it last, and the effort of recalling is the training. A review session finds what is fading and makes them pull it back out of memory.

## Only what they have learned

A review never teaches anything new. They come to it trusting that everything in it is something they already know; one unfamiliar idea breaks that trust ("why teach new things here? I've never heard of this").

- Practise only concepts on the map that they have held: today's list. A concept that is `unknown` on the map (never learned), or on no map at all, is not reviewed, even when it is the obvious next step after the ones you practised. `show`, `quiz` and `ask` refuse a `concept` like that in a review.
- Don't go on to "new ground" when the list is done or a pair of ideas suggests what comes next. Name it in `end_session`'s `next`, as a lesson (the `teach` skill), and stop.
- Untagged steps count too: a combining or extending step with no `concept` is still new material if they never learned it. When unsure, check the map with `get_topic`.
- A repair (the last point under "For each step") re-teaches only the missing piece of the concept being reviewed, from what they still hold. It doesn't pull in the next concept on the map.
- A review has no topic of its own, so links name it: `[[topic/concept-id]]`, never a bare `[[concept-id]]` (a bare one is looked for in the topic of the step's `concept`). `show` says when a link finds nothing.

## Short, so the day stays for learning

A review is a few minutes, not a sitting: the time it saves goes to new material. Long reviews of concepts learned long ago crowd out learning anything new, so:

- **Today's list, no more.** Aristotle caps a day's reviews (at most 6 concepts, less what was already reviewed today) and hands you only today's share. The rest of what is fading waits for the next days on purpose: don't add it, and don't review concepts that aren't on the list.
- **One question per concept, one grade per day.** Ask each concept once. Aristotle counts only one result per concept per day (the worst one), so a second question on it the same day doesn't move its schedule; it only costs their time.
- **Several concepts per step.** Put two or three concepts in one `ask`: a numbered part per concept, each a sentence or two, each answerable in a line or two. Tag the first with `concept` and the others with `also` (all as `topic/id`). With two to five concepts to check lightly, one `quiz` (a question per concept, each tagged) is quicker still.
- **Mastered concepts get a one-line check.** The list marks MASTERED a concept stable for a month or more whose last review was clean: one short question, or a quiz question, and nothing more.
- **No re-teaching unless they fail one.** When they get it, say so in a line and move on.

## Start

1. `start_session` with kind `review` and a goal like "Review what's fading". It also hands over answers they gave after the last session ended: judge and record them first. If the last review still had a question open, it picks that review up again instead of starting a new one and says so: don't ask that question again; wait for the answer with `collect_answers` and `wait: true`, judge it, and carry on in that review. The result lists today's concepts (`topic/concept`), least likely to be recalled first. If they named a topic (`/review differential-forms`), review only that topic's: `due_reviews` with `topic` (not capped: they asked for it). If they named one concept (`/review differential-forms/wedge-product`, from the concept's own page), review that one. If nothing is left for today, say so in one line (and what comes due soon) and stop, or offer to continue a class.
2. Work through today's list, worst-remembered first, two or three concepts at a time. Interleave topics in a step rather than finishing one before the next: mixing makes each retrieval harder, and so stronger.
3. If you need a concept's context (its summary, prerequisites, notes), call `get_topic` for its topic.

## For each step

1. **Ask them to produce it, not recognise it**, except for a light check on mastered concepts. Use `ask` with kind `recall` or `problem`. Good parts make them say the idea in a sentence, use it on a fresh small case, or say why it holds; vary the angle from the way it was taught. Keep each part short: a review question that takes ten minutes to answer is a lesson.
2. **Judge each part honestly, and fairly**:
   - **right**: the core idea is there, unaided. Loose wording, or a minor detail left out, is still right; name the detail in the feedback.
   - **partial**: they needed the hint in the question, or part of the core idea is missing or wrong.
   - **wrong**: they couldn't produce it, or it's a misconception.
3. **Feedback**: one `show` (kind `feedback`) for the whole step. Right: a line ("Both right.", plus the detail they left out if any). Partial: the missing piece, corrected, in two or three lines, with no new question.
4. **Record it** with `record_practice`, one result per concept (`kind: "recall"` or `"problem"`). This moves the review schedule; a wrong answer makes a solid concept shaky. Send it with your next call (the feedback `show` or the next question) in one message, not as a turn of its own.
5. **Only a wrong one is repaired**, and only that concept: re-teach the missing piece in one short `show`, built on what they still hold, then one fresh question on it. If they get it, mark it solid again with `update_map` (pass `topic`); the failed review already brings it back within days. If the gap is bigger than a quick repair, leave it shaky and say it will be picked up in a lesson on that topic.

## Ending

If `quiz` or `ask` returns "No answer yet", end your turn and leave the review open: their answer brings you back to `collect_answers`. They move between classes freely: if a tool says they went to another sitting, follow them without asking, as it says (`end_session` for this review, then `start_session` on theirs). When they say they are done or the list is done: `end_session` with what held (`locked`), what slipped (`shaky`), and what to do next (`next`: a lesson to repair something, or nothing).

Everything else follows the `teach` skill: they read in Aristotle, terminal replies are one line, maths in LaTeX, verify anything you're unsure of.
