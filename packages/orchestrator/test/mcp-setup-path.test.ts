import { describe, it, expect } from 'vitest'
import { isSuspiciousReevesPath, resolveReevesPath } from '../src/mcp-setup.js'

describe('mcp-setup resolveReevesPath', () => {
  it('rejects vitest worker fork scripts', () => {
    const bad = '/Users/x/dev/reevesagents/node_modules/.pnpm/vitest@4.1.6_y/node_modules/vitest/dist/workers/forks.js'
    expect(isSuspiciousReevesPath(bad)).toBe(true)
    expect(resolveReevesPath(bad)).not.toBe(bad)
  })

  it('rejects jest, mocha, ava paths', () => {
    expect(isSuspiciousReevesPath('/x/node_modules/jest-worker/build/worker.js')).toBe(true)
    expect(isSuspiciousReevesPath('/x/node_modules/.bin/mocha')).toBe(true)
    expect(isSuspiciousReevesPath('/x/node_modules/ava/cli.js')).toBe(true)
  })

  it('rejects any path under .pnpm/', () => {
    expect(isSuspiciousReevesPath('/x/node_modules/.pnpm/anything/dist/foo.js')).toBe(true)
  })

  it('accepts a normal reevesagents dist path', () => {
    const good = '/Users/x/dev/reevesagents-orchestrator/dist/cli.js'
    expect(isSuspiciousReevesPath(good)).toBe(false)
    expect(resolveReevesPath(good)).toBe(good)
  })

  it('accepts a globally installed bin path', () => {
    const good = '/opt/homebrew/bin/reevesagents-orchestrator'
    expect(isSuspiciousReevesPath(good)).toBe(false)
    expect(resolveReevesPath(good)).toBe(good)
  })

  it('falls back to a cli.js path when argv1 is suspicious', () => {
    const bad = '/x/node_modules/.pnpm/vitest/dist/workers/forks.js'
    const resolved = resolveReevesPath(bad)
    // Must end with cli.js (the bundled entry sibling to mcp-setup)
    expect(resolved.endsWith('cli.js')).toBe(true)
    // And must not be the bad path
    expect(resolved).not.toBe(bad)
  })

  it('falls back to a cli.js path when argv1 is undefined', () => {
    const resolved = resolveReevesPath(undefined)
    expect(resolved.endsWith('cli.js') || resolved === 'reevesagents-orchestrator').toBe(true)
  })

  it('does not write nvm-versioned paths into MCP config', () => {
    const nvmPath = '/Users/x/.nvm/versions/node/v22.5.0/lib/node_modules/reevesagents-orchestrator/dist/cli.js'
    const resolved = resolveReevesPath(nvmPath)
    expect(resolved).not.toBe(nvmPath)
    expect(resolved.endsWith('cli.js') || resolved === 'reevesagents-orchestrator').toBe(true)
  })

  it('does not write fnm or volta versioned paths into MCP config', () => {
    const fnmPath = '/Users/x/.fnm/node-versions/v22.5.0/installation/bin/reevesagents-orchestrator'
    const voltaPath = '/Users/x/.volta/bin/reevesagents-orchestrator'
    expect(resolveReevesPath(fnmPath)).not.toBe(fnmPath)
    expect(resolveReevesPath(voltaPath)).not.toBe(voltaPath)
  })
})
