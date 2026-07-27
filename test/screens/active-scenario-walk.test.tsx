// Renders active run/agent scenarios with seeded state.
// Visual aid only: run with --reporter=verbose to inspect the frames.

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RouterContext } from '../../src/tui/router.js'
import { ToastProvider } from '../../src/tui/contexts/ToastContext.js'
import { WizardProvider } from '../../src/tui/contexts/WizardContext.js'
import { WorkerDraftProvider } from '../../src/tui/contexts/WorkerDraftContext.js'
import { Welcome } from '../../src/tui/screens/Welcome.js'
import { Runs } from '../../src/tui/screens/Runs.js'
import { Run } from '../../src/tui/screens/run/Run.js'
import { RunAgents } from '../../src/tui/screens/run/RunAgents.js'
import { RunOutput } from '../../src/tui/screens/run/RunOutput.js'
import { AgentDetail } from '../../src/tui/screens/run/AgentDetail.js'
import { AgentOutput } from '../../src/tui/screens/run/AgentOutput.js'
import { AgentTask } from '../../src/tui/screens/run/AgentTask.js'
import { AgentKill } from '../../src/tui/screens/run/AgentKill.js'
import { AddWorker } from '../../src/tui/screens/run/AddWorker.js'
import { RunStop } from '../../src/tui/screens/run/RunStop.js'
import { NewRun } from '../../src/tui/screens/newrun/NewRun.js'
import { NewRunBasics } from '../../src/tui/screens/newrun/NewRunBasics.js'
import { NewRunRoot } from '../../src/tui/screens/newrun/NewRunRoot.js'
import { NewRunWorkers } from '../../src/tui/screens/newrun/NewRunWorkers.js'
import { NewRunReview } from '../../src/tui/screens/newrun/NewRunReview.js'
import { Settings } from '../../src/tui/screens/Settings.js'
import { Reference } from '../../src/tui/screens/Reference.js'
import { Credits } from '../../src/tui/screens/Credits.js'
import { writeAgent, writeRun } from '../../src/core/runs.js'
import type { AgentRecord, RunRecord } from '../../src/core/types.js'
import type { RouterContextValue, ScreenName } from '../../src/tui/types.js'

vi.mock('../../src/core/runs.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/runs.js')>('../../src/core/runs.js')
  return {
    ...actual,
    autoCleanupRuns: vi.fn(() => ({ removed: [], archived: [] })),
    runHasLiveTmuxTarget: vi.fn(() => true),
  }
})

vi.mock('../../src/core/runtime.js', () => ({
  openRunTabs: vi.fn(),
  openAgent: vi.fn(),
  openReeves: vi.fn(),
  stopRun: vi.fn(),
  killAgent: vi.fn(),
  spawnWorker: vi.fn(),
  startRun: vi.fn(),
  peekAgent: vi.fn((agentId: string, lines = 5) =>
    Array.from({ length: lines }, (_, idx) => `${agentId} output line ${idx + 1}`).join('\n')
  ),
}))

const RUN_ID = 'scenario-run'
const ROOT_ID = 'scenario-root'
const WORKER_ID = 'scenario-worker-1'

let registry = ''

function makeRun(): RunRecord {
  return {
    id: RUN_ID,
    name: 'scenario-run',
    status: 'running',
    tmux_session: 'reeves-scenario',
    reeves_window_id: '@0',
    reeves_pane_id: '%0',
    root_agent_id: ROOT_ID,
    working_dir: '/tmp/reeves-scenario',
    preset_name: null,
    started_at: '2026-05-24T10:00:00.000Z',
    ended_at: null,
  }
}

function makeAgent(patch: Partial<AgentRecord>): AgentRecord {
  return {
    id: ROOT_ID,
    run_id: RUN_ID,
    nickname: 'root',
    provider: 'codex',
    model: 'gpt-5-codex',
    role: 'root',
    working_dir: '/tmp/reeves-scenario',
    task: 'Coordinate workers, check their status, and report progress.',
    task_status: 'working',
    task_note: 'monitoring workers',
    tmux_session: 'reeves-scenario',
    tmux_window_id: '@1',
    tmux_pane_id: '%1',
    rc_enabled: false,
    permissions: 'ask',
    inbox: [],
    last_seen: Date.now() - 5000,
    started_at: '2026-05-24T10:00:01.000Z',
    ended_at: null,
    ...patch,
  }
}

function seedScenario(): void {
  writeRun(makeRun())
  writeAgent(makeAgent({}))
  for (let i = 1; i <= 10; i++) {
    writeAgent(makeAgent({
      id: `scenario-worker-${i}`,
      nickname: `worker-${i}`,
      provider: i % 3 === 0 ? 'cc' : i % 3 === 1 ? 'codex' : 'hermes',
      model: i % 2 === 0 ? 'default' : '',
      role: 'worker',
      task: `Investigate scenario ${i} and send findings to root.`,
      task_status: i % 4 === 0 ? 'queued' : i % 4 === 1 ? 'working' : i % 4 === 2 ? 'blocked' : 'done',
      task_note: i % 4 === 2 ? 'waiting for root input' : '',
      tmux_window_id: `@${i + 1}`,
      tmux_pane_id: `%${i + 1}`,
      last_seen: Date.now() - (i * 3000),
      started_at: `2026-05-24T10:${String(i + 1).padStart(2, '0')}:00.000Z`,
    }))
  }
}

function makeContext(screen: ScreenName, patch: Partial<RouterContextValue> = {}): RouterContextValue {
  return {
    screen,
    push: vi.fn(),
    pop: vi.fn(),
    forward: vi.fn(),
    replace: vi.fn(),
    resetStack: vi.fn(),
    selectedRunId: RUN_ID,
    setSelectedRunId: vi.fn(),
    selectedAgentId: WORKER_ID,
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

function Harness({
  children,
  screen,
  context,
}: {
  children: React.ReactNode
  screen: ScreenName
  context?: Partial<RouterContextValue>
}) {
  return (
    <RouterContext.Provider value={makeContext(screen, context)}>
      <WizardProvider>
        <WorkerDraftProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </WorkerDraftProvider>
      </WizardProvider>
    </RouterContext.Provider>
  )
}

const scenarios: Array<{
  name: string
  screen: ScreenName
  element: React.ReactNode
  context?: Partial<RouterContextValue>
}> = [
  { name: 'Welcome main menu', screen: 'Welcome', element: <Welcome /> },
  { name: 'Runs active list', screen: 'Runs', element: <Runs /> },
  { name: 'Run hub', screen: 'Run', element: <Run /> },
  { name: 'Run agents', screen: 'RunAgents', element: <RunAgents /> },
  { name: 'Run output', screen: 'RunOutput', element: <RunOutput /> },
  { name: 'Agent detail worker', screen: 'AgentDetail', element: <AgentDetail /> },
  { name: 'Agent detail root', screen: 'AgentDetail', element: <AgentDetail />, context: { selectedAgentId: ROOT_ID } },
  { name: 'Agent output', screen: 'AgentOutput', element: <AgentOutput /> },
  { name: 'Agent task', screen: 'AgentTask', element: <AgentTask /> },
  { name: 'Agent close', screen: 'AgentKill', element: <AgentKill /> },
  { name: 'Add worker', screen: 'AddWorker', element: <AddWorker /> },
  { name: 'Run stop', screen: 'RunStop', element: <RunStop /> },
  { name: 'New run entry', screen: 'NewRun', element: <NewRun /> },
  { name: 'New run basics', screen: 'NewRunBasics', element: <NewRunBasics /> },
  { name: 'New run root', screen: 'NewRunRoot', element: <NewRunRoot /> },
  { name: 'New run workers', screen: 'NewRunWorkers', element: <NewRunWorkers /> },
  { name: 'New run review', screen: 'NewRunReview', element: <NewRunReview /> },
  { name: 'Settings', screen: 'Settings', element: <Settings /> },
  { name: 'Reference', screen: 'Reference', element: <Reference /> },
  { name: 'Credits', screen: 'Credits', element: <Credits /> },
]

describe('active scenario walk', () => {
  beforeEach(() => {
    registry = mkdtempSync(join(tmpdir(), 'reeves-scenario-'))
    process.env.REEVES_REGISTRY = registry
    process.env.REEVES_RUN_ID = RUN_ID
    seedScenario()
  })

  afterEach(() => {
    delete process.env.REEVES_REGISTRY
    delete process.env.REEVES_RUN_ID
    rmSync(registry, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  for (const scenario of scenarios) {
    it(`renders ${scenario.name}`, () => {
      const { lastFrame, unmount } = render(
        <Harness screen={scenario.screen} context={scenario.context}>
          {scenario.element}
        </Harness>
      )
      const frame = lastFrame() ?? '(empty frame)'
      console.log(`\n========== ${scenario.name} ==========\n${frame}\n========================\n`)
      expect(frame.length).toBeGreaterThan(0)
      unmount()
    })
  }
})
