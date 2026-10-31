// Turns titles into the stable kebab-case ids used for topics, roadmaps, missions, glosses, chats and file names: the
// core's (@organon/core/server/slug). Letters of any script are kept ("Ἀρετή" -> "αρετη"), so titles in Greek or
// Japanese never all become "untitled"; ids made before that (letters outside a-z dropped) are still found, since
// lookups try slugCandidates().

export { legacySlugify, slugCandidates, slugify } from '@organon/core/server/slug';
