// Attaching a flow to a run: the one supported way to create one.
//
// The engine, the store and the tick existed before this module, and none of them could be reached:
// `flow status` and `flow tick` both require a flow file, and only the engine's own tests ever wrote
// one. `flow start` (CLI) and `flow_start` (MCP) now call this, so the validation cannot drift
// between the two surfaces — and neither can create a flow the engine cannot drive:
// - the run must exist in the registry;
// - both agents must already belong to *that* run (an agent of another run would be a paste into a
//   pane the operator never meant to drive);
// - the dev and the review agent must differ;
// - the project directory must be readable and carry a HEAD, because the engine binds every verdict
//   to a commit;
// - a run carries one flow: an active one is never replaced, a closed one only with `replace`.
//
// Nothing here sends anything: creating a flow writes one file, and a flow only moves when a tick
// runs.

import type { AgentRecord, RunRecord } from './types.js'
import type { FlowState } from './flow.js'
import { FlowStateError, createFlowState } from './flow.js'
import type { BlockSpec } from './spec.js'
import { readSpecFile } from './flow-queue.js'
import { readGitHead } from './flow-runner.js'
import { flowExists, flowPath, readFlow, saveFlow } from './flow-store.js'
import type { FlowStoreOptions } from './flow-store.js'
import { isRunsLockTimeout, listAgents, listRuns, withRunsLock } from './runs.js'
import { displayPath } from '../utils/paths.js'

export interface StartFlowInput {
  // Run id, run name, or a unique prefix of either.
  run_id: string
  // Agent ids or nicknames inside that run; a unique prefix is accepted.
  dev: string
  review: string
  // Defaults to the run's working directory.
  repo?: string
  max_rounds?: number
  review_timeout_sec?: number
  // Spec files to queue on the new flow: the blocks the dev receives after the first ACCEPT.
  specs?: string[]
  // Start over on a run whose flow is closed (escalated/done). An active flow is never replaced.
  replace?: boolean
  at?: string
}

export interface StartFlowOptions extends FlowStoreOptions {
  // The commit the flow starts from; defaults to the repository's HEAD. A tick requests a review of
  // the *next* commit, so this is the baseline, not a review request.
  head?: string
  // Epoch ms used for the claim-free initial state; the default is the wall clock.
  now?: number
}

export interface StartedFlow {
  state: FlowState
  path: string
  // True when an existing closed flow was deliberately replaced.
  replaced: boolean
}

function findRun(input: string): RunRecord {
  const wanted = input.trim()
  if (!wanted) throw new FlowStateError('a run id is required')
  const runs = listRuns()
  const exact = runs.find(run => run.id === wanted || run.name === wanted)
  if (exact) return exact
  const matches = runs.filter(run => run.id.startsWith(wanted) || run.name.startsWith(wanted))
  if (matches.length === 1) return matches[0]!
  if (matches.length > 1) throw new FlowStateError(`ambiguous run id: ${matches.map(run => run.id).join(', ')}`)
  throw new FlowStateError(`run not found: ${wanted}`)
}

// Agents are resolved inside the run, not across the registry: a nickname that also exists in another
// run must not attach that run's pane to this flow.
function findRunAgent(run: RunRecord, input: string, role: string): AgentRecord {
  const wanted = input.trim()
  if (!wanted) throw new FlowStateError(`a ${role} agent is required`)
  const agents = listAgents(run.id)
  const exact = agents.find(agent => agent.id === wanted || agent.nickname === wanted)
  if (exact) return exact
  const matches = agents.filter(agent => agent.id.startsWith(wanted) || agent.nickname.startsWith(wanted))
  if (matches.length === 1) return matches[0]!
  if (matches.length > 1) {
    throw new FlowStateError(`ambiguous ${role} agent in run ${run.id}: ${matches.map(agent => agent.id).join(', ')}`)
  }
  throw new FlowStateError(`no ${role} agent ${wanted} in run ${run.id} (agents there: ${agents.map(agent => agent.id).join(', ') || 'none'})`)
}

function readQueuedSpecs(paths: string[], repo: string): BlockSpec[] {
  const specs: BlockSpec[] = []
  for (const path of paths) {
    const spec = readSpecFile(path, { repo, existingIds: specs.map(entry => entry.id) })
    specs.push(spec)
  }
  return specs
}

// Create the flow, or refuse with the reason. The file write happens under the runs lock, so two
// `flow start` calls cannot both decide the run is free and overwrite each other.
export function startFlow(input: StartFlowInput, options: StartFlowOptions = {}): StartedFlow {
  const run = findRun(input.run_id)
  const dev = findRunAgent(run, input.dev, 'dev')
  const review = findRunAgent(run, input.review, 'review')
  const repo = (input.repo ?? run.working_dir).trim()
  if (!repo) {
    throw new FlowStateError(`run ${run.id} has no working directory; pass a project directory`)
  }
  const head = options.head ?? readGitHead(repo)
  if (!head) {
    // `displayPath`, not `shortHomePath`: a repo outside the home directory has no shorthand, and
    // this message is quoted by every surface that prints an error (an MCP host keeps it verbatim).
    throw new FlowStateError(`cannot read HEAD in ${displayPath(repo)} (is it a git repository with a commit?)`)
  }
  // Specs are read before the lock: a bad file must fail without touching the flow directory.
  const specs = input.specs?.length ? readQueuedSpecs(input.specs, repo) : []

  const at = input.at ?? new Date().toISOString()
  try {
    return withRunsLock<StartedFlow>(() => {
      const existed = flowExists(run.id, { root: options.root })
      if (existed) {
        const existing = readFlow(run.id, { root: options.root })
        const closed = existing.state === 'escalated' || existing.state === 'done'
        if (!closed) {
          throw new FlowStateError(
            `run ${run.id} already has a flow in state ${existing.state} (${displayPath(flowPath(run.id, options.root))});`
            + ` use \`flow status --run ${run.id}\`, or wait until it is escalated or done`,
          )
        }
        if (input.replace !== true) {
          throw new FlowStateError(
            `run ${run.id} has a closed flow (${existing.state}); pass --replace to start a new one on the same run`,
          )
        }
      }
      const created = createFlowState({
        run_id: run.id,
        repo,
        roles: { dev: dev.id, review: review.id },
        head,
        max_rounds: input.max_rounds,
        review_timeout_sec: input.review_timeout_sec,
        specs,
        at,
      })
      const state: FlowState = {
        ...created,
        log: [{ at, event: 'flow_started', detail: `${head} ${specs.length} queued` }],
      }
      return { state, path: saveFlow(state, { root: options.root }), replaced: existed }
    })
  } catch (err) {
    // The lock message names the absolute lock path, and every surface here prints errors
    // home-shortened, so it is replaced instead of rethrown.
    if (isRunsLockTimeout(err)) {
      throw new FlowStateError('another reevesagents process is writing the state directory; try again')
    }
    throw err
  }
}
