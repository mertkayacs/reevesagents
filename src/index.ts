// Programmatic API: stable agent-run runtime, doctor, and run state.
// Inputs: function arguments. Outputs: typed return values.
// Invariant: all exports are pure functions or constants; no side effects on import.

export { ErrorBoundary } from './components/ErrorBoundary.js'

export {
  startRun,
  openReeves,
  openRunTabs,
  openAgent,
  peekAgent,
  killAgent,
  stopRun,
} from './launcher/runtime.js'
export { runDoctor } from './launcher/doctor.js'
export { detectAvailable, buildCommand, BIN, PROVIDERS, isProvider, normalizeProvider } from './launcher/providers.js'
export {
  MODEL_CATALOG,
  PROVIDER_DEFAULT_MODEL,
  PROVIDER_DEFAULT_MODEL_LABEL,
  modelDisplayName,
  modelSourceForProvider,
  modelValuesForProvider,
} from './launcher/model-catalog.js'

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
} from './state/runs.js'

export { loadConfig, saveConfig, defaultConfig } from './state/config.js'
export {
  listSavedTrees, loadSavedTree, saveSavedTree, deleteSavedTree, presetsDir,
} from './state/store.js'

export type {
  Provider,
  Permissions,
  AuthMode,
  Effort,
  TaskStatus,
  ScreenName,
  Config,
  GlobalConfig,
  Message,
  RunRecord,
  RunHistoryRecord,
  RunHistoryStatus,
  AgentRecord,
  CheckResult,
  RouterContextValue,
} from './state/types.js'
