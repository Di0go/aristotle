// How the stores read and write their files in data/: the core's store (@organon/core/server/store) bound to this
// instance's data folder and warnings. Each file written whole, one write at a time per file; a file that can't be
// parsed is set aside and said, and one that is there but can't be read is never written over.

import { createStore } from '@organon/core/server/store';
import { DATA_DIR } from './config.ts';
import { warnings } from './warnings.ts';

/** The store itself, for what the core takes whole (the chats). */
export const store = createStore({ dataDir: DATA_DIR, warnings });
export const { loadJson, loadJsonDir, writeJson, writeFileAtomic, AppendLog } = store;
export { endLastLine, isObject, readLog, WriteQueue } from '@organon/core/server/store';
