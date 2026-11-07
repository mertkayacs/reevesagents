import { beforeEach, describe, expect, it, vi } from 'vitest'

const execFileSync = vi.hoisted(() => vi.fn())
const spawnSync = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({ execFileSync, spawnSync }))

import { trySessionExists, tryTargetExists } from '../src/core/tmux.js'

function spawnResult(status: number, stdout = ''): never {
  return { status, stdout, stderr: '' } as never
}

describe('failure-aware tmux probes', () => {
  beforeEach(() => {
    execFileSync.mockReset()
    spawnSync.mockReset()
  })

  it('keeps a listed session alive after a spurious has-session failure', () => {
    spawnSync.mockReturnValue(spawnResult(1))
    execFileSync.mockReturnValue('live-session\t0\t\t\t1\n')

    expect(trySessionExists('live-session')).toBe(true)
  })

  it('returns null when target listing fails while the session exists', () => {
    spawnSync
      .mockReturnValueOnce(spawnResult(1))
      .mockReturnValueOnce(spawnResult(0))

    expect(tryTargetExists('@7', 'live-session')).toBeNull()
  })
})
