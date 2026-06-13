import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render } from 'ink-testing-library'
import { Router } from '../../../src/router.js'
import * as StoreModule from '../../../src/state/store.js'
import * as RunsModule from '../../../src/state/runs.js'
import * as RuntimeModule from '../../../src/launcher/runtime.js'

const tick = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms))

// A keystroke can trigger several React state updates and re-renders (for example
// entering edit mode re-registers a field's useInput handler), and Ink buffers a
// lone Esc for ~20ms to disambiguate it from arrow-key sequences. Wait until the
// rendered frame has stayed unchanged for a span that clears that buffer, instead
// of guessing a fixed delay. A short fixed delay raced both handoffs and silently
// dropped the next keystroke (the committed Run Name and the Esc that ends a prompt).
const STABLE_MS = 50
async function settleFrame(lastFrame: () => string | undefined): Promise<void> {
  let previous = lastFrame()
  let stableSince = Date.now()
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    await tick()
    const current = lastFrame()
    if (current !== previous) {
      previous = current
      stableSince = Date.now()
    } else if (Date.now() - stableSince >= STABLE_MS) {
      return
    }
  }
}
const down = '\u001B[B'

vi.mock('../../../src/state/store.js')
vi.mock('../../../src/state/runs.js', async () => {
  const actual = await vi.importActual('../../../src/state/runs.js')
  return {
    ...actual,
    listRuns: vi.fn(() => []),
    listAgents: vi.fn(() => []),
    autoCleanupRuns: vi.fn(() => ({ removed: [], archived: [] })),
  }
})
vi.mock('../../../src/launcher/runtime.js')

async function press(
  stdin: { write: (_input: string) => void },
  lastFrame: () => string | undefined,
  input: string,
): Promise<void> {
  stdin.write(input)
  await settleFrame(lastFrame)
}

async function waitForFrame(lastFrame: () => string | undefined, text: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if ((lastFrame() ?? '').includes(text)) return
    await settleFrame(lastFrame)
  }
  expect(lastFrame() ?? '').toContain(text)
}

describe('New Run keyboard flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(StoreModule.listSavedTrees).mockReturnValue([])
    vi.mocked(RunsModule.listRuns).mockReturnValue([])
    vi.mocked(RunsModule.listAgents).mockReturnValue([])
    vi.mocked(RunsModule.autoCleanupRuns).mockReturnValue({ removed: [], archived: [] })
    vi.mocked(RuntimeModule.startRun).mockReturnValue({
      run: { id: 'run-1' } as any,
      agents: [],
    })
  })

  it('starts a run from the TUI path with multiline root and worker prompts', async () => {
    const { stdin, lastFrame, unmount } = render(<Router initialScreen="Runs" />)

    await waitForFrame(lastFrame, '❯ │ [ New Run')
    await press(stdin, lastFrame, '\r') // Runs -> New Run
    await waitForFrame(lastFrame, 'Run Name')

    await press(stdin, lastFrame, '\r') // edit Run Name
    await press(stdin, lastFrame, 'tui-run')
    await press(stdin, lastFrame, '\r') // commit Run Name

    await press(stdin, lastFrame, down)
    await press(stdin, lastFrame, down)
    await press(stdin, lastFrame, '\r') // Continue -> First Agent
    await waitForFrame(lastFrame, 'First Agent')

    await press(stdin, lastFrame, down) // Model
    await press(stdin, lastFrame, '\r') // open model options
    await waitForFrame(lastFrame, 'Model Options')
    await press(stdin, lastFrame, down) // sonnet
    await press(stdin, lastFrame, '\r') // select sonnet
    await press(stdin, lastFrame, down) // Prompt
    await press(stdin, lastFrame, '\r') // edit root prompt
    await press(stdin, lastFrame, 'root smoke task')
    await press(stdin, lastFrame, '\r') // newline in root prompt
    await press(stdin, lastFrame, 'second line')
    await press(stdin, lastFrame, '\u001B') // commit root prompt

    await press(stdin, lastFrame, down)
    await press(stdin, lastFrame, down)
    await press(stdin, lastFrame, down)
    await press(stdin, lastFrame, '\r') // Continue -> Workers
    await waitForFrame(lastFrame, 'Agents')

    await press(stdin, lastFrame, '\r') // Add Agent
    await waitForFrame(lastFrame, 'Nickname')

    await press(stdin, lastFrame, '\r') // edit worker nickname
    await press(stdin, lastFrame, 'reviewer')
    await press(stdin, lastFrame, '\r') // commit worker nickname

    await press(stdin, lastFrame, down)
    await press(stdin, lastFrame, down)
    await press(stdin, lastFrame, down)
    await press(stdin, lastFrame, '\r') // edit worker prompt
    await press(stdin, lastFrame, 'worker first line')
    await press(stdin, lastFrame, '\r') // newline in worker prompt
    await press(stdin, lastFrame, 'worker second line')
    await press(stdin, lastFrame, '\u001B') // commit worker prompt

    await press(stdin, lastFrame, down)
    await press(stdin, lastFrame, down)
    await press(stdin, lastFrame, down)
    await press(stdin, lastFrame, down)
    await press(stdin, lastFrame, '\r') // Done -> Workers
    await waitForFrame(lastFrame, 'reviewer')

    await press(stdin, lastFrame, down)
    await press(stdin, lastFrame, down)
    await press(stdin, lastFrame, '\r') // Continue -> Review
    await waitForFrame(lastFrame, 'Review')

    await press(stdin, lastFrame, '\r') // Start Run
    await settleFrame(lastFrame)

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
