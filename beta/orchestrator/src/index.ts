export { TOOLS, handleMcpTool, startMcpServer } from './mcp.js'
export { registerAll, register, unregister, isRegistered } from './mcp-setup.js'
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
} from './runtime.js'
// Approvals live in the main package; the orchestrator reuses them rather than
// keeping its own copy.
export { listRunApprovals, readRunApproval, resolveRunApproval } from '../../../src/state/approvals.js'
export type { CliRegistration } from './mcp-setup.js'
export type { StartRunRequest, SpawnWorkerRequest, RuntimeOptions, AllowedKey } from './runtime.js'
export type { RunApproval, ApprovalRisk, ApprovalStatus } from '../../../src/state/approvals.js'
