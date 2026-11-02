// The plan left the log dialog for its own, opened by the flow badge. Three things have to hold, and none of them is a
// browser question: the badge only opens when the run has a plan, the plan dialog exists on its own, and closing it hands
// focus back. The first is arithmetic in `insights-core.js` (DOM-free); the other two are structure, checked against the
// real client files.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const coreSource = readFileSync(join(process.cwd(), 'src/surfaces/webui/client/insights-core.js'), 'utf8')
const appSource = readFileSync(join(process.cwd(), 'src/surfaces/webui/client/app.js'), 'utf8')
const html = readFileSync(join(process.cwd(), 'src/surfaces/webui/client/index.html'), 'utf8')

interface Core {
  planIconVisible: (_flow: unknown) => boolean
  planFocusTarget: (_doc: unknown, _runId: string | null) => { id: string, focus: () => void } | null
  planExpanded: (_openRunId: string | null, _runId: string) => string
}

function fakeDoc(buttons: Record<string, { id: string, focus: () => void } | undefined>) {
  return {
    querySelector: (selector: string) => {
      // The three selectors the client asks for, mapped to whatever the fake DOM holds right now.
      if (selector.startsWith('[data-plan-run=')) return buttons[`plan:${selector.slice(16, -2)}`]
      if (selector.startsWith('[data-run-card=')) return buttons[`card:${selector.slice(16, -2)}`]
      if (selector === '#logs-btn') return buttons['logs']
      return null
    },
  }
}

const element = (id: string) => ({ id, focus: () => {} })

function loadCore(): Core {
  const sandbox: { insightsCore?: Core } = {}
  // The file is an IIFE that publishes itself on `window` (or `globalThis`); give it one and read it back.
  new Function('window', `${coreSource}; return window.insightsCore`)(sandbox)
  if (!sandbox.insightsCore) throw new Error('insights-core did not publish itself')
  return sandbox.insightsCore
}

describe('the flow badge opens the plan', () => {
  it('draws the Plan icon only when the run has a plan', () => {
    const { planIconVisible } = loadCore()

    expect(planIconVisible({ label: 'flow: plan 1/2', plan: { done: 1, total: 2 }, run_id: 'run-1' })).toBe(true)
    expect(planIconVisible({ label: 'flow: closed', plan: null, run_id: 'run-1' })).toBe(false)
    expect(planIconVisible(null)).toBe(false)
  })

  it('leaves the badge alone and puts the control beside it', () => {
    // The badge is a label: no button element, no click handler, no aria-haspopup on it.
    const badge = appSource.slice(appSource.indexOf("const flow = document.createElement('span')"), appSource.indexOf('headBody.appendChild(flow)'))
    expect(badge).not.toContain('addEventListener')
    expect(badge).not.toContain('aria-haspopup')
    expect(badge).not.toContain("createElement('button')")

    // The icon is the control, and it carries the run it belongs to.
    expect(appSource).toContain('core().planIconVisible')
    expect(appSource).toContain("planBtn.id = 'plan-btn'")
    expect(appSource).toContain("planBtn.setAttribute('aria-haspopup', 'dialog')")
    expect(appSource).toContain("planBtn.setAttribute('aria-label', t('web.planOpenLabel'))")
    expect(appSource).toContain('openPlanDialog(run.id)')
  })

  it('finds the icon again after an SSE re-render, and never falls back to body', () => {
    const { planFocusTarget } = loadCore()
    const runId = 'run-1'

    // The card is rebuilt: the old element is detached, and the query finds the new one — that is the whole point of not
    // holding a reference.
    const rerendered = element('plan-btn-new')
    expect(planFocusTarget(fakeDoc({ [`plan:${runId}`]: rerendered }), runId)).toBe(rerendered)

    // The run's card disappeared with its icon: focus goes to the card, not to `body`.
    const card = element('card-run-1')
    expect(planFocusTarget(fakeDoc({ [`card:${runId}`]: card }), runId)).toBe(card)

    // Nothing of that run is on screen: the Logs button is the last resort.
    const logs = element('logs-btn')
    expect(planFocusTarget(fakeDoc({ logs }), runId)).toBe(logs)
    // And with no run at all (defensive), also the Logs button.
    expect(planFocusTarget(fakeDoc({ logs }), null)).toBe(logs)
  })

  it('reports aria-expanded for the run whose dialog is open, including after a re-render', () => {
    const { planExpanded } = loadCore()

    expect(planExpanded('run-1', 'run-1')).toBe('true')
    expect(planExpanded('run-1', 'run-2')).toBe('false')
    // The dialog is closed: every card says false, even the one that was open a moment ago.
    expect(planExpanded(null, 'run-1')).toBe('false')
  })

  it('closes back to the icon, found again by run id', () => {
    expect(appSource).toMatch(/el\.planDialog\.addEventListener\('close'/)
    // The element is never remembered: an SSE re-render would detach it and the focus would land on `body`.
    expect(appSource).not.toContain('let planOpener = null')
    expect(appSource).toContain('let planOpenerRun = null')
    expect(appSource).toContain('data-plan-run')
    expect(appSource).toContain('planButtonFor(runId)')
    // If the card is gone, the focus still has somewhere to go — the rule lives in `planFocusTarget`, and the card carries
    // the id it needs.
    expect(appSource).toContain("core().planFocusTarget(document, runId)")
    expect(appSource).toContain('card.dataset.runCard = run.id')
  })

  it('keeps aria-expanded true while the dialog is open', () => {
    expect(appSource).toContain('setPlanExpanded(runId, true)')
    expect(appSource).toContain('setPlanExpanded(runId, false)')
  })

  it('keeps the plan out of the logs dialog', () => {
    const insights = html.slice(html.indexOf('id="insights-dialog"'))
    expect(insights).not.toContain('plan-panel')
    expect(insights).not.toContain('plan-list')

    const planDialog = html.slice(html.indexOf('id="plan-dialog"'), html.indexOf('id="insights-dialog"'))
    expect(planDialog).toContain('id="plan-panel"')
    expect(planDialog).toContain('id="plan-list"')
    expect(planDialog).toContain('id="plan-waiting"')
    expect(planDialog).toContain('id="plan-filter-waiting"')
    expect(planDialog).toContain('id="plan-progress-text"')
  })
})
