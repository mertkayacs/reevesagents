import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { NewRunWorkers } from '../../../src/screens/newrun/04Workers.js'
import * as RouterModule from '../../../src/router.js'
import * as WizardModule from '../../../src/state/WizardContext.js'
import { ToastProvider } from '../../../src/state/ToastContext.js'
import { WizardProvider } from '../../../src/state/WizardContext.js'

vi.mock('../../../src/router.js')
vi.mock('../../../src/state/WizardContext.js', async () => {
  const actual = await vi.importActual('../../../src/state/WizardContext.js')
  return {
    ...actual,
    useWizard: vi.fn(),
  }
})

describe('NewRunWorkers', () => {
  beforeEach(() => {
    vi.spyOn(RouterModule, 'useRouter').mockReturnValue({
      push: vi.fn(),
      pop: vi.fn(),
      replace: vi.fn(),
      forward: vi.fn(),
      screen: 'NewRunWorkers',
      selectedRunId: null,
      setSelectedRunId: vi.fn(),
      selectedAgentId: null,
      setSelectedAgentId: vi.fn(),
      selectedApprovalId: null,
      setSelectedApprovalId: vi.fn(),
      selectedWorkerIdx: null,
      setSelectedWorkerIdx: vi.fn(),
      canBack: false,
      canForward: false,
    } as any)

    vi.spyOn(WizardModule, 'useWizard').mockReturnValue({
      state: {
        name: 'test-run',
        workingDir: '/tmp',
        presetName: null,
        root: {
          nickname: 'root',
          provider: 'cc',
          model: 'claude-3-5-sonnet',
          prompt: 'test prompt',
          workingDir: '/tmp',
          permissions: 'ask',
          authMode: 'default',
          effort: 'default',
        },
        workers: [],
      },
      update: vi.fn(),
      updateRoot: vi.fn(),
      updateWorker: vi.fn(),
      addWorker: vi.fn(() => 0),
      removeWorker: vi.fn(),
      reset: vi.fn(),
    } as any)
  })

  it('renders without crashing', () => {
    const { lastFrame } = render(
      <ToastProvider>
        <WizardProvider>
          <NewRunWorkers />
        </WizardProvider>
      </ToastProvider>
    )

    const output = lastFrame()
    expect(output).toContain('Workers')
  })
})
