// Zombie-agent reaper. Two things turn a live agent record into a zombie: its tmux
// window died while the record still says running (a dead-window zombie), or it has
// outlived the configured max_lifetime_ms (a runaway that never exits). This sweep
// finds both and reaps them with killAgent, so their run tears down the same way a
// manual kill would.
//
// It complements autoCleanupRuns, which archives whole runs that have gone stale or
// ended. The reaper works one level down: it reaps individual dead agents inside a
// run that is otherwise still alive, and it enforces the lifetime cap that
// autoCleanupRuns knows nothing about.

import { loadConfig } from './config.js'
import {
  defaultTmuxAvailable,
  defaultTmuxTargetExists,
  listAgents,
  nowMs,
} from './runs.js'
import { killAgent, type RuntimeDriver } from './runtime.js'

export type ReapReason = 'window-gone' | 'lifetime-exceeded'

export interface ReapedAgent {
  agent_id: string
  run_id: string
  nickname: string
  reason: ReapReason
  age_ms: number
}

export interface SweepOptions {
  driver?: RuntimeDriver
  targetExists?: (_windowId: string, _session: string) => boolean
  tmuxAvailable?: () => boolean
  now?: () => number
  maxLifetimeMs?: number
}

// Reap every zombie agent once. Returns the list it reaped (empty when there is
// nothing to do). Dead-window reaping runs whether or not a lifetime is set;
// lifetime reaping only runs when max_lifetime_ms > 0.
export function sweepAgents(options: SweepOptions = {}): { reaped: ReapedAgent[] } {
  // An injected targetExists (tests) implies tmux is present; otherwise probe once.
  // Without tmux we cannot tell a dead window from a live one, so reap nothing
  // rather than nuke every record, mirroring autoCleanupRuns' missing-tmux guard.
  const haveTmux = options.targetExists ? true : (options.tmuxAvailable ?? defaultTmuxAvailable)()
  if (!haveTmux) return { reaped: [] }

  const targetExists = options.targetExists ?? defaultTmuxTargetExists
  const now = options.now ?? nowMs
  const maxLifetimeMs = options.maxLifetimeMs ?? loadConfig().global.max_lifetime_ms

  const reaped: ReapedAgent[] = []
  for (const agent of listAgents()) {
    if (agent.ended_at || agent.headless) continue
    const ageMs = now() - new Date(agent.started_at).getTime()
    let reason: ReapReason | null = null
    if (agent.tmux_window_id && !targetExists(agent.tmux_window_id, agent.tmux_session)) {
      reason = 'window-gone'
    } else if (maxLifetimeMs > 0 && ageMs > maxLifetimeMs) {
      reason = 'lifetime-exceeded'
    }
    if (!reason) continue
    try {
      killAgent(agent.id, options.driver ? { driver: options.driver } : {})
      reaped.push({
        agent_id: agent.id,
        run_id: agent.run_id,
        nickname: agent.nickname,
        reason,
        age_ms: Math.max(0, Math.round(ageMs)),
      })
    } catch {
      // The agent or its run was archived out from under us mid-sweep; nothing to reap.
    }
  }
  return { reaped }
}

// Throttle state for the periodic surfaces (TUI refresh, web SSE tick, MCP list).
// They tick every couple of seconds; without this each tick would spawn a tmux
// probe per windowed agent. Module-level is correct: these hosts are long-lived
// single processes.
let lastSweepAt = 0

// Sweep at most once per minIntervalMs. Returns swept:false (and no reaping) when a
// call lands inside the cooldown, so callers can wire it straight into a fast tick.
export function sweepAgentsThrottled(
  minIntervalMs = 15_000,
  options: SweepOptions = {},
): { reaped: ReapedAgent[]; swept: boolean } {
  const now = (options.now ?? nowMs)()
  if (lastSweepAt !== 0 && now - lastSweepAt < minIntervalMs) return { reaped: [], swept: false }
  lastSweepAt = now
  return { ...sweepAgents(options), swept: true }
}

// Test seam: forget the last sweep time so the next throttled call runs immediately.
export function resetSweepThrottle(): void {
  lastSweepAt = 0
}
