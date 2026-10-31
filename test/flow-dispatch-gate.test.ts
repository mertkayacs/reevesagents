import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { dispatchGatePath, withDispatchGate } from '../src/core/flow-dispatch-gate.js'

// The dispatch gate is the lock that keeps "the operator paused the flow" and "a prompt is being
// typed" mutually exclusive. It is a file lock, so these tests check the four properties the runner
// and the control commands rely on: exclusion, a bounded wait, a released lock, and stale-breaking.

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-dispatch-gate-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('withDispatchGate', () => {
  it('runs the section and releases the lock afterwards', () => {
    const result = withDispatchGate(() => 'done', { root })

    expect(result).toEqual({ acquired: true, value: 'done' })
    expect(existsSync(dispatchGatePath(root))).toBe(false)
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
    expect(existsSync(dispatchGatePath(root))).toBe(false)
  })

  it('releases the lock even when the section throws', () => {
    expect(() => withDispatchGate(() => { throw new Error('boom') }, { root })).toThrow('boom')
    expect(existsSync(dispatchGatePath(root))).toBe(false)
  })

  it('breaks a lock abandoned by a dead process', () => {
    // A gate whose mtime is far in the past belongs to a process that died mid-paste.
    writeFileSync(dispatchGatePath(root), JSON.stringify({ pid: 999999 }), 'utf-8')
    const old = new Date(Date.now() - 10 * 60 * 1000)
    utimesSync(dispatchGatePath(root), old, old)

    const result = withDispatchGate(() => 'taken over', { root, timeoutMs: 500 })

    expect(result).toEqual({ acquired: true, value: 'taken over' })
  })

  it('does not break a lock that is younger than the stale window', () => {
    writeFileSync(dispatchGatePath(root), JSON.stringify({ pid: 999999 }), 'utf-8')

    const result = withDispatchGate(() => 'never', { root, timeoutMs: 50 })

    expect(result.acquired).toBe(false)
    // Still the other holder's lock, untouched: a live paste must never have it broken underneath.
    expect(statSync(dispatchGatePath(root)).isFile()).toBe(true)
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
