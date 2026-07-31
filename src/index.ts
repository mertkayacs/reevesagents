// Programmatic API: stable agent-run runtime, doctor, and run state.
// Inputs: function arguments. Outputs: typed return values.
// Invariant: all exports are pure functions or constants; no side effects on import.

export {
  startRun,
  openReeves,
  openRunTabs,
  openAgent,
  peekAgent,
  killAgent,
  stopRun,
} from './core/runtime.js'
export { runDoctor } from './core/doctor.js'
export { detectAvailable, buildCommand, BIN, PROVIDERS, isProvider, normalizeProvider } from './core/providers.js'
export {
  MODEL_CATALOG,
  PROVIDER_DEFAULT_MODEL,
  PROVIDER_DEFAULT_MODEL_LABEL,
  modelDisplayName,
  modelSourceForProvider,
  modelValuesForProvider,
} from './core/model-catalog.js'

export {
  listRuns,
  readRun,
  listAgents,
  readAgent,
  computeRunStatus,
  listRunHistory,
  nowIso,
  stateRoot,
  runsDir,
} from './core/runs.js'

export { loadConfig, saveConfig, defaultConfig } from './core/config.js'
export {
  listPresets, loadPreset, savePreset, deletePreset, presetsDir,
} from './core/store.js'

export type {
  Provider,
  Permissions,
  AuthMode,
  Effort,
  TaskStatus,
  Config,
  GlobalConfig,
  Message,
  RunRecord,
  RunHistoryRecord,
  RunHistoryStatus,
  AgentRecord,
  CheckResult,
} from './core/types.js'

export type { ScreenName, RouterContextValue } from './surfaces/tui/types.js'
