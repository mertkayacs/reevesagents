import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { NewRunStarting } from '../../../src/screens/newrun/05Starting.js'
import * as RouterModule from '../../../src/router.js'
import * as WizardModule from '../../../src/state/WizardContext.js'
import * as RuntimeModule from '../../../src/launcher/runtime.js'
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
vi.mock('../../../src/launcher/runtime.js')

describe('NewRunStarting', () => {
  beforeEach(() => {
    vi.spyOn(RouterModule, 'useRouter').mockReturnValue({
      push: vi.fn(),
      pop: vi.fn(),
      replace: vi.fn(),
      forward: vi.fn(),
      resetStack: vi.fn(),
      screen: 'NewRunStarting',
      selectedRunId: null,
      setSelectedRunId: vi.fn(),
      selectedAgentId: null,
      setSelectedAgentId: vi.fn(),
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

    vi.spyOn(RuntimeModule, 'startRun').mockReturnValue({
      run: { id: 'test-run-1' } as any,
      agents: [],
    })
  })

  it('renders without crashing', () => {
    const { lastFrame } = render(
      <ToastProvider>
        <WizardProvider>
          <NewRunStarting />
        </WizardProvider>
      </ToastProvider>
    )

    const output = lastFrame()
    expect(output).toContain('Launching')
  })
})
