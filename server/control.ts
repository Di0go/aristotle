// Start, stop and check the Aristotle server: the core's control (@organon/core/server/control) for this app. Used by
// the bridge and by `pnpm app <command>`. Never writes to stdout: the bridge's stdout is the MCP channel.
//
// The live instance goes through systemd when aristotle.service is installed (scripts/install-service.sh). That
// service may run another checkout of the code (the release copy, scripts/release.ts), so `start --build` refuses to
// build here for it. A dev instance (ARISTOTLE_INSTANCE=dev) never touches systemd.

import { controlCli, createControl } from '@organon/core/server/control';
import { app } from './config.ts';

export const { health, build, start, stop } = createControl(app);
/** One pid file per port, so test servers on other ports never touch the real one's. */
export const PID_FILE = app.pidFile;
export const LOG_FILE = app.logFile;

if (import.meta.main) await controlCli(app);
