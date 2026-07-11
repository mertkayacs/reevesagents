// Win-native registry record shapes. The unix records key agents to tmux targets
// (tmux_session/window/pane); ConPTY has none of that, so agents key to a ConPTY
// child pid instead. Otherwise the run/agent/history split mirrors the unix
// registry so the drive-loop metadata is the same.

import type {
  AgentRole,
  Permissions,
  Provider,
  RunHistoryStatus,
  RunStatus,
  TaskStatus,
} from '../shared/types.js'

// <REEVES_WIN_REGISTRY>/runs/<run-id>/run.json
export interface PtyRunRecord {
  id: string
  name: string
  status: RunStatus
  root_agent_id: string
  working_dir: string
  started_at: string
  ended_at: string | null
}

// <REEVES_WIN_REGISTRY>/runs/<run-id>/agents/<agent-id>.json
export interface PtyAgentRecord {
  id: string
  run_id: string
  nickname: string
  provider: Provider
  model: string
  role: AgentRole
  working_dir: string
  task: string
  task_status: TaskStatus
  pid: number
  permissions: Permissions
  started_at: string
  ended_at: string | null
}

// <REEVES_WIN_REGISTRY>/history/runs/<run-id>.json
export interface PtyRunHistoryRecord {
  id: string
  name: string
  status: RunHistoryStatus
  working_dir: string
  started_at: string
  ended_at: string | null
  archived_at: string
  agent_count: number
  root_provider: Provider | null
}
