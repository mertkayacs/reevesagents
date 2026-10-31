// Flow view: what a surface is allowed to show about a flow.
//
// The payload below is a published shape — `flow status --json` and the MCP `flow_status` tool
// return exactly it — so two rules live here instead of in each surface: a path is rendered
// home-shortened, and secret-looking text in the log passes the redactor. A flow whose file cannot
// be read is named by the store, not hidden behind an empty result.
//
// Nothing here decides anything: the engine owns the transitions, this module only describes them.

import type { FlowState } from './flow.js'
import { FlowStateError } from './flow.js'
import { flowPath, listFlowFiles } from './flow-store.js'
import { redactSecrets } from './redact.js'
import { shortHomePath } from '../utils/paths.js'

// Run ids are what a flow is keyed by, and a flow of an archived run must still resolve, so this
// reads the flow directory rather than the live run registry. An exact id wins; a unique prefix is
// accepted, which is what makes a hand-typed id usable.
export function resolveFlowRunId(input: string, root?: string): string {
  const wanted = input.trim()
  if (!wanted) throw new FlowStateError('a run id is required')
  const files = listFlowFiles(root)
  const exact = files.find(file => file.run_id === wanted)
  if (exact) return exact.run_id
  const matches = files.filter(file => file.run_id.startsWith(wanted))
  if (matches.length === 1) return matches[0]!.run_id
  if (matches.length > 1) throw new FlowStateError(`ambiguous run id: ${matches.map(file => file.run_id).join(', ')}`)
  const known = files.slice(0, 5).map(file => file.run_id).join(', ')
  throw new FlowStateError(known
    ? `no flow for run ${wanted} (flows exist for: ${known}${files.length > 5 ? ', ...' : ''})`
    : `no flow for run ${wanted} (no flows exist yet)`)
}

export interface FlowStatusPayload {
  schema_version: number
  run_id: string
  state: string
  rounds: number
  max_rounds: number
  review_started_at: number | null
  review_timeout_sec: number
  head: string
  claim: { head: string, verdict: string | null, verdict_count: number }
  queue: { id: string, title: string, source_path: string | null }[]
  dispatched_specs: string[]
  repo: string
  updated_at: string
  last_decision: { at: string, event: string, detail: string } | null
  log: { at: string, event: string, detail: string }[]
  path: string
}

// A queued block is summarised, never dumped: `body` is repository-authored text and the payload
// is a log line in a transcript. Its id, title and origin are enough to recognise it.
export function flowStatusPayload(state: FlowState, path = flowPath(state.run_id)): FlowStatusPayload {
  const queue = state.specs
    .filter(spec => !state.dispatched_specs.includes(spec.id))
    .map(spec => ({
      id: spec.id,
      title: spec.title,
      source_path: spec.source_path ? shortHomePath(spec.source_path) : null,
    }))
  const log = state.log.slice(-5).map(entry => ({
    at: entry.at,
    event: entry.event,
    detail: redactSecrets(entry.detail),
  }))
  return {
    schema_version: state.schema_version,
    run_id: state.run_id,
    state: state.state,
    rounds: state.rounds,
    max_rounds: state.max_rounds,
    review_started_at: state.review_started_at,
    review_timeout_sec: state.review_timeout_sec,
    head: state.claim.head,
    claim: {
      head: state.claim.head,
      verdict: state.claim.verdict,
      verdict_count: state.claim.verdict_count,
    },
    queue,
    dispatched_specs: state.dispatched_specs,
    repo: shortHomePath(state.repo),
    updated_at: state.updated_at,
    // `flow status` and an MCP host both want "why is it sitting there" in one field.
    last_decision: log.at(-1) ?? null,
    log,
    path: shortHomePath(path),
  }
}
