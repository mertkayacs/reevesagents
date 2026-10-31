import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DISPATCH_GATE_STALE_MS, dispatchGatePath, withDispatchGate } from '../src/core/flow-dispatch-gate.js'

// The dispatch gate is the lock that keeps "the operator paused the flow" and "a prompt is being
// typed" mutually exclusive. It is a file lock, so these tests check what the runner and the control
// commands rely on: exclusion, a bounded wait, a released lock, and a takeover that can never remove
// a gate somebody else now holds.

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-dispatch-gate-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function lockPath(): string {
  return dispatchGatePath(root)
}

function owner(): { pid: number, token: string, created_at: string } {
  return JSON.parse(readFileSync(lockPath(), 'utf-8'))
}

// A pid that is definitely not running: a child that has already exited. A hard-coded pid could be
// alive on the machine running the suite, and then the lock would (correctly) never be reclaimed.
function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', 'process.exit(0)'])
  expect(child.pid).toBeTypeOf('number')
  return child.pid as number
}

// Write a gate file with a chosen owner and move its mtime into the past, the way a process that died
// mid-paste leaves it.
function writeGate(mtimeAgoMs: number, ownerPid: number, token = 'foreign'): void {
  writeFileSync(lockPath(), JSON.stringify({ pid: ownerPid, token, created_at: new Date().toISOString() }), 'utf-8')
  const when = new Date(Date.now() - mtimeAgoMs)
  utimesSync(lockPath(), when, when)
}

// Every file the gate may leave behind besides the gate itself: a publisher's temp, a reclaimer's
// inode token, or the round-8 rename artefact. A clean run leaves none of them.
function strays(): string[] {
  return readdirSync(root).filter(name => /\.(dead|owner|reclaim)\./.test(name))
}

describe('withDispatchGate', () => {
  it('runs the section and releases the lock afterwards', () => {
    const result = withDispatchGate(() => 'done', { root })

    expect(result).toEqual({ acquired: true, value: 'done' })
    expect(existsSync(lockPath())).toBe(false)
  })

  it('excludes a second holder and gives up after the timeout', () => {
    const second = withDispatchGate(() => {
      // Nested acquisition is what a second process would look like: the lock file is already there,
      // so this one waits, then reports that it never got in.
      const inner = withDispatchGate(() => 'inner', { root, timeoutMs: 50 })
      expect(inner.acquired).toBe(false)
      return 'outer'
    }, { root })

    expect(second).toEqual({ acquired: true, value: 'outer' })
    expect(existsSync(lockPath())).toBe(false)
  })

  it('releases the lock even when the section throws', () => {
    expect(() => withDispatchGate(() => { throw new Error('boom') }, { root })).toThrow('boom')
    expect(existsSync(lockPath())).toBe(false)
  })

  it('creates the state directory when it does not exist yet', () => {
    const nested = join(root, 'deep', 'state')
    const spy = vi.fn(() => 1)

    const result = withDispatchGate(spy, { root: nested })

    expect(result.acquired).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(existsSync(dispatchGatePath(nested))).toBe(false)
  })
})

describe('reclaiming a gate left behind by a dead process', () => {
  it('takes over a lock whose owner is gone and whose file is old', () => {
    writeGate(10 * 60 * 1000, deadPid())

    const result = withDispatchGate(() => 'taken over', { root, timeoutMs: 500 })

    expect(result).toEqual({ acquired: true, value: 'taken over' })
    // Nothing left over: the reclaimed file was removed, not merely renamed.
    expect(strays()).toEqual([])
  })

  it('never reclaims a live holder, however old its file is', () => {
    // The round-8 finding: an expired mtime used to be enough to unlink the gate, so a second waiter
    // could remove the fresh gate of the process that had just acquired it. A live pid now wins over
    // any age.
    const before = process.pid
    writeGate(10 * 60 * 1000, before, 'live-holder')

    const result = withDispatchGate(() => 'never', { root, timeoutMs: 100 })

    expect(result.acquired).toBe(false)
    expect(owner()).toMatchObject({ pid: before, token: 'live-holder' })
  })

  it('never touches a gate that exists without its content yet', () => {
    // Round 9: a gate created but not yet written cannot be attributed to anybody. Removing it would
    // delete the file a publisher is about to complete, so it is left alone like a damaged lock.
    writeFileSync(lockPath(), '', 'utf-8')
    const when = new Date(Date.now() - 10 * DISPATCH_GATE_STALE_MS)
    utimesSync(lockPath(), when, when)

    const result = withDispatchGate(() => 'never', { root, timeoutMs: 150 })

    expect(result.acquired).toBe(false)
    expect(existsSync(lockPath())).toBe(true)
  })

  it('does not reclaim while the runs lock is held, and does once it is free', () => {
    // Reclamation is serialised by the runs lock (round 11): while somebody is writing the state tree
    // a takeover must not happen, because the judgement and the removal have to be one decision.
    const dead = deadPid()
    writeGate(10 * DISPATCH_GATE_STALE_MS, dead)
    const runsLock = join(root, '.runs.lock')
    writeFileSync(runsLock, JSON.stringify({ pid: process.pid }), 'utf-8')

    const blocked = withDispatchGate(() => 'never', { root, timeoutMs: 150 })

    expect(blocked.acquired).toBe(false)
    expect(owner().pid).toBe(dead)

    // The runs lock is free again: the same attempt now reclaims the gate.
    rmSync(runsLock, { force: true })
    const taken = withDispatchGate(() => 'taken over', { root, timeoutMs: 500 })
    expect(taken).toEqual({ acquired: true, value: 'taken over' })
    expect(strays()).toEqual([])
  })

  it('never reclaims a lock younger than the stale window, even when its owner is gone', () => {
    writeGate(1000, deadPid())

    const result = withDispatchGate(() => 'never', { root, timeoutMs: 100 })

    expect(result.acquired).toBe(false)
    expect(owner().token).toBe('foreign')
  })

  it('never reclaims a lock it cannot identify', () => {
    // A damaged gate cannot be attributed to a dead process, so it is left for a human to remove
    // instead of risking two holders.
    writeFileSync(lockPath(), 'not json', 'utf-8')
    const when = new Date(Date.now() - 10 * DISPATCH_GATE_STALE_MS)
    utimesSync(lockPath(), when, when)

    const result = withDispatchGate(() => 'never', { root, timeoutMs: 100 })

    expect(result.acquired).toBe(false)
    expect(readFileSync(lockPath(), 'utf-8')).toBe('not json')
  })

  it('does not remove the fresh gate of the waiter that won the reclaim', () => {
    // Two waiters see the same dead lock. This test is the second one: it must fail to enter, and it
    // must leave the winner's gate exactly where it is.
    writeGate(10 * 60 * 1000, deadPid())

    const outer = withDispatchGate(() => {
      const held = owner()
      const inner = withDispatchGate(() => 'never', { root, timeoutMs: 100 })

      expect(inner.acquired).toBe(false)
      // The winner's gate is still there, unchanged, and the loser left no strays.
      expect(owner()).toMatchObject({ pid: held.pid, token: held.token, created_at: held.created_at })
      expect(strays()).toEqual([])
      return 'winner'
    }, { root, timeoutMs: 500 })

    expect(outer).toEqual({ acquired: true, value: 'winner' })
    expect(existsSync(lockPath())).toBe(false)
  })

  it('does not release a gate it no longer owns', () => {
    // A process that was reclaimed while it believed it held the gate must not delete the new
    // holder's file on the way out.
    const outer = withDispatchGate(() => {
      const takeoverToken = 'somebody-else'
      writeFileSync(lockPath(), JSON.stringify({ pid: process.pid, token: takeoverToken, created_at: new Date().toISOString() }), 'utf-8')
      return 'done'
    }, { root })

    expect(outer.acquired).toBe(true)
    expect(owner().token).toBe('somebody-else')
  })
})
