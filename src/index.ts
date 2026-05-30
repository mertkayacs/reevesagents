// Programmatic API: runtime, doctor, run state, and MCP surface.
// Inputs: function arguments. Outputs: typed return values.
// Invariant: all exports are pure functions or constants; no side effects on import.

export { ErrorBoundary } from './components/ErrorBoundary.js'

export {
  startRun,
  spawnWorker,
  openReeves,
  openAgent,
  peekAgent,
  sendText,
  sendKey,
  interrupt,
  killAgent,
  stopRun,
} from './launcher/runtime.js'
export { runDoctor } from './launcher/doctor.js'
export { detectAvailable, buildCommand, BIN, PROVIDERS, isProvider } from './launcher/providers.js'

export {
  listRuns,
  readRun,
  listAgents,
  readAgent,
  computeRunStatus,
  nowIso,
  stateRoot,
  runsDir,
} from './state/runs.js'

export { loadConfig, saveConfig, defaultConfig } from './state/config.js'
export {
  listSavedTrees, loadSavedTree, saveSavedTree, deleteSavedTree, presetsDir,
} from './state/store.js'

export { startMcpServer } from './mcp.js'
export { registerAll, register, unregister, isRegistered } from './mcp-setup.js'

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
  AgentRecord,
  RunApproval,
  CheckResult,
  RouterContextValue,
} from './state/types.js'
