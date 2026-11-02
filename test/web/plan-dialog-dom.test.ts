// @vitest-environment happy-dom
//
// The Esc path, driven through a real `<dialog>` in a real (if minimal) DOM instead of a hand-written fake.
//
// What happy-dom does and does not do, measured rather than assumed: `new KeyboardEvent('keydown', { key: 'Escape' })` on an
// open `<dialog>` leaves `dialog.open === true` and fires nothing. It does deliver `cancel`, so the platform sequence is
// reproduced here the way a browser performs it — `cancel` then `close()` — and the controller's `close` handler is what the
// test then observes. A real browser's own Esc handling is checked by hand (see `docs/GUIDE.md`), because no DOM emulator in
// this repository implements it.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

// This project compiles without `lib.dom` (its client files are plain JS), so the few DOM shapes this test needs are named
// here instead of pulling the whole library into the type check.
declare const document: any
// The DOM event constructor, read off the environment: this project's TypeScript lib has no DOM globals.
function domEvent(type: string, init?: { cancelable?: boolean }): { type: string } {
  const ctor = (globalThis as unknown as {
    Event: new (_type: string, _init?: { cancelable?: boolean }) => { type: string }
  }).Event
  return new ctor(type, init)
}
type Dialog = any
type El = any

interface Controller {
  attach: (_dialog: Dialog) => void
  open: (_runId: string) => void
  close: () => El | null
  expandedOf: (_runId: string) => string
  openRunId: string | null
}

function loadController(): (_doc: any) => Controller {
  const source = readFileSync(join(process.cwd(), 'src/surfaces/webui/client/plan-controller.js'), 'utf8')
  const sandbox: { planDialogController?: { createPlanDialogController: (_doc: any) => Controller } } = {}
  new Function('window', `${source}; return window.planDialogController`)(sandbox)
  if (!sandbox.planDialogController) throw new Error('plan-controller did not publish itself')
  return sandbox.planDialogController.createPlanDialogController
}

// A run card as the client draws it: a chip (a label) and the plan icon beside it.
function mountCard(runId: string, withPlan = true): { card: El, button: El | null } {
  const card = document.createElement('div')
  card.className = 'card'
  card.dataset.runCard = runId
  card.tabIndex = -1
  const chip = document.createElement('span')
  chip.className = 'run-flow flow-badge'
  chip.textContent = 'flow: done 2/2'
  card.appendChild(chip)
  let button: El | null = null
  if (withPlan) {
    button = document.createElement('button')
    button.id = 'plan-btn'
    button.className = 'flow-plan-btn'
    button.dataset.planRun = runId
    button.innerHTML = '<svg aria-hidden="true"></svg>'
    card.appendChild(button)
  }
  document.body.appendChild(card)
  return { card, button }
}

// `document.activeElement` is not in this project's TypeScript lib; read it through the DOM object the environment provides.
function activeElement(): unknown {
  return (document as unknown as { activeElement: unknown }).activeElement
}

function mountDialog(): Dialog {
  const dialog = document.createElement('dialog')
  dialog.id = 'plan-dialog'
  document.body.appendChild(dialog)
  return dialog
}

// What a browser does on Escape: `cancel`, then the dialog closes and fires `close`.
function pressEscape(dialog: Dialog): void {
  const cancelled = !dialog.dispatchEvent(domEvent('cancel', { cancelable: true }))
  if (!cancelled) dialog.close()
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('Esc on a real dialog', () => {
  it('closes the dialog, tells the controller, and focuses the button that exists now', () => {
    const create = loadController()
    const { button: first } = mountCard('run-1')
    const dialog = mountDialog()
    const controller = create(document)
    controller.attach(dialog)

    dialog.showModal()
    controller.open('run-1')
    expect(first!.getAttribute('aria-expanded')).toBe('true')

    // An SSE frame rebuilds the card: the old button is detached, a new one arrives for the same run.
    document.body.innerHTML = ''
    const { button: second } = mountCard('run-1')
    document.body.appendChild(dialog)
    // The re-render asks the controller what the fresh button should say, exactly as `app.js` does.
    second!.setAttribute('aria-expanded', controller.expandedOf('run-1'))
    expect(second!.getAttribute('aria-expanded')).toBe('true')

    pressEscape(dialog)

    expect(dialog.open).toBe(false)
    expect(controller.openRunId).toBeNull()
    expect(activeElement()).toBe(second)
    expect(second!.getAttribute('aria-expanded')).toBe('false')
  })

  it('falls back to the card, then to the Logs button, when the icon is gone', () => {
    const create = loadController()
    const { card } = mountCard('run-1', false)
    const logs = document.createElement('button')
    logs.id = 'logs-btn'
    document.body.appendChild(logs)
    const dialog = mountDialog()
    const controller = create(document)
    controller.attach(dialog)

    dialog.showModal()
    controller.open('run-1')
    pressEscape(dialog)
    expect(activeElement()).toBe(card)

    card.remove()
    dialog.showModal()
    controller.open('run-1')
    pressEscape(dialog)
    expect(activeElement()).toBe(logs)
  })

  it('never leaves the focus on the body', () => {
    const create = loadController()
    // The agreed last resort when the run has left the page entirely.
    const logs = document.createElement('button')
    logs.id = 'logs-btn'
    document.body.appendChild(logs)
    const dialog = mountDialog()
    const controller = create(document)
    controller.attach(dialog)
    dialog.showModal()
    controller.open('run-1')
    pressEscape(dialog)
    // Nothing of that run is on the page: the focus lands on the Logs button, never on `body`.
    expect(activeElement()).toBe(logs)
  })
})
