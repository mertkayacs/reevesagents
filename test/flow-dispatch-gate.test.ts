import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { processInstanceOf, withDispatchGate } from '../src/core/flow-dispatch-gate.js'

// The gate keeps "the operator paused the flow" and "a prompt is being typed" mutually exclusive.
// It is Lamport's bakery over files, so these tests check what the runner and the control commands
// rely on: exclusion, a bounded wait, a released gate, dead contenders being ignored — and that a
// contender never removes a file it did not create.

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'reeves-dispatch-gate-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

// A pid that is definitely not running: a child that has already exited. A hard-coded pid could be
// alive on the machine running the suite, and then the entry would (correctly) still count.
function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', 'process.exit(0)'])
  expect(child.pid).toBeTypeOf('number')
  return child.pid as number
}

// Alive as far as the probe is concerned, but not ours: `kill(pid, 0)` answers EPERM for a process
// owned by another user, which counts as alive. PID 1 is always there.
const FOREIGN_LIVE_PID = 1

function gateFiles(): string[] {
  return readdirSync(root).filter(name => name.startsWith('.flow-dispatch'))
}

function writeEntry(kind: 'cand' | 'choosing', pid: number, token: string, ts = 0, instance = ''): string {
  const path = join(root, `.flow-dispatch.${kind}.${pid}.${token}`)
  const body = kind === 'cand' ? { pid, token, ts, instance } : { pid, token, instance }
  writeFileSync(path, JSON.stringify(body), 'utf-8')
  return path
}

// The instance id the gate writes for a pid, in whatever format this host's probe produces
// (`linux:<ticks>` or `ps:<lstart>`), or '' when it has neither.
function instanceOf(pid: number): string {
  return processInstanceOf(pid) ?? ''
}

function ownInstance(): string {
  return instanceOf(process.pid)
}

// A well-formed instance of the *shape this host produces* that is not the one the pid currently has.
// It has to reuse the running probe's tag: the gate treats values from different probes as
// incomparable, so a hard-coded `linux:0` would silently stop testing anything on macOS.
function foreignInstanceFor(own: string): string {
  const tag = own.includes(':') ? own.slice(0, own.indexOf(':') + 1) : 'linux:'
  return tag === 'ps:' ? 'ps:Thu Jan  1 00:00:00 1970' : `${tag}0`
}

function recycledInstance(): string | null {
  const own = ownInstance()
  return own ? foreignInstanceFor(own) : null
}

// An instance the *other* probe would have written, whatever this host runs. The gate refuses to
// compare across tags, so this must always look incomparable — and on macOS the host's own values are
// `ps:`, which a hard-coded `ps:` fixture would silently make comparable instead.
function otherProbeInstanceFor(own: string): string {
  const tag = own.includes(':') ? own.slice(0, own.indexOf(':') + 1) : 'linux:'
  return tag === 'ps:' ? 'linux:0' : 'ps:Thu Jan  1 00:00:00 1970'
}

describe('test fixtures', () => {
  it('builds an other-probe instance with the tag this host does not use', () => {
    // The mirror of the fixture above: the mismatched-tag test has to stay mismatched on both hosts.
    expect(otherProbeInstanceFor('linux:123456')).toBe('ps:Thu Jan  1 00:00:00 1970')
    expect(otherProbeInstanceFor('ps:Thu Oct 30 10:00:00 2026')).toBe('linux:0')
  })

  it('builds a foreign instance with the running probe\'s tag', () => {
    // The gate compares only same-tag values; a hard-coded `linux:` fixture would turn every recycled
    // pid test into a no-op on a host whose probe answers `ps:`.
    expect(foreignInstanceFor('linux:123456')).toBe('linux:0')
    expect(foreignInstanceFor('ps:Thu Oct 30 10:00:00 2026')).toBe('ps:Thu Jan  1 00:00:00 1970')
    expect(foreignInstanceFor('linux:123456')).not.toBe('linux:123456')
    expect(foreignInstanceFor('ps:Thu Oct 30 10:00:00 2026')).not.toBe('ps:Thu Oct 30 10:00:00 2026')
  })
})

describe('withDispatchGate', () => {
  it('runs the section and leaves nothing behind', () => {
    const result = withDispatchGate(() => 'done', { root })

    expect(result).toEqual({ acquired: true, value: 'done' })
    expect(gateFiles()).toEqual([])
  })

  it('excludes a second holder and gives up after the timeout', () => {
    const outer = withDispatchGate(() => {
      // The nested call publishes its own ticket, sees the outer one is smaller, and waits.
      const inner = withDispatchGate(() => 'inner', { root, timeoutMs: 80 })
      expect(inner.acquired).toBe(false)
      return 'outer'
    }, { root })

    expect(outer).toEqual({ acquired: true, value: 'outer' })
    expect(gateFiles()).toEqual([])
  })

  it('releases the gate even when the section throws', () => {
    expect(() => withDispatchGate(() => { throw new Error('boom') }, { root })).toThrow('boom')
    expect(gateFiles()).toEqual([])
  })

  it('creates the state directory when it does not exist yet', () => {
    const nested = join(root, 'deep', 'state')
    const spy = vi.fn(() => 1)

    const result = withDispatchGate(spy, { root: nested })

    expect(result.acquired).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
    // The gate's directory is the state dir itself; nothing is left in it after the section.
    expect(existsSync(nested)).toBe(true)
    expect(readdirSync(nested).filter(name => name.startsWith('.flow-dispatch'))).toEqual([])
  })
})

describe('contenders', () => {
  it('waits for a live contender that holds an earlier ticket', () => {
    const foreign = instanceOf(FOREIGN_LIVE_PID)
    if (!foreign) return   // no /proc on this host: the entry would be unidentifiable by design
    writeEntry('cand', FOREIGN_LIVE_PID, 'earlier', 1, foreign)

    const result = withDispatchGate(() => 'never', { root, timeoutMs: 120 })

    expect(result.acquired).toBe(false)
    // The losing ticket is withdrawn, so it cannot block the next attempt.
    expect(gateFiles().filter(name => name.includes(`.cand.${process.pid}.`))).toEqual([])
  })

  it('ignores and collects a ticket whose owner is gone', () => {
    const stale = writeEntry('cand', deadPid(), 'dead', 1)

    const result = withDispatchGate(() => 'mine', { root, timeoutMs: 500 })

    expect(result).toEqual({ acquired: true, value: 'mine' })
    expect(existsSync(stale)).toBe(false)
    expect(gateFiles()).toEqual([])
  })

  it('collects a ticket whose pid was reused by another process', () => {
    // Round 13: `kill(pid, 0)` answers "alive" for a recycled pid, so a dead contender's ticket would
    // block the gate for ever. The instance id tells the two apart.
    const recycled = recycledInstance()
    if (!recycled) return   // no probe on this host: the gate refuses to bid at all
    const stale = writeEntry('cand', process.pid, 'recycled', 1, recycled)

    const result = withDispatchGate(() => 'mine', { root, timeoutMs: 500 })

    expect(result).toEqual({ acquired: true, value: 'mine' })
    expect(existsSync(stale)).toBe(false)
    expect(gateFiles()).toEqual([])
  })

  it('collects a recycled ticket on a host whose probe answers like macOS does', () => {
    // The same rule as above, exercised with `ps:<lstart>` values through the injectable probe: this
    // is the macOS code path, which cannot be produced on a Linux box any other way.
    const own = 'ps:Thu Oct 30 10:00:00 2026'
    const stale = writeEntry('cand', process.pid, 'recycled', 1, 'ps:Thu Jan  1 00:00:00 1970')

    const result = withDispatchGate(() => 'mine', {
      root,
      timeoutMs: 500,
      instanceProbe: () => own,
    })

    expect(result).toEqual({ acquired: true, value: 'mine' })
    expect(existsSync(stale)).toBe(false)
  })

  it('keeps a ps-shaped ticket whose instance still matches', () => {
    const own = 'ps:Thu Oct 30 10:00:00 2026'
    writeEntry('cand', process.pid, 'live', 0, own)

    const result = withDispatchGate(() => 'never', { root, timeoutMs: 120, instanceProbe: () => own })

    expect(result.acquired).toBe(false)
  })

  it('does not treat its own live instance as dead', () => {
    // The same pid with the *matching* instance is a real contender: this must still wait.
    writeEntry('cand', process.pid, 'live', 1, ownInstance())

    const result = withDispatchGate(() => 'never', { root, timeoutMs: 120 })

    expect(result.acquired).toBe(false)
  })

  it('collects a choosing marker left by a reused pid', () => {
    const recycled = recycledInstance()
    if (!recycled) return
    const stale = writeEntry('choosing', process.pid, 'recycled', 0, recycled)

    const result = withDispatchGate(() => 'mine', { root, timeoutMs: 500 })

    expect(result).toEqual({ acquired: true, value: 'mine' })
    expect(existsSync(stale)).toBe(false)
  })

  it('does not compare instances written by a different probe', () => {
    // An entry from the other probe says nothing about this host's process instances, so it is treated
    // as alive rather than guessed dead. The fixture picks the tag the host does *not* use: writing a
    // fixed `ps:` value would be comparable on macOS, where the host's own probe answers `ps:`.
    const own = ownInstance()
    if (!own) return
    const entry = writeEntry('cand', FOREIGN_LIVE_PID, 'otherprobe', 1, otherProbeInstanceFor(own))

    const result = withDispatchGate(() => 'never', { root, timeoutMs: 120 })

    expect(result.acquired).toBe(false)
    expect(existsSync(entry)).toBe(true)
  })

  it('keeps a cross-probe entry alive on a host whose own probe answers ps', () => {
    // The macOS shape, driven through the injectable probe: this host answers `ps:`, the entry was
    // written by a `linux:` host, so the two are not comparable and the entry must not be collected.
    const own = 'ps:Thu Oct 30 10:00:00 2026'
    const entry = writeEntry('cand', process.pid, 'otherprobe', 1, 'linux:0')

    const result = withDispatchGate(() => 'never', { root, timeoutMs: 120, instanceProbe: () => own })

    expect(result.acquired).toBe(false)
    expect(existsSync(entry)).toBe(true)
  })

  it('does not bid at all when the host cannot identify its own process instance', () => {
    // Round 15: publishing a ticket with an empty instance would leave a file the next scan refuses
    // as "written by an older reevesagents" — a sticky breakage this process caused itself. A host
    // that cannot identify itself therefore bids nothing and says why.
    expect(() => withDispatchGate(() => 'never', { root, timeoutMs: 100, instanceProbe: () => null }))
      .toThrow(/cannot identify this process instance/)
    expect(gateFiles()).toEqual([])
  })

  it('withdraws its own bid when the field cannot be judged mid-attempt', () => {
    // The probe works for this process but not for a legacy entry: the error is raised inside the
    // attempt, and it must not leave our own ticket behind for every later call to trip over.
    const foreign = instanceOf(FOREIGN_LIVE_PID)
    if (!foreign) return
    const legacy = writeEntry('cand', FOREIGN_LIVE_PID, 'legacy', 0, '')
    const probe = (pid: number) => (pid === process.pid ? 'test:1' : null)

    expect(() => withDispatchGate(() => 'never', { root, timeoutMs: 200, instanceProbe: probe }))
      .toThrow(/records no process instance/)
    expect(gateFiles()).toEqual([legacy.split('/').pop()])
    expect(existsSync(join(root, `.flow-dispatch.cand.${process.pid}.`))).toBe(false)
  })

  it('refuses an entry written by a build that recorded no process instance', () => {
    // Round 14: an entry without an instance cannot be judged — treating it as alive blocks the gate
    // for ever, treating it as dead admits a second holder. It is reported instead.
    const legacy = writeEntry('cand', process.pid, 'legacy', 1, '')

    expect(() => withDispatchGate(() => 'never', { root, timeoutMs: 100 }))
      .toThrow(/records no process instance/)
    expect(existsSync(legacy)).toBe(true)
  })

  it('collects a legacy entry whose owner is gone', () => {
    const legacy = writeEntry('cand', deadPid(), 'legacy', 1, '')

    const result = withDispatchGate(() => 'mine', { root, timeoutMs: 500 })

    expect(result).toEqual({ acquired: true, value: 'mine' })
    expect(existsSync(legacy)).toBe(false)
  })

  it('refuses to enter when the state directory cannot be read', () => {
    // A directory this process can write but not list is not an empty field: entering blind would
    // mean entering alongside a contender it cannot see. Root ignores the mode bits, so skip there.
    if (process.getuid?.() === 0) return
    chmodSync(root, 0o300)
    try {
      expect(() => withDispatchGate(() => 'never', { root, timeoutMs: 100 })).toThrow(/cannot read the state directory/)
      // Nothing was published into the dark.
      chmodSync(root, 0o700)
      expect(gateFiles()).toEqual([])
    } finally {
      chmodSync(root, 0o700)
    }
  })

  it('waits while a live process is choosing its ticket', () => {
    // A chooser has not published its timestamp yet, so a minimum read now could be overtaken.
    const foreign = instanceOf(FOREIGN_LIVE_PID)
    if (!foreign) return
    const marker = writeEntry('choosing', FOREIGN_LIVE_PID, 'choosing', 0, foreign)

    const blocked = withDispatchGate(() => 'never', { root, timeoutMs: 120 })
    expect(blocked.acquired).toBe(false)

    rmSync(marker)
    const taken = withDispatchGate(() => 'mine', { root, timeoutMs: 500 })
    expect(taken).toEqual({ acquired: true, value: 'mine' })
  })

  it('never removes a marker or ticket whose owner is alive', () => {
    const foreign = instanceOf(FOREIGN_LIVE_PID)
    if (!foreign) return
    const foreignTicket = writeEntry('cand', FOREIGN_LIVE_PID, 'live', 0, foreign)
    const foreignMarker = writeEntry('choosing', FOREIGN_LIVE_PID, 'live', 0, foreign)

    withDispatchGate(() => 'never', { root, timeoutMs: 120 })

    expect(existsSync(foreignTicket)).toBe(true)
    expect(existsSync(foreignMarker)).toBe(true)
  })

  it('takes the gate once the earlier contender releases its ticket', () => {
    const foreign = instanceOf(FOREIGN_LIVE_PID)
    if (!foreign) return
    const earlier = writeEntry('cand', FOREIGN_LIVE_PID, 'earlier', 1, foreign)
    // A real contender removes its ticket when it finishes. The wait loop blocks the event loop, so
    // the release has to come from another process rather than a timer.
    const child = spawn(process.execPath, ['-e', `setTimeout(() => { try { require('fs').unlinkSync(${JSON.stringify(earlier)}) } catch {} }, 150)`], { stdio: 'ignore' })

    try {
      const result = withDispatchGate(() => 'mine', { root, timeoutMs: 5000 })
      expect(result).toEqual({ acquired: true, value: 'mine' })
    } finally {
      child.kill()
      try { rmSync(earlier) } catch { /* already gone */ }
    }
  })
})
