import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Router } from '../../src/surfaces/tui/router.js'
import { writeAgent, writeRun } from '../../src/core/runs.js'
import { createRunApproval, listRunApprovals } from '../../src/core/approvals.js'
import type { AgentRecord, RunRecord } from '../../src/core/types.js'

const ESC = String.fromCharCode(27)
const DOWN = ESC + '[B'
const RIGHT = ESC + '[C'
const waitForInput = () => new Promise(resolve => setTimeout(resolve, 75))

let registry = ''

function makeRun(): RunRecord {
  return {
    id: 'r1',
    name: 'run one',
    status: 'running',
    tmux_session: 'reeves_r1',
    reeves_window_id: '@0',
    reeves_pane_id: '%0',
    root_agent_id: 'a1',
    working_dir: '/tmp',
    preset_name: null,
    started_at: '2026-01-01T00:00:00.000Z',
    ended_at: null,
  }
}

function makeAgent(): AgentRecord {
  return {
    id: 'a1',
    run_id: 'r1',
    nickname: 'builder',
    provider: 'codex',
    model: '',
    role: 'root',
    working_dir: '/tmp',
    task: '',
    task_status: 'working',
    task_note: '',
    tmux_session: 'reeves_r1',
    tmux_window_id: '@1',
    tmux_pane_id: '%1',
    rc_enabled: false,
    permissions: 'ask',
    inbox: [],
    last_seen: 0,
    started_at: '2026-01-01T00:00:01.000Z',
    ended_at: null,
  }
}

describe('Approvals screen', () => {
  beforeEach(() => {
    registry = mkdtempSync(join(tmpdir(), 'reeves-approvals-test-'))
    process.env.REEVES_REGISTRY = registry
    writeRun(makeRun())
    writeAgent(makeAgent())
    createRunApproval({ agent_id: 'a1', action: 'deploy to prod', summary: 'ship the release', risk: 'high' })
  })

  afterEach(() => {
    delete process.env.REEVES_REGISTRY
    rmSync(registry, { recursive: true, force: true })
  })

  it('lists a pending approval and approves it after confirmation', async () => {
    const { stdin, lastFrame, unmount } = render(<Router initialScreen="Approvals" />)

    // The pending request shows in the list.
    expect(lastFrame() ?? '').toContain('deploy to prod')
    expect(lastFrame() ?? '').toContain('Pending')

    // Move down to the Approve action and open its confirm dialog.
    stdin.write(DOWN)
    await waitForInput()
    stdin.write('\r')
    await waitForInput()
    expect(lastFrame() ?? '').toContain('Approve this request?')

    // Right focuses the confirm button, enter approves.
    stdin.write(RIGHT)
    await waitForInput()
    stdin.write('\r')
    await waitForInput()

    expect(listRunApprovals(undefined, 'pending')).toEqual([])
    expect(listRunApprovals(undefined, 'approved').map(item => item.id)).toHaveLength(1)
    expect(lastFrame() ?? '').toContain('No pending approvals')
    unmount()
  })
})
