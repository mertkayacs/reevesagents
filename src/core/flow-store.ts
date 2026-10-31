// Flow store: one file per flow under `<state-dir>/flows/<run-id>.json`.
//
// Separate from the run registry on purpose (docs/flows-design.md §3): `archiveAndRemoveRun` and
// `autoCleanupRuns` delete a run directory wholesale, and a flow whose agents died is exactly a
// stale run — pipeline state stored there would die mid-flight.
//
// Two rules the file needs:
// - **Atomic, with no fallback.** Temp file + rename, mode 0600, following `runs.ts` rather than
//   `store.ts` (whose catch writes the target directly, so a crash during that fallback leaves
//   torn JSON where a reader expects a whole document). A failed rename fails the save; losing one
//   tick is cheaper than losing the state.
// - **No silent reset.** A file with another schema_version, damaged JSON or a missing field is a
//   read error naming the file, never "start fresh" — a reset would drop a pipeline mid-round.

import { chmodSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { stateRoot } from './runs.js'
import { shortHomePath } from '../utils/paths.js'
import type { FlowState } from './flow.js'
import { FLOW_SCHEMA_VERSION, FlowStateError, parseFlowState } from './flow.js'

// A run id becomes a file name, so it is validated instead of trusted: `../x` from a CLI argument
// must not be able to write outside the flows directory.
export const FLOW_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/

export interface FlowStoreOptions {
  // Defaults to `stateRoot()` (REEVES_REGISTRY or ~/.reeves), like every other store here.
  root?: string
  // Test seam only: replaces the final rename, so the window between the temp write and the swap
  // is reproducible. Production callers never pass it.
  rename?: (_from: string, _to: string) => void
}

export function flowsDir(root = stateRoot()): string {
  return join(root, 'flows')
}

export function flowPath(runId: string, root = stateRoot()): string {
  if (!FLOW_ID_PATTERN.test(runId)) throw new FlowStateError(`not a valid flow id: ${runId}`)
  return join(flowsDir(root), `${runId}.json`)
}

// Every flow file on disk, sorted by run id. A caller that cannot read one gets its path back
// instead of an exception, so a single damaged file never breaks a listing.
export function listFlowFiles(root = stateRoot()): { run_id: string, path: string }[] {
  let entries: string[]
  try {
    entries = readdirSync(flowsDir(root))
  } catch {
    return []
  }
  return entries
    .filter(entry => entry.endsWith('.json'))
    .map(entry => entry.slice(0, -'.json'.length))
    .filter(runId => FLOW_ID_PATTERN.test(runId))
    .sort()
    .map(runId => ({ run_id: runId, path: flowPath(runId, root) }))
}

export function readFlow(runId: string, options: FlowStoreOptions = {}): FlowState {
  const path = flowPath(runId, options.root)
  return readFlowFile(path, runId)
}

export function readFlowFile(path: string, runId = ''): FlowState {
  let raw: string
  try {
    raw = readFileSync(path, 'utf-8')
  } catch (err) {
    if ((err as { code?: string }).code === 'ENOENT') {
      throw new FlowStateError(`no flow state at ${shortHomePath(path)}`)
    }
    throw new FlowStateError(`flow state could not be read: ${shortHomePath(path)}: ${(err as Error).message}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Explicit, and it names the file: a flow file that no longer parses can only be deleted by
    // a human, so hiding it behind "no flow" would be a lie.
    throw new FlowStateError(`flow state is not valid JSON: ${shortHomePath(path)}`)
  }
  let state: FlowState
  try {
    state = parseFlowState(parsed)
  } catch (err) {
    if (err instanceof FlowStateError) throw new FlowStateError(`${err.message}: ${shortHomePath(path)}`)
    throw err
  }
  if (runId && state.run_id !== runId) {
    throw new FlowStateError(`flow state at ${shortHomePath(path)} belongs to run ${state.run_id}, not ${runId}`)
  }
  return state
}

export function saveFlow(state: FlowState, options: FlowStoreOptions = {}): string {
  const path = flowPath(state.run_id, options.root)
  mkdirSync(dirname(path), { recursive: true })
  const tmpPath = `${path}.tmp`
  const text = JSON.stringify({ ...state, schema_version: FLOW_SCHEMA_VERSION }, null, 2)
  try {
    writeFileSync(tmpPath, text, 'utf-8')
    chmodSync(tmpPath, 0o600)
    ;(options.rename ?? renameSync)(tmpPath, path)
  } catch (err) {
    // Remove the half-written temp file: the next reader must see the previous document or
    // nothing at all, never a file this save abandoned.
    try { unlinkSync(tmpPath) } catch { /* already gone */ }
    throw new FlowStateError(`flow state was not saved: ${shortHomePath(path)}: ${(err as Error).message}`)
  }
  return path
}
