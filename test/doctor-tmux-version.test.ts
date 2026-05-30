import { describe, it, expect } from 'vitest'

function parseTmuxVersion(versionStr: string): { major: number; minor: number } {
  const match = versionStr.match(/tmux (\d+)\.(\d+)/)
  if (!match) throw new Error(`unable to parse tmux version: ${versionStr}`)
  return {
    major: parseInt(match[1] ?? '0', 10),
    minor: parseInt(match[2] ?? '0', 10),
  }
}

describe('Doctor tmux version parsing', () => {
  it('parses tmux 3.3a', () => {
    const v = parseTmuxVersion('tmux 3.3a')
    expect(v.major).toBe(3)
    expect(v.minor).toBe(3)
  })

  it('parses tmux 2.9', () => {
    const v = parseTmuxVersion('tmux 2.9')
    expect(v.major).toBe(2)
    expect(v.minor).toBe(9)
  })

  it('parses tmux 4.0', () => {
    const v = parseTmuxVersion('tmux 4.0')
    expect(v.major).toBe(4)
    expect(v.minor).toBe(0)
  })

  it('throws on invalid format', () => {
    expect(() => parseTmuxVersion('not a version')).toThrow()
  })

  it('returns warn for 2.9', () => {
    const v = parseTmuxVersion('tmux 2.9')
    const status = v.major >= 3 ? 'ok' : 'warn'
    expect(status).toBe('warn')
  })

  it('returns ok for 3.3', () => {
    const v = parseTmuxVersion('tmux 3.3a')
    const status = v.major >= 3 ? 'ok' : 'warn'
    expect(status).toBe('ok')
  })
})
