// Pure unit tests for src/core/winmux.ts — runnable on every platform.
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  expandFormat,
  isStreamingCommand,
  nextWindowIndex,
  parseArgs,
  paneCommandName,
  resolveHome,
  resolveTarget,
  translateKeys,
  winmuxPipeName,
  winmuxStatePath,
  type WMSession,
} from '../src/core/winmux.js'

function state(...groups: WMSession[][]): { sessions: WMSession[] } {
  return { sessions: groups.flat() }
}

function mkSession(world: { name: string; windows?: Partial<WMSession['windows'][number]>[]; current?: string; group?: string; created?: number; attached?: number }): WMSession {
  const windows = (world.windows ?? [{}]).map((w, i) => ({
    id: w.id ?? `@${i}`,
    name: w.name ?? `w${i}`,
    index: w.index ?? i,
    paneId: w.paneId ?? `@${i}`,
  }))
  return {
    name: world.name,
    createdSec: world.created ?? 1,
    group: world.group ?? '',
    windows,
    currentWindowId: world.current ?? windows[0].id,
    attached: world.attached ?? 0,
  }
}

describe('parseArgs', () => {
  it('separates booleans, values and positional args', () => {
    const p = parseArgs(['new-window', '-dP', '-F', '#{window_id}', '-t', 'run:', '-n', 'claude', 'echo hi'])
    expect(p.error).toBeUndefined()
    expect(p.bools.has('d')).toBe(true)
    expect(p.bools.has('P')).toBe(true)
    expect(p.strs.F).toBe('#{window_id}')
    expect(p.strs.t).toBe('run:')
    expect(p.strs.n).toBe('claude')
    expect(p.rest).toEqual(['echo hi'])
  })

  it('accepts inline binds', () => {
    const p = parseArgs(['capture-pane', '-p', '-S-80', '--x', '-e'])
    expect(p.error).toBeUndefined()
    expect(p.strs.S).toBe('-80')
    expect(p.bools.has('p')).toBe(true)
  })

  it('rejects unknown flags', () => {
    const p = parseArgs(['new-session', '-z'])
    expect(p.error).toBe('unknown flag -z for new-session')
  })
})

describe('targets', () => {
  const s1 = mkSession({ name: 'run', windows: [{ id: '@0', name: 'reeves', paneId: '%0' }, { id: '@1', name: 'claude', index: 1, paneId: '%1' }], current: '@1' })
  const s2 = mkSession({ name: 'reeves', windows: [{ id: '@2', name: 'w0', paneId: '%2' }], group: 'run' })
  const st = state([s1, s2])

  it('resolves session by exact name, = mark is cosmetic here', () => {
    expect(resolveTarget(st, 'run', {}, 'session').session?.name).toBe('run')
    expect(resolveTarget(st, '=run', {}, 'session').session?.name).toBe('run')
    const miss = resolveTarget(st, 'nope', {}, 'session')
    expect(miss.error).toBe(`can't find session: nope`)
  })

  it('resolves current window of a session, index, name and id forms', () => {
    expect(resolveTarget(st, 'run:', {}, 'window').window?.id).toBe('@1')
    expect(resolveTarget(st, 'run:0', {}, 'window').window?.id).toBe('@0')
    expect(resolveTarget(st, 'run:claude', {}, 'window').window?.id).toBe('@1')
    expect(resolveTarget(st, '@0', {}, 'window').window?.id).toBe('@0')
    expect(resolveTarget(st, '%1', {}, 'window').window?.id).toBe('@1')
    expect(resolveTarget(st, 'run:99', {}, 'window').error).toBe("can't find window: run:99")
  })

  it('a pane id means its window', () => {
    expect(resolveTarget(st, '%2', {}, 'window').window?.id).toBe('@2')
  })

  it('resolves panes and defaults to env pane, then the newest session', () => {
    const pane = resolveTarget(st, '%0', {}, 'pane')
    expect(pane.paneId).toBe('%0')
    const byEnv = resolveTarget(st, undefined, { envPaneId: '%0' }, 'session')
    expect(byEnv.session?.name).toBe('run')
    const newest = resolveTarget(st, undefined, {}, 'window')
    expect(newest.session?.name).toBe('reeves')
    expect(newest.window?.id).toBe('@2')
  })
})

describe('formats', () => {
  const s1 = mkSession({ name: 'run', windows: [{ id: '@5', name: 'claude', index: 3, paneId: '%7' }], group: 'anchor', created: 42, attached: 1 })
  const ctx = {
    session_name: s1.name,
    session_attached: s1.attached,
    session_group: s1.group,
    session_group_list: 'anchor,run',
    session_created: s1.createdSec,
    window_id: '@5',
    window_name: 'claude',
    window_index: 3,
    pane_id: '%7',
    pane_pid: 1234,
    pane_current_command: 'node',
  }
  it('expands #{...} and short forms, unknown vars to empty', () => {
    expect(expandFormat('#{session_name}:#{window_index}', ctx)).toBe('run:3')
    expect(expandFormat('#{window_id} #{pane_id} #{pane_pid}', ctx)).toBe('@5 %7 1234')
    expect(expandFormat('#S:#I #W #D #{nope}', ctx)).toBe('run:3 claude %7 ')
    expect(expandFormat('#{session_group_list}', ctx)).toBe('anchor,run')
  })
})

describe('keys', () => {
  it('translates names, C-chars, and passes other tokens literally', () => {
    expect(translateKeys(['Enter'], false)).toBe('\r')
    expect(translateKeys(['C-c'], false)).toBe('\x03')
    expect(translateKeys(['echo hi', 'Enter'], false)).toBe('echo hi\r')
    expect(translateKeys(['abcd'], false)).toBe('abcd')
    expect(translateKeys(['a', 'Enter'], true)).toBe('aEnter')
  })
})

describe('resolveHome', () => {
  // same state-root rule as runs.ts stateRoot(); an empty value must fall back
  it('uses REEVES_REGISTRY, falls back to ~/.reeves when unset or empty', () => {
    expect(resolveHome({ REEVES_REGISTRY: 'C:\\r' }, 'C:\\h')).toBe('C:\\r')
    expect(resolveHome({}, 'C:\\h')).toBe(join('C:\\h', '.reeves'))
    expect(resolveHome({ REEVES_REGISTRY: '' }, 'C:\\h')).toBe(join('C:\\h', '.reeves'))
    expect(resolveHome({ REEVES_REGISTRY: '   ' }, 'C:\\h')).toBe('   ')
  })
})

describe('misc', () => {
  it('window indices and command names', () => {
    expect(nextWindowIndex([{ id: '@0', name: 'a', index: 0, paneId: '%0' }])).toBe(1)
    expect(nextWindowIndex([])).toBe(0)
    expect(paneCommandName(null)).toBe('cmd')
    expect(paneCommandName('node C:/x/echo.mjs')).toBe('node')
    expect(paneCommandName('"C:\\Program Files\\foo.exe" args')).toBe('foo')
    expect(paneCommandName('cmd.exe')).toBe('cmd')
  })
  it('streaming commands and path derivation', () => {
    expect(isStreamingCommand('attach')).toBe(true)
    expect(isStreamingCommand('new-window')).toBe(false)
    expect(winmuxStatePath('C:\\tmp')).toContain('winmux.json')
    expect(winmuxPipeName('C:\\tmp')).toMatch(/^\\\\\.\\pipe\\reeves-winmux-[0-9a-f]{12}$/)
    expect(winmuxPipeName('C:\\tmp')).not.toBe(winmuxPipeName('C:\\other'))
  })
})
