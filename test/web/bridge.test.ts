import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeRun, writeAgent } from '../../src/state/runs.js'
import { resolveTerminalTarget, parseClientFrame } from '../../src/web/bridge.js'
import type { AgentRecord, RunRecord } from '../../src/state/types.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'reeves-web-bridge-'))
  process.env.REEVES_REGISTRY = tmpDir
})

afterEach(() => {
  delete process.env.REEVES_REGISTRY
  rmSync(tmpDir, { recursive: true, force: true })
})

function makeRun(id: string, mode: RunRecord['mode'] = 'spawner'): RunRecord {
  return {
    id,
    mode,
    name: `run-${id}`,
    status: 'running',
    tmux_session: `reeves_${id}`,
    reeves_window_id: '@0',
    reeves_pane_id: '%0',
    root_agent_id: `${id}-root`,
    working_dir: '/tmp/work',
    preset_name: null,
    started_at: '2026-01-01T00:00:00.000Z',
    ended_at: null,
  }
}

function makeAgent(id: string, runId: string, overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id,
    run_id: runId,
    nickname: id,
    provider: 'cc',
    model: '',
    role: 'worker',
    working_dir: '/tmp/work',
    task: '',
    task_status: 'queued',
    task_note: '',
    tmux_session: `reeves_${runId}`,
    tmux_window_id: '@1',
    tmux_pane_id: '%1',
    rc_enabled: false,
    permissions: 'ask',
    inbox: [],
    last_seen: 0,
    started_at: '2026-01-01T00:00:01.000Z',
    ended_at: null,
    ...overrides,
  }
}

describe('resolveTerminalTarget', () => {
  it('resolves a live windowed agent to its tmux target', () => {
    writeRun(makeRun('r1'))
    writeAgent(makeAgent('worker', 'r1', { nickname: 'planner' }))

    expect(resolveTerminalTarget('worker')).toEqual({
      session: 'reeves_r1',
      windowId: '@1',
      nickname: 'planner',
    })
  })

  it('throws when the id is empty', () => {
    expect(() => resolveTerminalTarget('')).toThrow('missing terminal id')
  })

  it('throws when the agent does not exist', () => {
    writeRun(makeRun('r1'))
    expect(() => resolveTerminalTarget('ghost')).toThrow('Agent not found')
  })

  it('throws when the terminal has ended', () => {
    writeRun(makeRun('r1'))
    writeAgent(makeAgent('gone', 'r1', { ended_at: '2026-01-01T01:00:00.000Z' }))
    expect(() => resolveTerminalTarget('gone')).toThrow('terminal has ended')
  })

  it('throws when the agent is headless', () => {
    writeRun(makeRun('r1'))
    writeAgent(makeAgent('caller', 'r1', { headless: true, tmux_window_id: '' }))
    expect(() => resolveTerminalTarget('caller')).toThrow('terminal has no tmux window')
  })

  it('throws when the agent has no tmux window', () => {
    writeRun(makeRun('r1'))
    writeAgent(makeAgent('nowin', 'r1', { tmux_window_id: '' }))
    expect(() => resolveTerminalTarget('nowin')).toThrow('terminal has no tmux window')
  })

  it('resolves orchestrator agents only when pre-beta mode is enabled', () => {
    writeRun(makeRun('prebeta', 'orchestrator'))
    writeAgent(makeAgent('worker', 'prebeta', { nickname: 'worker' }))

    expect(() => resolveTerminalTarget('worker')).toThrow('Agent not found')
    expect(resolveTerminalTarget('worker', { prebetaOrchestrator: true })).toEqual({
      session: 'reeves_prebeta',
      windowId: '@1',
      nickname: 'worker',
    })
  })

  it('rejects headless orchestrator roots in pre-beta mode', () => {
    writeRun(makeRun('prebeta', 'orchestrator'))
    writeAgent(makeAgent('root', 'prebeta', {
      role: 'root',
      headless: true,
      tmux_window_id: '',
      tmux_pane_id: '',
    }))

    expect(() => resolveTerminalTarget('root', { prebetaOrchestrator: true })).toThrow('terminal has no tmux window')
  })
})

describe('parseClientFrame', () => {
  it('parses an input frame', () => {
    expect(parseClientFrame('{"t":"i","d":"ls\\n"}')).toEqual({ t: 'i', d: 'ls\n' })
  })

  it('parses a resize frame', () => {
    expect(parseClientFrame('{"t":"r","c":120,"r":40}')).toEqual({ t: 'r', c: 120, r: 40 })
  })

  it('parses from a Buffer payload', () => {
    expect(parseClientFrame(Buffer.from('{"t":"i","d":"x"}', 'utf8'))).toEqual({ t: 'i', d: 'x' })
  })

  it('rejects malformed JSON', () => {
    expect(parseClientFrame('{not json')).toBeNull()
  })

  it('rejects an unknown frame type', () => {
    expect(parseClientFrame('{"t":"z","d":"x"}')).toBeNull()
  })

  it('rejects an input frame without a string payload', () => {
    expect(parseClientFrame('{"t":"i","d":5}')).toBeNull()
  })

  it('rejects a resize frame with non-numeric dimensions', () => {
    expect(parseClientFrame('{"t":"r","c":"80","r":24}')).toBeNull()
  })

  it('rejects a non-object payload', () => {
    expect(parseClientFrame('42')).toBeNull()
  })
})
