// Ships what is committed here to the app you learn in, without ever running half-finished code: the core's release
// (@organon/core/server/release). The live app runs from a release copy (a Git worktree, ~/.local/share/aristotle/app
// by default) at a fixed commit, while its data and state stay in this checkout's data/ and .aristotle/. A release
// refuses uncommitted changes and a core pin the copy could not install, runs every gate, checks the commit out in the
// copy, installs and builds there, points aristotle.service at it and restarts it, waits for the new commit to answer
// from a new process, and puts the previous release back if it does not. The tag `live` marks what is running;
// `git log live..` is what is not released yet.
//
//   pnpm release              release HEAD
//   pnpm release --rollback   go back to the release before (tag live-previous), without gates

import path from 'node:path';
import { defineApp } from '@organon/core/server/app';
import { release } from '@organon/core/server/release';

const ok = await release(defineApp(path.resolve(import.meta.dirname, '..')));
process.exit(ok ? 0 : 1);
