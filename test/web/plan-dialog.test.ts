// The plan dialog's focus and ARIA rules, driven through the real controller against a small DOM.
//
// The case that matters (review of b6e6782): a run card is rebuilt on every SSE frame, so the button that opened the dialog is
// detached by the time Esc arrives. These tests open the dialog, replace the card's button the way a re-render does, close it,
// and check **which** element received focus — the new one, never the detached one. The negative control is the point: if the
// controller remembered the element instead of looking it up, the detached button would get the focus call and the test fails.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface Controller {
  open: (_runId: string) => void
  close: () => FakeEl | null
  expandedOf: (_runId: string) => string
  openRunId: string | null
}

class FakeEl {
  attributes: Record<string, string> = {}
  focused = 0
  kind: 'plan' | 'card' | 'logs' | 'other'
  runId: string
  constructor(kind: 'plan' | 'card' | 'logs' | 'other', runId = '') {
    this.kind = kind
    this.runId = runId
  }
  getAttribute(name: string): string | null { return this.attributes[name] ?? null }
  setAttribute(name: string, value: string): void { this.attributes[name] = String(value) }
  focus(): void { this.focused += 1 }
}

// Only the four lookups the controller makes: `[data-plan-run="…"]`, `[data-run-card="…"]`, `#logs-btn` and all plan buttons.
class FakeDoc {
  nodes: FakeEl[] = []
  mount(node: FakeEl): FakeEl { this.nodes.push(node); return node }
  unmount(node: FakeEl): void { this.nodes = this.nodes.filter(entry => entry !== node) }
  querySelector(selector: string): FakeEl | null {
    const plan = /^\[data-plan-run="(.*)"\]$/.exec(selector)
    if (plan) return this.nodes.find(node => node.kind === 'plan' && node.runId === plan[1]) ?? null
    const card = /^\[data-run-card="(.*)"\]$/.exec(selector)
    if (card) return this.nodes.find(node => node.kind === 'card' && node.runId === card[1]) ?? null
    if (selector === '#logs-btn') return this.nodes.find(node => node.kind === 'logs') ?? null
    return null
  }
  querySelectorAll(selector: string): FakeEl[] {
    return selector === '[data-plan-run]' ? this.nodes.filter(node => node.kind === 'plan') : []
  }
}

function loadController(): (_doc: unknown) => Controller {
  const source = readFileSync(join(process.cwd(), 'src/surfaces/webui/client/plan-controller.js'), 'utf8')
  const sandbox: { planDialogController?: { createPlanDialogController: (_doc: unknown) => Controller } } = {}
  new Function('window', `${source}; return window.planDialogController`)(sandbox)
  if (!sandbox.planDialogController) throw new Error('plan-controller did not publish itself')
  return sandbox.planDialogController.createPlanDialogController
}

const planButton = (doc: FakeDoc, runId: string): FakeEl => {
  const button = doc.mount(new FakeEl('plan', runId))
  button.setAttribute('data-plan-run', runId)
  return button
}

describe('closing the plan dialog puts focus back where the user was', () => {
  it('focuses the button that exists now, not the one that was detached by a re-render', () => {
    const create = loadController()
    const doc = new FakeDoc()
    const logs = doc.mount(new FakeEl('logs'))
    const first = planButton(doc, 'run-1')
    const controller = create(doc)

    controller.open('run-1')
    expect(first.getAttribute('aria-expanded')).toBe('true')

    // An SSE frame rebuilds the card: the old button leaves the document, a new one arrives for the same run.
    doc.unmount(first)
    const second = planButton(doc, 'run-1')
    second.setAttribute('aria-expanded', controller.expandedOf('run-1'))
    expect(second.getAttribute('aria-expanded')).toBe('true')

    const focused = controller.close()

    expect(focused).toBe(second)
    expect(second.focused).toBe(1)
    // The detached button is not the one that got the focus call — the negative control for "remembered the element".
    expect(first.focused).toBe(0)
    expect(logs.focused).toBe(0)
    // Closed: every card says so.
    expect(second.getAttribute('aria-expanded')).toBe('false')
  })

  it('falls back to the run card when the card\'s button is gone, and to Logs when the card is gone too', () => {
    const create = loadController()
    const doc = new FakeDoc()
    const logs = doc.mount(new FakeEl('logs'))
    const card = doc.mount(new FakeEl('card', 'run-1'))
    const controller = create(doc)

    controller.open('run-1')
    expect(controller.close()).toBe(card)
    expect(card.focused).toBe(1)

    doc.unmount(card)
    controller.open('run-1')
    expect(controller.close()).toBe(logs)
    expect(logs.focused).toBe(1)
  })

  it('keeps aria-expanded true across a re-render while the dialog is open, and false for other runs', () => {
    const create = loadController()
    const doc = new FakeDoc()
    const controller = create(doc)
    const other = planButton(doc, 'run-2')
    const first = planButton(doc, 'run-1')

    controller.open('run-1')
    expect(first.getAttribute('aria-expanded')).toBe('true')
    expect(other.getAttribute('aria-expanded')).toBe('false')

    doc.unmount(first)
    const second = planButton(doc, 'run-1')
    second.setAttribute('aria-expanded', controller.expandedOf('run-1'))
    expect(second.getAttribute('aria-expanded')).toBe('true')
    expect(other.getAttribute('aria-expanded')).toBe('false')

    controller.close()
    expect(second.getAttribute('aria-expanded')).toBe('false')
    expect(controller.openRunId).toBeNull()
  })
})
