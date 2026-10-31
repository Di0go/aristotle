// KaTeX, loaded just after the first paint (or when first needed, if sooner) instead of on the startup path: the
// core's (@organon/core/ui/maths), one for the whole page, so the core's Markdown and Aristotle's share it. Until it
// arrives, maths renders as a quiet placeholder; reading `version` in a reactive context renders it again once here.

export { maths } from '@organon/core/ui/maths';
