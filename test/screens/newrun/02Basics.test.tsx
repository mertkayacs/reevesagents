import { describe, it, expect, beforeEach, vi } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { NewRunBasics } from '../../../src/screens/newrun/02Basics.js'
import * as RouterModule from '../../../src/router.js'
import { ToastProvider } from '../../../src/state/ToastContext.js'
import { WizardProvider } from '../../../src/state/WizardContext.js'

vi.mock('../../../src/router.js')

describe('NewRunBasics', () => {
  beforeEach(() => {
    vi.spyOn(RouterModule, 'useRouter').mockReturnValue({
      push: vi.fn(),
      pop: vi.fn(),
      replace: vi.fn(),
    } as any)
  })

  it('renders breadcrumb and step indicator', () => {
    const { lastFrame } = render(
      <WizardProvider>
        <ToastProvider>
          <NewRunBasics />
        </ToastProvider>
      </WizardProvider>
    )
    const output = lastFrame()
    expect(output).toContain('ReevesAgents')
    expect(output).toContain('New Run')
    expect(output).toContain('1 / 4')
    expect(output).toContain('Basics')
  })

  it('renders Run Name field', () => {
    const { lastFrame } = render(
      <WizardProvider>
        <ToastProvider>
          <NewRunBasics />
        </ToastProvider>
      </WizardProvider>
    )
    const output = lastFrame()
    expect(output).toContain('Run Name')
  })

  it('renders Working Dir field', () => {
    const { lastFrame } = render(
      <WizardProvider>
        <ToastProvider>
          <NewRunBasics />
        </ToastProvider>
      </WizardProvider>
    )
    const output = lastFrame()
    expect(output).toContain('Working Dir')
  })

  it('renders action section with Continue, Back, Reset', () => {
    const { lastFrame } = render(
      <WizardProvider>
        <ToastProvider>
          <NewRunBasics />
        </ToastProvider>
      </WizardProvider>
    )
    const output = lastFrame()
    expect(output).toContain('Actions')
    expect(output).toContain('Continue')
    expect(output).toContain('Back')
    expect(output).toContain('Reset Wizard')
  })
})
