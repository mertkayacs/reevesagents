// Onboarding state and a one-call setup action, shared by the CLI, TUI, and Web
// so every surface offers the same first-run flow over one core. Nothing runs at
// import; a surface builds the state when it needs it and calls runOnboarding
// only once the user has consented to connect their CLIs.

import { detectAvailable } from './providers.js'
import { checkTmux, nodeVersionCheck } from './doctor.js'
import {
  attachAll,
  hostStatus,
  resolveLaunchCmd,
  verifyServerLaunch,
  type AttachResult,
  type HostStatus,
  type VerifyResult,
} from '../mcp/installer.js'
import type { Provider } from './types.js'

export interface OnboardingState {
  tmuxOk: boolean
  nodeOk: boolean
  installedProviders: Provider[]
  hosts: HostStatus[]
  // Installed, drivable hosts we can connect for the user but have not yet.
  attachable: string[]
  attachedHosts: string[]
  // Whether the MCP launcher resolved to an absolute, PATH-independent command.
  launcherAbsolute: boolean
  // Enough to spawn an agent: tmux plus at least one provider CLI on PATH.
  ready: boolean
}

export function buildOnboardingState(): OnboardingState {
  const available = detectAvailable()
  const installedProviders = (Object.keys(available) as Provider[]).filter(p => available[p])
  const hosts = hostStatus()
  const tmuxOk = checkTmux().status !== 'fail'
  return {
    tmuxOk,
    nodeOk: nodeVersionCheck().status === 'ok',
    installedProviders,
    hosts,
    attachable: hosts.filter(h => h.installed && !h.manual && !h.attached).map(h => h.key),
    attachedHosts: hosts.filter(h => h.attached).map(h => h.key),
    launcherAbsolute: resolveLaunchCmd().command !== 'reevesagents',
    ready: tmuxOk && installedProviders.length > 0,
  }
}

export interface OnboardingResult {
  attached: AttachResult[]
  verify: VerifyResult | null
}

// The consented setup action: connect every installed drivable host, then verify
// the server launches. Idempotent, because attachAll skips already-attached
// hosts, so re-running is safe.
export async function runOnboarding(): Promise<OnboardingResult> {
  const attached = attachAll()
  const verify = attached.some(result => result.ok) ? await verifyServerLaunch() : null
  return { attached, verify }
}
