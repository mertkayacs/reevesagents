import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Router } from '../../src/surfaces/tui/router.js'
import { archiveAndRemoveRun, listRunHistory, writeAgent, writeRun } from '../../src/core/runs.js'
import type { AgentRecord, RunRecord } from '../../src/core/types.js'

const waitForInput = () => new Promise(resolve => setTimeout(resolve, 75))

let registry = ''

function makeRun(): RunRecord {
  return {
    id: 'old',
    name: 'old run',
    status: 'ended',
    tmux_session: 'reeves_old',
    reeves_window_id: '@0',
    reeves_pane_id: '%0',
    root_agent_id: 'root',
    working_dir: '/tmp',
    preset_name: null,
    started_at: '2026-01-01T00:00:00.000Z',
    ended_at: '2026-01-01T00:05:00.000Z',
  }
}

function makeAgent(): AgentRecord {
  return {
    id: 'root',
    run_id: 'old',
    nickname: 'root',
    provider: 'codex',
    model: '',
    role: 'root',
    working_dir: '/tmp',
    task: '',
    task_status: 'done',
    task_note: '',
    tmux_session: 'reeves_old',
    tmux_window_id: '@1',
    tmux_pane_id: '%1',
    rc_enabled: false,
    permissions: 'ask',
    inbox: [],
    last_seen: 0,
    started_at: '2026-01-01T00:00:01.000Z',
    ended_at: '2026-01-01T00:05:00.000Z',
  }
}

describe('RunHistory screen', () => {
  beforeEach(() => {
    registry = mkdtempSync(join(tmpdir(), 'reeves-run-history-test-'))
    process.env.REEVES_REGISTRY = registry
    writeRun(makeRun())
    writeAgent(makeAgent())
    archiveAndRemoveRun('old', 'ended')
  })

  afterEach(() => {
    delete process.env.REEVES_REGISTRY
    rmSync(registry, { recursive: true, force: true })
  })

  it('deletes an archived run after confirmation', async () => {
    const { stdin, lastFrame, unmount } = render(<Router initialScreen="RunHistory" />)

    expect(lastFrame() ?? '').toContain('old run')
    stdin.write('\u001B[B')
    await waitForInput()
    stdin.write('\r')
    await waitForInput()
    expect(lastFrame() ?? '').toContain('Delete "old run"?')

    stdin.write('\u001B[C')
    await waitForInput()
    stdin.write('\r')
    await waitForInput()

    expect(listRunHistory()).toEqual([])
    expect(lastFrame() ?? '').toContain('No history yet')
    unmount()
  })
})
