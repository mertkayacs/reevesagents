import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { shellQuoteFor } from '../src/core/provider-launch.js'
import { binaryOnPath } from '../src/core/providers.js'
import { splitWindowsCommandLine } from '../src/surfaces/mcp/host.js'
import { tmuxCommand } from '../src/core/tmux.js'

describe('shellQuoteFor', () => {
  it('posix single-quotes and escapes embedded quotes', () => {
    expect(shellQuoteFor('plain', 'linux')).toBe(`'plain'`)
    expect(shellQuoteFor(`it's "here"`, 'linux')).toBe(`'it'\\''s "here"'`)
  })

  it('posix stays single-quoted on darwin', () => {
    expect(shellQuoteFor('a b', 'darwin')).toBe(`'a b'`)
  })

  it('cmd leaves plain tokens unquoted', () => {
    expect(shellQuoteFor('plain', 'win32')).toBe('plain')
    expect(shellQuoteFor('C:\\Users\\x', 'win32')).toBe('C:\\Users\\x')
  })

  it('cmd wraps spaces and doubles embedded quotes', () => {
    expect(shellQuoteFor('a b', 'win32')).toBe('"a b"')
    expect(shellQuoteFor(`say "hi"`, 'win32')).toBe('"say ""hi"""')
    expect(shellQuoteFor("it's", 'win32')).toBe('"it\'s"')
  })

  it('host command splitter tokenizes cmd command lines', () => {
    expect(splitWindowsCommandLine('node "C:\\Program Files\\claude" mcp')).toEqual([
      'node',
      'C:\\Program Files\\claude',
      'mcp',
    ])
    expect(splitWindowsCommandLine('')).toEqual([])
  })
})

describe('tmuxCommand', () => {
  it('routes to plain tmux on linux and darwin', () => {
    expect(tmuxCommand('linux')).toEqual({ file: 'tmux', prefix: [] })
    expect(tmuxCommand('darwin')).toEqual({ file: 'tmux', prefix: [] })
  })

  it('routes to node + winmux entry on win32', () => {
    expect(tmuxCommand('win32').file).toBe(process.execPath)
    expect(tmuxCommand('win32').prefix[0]!.endsWith('winmux.js')).toBe(true)
  })

  it('honors REEVES_WINMUX_ENTRY on win32', () => {
    const prev = process.env.REEVES_WINMUX_ENTRY
    process.env.REEVES_WINMUX_ENTRY = join('mock', 'winmux.js')
    try {
      expect(tmuxCommand('win32')).toEqual({ file: process.execPath, prefix: [join('mock', 'winmux.js')] })
    } finally {
      if (prev === undefined) delete process.env.REEVES_WINMUX_ENTRY
      else process.env.REEVES_WINMUX_ENTRY = prev
    }
  })
})

describe('binaryOnPath', () => {
  it('resolves a missing binary to false on every platform', () => {
    expect(binaryOnPath('definitely-not-a-real-binary-x9z7')).toBe(false)
  })
})
