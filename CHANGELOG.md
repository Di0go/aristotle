# Changelog

What changed for whoever uses Aristotle, newest first: what you see, what is kept, and what you have to do (usually
nothing). The code's history is in Git; this is what it means for the learner whose history it is.

## 2026-10-31: Aristotle on @organon/core 0.8.1

Aristotle's infrastructure is now [`@organon/core`](https://github.com/Di0go/organon), the core it shares with Galen
and Argus, pinned at an exact version: a fix to the mechanism (the server, the agent's drawer, the chat, Settings, the
frame, the Markdown, the release) is made once there and reaches Aristotle when the pin moves. Each module was swapped
on its own and proved to give the same result as before, on a copy of the real data and on the demo library, by the
differentials in `scripts/proofs/`. Nothing in `data/` changes: the topics, the maps, the sittings, the reviews and
their schedules, the glosses, the notes, the missions and the chats are read and written exactly as before. Nothing
has to be done. What does change:

**What you see**

- **Green is an accent**, first in Appearance's row (the core's accents are the same in every app). Blue is still
  Aristotle's default.
- **The red accent is a crimson** (`#bf124e`, dark `#f15f7f`), and under it what says a problem moves off it, so a
  link never reads as an error. Only if you picked red; blue, violet and graphite are exactly as they were.
- **A chart's three series have fixed colours**, checked for colour blindness (Progress: lessons, reviews, training),
  instead of the accent, the shaky yellow and the solid green.
- **Hover cards are the core's**: a term's card is as wide as its definition (up to 320 px) and keeps its paragraphs;
  a concept's or a gloss's card is 300 px wide, with a little more room inside. What each card says is the same.
- **On a phone, the search button in the top bar draws a magnifying glass**, not a filled disc, and the status line's
  items sit 10 px apart instead of 16.
- **A page title, a crumb or a property with a very long word wraps** instead of running out of its column.
- **A new release loads on its own**: a page open when Aristotle is updated reloads itself once you are not typing
  (or when you next leave the tab, if you are), instead of waiting for F5. What you were writing is kept, as always.
- **Days are the right days west of Greenwich**: a date written as a day (a sitting's) was read as midnight UTC, the
  day before in the Americas. In Lisbon nothing changes.

**What is kept**

- Your look, your tabs, the drawer's height and what you were writing are kept under the same keys in the browser
  (`aristotle.*`); the Mind Gym's old keys are still moved over, by the core now.
- The commits in `data/` read as before ("Data: <topics>, 2 sessions, roadmap …").
- A tutor session open before the update keeps working: its bridge still says the old names, and the server reads them.
- Your reviews are scheduled by the same rules: each card's next date, stability and difficulty come out as before
  (checked on a copy of your data by practising solid concepts on both versions). Nothing is recalculated.

**Behind the scenes**

- A `settings.json` that can't be read is set aside, never written over; three changes at once all land.
- A data file that is there but can't be read is never written over.
- The server says which app and which commit it is (`/api/health`), and a release waits for the new commit to answer
  from a new process before it counts as live; `pnpm release --rollback` reads the lockfile of the release it goes
  back to.
- A body that is not JSON gets the core's 400 "Not JSON", one over 1 MB a 413.
- Search folds accents with the core's function (the same one); what a result shows of its text is as before.
- The scripts that set up `aristotle.test` (`pnpm service`, `pnpm tls`, the core's `setup-hostname.sh`) are the core's,
  from [`app.json`](app.json). What the app had as the Mind Gym on gym.test is cleaned up by its own
  `scripts/retire-gym-test.sh` (nothing to do on an install that never was).
