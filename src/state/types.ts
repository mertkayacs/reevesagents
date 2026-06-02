// Core type definitions for spawner run state, presets, and TUI routing.

export type Provider = 'cc' | 'codex' | 'opencode' | 'hermes' | 'kimi' | 'deepseek' | 'pi' | 'qwen' | 'aider'

export type LanguageCode = 'en' | 'de' | 'fr' | 'es' | 'pt' | 'it' | 'tr' | 'zh-Hans' | 'ar'

export type Permissions = 'skip' | 'ask'

export type TaskStatus = 'queued' | 'working' | 'done' | 'failed' | 'blocked'

export type AuthMode = 'default' | 'api-key'

export type Effort = 'default' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type AgentRole = 'root' | 'worker'

export type RunStatus = 'running' | 'ended'

export type RunViewStatus = RunStatus | 'stale'

export type RunMode = 'spawner' | 'orchestrator'

export type RunHistoryStatus = 'ended' | 'stale'

export type ScreenName =
  | 'Welcome'
  | 'LanguageSelect'
  | 'Runs'
  | 'RunHistory'
  | 'Run'
  | 'RunAgents'
  | 'RunOutput'
  | 'RunStop'
  | 'AgentDetail'
  | 'AgentOutput'
  | 'AgentTask'
  | 'AgentKill'
  | 'NewRun'
  | 'NewRunBasics'
  | 'NewRunRoot'
  | 'NewRunWorkers'
  | 'NewRunWorker'
  | 'NewRunReview'
  | 'NewRunStarting'
  | 'AddWorker'
  | 'Settings'
  | 'Reference'
  | 'Credits'
  | 'Doctor'
  | 'DoctorCheck'

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
  mode?: string
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
  mode: RunMode
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
  rc_enabled: boolean
  permissions: Permissions
  headless?: boolean        // true for add-on caller records with no tmux window
  inbox: Message[]
  last_seen: number
  started_at: string
  ended_at: string | null
}

// Per-slot config inside a saved preset.
export interface SavedTreeSlot {
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
export interface SavedTree {
  name: string
  description: string
  root: SavedTreeSlot
  workers: SavedTreeSlot[]
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

// Router context — browser-like screen history via push/pop/forward/replace.
export interface RouterContextValue {
  screen: ScreenName
  push: (_screen: ScreenName) => void
  pop: () => void
  forward: () => void
  replace: (_screen: ScreenName) => void
  resetStack: (_screen: ScreenName, _base?: ScreenName[]) => void
  selectedRunId: string | null
  setSelectedRunId: (_runId: string | null) => void
  selectedAgentId: string | null
  setSelectedAgentId: (_agentId: string | null) => void
  selectedCheckName: string | null
  setSelectedCheckName: (_name: string | null) => void
  selectedWorkerIdx: number | null
  setSelectedWorkerIdx: (_idx: number | null) => void
  canBack: boolean
  canForward: boolean
}

// Global preferences; no auth, no keys.
export interface GlobalConfig {
  peek_interval_ms: number          // ms between peek polls; default 5000
  peek_lines: number                // capture-pane lines shown; default 10
  max_depth: number                 // spawn recursion cap; default 5
  max_agents: number                // tree size cap; default 10
  ready_delay_ms: number            // ms to wait after session start before task injection; default 5000
  default_permissions: Permissions  // default 'ask'
  language: LanguageCode            // default 'en'
}

export interface Config {
  version: number
  global: GlobalConfig
}
