// What is being written and not sent yet (an answer, a note, a message to the chat), kept in this browser so a reload
// or a closed tab never loses it: the core's drafts (@organon/core/ui/drafts), under Aristotle's keys
// ("aristotle.draft.<what>"), set before anything reads one. Old ones are tidied away after a while.

import { drafts } from '@organon/core/ui/drafts';

drafts.init('aristotle');

export { drafts };
