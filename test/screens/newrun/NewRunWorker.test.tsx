import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { NewRunWorker } from '../../../src/tui/screens/newrun/NewRunWorker.js'
import * as RouterModule from '../../../src/tui/router.js'
import * as WizardModule from '../../../src/tui/contexts/WizardContext.js'
import { ToastProvider } from '../../../src/tui/contexts/ToastContext.js'
import { WizardProvider } from '../../../src/tui/contexts/WizardContext.js'

vi.mock('../../../src/tui/router.js')
vi.mock('../../../src/tui/contexts/WizardContext.js', async () => {
  const actual = await vi.importActual('../../../src/tui/contexts/WizardContext.js')
  return {
    ...actual,
    useWizard: vi.fn(),
  }
})

describe('NewRunWorker', () => {
  beforeEach(() => {
    vi.spyOn(RouterModule, 'useRouter').mockReturnValue({
      push: vi.fn(),
      pop: vi.fn(),
      replace: vi.fn(),
      forward: vi.fn(),
      screen: 'NewRunWorker',
      selectedRunId: null,
      setSelectedRunId: vi.fn(),
      selectedAgentId: null,
      setSelectedAgentId: vi.fn(),
      selectedWorkerIdx: 0,
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
        workers: [
          {
            nickname: 'worker1',
            provider: 'cc',
            model: 'claude-3-5-sonnet',
            prompt: 'worker task',
            workingDir: '/tmp',
            permissions: 'ask',
            authMode: 'default',
            effort: 'default',
          },
        ],
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
          <NewRunWorker />
        </WizardProvider>
      </ToastProvider>
    )

    const output = lastFrame()
    expect(output).toContain('Agent')
  })

  it('shows the Auth picker for a cc worker', () => {
    const { lastFrame } = render(
      <ToastProvider>
        <WizardProvider>
          <NewRunWorker />
        </WizardProvider>
      </ToastProvider>
    )

    const output = lastFrame()!
    expect(output).toContain('Auth')
    expect(output).toContain('Default login')
  })

  it('hides the Auth picker for a non-cc provider', () => {
    vi.spyOn(WizardModule, 'useWizard').mockReturnValue({
      state: {
        name: 'test-run',
        workingDir: '/tmp',
        presetName: null,
        root: { nickname: 'root', provider: 'cc', model: '', prompt: '', workingDir: '/tmp', permissions: 'ask', authMode: 'default', effort: 'default' },
        workers: [
          { nickname: 'worker1', provider: 'kimi', model: '', prompt: '', workingDir: '/tmp', permissions: 'ask', authMode: 'default', effort: 'default' },
        ],
      },
      update: vi.fn(),
      updateRoot: vi.fn(),
      updateWorker: vi.fn(),
      addWorker: vi.fn(() => 0),
      removeWorker: vi.fn(),
      reset: vi.fn(),
    } as any)

    const { lastFrame } = render(
      <ToastProvider>
        <WizardProvider>
          <NewRunWorker />
        </WizardProvider>
      </ToastProvider>
    )

    const output = lastFrame()!
    expect(output).not.toContain('Auth')
  })
})
