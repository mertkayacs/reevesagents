// Where the state tree lives: `REEVES_REGISTRY` when a process overrides it (a test, a container, a
// second workspace), `~/.reeves` otherwise.
//
// It gets its own module for one concrete reason: the flow store needs the path but must not import
// the run registry, because the registry imports the flow store to delete a flow when a run's history
// record is deleted (§3.3). Keeping the path here breaks that cycle instead of relying on ESM
// initialisation order.

import { homedir } from 'node:os'
import { join } from 'node:path'

export function stateRoot(): string {
  return process.env.REEVES_REGISTRY || join(homedir(), '.reeves')
}
