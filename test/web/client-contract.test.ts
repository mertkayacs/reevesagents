import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const clientRoot = join(process.cwd(), 'src/web/client')

function readClientFile(name: string): string {
  return readFileSync(join(clientRoot, name), 'utf8')
}

describe('web client create flow', () => {
  it('keeps new run and add agent as separate entry points', () => {
    const html = readClientFile('index.html')
    const js = readClientFile('app.js')

    expect(html).toContain('id="new-run-btn"')
    expect(html).toContain('id="empty-new-run"')
    expect(html).toContain('id="stage-add-agent"')
    expect(html).toContain('Add agent')
    expect(html).not.toContain('id="new-btn"')
    expect(html).not.toContain('id="f-run"')
    expect(html).not.toContain('Target run')

    expect(js).toContain('function openRunDialog()')
    expect(js).toContain('function openAgentDialog(runId)')
    expect(js).toContain("createContext = { kind: 'run', runId: '' }")
    expect(js).toContain("createContext = { kind: 'agent', runId }")
    expect(js).toContain("run_id: createContext.kind === 'agent' ? createContext.runId : undefined")
    expect(js).toContain("run_name: createContext.kind === 'run' ?")
  })

  it('keeps polished mobile button styles scoped to the top bar', () => {
    const css = readClientFile('app.css')

    expect(css).toContain('@keyframes fadeUp')
    expect(css).toContain('@keyframes dialogIn')
    expect(css).toContain('.run-action')
    expect(css).toContain('.dialog-note')
    expect(css).toContain('.topbar .btn-accent')
    expect(css).not.toContain('\n  .btn-accent {\n    position: absolute;')
  })
})
