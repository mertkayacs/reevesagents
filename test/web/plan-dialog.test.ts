// The plan icon, driven through the real controller against a small DOM.
//
// The Esc/focus path lives in `plan-dialog-dom.test.ts`, where a real `<dialog>` and a real `Event` do the work. What is left
// here needs no dialog: the icon is drawn for a run that has a plan, and not at all for one that does not.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface Controller {
  createIcon: (_flow: unknown, _labels: { ariaLabel: string }) => FakeEl | null
  open: (_runId: string) => void
  expandedOf: (_runId: string) => string
  openRunId: string | null
}

class FakeEl {
  attributes: Record<string, string> = {}
  getAttribute(name: string): string | null { return this.attributes[name] ?? null }
  setAttribute(name: string, value: string): void { this.attributes[name] = String(value) }
  focus(): void { /* the icon is never focused here; that is the dialog test's job */ }
}

// Only what `createIcon` touches: `createElement` for the button.
class FakeDoc {
  createElement = (): FakeEl => new FakeEl()
  querySelector = (): FakeEl | null => null
  querySelectorAll = (): FakeEl[] => []
}

interface Core {
  planIconVisible: (_flow: unknown) => boolean
}

function loadCore(): Core {
  const source = readFileSync(join(process.cwd(), 'src/surfaces/webui/client/insights-core.js'), 'utf8')
  const sandbox: { insightsCore?: Core } = {}
  new Function('window', `${source}; return window.insightsCore`)(sandbox)
  if (!sandbox.insightsCore) throw new Error('insights-core did not publish itself')
  return sandbox.insightsCore
}

function loadController(core: Core): Controller {
  const source = readFileSync(join(process.cwd(), 'src/surfaces/webui/client/plan-controller.js'), 'utf8')
  const sandbox: {
    insightsCore?: Core
    planDialogController?: { createPlanDialogController: (_doc: unknown) => Controller }
  } = { insightsCore: core }
  new Function('window', `${source}; return window.planDialogController`)(sandbox)
  if (!sandbox.planDialogController) throw new Error('plan-controller did not publish itself')
  return sandbox.planDialogController.createPlanDialogController(new FakeDoc())
}

describe('the plan icon', () => {
  it('is drawn only for a run with a plan, and stamped with that run', () => {
    const controller = loadController(loadCore())

    const made = controller.createIcon(
      { label: 'flow: done 2/2', plan: { done: 2, total: 2 }, run_id: 'run-1' },
      { ariaLabel: 'Plan' },
    )
    if (!made) throw new Error('the icon was not created for a run with a plan')
    expect(made.attributes['data-plan-run']).toBe('run-1')
    expect(made.attributes['aria-label']).toBe('Plan')
    expect(made.attributes['aria-haspopup']).toBe('dialog')
    expect(made.attributes['aria-expanded']).toBe('false')

    // No plan: no button at all — not a disabled one.
    expect(controller.createIcon({ label: 'flow: closed', plan: null, run_id: 'run-1' }, { ariaLabel: 'Plan' })).toBeNull()
  })

  it('reports aria-expanded for the run whose dialog is open', () => {
    const controller = loadController(loadCore())

    expect(controller.expandedOf('run-1')).toBe('false')
    controller.open('run-1')
    expect(controller.openRunId).toBe('run-1')
    expect(controller.expandedOf('run-1')).toBe('true')
    expect(controller.expandedOf('run-2')).toBe('false')
  })
})
