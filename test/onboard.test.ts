import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// child_process is mocked so which / tmux -V / mcp list are fully controlled and
// no real CLI is touched. resolveLaunchCmd resolves via the running node entry,
// so it never reaches this mock.
const execFileSync = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({
  execFileSync,
  spawnSync: vi.fn(() => ({ status: 1, stdout: '', stderr: '' })),
}))

interface Env {
  installed: Set<string>
  attachedHosts?: string[]
  tmux?: string | null // null => tmux missing
}

function wireEnv(env: Env): void {
  execFileSync.mockImplementation((file: string, args: string[]) => {
    if (file === 'tmux') {
      if (env.tmux === null) throw new Error('tmux absent')
      return `tmux ${env.tmux ?? '3.4'}\n`
    }
    if (file === 'which') {
      if (env.installed.has(args[0]!)) return `/usr/bin/${args[0]}\n`
      throw new Error(`absent: ${args[0]}`)
    }
    if (args?.[1] === 'list') {
      return (env.attachedHosts ?? []).includes(file) ? 'reevesagents: reevesagents mcp\n' : ''
    }
    return ''
  })
}

let tmpDir: string
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-onboard-'))
  process.env.REEVES_REGISTRY = tmpDir
  process.env.REEVES_CONFIG = join(tmpDir, 'config.json')
  execFileSync.mockReset()
})
afterEach(() => {
  delete process.env.REEVES_REGISTRY
  delete process.env.REEVES_CONFIG
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('onboarding state', () => {
  it('marks installed drivable unconnected hosts as attachable and skips connected ones', async () => {
    wireEnv({ installed: new Set(['claude', 'codex']), attachedHosts: ['claude'] })
    const { buildOnboardingState } = await import('../src/core/onboard.js')
    const state = buildOnboardingState()

    expect(state.tmuxOk).toBe(true)
    expect(state.installedProviders).toContain('cc')
    expect(state.installedProviders).toContain('codex')
    expect(state.attachedHosts).toContain('cc')
    expect(state.attachable).toContain('codex')
    expect(state.attachable).not.toContain('cc')
    expect(state.launcherAbsolute).toBe(true)
    expect(state.ready).toBe(true)
  })

  it('is not ready without a provider CLI', async () => {
    wireEnv({ installed: new Set() })
    const { buildOnboardingState } = await import('../src/core/onboard.js')
    const state = buildOnboardingState()
    expect(state.installedProviders).toEqual([])
    expect(state.ready).toBe(false)
  })

  it('reports tmux missing and is not ready even with a provider', async () => {
    wireEnv({ installed: new Set(['claude']), tmux: null })
    const { buildOnboardingState } = await import('../src/core/onboard.js')
    const state = buildOnboardingState()
    expect(state.tmuxOk).toBe(false)
    expect(state.ready).toBe(false)
  })
})
