// Focus mode: everything but the page hides (ribbon, library, tabs, status line, the bench beside a lesson), for
// reading and answering with nothing else in view: the core's (@organon/core/ui/frame). F toggles it, Escape leaves it
// unless something of Aristotle's is open to close first (App.svelte gives the frame `busy`); remembered per browser
// under "aristotle.focus".

export { focus } from '@organon/core/ui/frame';
