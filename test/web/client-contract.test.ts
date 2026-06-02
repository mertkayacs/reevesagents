import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const clientRoot = join(process.cwd(), 'src/web/client')

function readClientFile(name: string): string {
  return readFileSync(join(clientRoot, name), 'utf8')
}

describe('web client create flow', () => {
  it('mounts the animated Lottie duck instead of the old inline SVG', () => {
    const html = readClientFile('index.html')
    const js = readClientFile('app.js')
    const css = readClientFile('app.css')
    const lottie = JSON.parse(readClientFile('brand-duck.json')) as { nm?: string; layers?: unknown[]; assets?: unknown[] }

    expect(html).toContain('id="brand-duck"')
    expect(html).not.toContain('<svg class="brand-duck"')
    expect(js).toContain("api('GET', '/brand-duck.json')")
    expect(js).toContain('window.requestAnimationFrame(tick)')
    expect(js).toContain('function renderBrandDuck(animation)')
    expect(css).toContain('.brand-duck svg')
    expect(lottie.nm).toBe('chick1 ')
    expect(lottie.layers?.length).toBeGreaterThan(0)
    expect(lottie.assets?.length).toBeGreaterThan(0)
  })

  it('keeps new run and add agent as separate entry points', () => {
    const html = readClientFile('index.html')
    const js = readClientFile('app.js')

    expect(html).toContain('id="new-run-btn"')
    expect(html).toContain('id="new-agent-btn"')
    expect(html).toContain('id="language-select"')
    expect(html).toContain('id="empty-new-run"')
    expect(html).toContain('id="stage-add-agent"')
    expect(html).toContain('id="create-run-tab"')
    expect(html).toContain('id="create-agent-tab"')
    expect(html).toContain('id="f-agent-run"')
    expect(html).toContain('id="provider-grid"')
    expect(html).toContain('id="f-model"')
    expect(html).toContain('id="f-permissions"')
    expect(html).toContain('id="permission-grid"')
    expect(html).toContain('Permission mode')
    expect(html).toContain('Add agent')
    expect(html).not.toContain('id="new-btn"')
    expect(html).not.toContain('id="f-run"')
    expect(html).not.toContain('Target run')

    expect(js).toContain('function openRunDialog()')
    expect(js).toContain('function openAgentDialog(runId)')
    expect(js).toContain('function populateAgentRunSelect(preferred)')
    expect(js).toContain('function updateProviderSelection()')
    expect(js).toContain('function renderModels()')
    expect(js).toContain('function updatePermissionSelection()')
    expect(js).toContain('function renderLanguageSelect()')
    expect(js).toContain("api('POST', '/api/language'")
    expect(js).toContain("api('POST', `/api/history/${encodeURIComponent(record.id)}/delete`")
    expect(js).toContain("api('POST', `/api/runs/${encodeURIComponent(run.id)}/delete`")
    expect(js).toContain("api('POST', `/api/terminals/${encodeURIComponent(agent.id)}/delete`")
    expect(js).toContain('function deleteHistoryRecord(record)')
    expect(js).toContain('function deleteAgentRecord(agent)')
    expect(js).toContain("createContext = { kind: 'run', runId: '' }")
    expect(js).toContain("createContext = { kind: 'agent', runId: run.id }")
    expect(js).toContain('model: el.fModel.value')
    expect(js).toContain('permissions: el.fPermissions.value')
    expect(js).toContain("run_id: createContext.kind === 'agent' ? createContext.runId : undefined")
    expect(js).toContain("run_name: createContext.kind === 'run' ?")
  })

  it('keeps polished mobile button styles scoped to the top bar', () => {
    const css = readClientFile('app.css')

    expect(css).toContain('@keyframes fadeUp')
    expect(css).toContain('@keyframes dialogIn')
    expect(css).toContain('.run-action')
    expect(css).toContain('.run-delete')
    expect(css).toContain('.card-agent-action')
    expect(css).toContain('.dialog-note')
    expect(css).toContain('.provider-grid')
    expect(css).toContain('.language-picker')
    expect(css).toContain('.history-delete')
    expect(css).toContain('.provider-option[aria-selected="true"]')
    expect(css).toContain('.create-options-grid')
    expect(css).toContain('.permission-option[aria-checked="true"]')
    expect(css).not.toContain('.topbar .btn-accent {\n    position: absolute;')
  })
})
