// Pure logic for the setup checklist. Takes already-detected boolean
// state (so the function has no I/O) and returns the counts the UI renders
// plus the cascade-driven next-step tip. Tests pin this down without needing
// to mock filesystem, PATH, or child_process.

import type { Provider } from './types.js'

export interface ChecklistState {
  tmuxOk: boolean
  numDetected: number          // how many providers' binaries are on PATH
  numRegistered: number        // how many of those are MCP-registered
  totalProviders: number       // size of the provider universe
  tip: string                  // single user-facing "do this next" line
  ready: boolean               // tmux + ≥1 detected + ≥1 registered
}

const TIP_TMUX     = 'Install tmux first: brew install tmux (or apt install tmux).'
const TIP_PROVIDER = 'Install a provider CLI like claude, codex, opencode, or hermes.'
const TIP_REGISTER = 'Open Settings and choose "detect and register CLIs" so agents can call this MCP.'
const TIP_READY    = "You're set. Open the TUI and start a run from Welcome or Runs."

export function computeChecklist(
  tmuxOk: boolean,
  available: Record<Provider, boolean>,
  registered: Record<Provider, boolean>,
): ChecklistState {
  const providers = Object.keys(available) as Provider[]
  const numDetected = providers.filter(p => available[p]).length
  const numRegistered = providers.filter(p => registered[p]).length
  const totalProviders = providers.length
  const ready = tmuxOk && numDetected > 0 && numRegistered > 0

  // Cascade: highest-priority unmet need wins.
  let tip: string
  if (!tmuxOk) tip = TIP_TMUX
  else if (numDetected === 0) tip = TIP_PROVIDER
  else if (numRegistered === 0) tip = TIP_REGISTER
  else tip = TIP_READY

  return { tmuxOk, numDetected, numRegistered, totalProviders, tip, ready }
}

// Exported for tests so the tip strings can be compared without copy-pasting.
export const CHECKLIST_TIPS = {
  tmux: TIP_TMUX,
  provider: TIP_PROVIDER,
  register: TIP_REGISTER,
  ready: TIP_READY,
} as const
