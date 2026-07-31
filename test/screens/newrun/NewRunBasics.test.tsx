import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { NewRunBasics } from '../../../src/surfaces/tui/screens/newrun/NewRunBasics.js'
import * as RouterModule from '../../../src/surfaces/tui/router.js'
import { ToastProvider } from '../../../src/surfaces/tui/contexts/ToastContext.js'
import { WizardProvider } from '../../../src/surfaces/tui/contexts/WizardContext.js'

vi.mock('../../../src/surfaces/tui/router.js')

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
