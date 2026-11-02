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
}

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
    expect(appSource).toContain('openPlanDialog(run.id, planBtn)')
  })

  it('closes back to the badge that opened it', () => {
    expect(appSource).toMatch(/el\.planDialog\.addEventListener\('close'/)
    expect(appSource).toContain('opener.focus()')
    expect(appSource).toContain('el.planClose.addEventListener')
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
