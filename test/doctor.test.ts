import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// runDoctor probes helper tool CLIs through node:child_process (hf auth whoami,
// colab --auth=oauth2 whoami, ollama list) and PATH through `which`; intercept
// both so no real CLI ever runs here. `which` fails by default, so every tool
// and provider reads as missing and the checks stay deterministic.
const execFileSync = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execFileSync, spawnSync: vi.fn(() => ({ status: 1, stdout: '' })) }))

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-doctor-test-'))
  process.env.REEVES_REGISTRY = tmpDir
  process.env.REEVES_DOCTOR_SKIP_PROVIDER_COMPAT = '1'
  execFileSync.mockReset()
  execFileSync.mockImplementation(() => { throw new Error('which: not found') })
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  delete process.env.REEVES_DOCTOR_SKIP_PROVIDER_COMPAT
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('doctor', () => {
  it('runDoctor returns result with checks array', async () => {
    const { runDoctor } = await import('../src/core/doctor.js')
    const result = runDoctor()
    expect(Array.isArray(result.checks)).toBe(true)
    expect(result.checks.length).toBeGreaterThan(0)
  })

  it('each check has name, status, detail', async () => {
    const { runDoctor } = await import('../src/core/doctor.js')
    const result = runDoctor()
    for (const check of result.checks) {
      expect(typeof check.name).toBe('string')
      expect(['ok', 'warn', 'fail']).toContain(check.status)
      expect(typeof check.detail).toBe('string')
    }
  })

  it('includes node check', async () => {
    const { runDoctor } = await import('../src/core/doctor.js')
    const result = runDoctor()
    expect(result.checks.find(c => c.name === 'node')).toBeDefined()
  })

  it('includes platform check', async () => {
    const { runDoctor } = await import('../src/core/doctor.js')
    const result = runDoctor()
    expect(result.checks.find(c => c.name === 'platform')).toBeDefined()
  })

  it('reports native Windows as unsupported', async () => {
    const { platformSupportCheck } = await import('../src/core/doctor.js')
    const check = platformSupportCheck('win32', {}, '')
    expect(check.status).toBe('fail')
    expect(check.detail).toContain('WSL')
  })

  it('reports Linux and WSL as supported', async () => {
    const { platformSupportCheck } = await import('../src/core/doctor.js')
    expect(platformSupportCheck('linux', {}, 'Linux version').detail).toBe('Linux supported')
    expect(platformSupportCheck('linux', { WSL_DISTRO_NAME: 'Ubuntu' }, 'Linux version').detail).toBe('WSL supported')
    expect(platformSupportCheck('linux', {}, 'Linux version microsoft-standard-WSL2').detail).toBe('WSL supported')
  })

  it('includes provider compatibility check', async () => {
    const { runDoctor } = await import('../src/core/doctor.js')
    const result = runDoctor()
    expect(result.checks.find(c => c.name === 'provider compat')).toBeDefined()
  })

  it('node check passes on node 22.12+', async () => {
    const { runDoctor } = await import('../src/core/doctor.js')
    const result = runDoctor()
    expect(result.checks.find(c => c.name === 'node')?.status).toBe('ok')
  })

  it('node check enforces package minimum 22.12.0', async () => {
    const { nodeVersionCheck } = await import('../src/core/doctor.js')
    expect(nodeVersionCheck('v20.19.0').status).toBe('fail')
    expect(nodeVersionCheck('v22.11.0').status).toBe('fail')
    expect(nodeVersionCheck('v22.11.0').detail).toBe('22.11.0 (need >=22.12.0)')
    expect(nodeVersionCheck('v22.12.0').status).toBe('ok')
    expect(nodeVersionCheck('v24.0.0').status).toBe('ok')
  })

  it('does not expose runtime cleanup from doctor', async () => {
    const { runDoctor } = await import('../src/core/doctor.js')
    const result = runDoctor()
    expect('orphans' in result).toBe(false)
  })

  it('checks v1 state paths instead of old session orphans', async () => {
    const { runDoctor } = await import('../src/core/doctor.js')
    const result = runDoctor()
    expect(result.checks.find(c => c.name === 'runs dir')).toBeDefined()
    expect(result.checks.find(c => c.name === 'presets dir')).toBeDefined()
    expect(result.checks.find(c => c.name === 'runs state')).toBeDefined()
  })

  it('includes a web extras check that never fails (optional feature)', async () => {
    const { runDoctor } = await import('../src/core/doctor.js')
    const check = runDoctor().checks.find(c => c.name === 'web extras')
    expect(check).toBeDefined()
    expect(['ok', 'warn']).toContain(check!.status)
  })

  it('includes an mcp server check that never fails (optional hardening)', async () => {
    const { runDoctor } = await import('../src/core/doctor.js')
    const check = runDoctor().checks.find(c => c.name === 'mcp server')
    expect(check).toBeDefined()
    expect(['ok', 'warn']).toContain(check!.status)
  })

  it('includes an informational tools check that never fails', async () => {
    const { runDoctor } = await import('../src/core/doctor.js')
    const check = runDoctor().checks.find(c => c.name === 'tools')
    expect(check).toBeDefined()
    expect(check!.status).toBe('ok') // missing tools narrow what agents can reach; they never fail the run
    expect(check!.detail).toContain('Perplexity CLI')
    expect(check!.detail).toMatch(/(installed|missing)/)
  })
})
