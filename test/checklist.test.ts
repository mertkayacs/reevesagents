import { describe, it, expect } from 'vitest'
import { computeChecklist, CHECKLIST_TIPS } from '../src/state/checklist.js'
import type { Provider } from '../src/state/types.js'

type ProviderMap = Record<Provider, boolean>

const allFalse: ProviderMap = { cc: false, codex: false, opencode: false, hermes: false }
const allTrue:  ProviderMap = { cc: true,  codex: true,  opencode: true,  hermes: true  }
const ccOnly:   ProviderMap = { cc: true,  codex: false, opencode: false, hermes: false }
const ccAndCodex: ProviderMap = { cc: true, codex: true, opencode: false, hermes: false }

describe('computeChecklist', () => {
  it('reports tmux first when tmux is missing, regardless of provider state', () => {
    const c = computeChecklist(false, allTrue, allTrue)
    expect(c.tip).toBe(CHECKLIST_TIPS.tmux)
    expect(c.tmuxOk).toBe(false)
    expect(c.ready).toBe(false)
  })

  it('tells the user to install a provider when tmux is ok but nothing is on PATH', () => {
    const c = computeChecklist(true, allFalse, allFalse)
    expect(c.tip).toBe(CHECKLIST_TIPS.provider)
    expect(c.numDetected).toBe(0)
    expect(c.numRegistered).toBe(0)
    expect(c.ready).toBe(false)
  })

  it('tells the user to register when providers are installed but MCP is missing', () => {
    const c = computeChecklist(true, ccAndCodex, allFalse)
    expect(c.tip).toBe(CHECKLIST_TIPS.register)
    expect(c.numDetected).toBe(2)
    expect(c.numRegistered).toBe(0)
    expect(c.ready).toBe(false)
  })

  it('reports ready when tmux + at least one provider + at least one registered', () => {
    const c = computeChecklist(true, ccOnly, ccOnly)
    expect(c.tip).toBe(CHECKLIST_TIPS.ready)
    expect(c.numDetected).toBe(1)
    expect(c.numRegistered).toBe(1)
    expect(c.ready).toBe(true)
  })

  it('reports ready with partial registration (registered > 0, even if not all)', () => {
    const c = computeChecklist(true, ccAndCodex, ccOnly)
    expect(c.tip).toBe(CHECKLIST_TIPS.ready)
    expect(c.numDetected).toBe(2)
    expect(c.numRegistered).toBe(1)
    expect(c.ready).toBe(true)
  })

  it('reports ready with full setup (all 4 providers detected and registered)', () => {
    const c = computeChecklist(true, allTrue, allTrue)
    expect(c.tip).toBe(CHECKLIST_TIPS.ready)
    expect(c.numDetected).toBe(4)
    expect(c.numRegistered).toBe(4)
    expect(c.ready).toBe(true)
  })

  it('reports totalProviders matching the input map size', () => {
    const c = computeChecklist(true, allTrue, allTrue)
    expect(c.totalProviders).toBe(4)
  })

  it('tmux precedence: ready chain breaks even if everything else is set', () => {
    expect(computeChecklist(false, allTrue,  allTrue ).tip).toBe(CHECKLIST_TIPS.tmux)
    expect(computeChecklist(false, ccOnly,   ccOnly  ).tip).toBe(CHECKLIST_TIPS.tmux)
    expect(computeChecklist(false, allFalse, allFalse).tip).toBe(CHECKLIST_TIPS.tmux)
  })

  it('provider-detected precedence: register tip never wins over provider tip', () => {
    // Pathological input: registered flags set even though no provider is detected.
    // The function trusts inputs but cascades on numDetected first, so the user
    // is told to install a provider rather than to register one that doesn't exist.
    const c = computeChecklist(true, allFalse, allTrue)
    expect(c.tip).toBe(CHECKLIST_TIPS.provider)
    expect(c.numRegistered).toBe(4)  // value is reported as-is
    expect(c.ready).toBe(false)      // not ready because nothing is detected
  })

  it('exact cascade across all branches', () => {
    // tmux missing
    expect(computeChecklist(false, allFalse, allFalse).tip).toBe(CHECKLIST_TIPS.tmux)
    // tmux ok, no providers
    expect(computeChecklist(true,  allFalse, allFalse).tip).toBe(CHECKLIST_TIPS.provider)
    // tmux ok, providers ok, no mcp
    expect(computeChecklist(true,  ccOnly,   allFalse).tip).toBe(CHECKLIST_TIPS.register)
    // everything ok
    expect(computeChecklist(true,  ccOnly,   ccOnly  ).tip).toBe(CHECKLIST_TIPS.ready)
  })

  it('next-step tip strings are non-empty and distinct', () => {
    const tips = Object.values(CHECKLIST_TIPS)
    expect(new Set(tips).size).toBe(tips.length)
    for (const t of tips) expect(t.length).toBeGreaterThan(0)
  })
})
