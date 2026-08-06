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
import { listAgents, listRuns, nowMs } from './runs.js'
import {
  allWindowIds as tmuxAllWindowIds,
  listSessions as tmuxListSessions,
  killSession as tmuxKillSession,
  sessionAttached as tmuxSessionAttached,
  RUN_SESSION_PATTERN,
  sessionInGroup,
  targetExists as tmuxTargetExists,
  tmuxAvailable,
  VIEWER_SESSION_PATTERN,
  type RuntimeDriver,
  type TmuxSessionInfo,
} from './tmux.js'
import { killAgent } from './runtime.js'

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
  const haveTmux = options.targetExists ? true : (options.tmuxAvailable ?? tmuxAvailable)()
  if (!haveTmux) return { reaped: [] }

  const targetExists = options.targetExists ?? tmuxTargetExists
  const now = options.now ?? nowMs
  const maxLifetimeMs = options.maxLifetimeMs ?? loadConfig().global.max_lifetime_ms

  const candidates = listAgents().filter(agent => !agent.ended_at && !agent.headless)

  // Batch path (no injected probe): one server-wide window enumeration instead
  // of a tmux spawn per agent per sweep. A miss is confirmed with a fresh probe
  // so a window born after the enumeration is never misjudged as gone.
  const batchWindows = !options.targetExists && candidates.some(agent => agent.tmux_window_id)
    ? tmuxAllWindowIds()
    : null
  const probe = batchWindows
    ? (id: string, session: string): boolean => batchWindows.has(`${session}\0${id}`) || targetExists(id, session)
    : targetExists

  const reaped: ReapedAgent[] = []
  for (const agent of candidates) {
    const ageMs = now() - new Date(agent.started_at).getTime()
    let reason: ReapReason | null = null
    if (agent.tmux_window_id && !probe(agent.tmux_window_id, agent.tmux_session)) {
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

// Orphan sessions are tmux sessions that no live record owns: run sessions left
// behind by a crash between new-session and the record write (or by an archive
// that predates kill-before-archive), and web viewer sessions whose run session
// is gone. Record-driven cleanup can never see these, so enumerate instead.
// Safety rules:
// - Attached sessions are spared, re-probed right before the kill (a human may
//   have attached since the enumeration).
// - Sessions younger than ORPHAN_MIN_AGE_SEC are spared: a startRun in another
//   process creates the session before its record exists, and the sweep must not
//   kill a run that is still starting.
// - Ownership is judged against this process's registry only (stateRoot()); two
//   registries sharing one tmux server is unsupported — a sweep would see the
//   other registry's sessions as orphans.
export interface OrphanSweepOptions {
  listSessions?: () => TmuxSessionInfo[]
  killSession?: (_session: string) => void
  sessionAttached?: (_session: string) => boolean
  tmuxAvailable?: () => boolean
  now?: () => number
  // Manual sweeps (CLI/MCP reap) set this: the grace exists to protect runs
  // mid-start from *background* sweeps; an explicit user sweep may ignore it.
  ignoreGrace?: boolean
}

// Sessions younger than this are still being set up by their owning process.
const ORPHAN_MIN_AGE_SEC = 60

export function sweepOrphanSessions(options: OrphanSweepOptions = {}): { killed: string[] } {
  const haveTmux = options.listSessions ? true : (options.tmuxAvailable ?? tmuxAvailable)()
  if (!haveTmux) return { killed: [] }
  const sessions = (options.listSessions ?? tmuxListSessions)()
  const killSession = options.killSession ?? tmuxKillSession
  const sessionAttached = options.sessionAttached ?? tmuxSessionAttached
  const nowSec = ((options.now ?? nowMs)()) / 1000
  const liveRunSessions = new Set(listRuns().map(run => run.tmux_session))
  const killed: string[] = []
  for (const info of sessions) {
    if (info.attached) continue
    if (!options.ignoreGrace && info.createdSec > 0 && nowSec - info.createdSec < ORPHAN_MIN_AGE_SEC) continue
    let orphan = false
    if (RUN_SESSION_PATTERN.test(info.name)) {
      orphan = !liveRunSessions.has(info.name)
    } else if (VIEWER_SESSION_PATTERN.test(info.name)) {
      // A viewer is only legitimate while its group still holds a recorded run session.
      orphan = ![...liveRunSessions].some(s => sessionInGroup(info, s))
    }
    if (!orphan) continue
    if (sessionAttached(info.name)) continue
    try {
      killSession(info.name)
      killed.push(info.name)
    } catch {
      // session disappeared mid-sweep
    }
  }
  return { killed }
}

// Orphan enumeration is one list-sessions call, so it can share the sweep cadence.
let lastOrphanSweepAt = 0

export function sweepOrphanSessionsThrottled(
  minIntervalMs = 15_000,
  options: OrphanSweepOptions = {},
): { killed: string[]; swept: boolean } {
  const now = nowMs()
  if (lastOrphanSweepAt !== 0 && now - lastOrphanSweepAt < minIntervalMs) return { killed: [], swept: false }
  lastOrphanSweepAt = now
  return { ...sweepOrphanSessions(options), swept: true }
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
  lastOrphanSweepAt = 0
}
