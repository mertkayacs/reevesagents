import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render } from 'ink-testing-library'
import { Router } from '../../../src/tui/router.js'
import * as StoreModule from '../../../src/core/store.js'
import * as RunsModule from '../../../src/core/runs.js'
import * as RuntimeModule from '../../../src/core/runtime.js'

const tick = (ms = 5) => new Promise(resolve => setTimeout(resolve, ms))

// Drive keystrokes deterministically without guessing a fixed delay. A single
// fixed sleep is fragile two ways at once: too short under GC load and the next
// key races in before this one is processed; the dropped key is usually the lone
// Esc that commits a prompt, and because the arrow keys are themselves Esc
// sequences ("[B"), the in-flight Esc then collides with the next arrow.
//
// So settle in two phases. First wait until the keystroke has visibly landed (the
// frame differs from what it was when the key was sent), which guarantees we never
// send the next key while this one is still in Ink's input buffer. Then wait until
// the burst of re-renders stops changing the frame. The change wait is bounded so a
// key that legitimately changes nothing cannot hang the test.
const STABLE_MS = 40
const CHANGE_WAIT_MS = 1500
const SETTLE_DEADLINE_MS = 3000
async function settleFrame(lastFrame: () => string | undefined, before?: string): Promise<void> {
  const start = Date.now()
  // Phase 1: wait for this keystroke to take visible effect before moving on.
  if (before !== undefined) {
    while (lastFrame() === before && Date.now() - start < CHANGE_WAIT_MS) await tick()
  }
  // Phase 2: wait for the re-render burst to settle.
  let previous = lastFrame()
  let stableSince = Date.now()
  const deadline = start + SETTLE_DEADLINE_MS
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

vi.mock('../../../src/core/store.js')
vi.mock('../../../src/core/runs.js', async () => {
  const actual = await vi.importActual('../../../src/core/runs.js')
  return {
    ...actual,
    listRuns: vi.fn(() => []),
    listAgents: vi.fn(() => []),
    autoCleanupRuns: vi.fn(() => ({ removed: [], archived: [] })),
  }
})
vi.mock('../../../src/core/runtime.js')

async function press(
  stdin: { write: (_input: string) => void },
  lastFrame: () => string | undefined,
  input: string,
): Promise<void> {
  const before = lastFrame()
  stdin.write(input)
  await settleFrame(lastFrame, before)
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
    vi.mocked(StoreModule.listPresets).mockReturnValue([])
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
    await press(stdin, lastFrame, down) // cc root has an Auth field before Effort
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
    await press(stdin, lastFrame, down) // cc worker has an Auth field before Effort
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
