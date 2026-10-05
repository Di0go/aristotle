---
name: praxis
description: Praxis missions in Aristotle. Designs a real task that puts what Diogo learned to work for his own advantage outside the app (in one of his projects, his training, on his computer, or anywhere when nothing of his fits), then reviews his debrief. Use when he types /praxis, finishes a roadmap step or a whole roadmap, asks for a practical exercise, a mission or a way to apply what he learned, or asks you to review a mission.
---

# Praxis

Aristotle split knowing that (*theoria*) from doing (*praxis*); he held that we become just by doing just acts. A lesson makes something understood and training makes it usable on paper. A mission makes it **used**: once, for real, in his life, where it gets him something. It is the last test of transfer, and the one Aristotle can't fake.

## When

- **The final mission of every roadmap (a capstone)**: the last item of every course, shown from the start. It is designed **on its own** as soon as the last step is done: the `teach` skill starts it as it closes that step, and Aristotle asks you (`/praxis capstone <roadmap>`, "on your own") if that didn't happen. Bigger, and it uses the whole path at once. Don't propose it in the terminal: design it, save it, and say in one line that it's up.
- **After a single step**: only when he asks. One mission per step.
- **A topic outside any roadmap**, or whenever he asks: scope `topic`.
- **Reviewing**: when he has written a debrief (`list_missions` with status `debriefed`).

He can come at it from the interface (it asks you with `/praxis step N of <roadmap>`, `/praxis capstone <roadmap>`, `/praxis topic <slug>`, `/praxis review <id>`) or by typing. Praxis is a conversation in the terminal beside the page, not a session: don't call `start_session` for it. Keep replies short. The mission itself, and your review, go to Aristotle through the tools.

## Designing a mission

1. **Read what it should use.** `get_roadmap` and `get_topic` (the step's topic; for a capstone, every step's). Note the goal concepts, the solid ones, what was shaky, and any missions already set (don't repeat one).
2. **Look for where it lands in his life.** First what he told Aristotle himself: `read_about` (his About you page) and, for a roadmap, its "Where he will use it" (`get_roadmap`). Those come first and are enough on their own for anyone. Then, for Diogo, you can also read his machine, so look before you guess:
   - `data/profile.md`, and your memory notes on him.
   - His projects: `ls ~/Projects`, then the READMEs, notes and recent `git log` of the ones that look related. `~/Projects/Machine` holds his kickboxing (training, fights, recovery; it also holds health notes, so use only what the mission needs).
   - His computer and tools, when the topic is technical.
   Look for a real decision, problem, habit or project where this knowledge **gives him an edge**: something he does anyway, done better, or something he wants and can now reach.
3. **When nothing of his fits, set one anyway.** Don't force a link that isn't there. A mission in the open world still counts: build a small thing, run an experiment on himself, observe and measure something out there, predict and then check, or teach it to someone and note where they get stuck. Say plainly that it isn't tied to his life (the `arena` is "anywhere").
4. **Pitch it right.** Just past comfortable, like training: it needs the concepts, not a recap of them. A step mission fits in a day or a few sittings; a capstone can take a week or two. It must be safe: nothing that risks his health, his money, his work or other people. In training, stay within what his coach would sign off; flag anything physical that needs his coach.
5. **For a mission he asked for, propose it in the terminal first** (a final mission is designed on its own: skip straight to `save_mission` with the best option, and name the other in its `why` if there was a close second), in a few lines: the idea, the arena, why it pays off. If there are two good options (one in his life, one in the open), offer both and let him pick. Then `save_mission`:
   - `title`: an imperative, specific (not "Apply X").
   - `why`: the advantage, in his terms. What does he get from it?
   - `brief`: the situation, the task, constraints, and what to bring back (numbers, a file, a commit, a log, a recording). Write it so he can do it without asking. Use [[concept]] links and hover terms like a lesson. No hints about how to solve it: that's the struggle.
   - `criteria`: 2 to 5 **observable** "done when" lines he can report against. "Logged HR at 3 points in 5 rounds" is observable; "understood arousal better" isn't.
   - `concepts`: every concept it really puts to use, as `topic/id`.
6. Tell him in one line it's up in Praxis.

## Reviewing a debrief

1. `list_missions` with the `mission` id: the brief, the criteria and his debrief.
2. **Check what you can.** If he names a repo, read the commits and the code. If he names a file or numbers, open them. If he describes something you can't verify (a sparring round, a conversation), you depend on his account: judge whether it is specific enough to be real, and ask for what's missing (in the terminal, one question at a time) before you judge it.
3. `review_mission`:
   - `verdict`: **achieved** (every criterion met, and the concepts were really used), **partly**, or **missed**. Be honest; a generous verdict trains nothing.
   - `critique` (Markdown): each criterion, met or not and how you know; where his use of the concepts was sound; the first thing that went wrong, if anything; what to do with it next (keep the habit, a follow-up, what to retry).
   - `results`: one per concept. `right` if it was applied soundly, `partial` if it was applied with gaps, `wrong` if the mission showed it doesn't hold in practice. These move the review schedule like any practice; a `wrong` makes a solid concept shaky, which is the point: the map should say what holds up in real life.
4. If the debrief showed a real gap, `update_map` with a note on the concept and suggest the lesson or `/train` that would fix it. If it went well and it's something he'll keep doing, say so in the critique.

He can rewrite a debrief after a review and try again; review the new one the same way.

Everything else follows the `teach` skill: accuracy first (verify before you claim), short terminal replies, and his data stays his: never delete or rewrite `data/` by hand.
