import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render } from 'ink-testing-library'
import { Router } from '../../../src/router.js'
import * as StoreModule from '../../../src/state/store.js'
import * as RunsModule from '../../../src/state/runs.js'
import * as RuntimeModule from '../../../src/launcher/runtime.js'

const waitForInput = () => new Promise(resolve => setTimeout(resolve, 75))
const down = '\u001B[B'

vi.mock('../../../src/state/store.js')
vi.mock('../../../src/state/runs.js', async () => {
  const actual = await vi.importActual('../../../src/state/runs.js')
  return {
    ...actual,
    listRuns: vi.fn(() => []),
    listAgents: vi.fn(() => []),
    autoCleanupRuns: vi.fn(() => ({ removed: [] })),
  }
})
vi.mock('../../../src/launcher/runtime.js')

async function press(stdin: { write: (_input: string) => void }, input: string): Promise<void> {
  stdin.write(input)
  await waitForInput()
}

async function waitForFrame(lastFrame: () => string | undefined, text: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if ((lastFrame() ?? '').includes(text)) return
    await waitForInput()
  }
  expect(lastFrame() ?? '').toContain(text)
}

describe('New Run keyboard flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(StoreModule.listSavedTrees).mockReturnValue([])
    vi.mocked(RunsModule.listRuns).mockReturnValue([])
    vi.mocked(RunsModule.listAgents).mockReturnValue([])
    vi.mocked(RunsModule.autoCleanupRuns).mockReturnValue({ removed: [] })
    vi.mocked(RuntimeModule.startRun).mockReturnValue({
      run: { id: 'run-1' } as any,
      agents: [],
    })
  })

  it('starts a run from the TUI path with multiline root and worker prompts', async () => {
    const { stdin, lastFrame, unmount } = render(<Router initialScreen="Runs" />)

    await waitForFrame(lastFrame, '❯ │ [ New Run')
    await press(stdin, '\r') // Runs -> New Run
    await waitForFrame(lastFrame, 'Run Name')

    await press(stdin, '\r') // edit Run Name
    await press(stdin, 'tui-run')
    await press(stdin, '\r') // commit Run Name

    await press(stdin, down)
    await press(stdin, down)
    await press(stdin, '\r') // Continue -> First Terminal
    await waitForFrame(lastFrame, 'First Terminal')

    await press(stdin, down) // Model
    await press(stdin, '\r') // open model options
    await waitForFrame(lastFrame, 'Model Options')
    await press(stdin, down) // sonnet
    await press(stdin, '\r') // select sonnet
    await press(stdin, down) // Prompt
    await press(stdin, '\r') // edit root prompt
    await press(stdin, 'root smoke task')
    await press(stdin, '\r') // newline in root prompt
    await press(stdin, 'second line')
    await press(stdin, '\u001B') // commit root prompt

    await press(stdin, down)
    await press(stdin, down)
    await press(stdin, down)
    await press(stdin, '\r') // Continue -> Workers
    await waitForFrame(lastFrame, 'Terminals')

    await press(stdin, '\r') // Add Terminal
    await waitForFrame(lastFrame, 'Nickname')

    await press(stdin, '\r') // edit worker nickname
    await press(stdin, 'reviewer')
    await press(stdin, '\r') // commit worker nickname

    await press(stdin, down)
    await press(stdin, down)
    await press(stdin, down)
    await press(stdin, '\r') // edit worker prompt
    await press(stdin, 'worker first line')
    await press(stdin, '\r') // newline in worker prompt
    await press(stdin, 'worker second line')
    await press(stdin, '\u001B') // commit worker prompt

    await press(stdin, down)
    await press(stdin, down)
    await press(stdin, down)
    await press(stdin, down)
    await press(stdin, '\r') // Done -> Workers
    await waitForFrame(lastFrame, 'reviewer')

    await press(stdin, down)
    await press(stdin, down)
    await press(stdin, '\r') // Continue -> Review
    await waitForFrame(lastFrame, 'Review')

    await press(stdin, '\r') // Start Run
    await waitForInput()

    expect(RuntimeModule.startRun).toHaveBeenCalledOnce()
    const request = vi.mocked(RuntimeModule.startRun).mock.calls[0]![0]
    expect(request.mode).toBe('spawner')
    expect(request.name).toBe('tui-run')
    expect(request.root.model).toBe('sonnet')
    expect(request.root.task).toBe('root smoke task\nsecond line')
    const workers = request.workers ?? []
    expect(workers).toHaveLength(1)
    expect(workers[0]).toMatchObject({
      nickname: 'reviewer',
      task: 'worker first line\nworker second line',
    })
    expect(request.name).not.toMatch(/[\r\n]/)

    unmount()
  })
})
