import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { NewRunReview } from '../../../src/screens/newrun/05Review.js'
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

describe('NewRunReview', () => {
  beforeEach(() => {
    vi.spyOn(RouterModule, 'useRouter').mockReturnValue({
      push: vi.fn(),
      pop: vi.fn(),
      replace: vi.fn(),
      forward: vi.fn(),
      screen: 'NewRunReview',
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
        mode: 'spawner',
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
          <NewRunReview />
        </WizardProvider>
      </ToastProvider>
    )

    const output = lastFrame()
    expect(output).toContain('Review')
  })
})
