// Shared CLI helpers: id resolution with prefix/name matching, and the
// destructive-action confirmation gate. Used across the command files.

import { listAgents, listRuns } from '../../core/runs.js'
import type { AgentRecord, RunRecord } from '../../core/types.js'

export function resolveRun(id: string): RunRecord {
  const runs = listRuns()
  const exact = runs.find(run => run.id === id || run.name === id)
  if (exact) return exact
  const matches = runs.filter(run => run.id.startsWith(id) || run.name.startsWith(id))
  if (matches.length === 1) return matches[0]!
  if (matches.length > 1) throw new Error(`ambiguous run id: ${matches.map(run => run.id).join(', ')}`)
  throw new Error(`run not found: ${id}`)
}

export function resolveAgent(id: string): AgentRecord {
  const agents = listAgents()
  const exact = agents.find(agent => agent.id === id || agent.nickname === id)
  if (exact) return exact
  const matches = agents.filter(agent => agent.id.startsWith(id) || agent.nickname.startsWith(id))
  if (matches.length === 1) return matches[0]!
  if (matches.length > 1) throw new Error(`ambiguous agent id: ${matches.map(agent => agent.id).join(', ')}`)
  throw new Error(`agent not found: ${id}`)
}

function destructiveAllowed(opts: { yes?: boolean }): boolean {
  return opts.yes === true || process.env.ALLOW_DESTRUCTIVE === '1'
}

export function requireDestructiveConfirmation(opts: { yes?: boolean }, command: string): void {
  if (destructiveAllowed(opts)) return
  throw new Error(`refusing to ${command} without --yes or ALLOW_DESTRUCTIVE=1`)
}
