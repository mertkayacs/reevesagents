import { describe, it, expect } from 'vitest'
import { providerFromParent } from '../src/agent-mcp/host.js'

// providerFromParent maps a parent process (comm + argv) to a provider. The hard
// case is a Node CLI whose comm is "node": detection must fall through to the
// argv basenames to recognize the shipping claude/kimi/qwen binaries.
describe('providerFromParent', () => {
  it('maps a direct binary comm to its provider', () => {
    expect(providerFromParent('claude', [])).toBe('cc')
  })

  it('falls back to argv basename when comm is node (shebang Node CLI)', () => {
    expect(providerFromParent('node', ['/usr/bin/node', '/home/x/.local/bin/claude', 'mcp'])).toBe('cc')
  })

  it('maps codex by comm', () => {
    expect(providerFromParent('codex', [])).toBe('codex')
  })

  it('returns null for an unrelated shell', () => {
    expect(providerFromParent('bash', ['bash', '-c', 'x'])).toBeNull()
  })

  it('returns null for a node process that is not a known CLI', () => {
    expect(providerFromParent('node', ['node', '/home/x/cli.js'])).toBeNull()
  })
})
