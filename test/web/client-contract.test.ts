import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const clientRoot = join(process.cwd(), 'src/surfaces/webui/client')

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
    expect(html).toContain('rel="icon" type="image/png"')
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
    expect(html).toContain('id="doctor-btn"')
    expect(html).toContain('id="doctor-dialog"')
    expect(html).toContain('id="about-btn"')
    expect(html).toContain('id="about-dialog"')
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
    expect(html).toContain('class="field-help"')
    expect(html).toContain('id="run-name-help"')
    expect(html).toContain('id="provider-help"')
    expect(html).toContain('Permission mode')
    expect(html).toContain('Add agent')
    expect(html).not.toContain('id="new-btn"')
    expect(html).not.toContain('id="f-run"')
    expect(html).not.toContain('Target run')

    expect(js).toContain('function openRunDialog()')
    expect(js).toContain('function openAgentDialog(runId)')
    expect(js).toContain('function populateAgentRunSelect(preferred)')
    expect(js).toContain('function updateProviderSelection()')
    expect(js).toContain('function handleProviderKeydown(ev, providerId)')
    expect(js).toContain('function renderModels()')
    expect(js).toContain('function updatePermissionSelection()')
    expect(js).toContain('function handlePermissionKeydown(ev)')
    expect(js).toContain('function updateCreateSubmitState()')
    expect(js).toContain('function showUnavailableAgent(id, found)')
    expect(js).toContain('function reconcileSelectedAgent()')
    expect(js).toContain('function reconcileCreateDialog()')
    expect(js).toContain('function renderLanguageSelect()')
    expect(js).toContain("api('POST', '/api/language'")
    expect(js).toContain("api('POST', `/api/history/${encodeURIComponent(record.id)}/delete`")
    expect(js).toContain("api('POST', `/api/runs/${encodeURIComponent(run.id)}/delete`")
    expect(js).toContain("api('POST', `/api/terminals/${encodeURIComponent(agent.id)}/delete`")
    expect(js).toContain('function deleteHistoryRecord(record)')
    expect(js).toContain('function deleteAgentRecord(agent)')
    expect(js).toContain('function renderApproval(approval)')
    expect(js).toContain('function resolveApproval(approval, decision)')
    expect(js).toContain("api('POST', `/api/approvals/${encodeURIComponent(approval.id)}/resolve`")
    expect(js).toContain("task.className = 'card-task'")
    expect(js).toContain('function openDoctorDialog()')
    expect(js).toContain('function renderDoctorChecks(checks)')
    expect(js).toContain("api('GET', '/api/doctor')")
    expect(js).toContain('function openAboutDialog()')
    expect(js).toContain("createContext = { kind: 'run', runId: '' }")
    expect(js).toContain("createContext = { kind: 'agent', runId: run.id }")
    expect(js).toContain('model: el.fModel.value')
    expect(js).toContain('permissions: el.fPermissions.value')
    expect(js).toContain("run_id: createContext.kind === 'agent' ? createContext.runId : undefined")
    expect(js).toContain("run_name: createContext.kind === 'run' ?")
    expect(js).toContain("availability.className = 'card-open-hint'")
    expect(js).toContain("agent.canAttach ? t('web.openAgent') : disabledReasonLabel(agent)")
    expect(js).toContain('if (found && found.terminal.canAttach) attach(created.id)')
    expect(js).toContain('reconcileSelectedAgent()')
    expect(js).toContain('reconcileCreateDialog()')
    expect(js).toContain("'web.noLiveTmuxTarget': 'run tmux session is unavailable'")
    expect(js).toContain("ws.onclose = () => { if (session && session.id === id && !finalState)")
  })

  it('keeps polished mobile button styles scoped to the top bar', () => {
    const css = readClientFile('app.css')

    expect(css).toContain('@keyframes fadeUp')
    expect(css).toContain('@keyframes dialogIn')
    expect(css).toContain('.run-action')
    expect(css).toContain('.run-delete')
    expect(css).toContain('.card-agent-action')
    expect(css).toContain('.card-open-hint')
    expect(css).toContain('.dialog-note')
    expect(css).toContain('.field-help')
    expect(css).toContain('.provider-grid')
    expect(css).toContain('.language-picker')
    expect(css).toContain('.history-delete')
    expect(css).toContain('.approval-card')
    expect(css).toContain('.approval-approve')
    expect(css).toContain('.card-task')
    expect(css).toContain('.doctor-check')
    expect(css).toContain('.about-row')
    expect(css).toContain('.provider-option[aria-selected="true"]')
    expect(css).toContain('.create-options-grid')
    expect(css).toContain('.permission-option[aria-checked="true"]')
    expect(css).not.toContain('.topbar .btn-accent {\n    position: absolute;')
  })

  it('exposes the agent control (MCP installer) surface', () => {
    const html = readClientFile('index.html')
    const js = readClientFile('app.js')
    const css = readClientFile('app.css')

    expect(html).toContain('id="agent-control-btn"')
    expect(html).toContain('id="mcp-dialog"')
    expect(html).toContain('id="mcp-host-list"')
    expect(html).toContain('id="mcp-attach-all"')

    expect(js).toContain("api('GET', '/api/mcp-hosts')")
    expect(js).toContain("api('POST', '/api/mcp-hosts/attach'")
    expect(js).toContain("api('POST', '/api/mcp-hosts/detach'")
    expect(js).toContain("api('POST', '/api/mcp-hosts/attach-all'")
    expect(js).toContain('function renderMcpHosts()')
    expect(js).toContain('function openMcpDialog()')
    expect(js).toContain("'web.mcpTitle': 'Agent control'")

    expect(css).toContain('.mcp-host-row')
    expect(css).toContain('.mcp-host-action')
  })

  it('exposes the launch knobs, config panel, and presets panel', () => {
    const html = readClientFile('index.html')
    const js = readClientFile('app.js')

    expect(html).toContain('id="f-auth-mode"')
    expect(html).toContain('id="f-effort"')
    expect(html).toContain('id="auth-mode-field"')
    expect(html).toContain('id="effort-field"')
    expect(html).toContain('id="config-btn"')
    expect(html).toContain('id="config-dialog"')
    expect(html).toContain('id="config-list"')
    expect(html).toContain('id="presets-btn"')
    expect(html).toContain('id="presets-dialog"')
    expect(html).toContain('id="presets-list"')
    expect(html).toContain('id="preset-name-input"')

    expect(js).toContain('auth_mode: el.fAuthMode.value')
    expect(js).toContain('effort: el.fEffort.value')
    expect(js).toContain('function updateLaunchKnobVisibility()')
    expect(js).toContain('function openConfigDialog()')
    expect(js).toContain('function renderConfigFields(payload)')
    expect(js).toContain('function saveConfig()')
    expect(js).toContain("api('GET', '/api/config')")
    expect(js).toContain("api('POST', '/api/config'")
    expect(js).toContain('function openPresetsDialog()')
    expect(js).toContain('function renderPresets(presets)')
    expect(js).toContain('function savePreset()')
    expect(js).toContain("api('GET', '/api/presets')")
    expect(js).toContain("api('POST', '/api/presets/save'")
    expect(js).toContain("api('POST', `/api/presets/${encodeURIComponent(name)}/start`")
    expect(js).toContain("api('POST', `/api/presets/${encodeURIComponent(name)}/delete`")
  })
})

describe('web client flow chip', () => {
  it('renders the server-rendered label and styles attention, with no copy of the wording', () => {
    const js = readClientFile('app.js')
    const css = readClientFile('app.css')

    // The chip reads the label the server rendered through core/flow-label.ts.
    expect(js).toContain('run.flow.label')
    // The chip carries the tone the server decided: the classes are a mapping, never a second copy of the rule.
    expect(js).toContain('flow-badge--')
    expect(js).toContain('is-pulsing')
    expect(js).toContain('flow.dataset.attention')
    // No second copy of the badge text or of the attention wording in the browser bundle.
    expect(js).not.toContain('flow: review')
    expect(js).not.toContain('flow: escalated')
    expect(js).not.toContain('needs attention')
    expect(js).not.toContain('rounds spent')
    // State comes from the existing panel classes, not from inline styles.
    expect(js).not.toContain('flow.style.color')
    expect(css).toContain('.run-flow {')
    expect(css).toContain('.run-flow[data-attention]')
    // One class per tone, and the pulse is opt-in so a stale badge cannot keep breathing.
    for (const tone of ['progress', 'done', 'attention', 'paused']) {
      expect(css).toContain(`.flow-badge--${tone}`)
    }
    expect(css).toContain('.flow-badge.is-pulsing')
    expect(css).toContain('prefers-reduced-motion: reduce')
    expect(css).toContain('var(--warn)')
  })
})

describe('insights dialog (Plan + Logs) and the card pulse', () => {
  const html = readClientFile('index.html')
  const js = readClientFile('app.js')
  const css = readClientFile('app.css')

  it('puts one button after About, and one dialog with two tabs', () => {
    expect(html).toContain('id="logs-btn"')
    // The button sits after About and before New agent, which is the header order the block asks for.
    expect(html.indexOf('id="logs-btn"')).toBeGreaterThan(html.indexOf('id="about-btn"'))
    expect(html.indexOf('id="logs-btn"')).toBeLessThan(html.indexOf('id="new-agent-btn"'))

    expect(html).toContain('id="insights-dialog"')
    expect(html).toContain('id="insights-tab-plan"')
    expect(html).toContain('id="insights-tab-logs"')
    expect(html).toContain('role="tablist"')
    expect(html).toContain('role="tabpanel"')
  })

  it('has the Plan tab: progress, filter chips, item list, waiting block, empty state', () => {
    expect(html).toContain('id="plan-progress-text"')
    expect(html).toContain('role="progressbar"')
    expect(html).toContain('id="plan-filter-all"')
    expect(html).toContain('id="plan-filter-open"')
    expect(html).toContain('id="plan-filter-waiting"')
    expect(html).toContain('id="plan-list"')
    expect(html).toContain('id="plan-waiting"')
    expect(html).toContain('id="plan-detail"')
    expect(html).toContain('id="plan-empty"')
    expect(js).toContain('function renderPlan(')
    expect(js).toContain('function showPlanDetail(')
  })

  it('has the Logs tab: run filter, unread toggle, list, mark-read, live refresh, empty state', () => {
    expect(html).toContain('id="logs-list"')
    expect(html).toContain('id="logs-filter-run"')
    expect(html).toContain('id="logs-unread"')
    expect(html).toContain('id="logs-mark-read"')
    expect(html).toContain('id="logs-empty"')
    expect(html).toContain('aria-live="polite"')
    expect(js).toContain('function renderLogs(')
    expect(js).toContain('function markAllRead(')
    // Live refresh rides the existing SSE state frame: a new sequence loads the journal, no polling loop.
    expect(js).toContain('previous.latest_seq !== data.notifications.latest_seq')
  })

  it('opens the dialog with the plan tab when the run has a plan', () => {
    expect(js).toContain('function openInsightsDialog(')
    expect(js).toContain("api('GET', `/api/plan?run=")
    expect(js).toContain("const wanted = tab || (insights.plan ? 'plan' : 'logs')")
  })

  it('pulses only the card that has unread news, from the summary the server sends', () => {
    // The summary carries `agent_pulse_ms` (the client cannot read the config) and `unread_by` (one entry per
    // run/agent), so a single approval does not animate the whole sidebar.
    expect(js).toContain('notifications.agent_pulse_ms')
    expect(js).toContain('notifications.unread_by')
    expect(js).toContain("entry.agent_id === agent.id")
    // The card must be rendered with the run too: a run-level event (`agent_id: ''`) pulses the run's cards, and
    // without the second argument that branch could never fire.
    expect(js).toContain('renderPulse(card, agent, run)')
    expect(js).toContain("entry.agent_id === '' && run && entry.run_id === run.id")
    const server = readFileSync(join(process.cwd(), 'src/surfaces/webui/server.ts'), 'utf8')
    expect(server).toContain('withPulse(')
  })

  it('pulses for the newest applicable event, and reschedules one timer', () => {
    // An agent event and a run-level event can both apply to a card: the newest timestamp must win, not the last
    // array element. And the timer must be rescheduled to the earliest expiry instead of being pinned once.
    expect(js).toContain('if (!latest || entry.latest_ts > latest) latest = entry.latest_ts')
    expect(js).toContain('if (pulseTimer) { globalThis.clearTimeout(pulseTimer); pulseTimer = null }')
    expect(js).toContain('schedulePulseTick()\n    }, earliest + 25)')
  })

  it('feeds SSE frames through the same consumer as the first load', () => {
    // The stream used to copy only runs/history/approvals and drop `notifications`, so a read on another tab never
    // reached the badge, the pulse or an open Logs list.
    expect(js).toContain('events.onmessage = (e) => {')
    const subscribe = js.slice(js.indexOf('function subscribe()'), js.indexOf('function setConn('))
    expect(subscribe).toContain('applyState(data)')
    expect(subscribe).not.toContain('runs = data.runs')
  })

  it('keeps fields a frame does not carry instead of blanking them', () => {
    const apply = js.slice(js.indexOf('function applyState(data)'), js.indexOf('function subscribe()'))
    // Providers, language, theme and version only arrive on the first load; a frame must not reset them.
    expect(apply).toContain('if (Array.isArray(data.providers)) providers = data.providers')
    expect(apply).toContain('if (data.language) applyLanguage(data.language)')
    expect(apply).not.toContain('providers = data.providers || []')
  })

  it('refreshes the Logs list when another tab marks events read', () => {
    // `latest_seq` does not move on "mark read"; the condition has to watch the watermark and the unread count too.
    expect(js).toContain('previous.read_seq !== data.notifications.read_seq')
    expect(js).toContain('previous.unread !== data.notifications.unread')
  })

  it('shows a missing plan row as missing, in the list and in the detail', () => {
    expect(js).toContain("planStatusBadge(item.missing_since ? 'missing' : item.status)")
    expect(js).toContain("t('web.planMissingSince')")
    expect(js).toContain('web.planStatus_missing')
  })

  it('draws the pulse from the server timestamp and respects agent_pulse_ms', () => {
    expect(js).toContain('function renderPulse(')
    expect(js).toContain('function schedulePulseTick(')
    expect(js).toContain('pulseRemaining(')
    expect(css).toContain('.card-pulse')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('@media (max-width: 520px)')
  })

  it('writes external text with textContent only', () => {
    // The journal carries strings from other machines; an innerHTML there would be an injection point.
    const insightsSection = js.slice(js.indexOf('function renderLogs('), js.indexOf('function markAllRead('))
    expect(insightsSection).toContain('textContent')
    expect(insightsSection).not.toContain('innerHTML')
    const planSection = js.slice(js.indexOf('function renderPlan('), js.indexOf('function showPlanDetail('))
    expect(planSection).not.toContain('innerHTML')
  })
})
