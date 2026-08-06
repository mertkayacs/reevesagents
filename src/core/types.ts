// Core type definitions for agent-run state, presets, and config.
// TUI routing types (ScreenName, RouterContextValue) live in tui/types.ts.

export type Provider = 'cc' | 'codex' | 'opencode' | 'hermes' | 'kimi' | 'deepseek' | 'pi' | 'qwen' | 'aider'

export type LanguageCode = 'en' | 'de' | 'fr' | 'es' | 'pt' | 'it' | 'tr' | 'ru' | 'zh-Hans' | 'ar'

export type Permissions = 'skip' | 'ask'

export type TaskStatus = 'queued' | 'working' | 'done' | 'failed' | 'blocked'

export type AuthMode = 'default' | 'api-key'

export type Effort = 'default' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type AgentRole = 'root' | 'worker'

export type RunStatus = 'running' | 'ended'

export type RunViewStatus = RunStatus | 'stale'

export type RunHistoryStatus = 'ended' | 'stale'

export interface Message {
  id: string
  from_id: string       // sender's session id
  text: string
  sent_at: string       // ISO 8601
  read: boolean
}

// ~/.reeves/runs/<run-id>/run.json
export interface RunRecord {
  id: string
  name: string
  status: RunStatus
  tmux_session: string
  reeves_session?: string
  reeves_window_id: string
  reeves_pane_id: string
  root_agent_id: string
  working_dir: string
  preset_name: string | null
  started_at: string
  ended_at: string | null
}

// ~/.reeves/history/runs/<run-id>.json
export interface RunHistoryRecord {
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

// ~/.reeves/runs/<run-id>/agents/<agent-id>.json
export interface AgentRecord {
  id: string
  run_id: string
  nickname: string
  provider: Provider
  model: string
  role: AgentRole
  working_dir: string
  task: string
  task_status: TaskStatus
  task_note: string
  tmux_session: string
  tmux_window_id: string
  tmux_pane_id: string
  pane_pid?: number | null  // pane's foreground pid at spawn, for SIGTERM/SIGKILL escalation
  rc_enabled: boolean
  permissions: Permissions
  headless?: boolean        // true for add-on caller records with no tmux window
  inbox: Message[]
  last_seen: number
  started_at: string
  ended_at: string | null
}

// Per-slot config inside a saved preset.
export interface PresetSlot {
  nickname_template: string  // e.g. "researcher-1"
  provider: Provider
  model: string
  auth_mode: AuthMode
  effort: Effort
  initial_prompt: string     // sent to the agent on startup; no substitutions
  working_dir: string
  permissions: Permissions
  rc_enabled: boolean
}

// ~/.reeves/presets/<name>.json
export interface Preset {
  name: string
  description: string
  root: PresetSlot
  workers: PresetSlot[]
  working_dir_pattern?: string
  created_at: string
  updated_at: string
}

// Doctor check result.
export interface CheckResult {
  name: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
}

// Global preferences; no auth, no keys.
export interface GlobalConfig {
  peek_interval_ms: number          // ms between peek polls; default 5000
  peek_lines: number                // capture-pane lines shown; default 10
  max_depth: number                 // spawn recursion cap; default 5
  max_agents: number                // tree size cap; default 100
  ready_delay_ms: number            // ms to wait after session start before task injection; default 5000
  max_lifetime_ms: number           // auto-reap agents older than this; 0 disables; default 0
  default_permissions: Permissions  // default 'ask'
  language: LanguageCode            // default 'en'
}

export interface Config {
  version: number
  global: GlobalConfig
}
