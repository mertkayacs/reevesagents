import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AddWorker } from '../../../src/tui/screens/run/AddWorker.js'
import { RouterContext } from '../../../src/tui/router.js'
import { ToastProvider } from '../../../src/tui/contexts/ToastContext.js'
import { WorkerDraftProvider } from '../../../src/tui/contexts/WorkerDraftContext.js'
import { writeRun } from '../../../src/core/runs.js'
import type { RouterContextValue, RunRecord } from '../../../src/core/types.js'
import * as RuntimeModule from '../../../src/core/runtime.js'

vi.mock('../../../src/core/runtime.js', async () => {
  const actual = await vi.importActual<typeof import('../../../src/core/runtime.js')>('../../../src/core/runtime.js')
  return {
    ...actual,
    spawnWorker: vi.fn(),
  }
})

const RUN_ID = 'add-worker-run'
const waitForInput = () => new Promise(resolve => setTimeout(resolve, 75))
const down = '\u001B[B'

let registry = ''

function makeRun(): RunRecord {
  return {
    id: RUN_ID,
    name: 'existing-run',
    status: 'running',
    tmux_session: 'reeves-existing',
    reeves_window_id: '@0',
    reeves_pane_id: '%0',
    root_agent_id: 'root-agent',
    working_dir: '/tmp/existing-run',
    preset_name: null,
    started_at: '2026-05-24T10:00:00.000Z',
    ended_at: null,
  }
}

function makeContext(patch: Partial<RouterContextValue> = {}): RouterContextValue {
  return {
    screen: 'AddWorker',
    push: vi.fn(),
    pop: vi.fn(),
    forward: vi.fn(),
    replace: vi.fn(),
    resetStack: vi.fn(),
    selectedRunId: RUN_ID,
    setSelectedRunId: vi.fn(),
    selectedAgentId: null,
    setSelectedAgentId: vi.fn(),
    selectedCheckName: null,
    setSelectedCheckName: vi.fn(),
    selectedWorkerIdx: null,
    setSelectedWorkerIdx: vi.fn(),
    canBack: true,
    canForward: false,
    ...patch,
  }
}

function renderAddWorker(context: Partial<RouterContextValue> = {}) {
  return render(
    <RouterContext.Provider value={makeContext(context)}>
      <WorkerDraftProvider>
        <ToastProvider>
          <AddWorker />
        </ToastProvider>
      </WorkerDraftProvider>
    </RouterContext.Provider>
  )
}

async function press(stdin: { write: (_input: string) => void }, input: string): Promise<void> {
  stdin.write(input)
  await waitForInput()
}

describe('AddWorker', () => {
  beforeEach(() => {
    registry = mkdtempSync(join(tmpdir(), 'reeves-add-worker-'))
    process.env.REEVES_REGISTRY = registry
    writeRun(makeRun())
    vi.clearAllMocks()
  })

  afterEach(() => {
    delete process.env.REEVES_REGISTRY
    rmSync(registry, { recursive: true, force: true })
  })

  it('passes multiline prompt text to spawnWorker', async () => {
    const { stdin, unmount } = renderAddWorker()

    await press(stdin, down)
    await press(stdin, down)
    await press(stdin, down)
    await press(stdin, '\r')
    await press(stdin, 'line one')
    await press(stdin, '\r')
    await press(stdin, 'line two')
    await press(stdin, '\u001B')

    await press(stdin, down)
    await press(stdin, down)
    await press(stdin, down)
    await press(stdin, '\r')

    expect(RuntimeModule.spawnWorker).toHaveBeenCalledOnce()
    expect(vi.mocked(RuntimeModule.spawnWorker).mock.calls[0]![0]).toMatchObject({
      run_id: RUN_ID,
      nickname: 'worker',
      provider: 'codex',
      task: 'line one\nline two',
      permissions: 'ask',
    })

    unmount()
  })

  it('allows spawning an agent without an initial prompt', async () => {
    const { stdin, unmount } = renderAddWorker()

    for (let i = 0; i < 6; i++) await press(stdin, down)
    await press(stdin, '\r')

    expect(RuntimeModule.spawnWorker).toHaveBeenCalledOnce()
    expect(vi.mocked(RuntimeModule.spawnWorker).mock.calls[0]![0]).toMatchObject({
      run_id: RUN_ID,
      task: '',
    })

    unmount()
  })
})
