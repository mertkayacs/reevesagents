// TUI routing types: the screen catalog and the router context shape.
// These are surface types; domain/record types live in core/types.ts.

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
  | 'AgentControl'
  | 'Setup'
  | 'Reference'
  | 'Credits'
  | 'Doctor'
  | 'DoctorCheck'
  | 'Approvals'
  | 'Config'
  | 'Presets'

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
