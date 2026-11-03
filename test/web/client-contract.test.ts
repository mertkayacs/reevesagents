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

  it('puts one button after About, and keeps the logs dialog free of tabs', () => {
    expect(html).toContain('id="logs-btn"')
    // The button sits after About and before New agent, which is the header order the block asks for.
    expect(html.indexOf('id="logs-btn"')).toBeGreaterThan(html.indexOf('id="about-btn"'))
    expect(html.indexOf('id="logs-btn"')).toBeLessThan(html.indexOf('id="new-agent-btn"'))

    expect(html).toContain('id="insights-dialog"')
    // Logs are logs: the plan tab left this dialog for its own, opened from the flow badge.
    expect(html).not.toContain('id="insights-tab-plan"')
    // (the create dialog keeps its own tablist; this is about the logs dialog)
    expect(html).not.toContain('class="insights-tabs"')
    // The plan has its own dialog, and its own close button.
    expect(html).toContain('id="plan-dialog"')
    expect(html).toContain('id="plan-dialog-title"')
    expect(html).toContain('id="plan-close"')
    // The panel lives inside the plan dialog, not inside the logs one.
    expect(html.indexOf('id="plan-panel"')).toBeLessThan(html.indexOf('id="insights-dialog"'))
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

  it('carries the pause control and the state glyph the UI promises', () => {
    // The dialog owns the control; the card only reports the state. Both are asserted here because the server tests cannot see a DOM.
    expect(html).toContain('id="plan-play-pause"')
    expect(html).toContain('aria-pressed="false"')
    expect(js).toContain("el.planPlayPause.textContent = paused ? t('web.planResume') : t('web.planPause')")
    expect(js).toContain("el.planPlayPause.setAttribute('aria-label', paused ? t('web.planResumeLabel') : t('web.planPauseLabel'))")
    // Without this handler the button is decoration: a test that only checked the markup would still pass, so the wiring is asserted.
    expect(js).toContain("el.planPlayPause.addEventListener('click', () => { void togglePlanPlayPause() })")
    expect(js).toContain("`/api/flow/${paused ? 'resume' : 'pause'}`")
    // The card's glyph: present, driven by the flow's own status, and not a control.
    expect(js).toContain("run.flow.status === 'paused'")
    expect(js).toContain("planState.dataset.paused = String(paused)")
    expect(js).toContain('flow-plan-state')
    const glyph = js.slice(js.indexOf('const planState = document.createElement'), js.indexOf('headBody.appendChild(planState)'))
    expect(glyph).not.toContain('addEventListener')
    // And the state is kept in step by every snapshot, not only at open time.
    expect(js).toContain('syncPlanPlayPause()')
  })

  it('lays the head out as two rows of three columns, with icon actions in the corner', () => {
    // Row 1: name and counters. Row 2: the flow chip, the play/pause glyph and the plan icon, in that order and on one
    // line — the glyph used to fall to a third row because the two-column grid had no cell left for it (block 70).
    expect(css).toMatch(/\.run-head-body \{[^}]*display: grid/)
    expect(css).toMatch(/\.run-head-body \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto auto/)
    expect(css).toMatch(/\.run-name \{[^}]*grid-row: 1/)
    expect(css).toMatch(/\.run-meta \{[^}]*grid-row: 1/)
    expect(css).toMatch(/\.run-flow \{[^}]*grid-column: 1;[^}]*grid-row: 2/)
    expect(css).toMatch(/\.flow-plan-state \{[^}]*grid-column: 2;[^}]*grid-row: 2/)
    expect(css).toMatch(/\.flow-plan-btn \{[^}]*grid-column: 3;[^}]*grid-row: 2/)

    // Actions are 24×24 icons whose meaning lives in aria-label/title, not in a text node.
    expect(css).toMatch(/\.run-action,\s*\.run-stop,\s*\.run-delete \{[^}]*width: 24px/)
    expect(css).toMatch(/\.run-action,\s*\.run-stop,\s*\.run-delete \{[^}]*height: 24px/)
    // Destructive action stays apart, focus stays visible.
    expect(css).toMatch(/\.run-delete \{[^}]*margin-left: 4px/)
    expect(css).toContain('.run-delete:focus-visible')
    // Narrow cards drop the counters, never the chip.
    expect(css).toMatch(/@media \(max-width: 520px\)[\s\S]*\.run-meta \{\s*display: none;/)
  })

  it('keeps the chip readable: the counters yield first, and a paused flow is not a neutral chip', () => {
    // The counters used to own an auto column at their full 161px and squeezed the flow chip to 56px, where the label read
    // «поток: н…». They are capped and allowed to shrink to nothing (their text lives in `title`), so the chip keeps its
    // room and the name keeps the rest (block 70).
    expect(css).toMatch(/\.run-meta \{[^}]*min-width: 0/)
    expect(css).toMatch(/\.run-meta \{[^}]*max-width: 7ch/)
    expect(css).toMatch(/\.run-meta \{[^}]*text-overflow: ellipsis/)
    // The card — not the viewport — decides how tight its header is: a media query cannot ask the sidebar's width, so the
    // head is a size container, and on a narrow card the counters go first and the chip drops one type step.
    expect(css).toMatch(/\.run-head \{[^}]*container-type: inline-size/)
    expect(css).toMatch(/@container \(max-width: 262px\)[\s\S]*?\.run-meta \{\s*display: none;/)
    expect(css).toMatch(/@container \(max-width: 232px\)[\s\S]*?\.run-flow \{[^}]*font-size: 10px/)
    // The chip still truncates rather than overflowing — but only after everything that may yield has yielded.
    expect(css).toMatch(/\.run-flow \{[^}]*min-width: 0/)
    expect(css).toMatch(/\.run-flow \{[^}]*text-overflow: ellipsis/)
    // "Paused" reads as standing still from the border as well as the words: amber, and dashed, unlike the neutral chip.
    expect(css).toMatch(/\.flow-badge--paused \{[^}]*border-color: color-mix\(in srgb, var\(--warn\)/)
    expect(css).toMatch(/\.flow-badge--paused \{[^}]*border-style: dashed/)
  })

  it('lets the card tail start at the card edge instead of under the avatar', () => {
    // The 38px inset (and its 34px twin on narrow cards) pushed the longest tail — a queued agent: status + hint + stop —
    // into a wrap with room to spare (block 70). Both declarations are gone; the rest of the rule stays.
    expect(css).toMatch(/\.card-tail \{[^}]*display: flex/)
    expect(css).toMatch(/\.card-tail \{[^}]*flex-wrap: wrap/)
    expect(css).not.toMatch(/\.card-tail \{[^}]*padding-left/)
  })

  it('puts the play/pause glyph between the chip and the plan icon', () => {
    const head = js.slice(js.indexOf("headBody.className = 'run-head-body'"), js.indexOf('head.appendChild(headBody)'))
    // The order is the layout: chip, then the state glyph, then the control that opens the plan.
    const chip = head.indexOf('headBody.appendChild(flow)')
    const glyph = head.indexOf('headBody.appendChild(planState)')
    const icon = head.indexOf('headBody.appendChild(planBtn)')
    expect(chip).toBeGreaterThan(-1)
    expect(glyph).toBeGreaterThan(chip)
    expect(icon).toBeGreaterThan(glyph)
  })

  it('gives every action button an accessible name instead of a text node', () => {
    expect(js).toContain("add.setAttribute('aria-label', t('web.addAgent'))")
    expect(js).toContain("stop.setAttribute('aria-label', t('web.stop'))")
    expect(js).toContain("del.setAttribute('aria-label', t('common.delete'))")
    // The glyphs are drawn, not typed.
    expect(js).toContain("add.innerHTML = runActionIcon('add')")
    expect(js).toContain("stop.innerHTML = runActionIcon('stop')")
    expect(js).toContain("del.innerHTML = runActionIcon('delete')")
    // No `textContent` inside the run head any more: that is what used to make those buttons wide. (Other `del` buttons in
    // the file — history rows, presets — keep their text; this is about the card's header.)
    const head = js.slice(js.indexOf('head.className = \'run-head\''), js.indexOf("head.appendChild(headBody)"))
    expect(head).not.toContain('.textContent = t(')
  })

  it('keeps the plan icon in the head body, beside the chip', () => {
    // Placement is structure; the icon's own attributes and the "no plan, no button" rule are behaviour and live in
    // `plan-dialog.test.ts`, where the controller builds a real element.
    const head = js.slice(js.indexOf("headBody.className = 'run-head-body'"), js.indexOf('head.appendChild(headBody)'))
    expect(head).toContain('headBody.appendChild(flow)')
    expect(head).toContain('headBody.appendChild(planState)')
    expect(head).toContain('headBody.appendChild(planBtn)')
    // The chip is still a span: the icon is the only control in that row.
    expect(head).toContain("const flow = document.createElement('span')")
  })

  it('draws the plan icon from the plan itself, not from the run', () => {
    // Runtime, not a search through the source: load the client's own helper and ask it. A run with a plan has the icon; a run
    // without one has no button at all (not a disabled one — T1.6.6).
    const source = readFileSync(join(process.cwd(), 'src/surfaces/webui/client/insights-core.js'), 'utf8')
    const sandbox: { insightsCore?: { planIconVisible: (_flow: unknown) => boolean } } = {}
    new Function('window', `${source}; return window.insightsCore`)(sandbox)
    const { planIconVisible } = sandbox.insightsCore!

    expect(planIconVisible({ label: 'flow: done 2/2', plan: { done: 2, total: 2 }, run_id: 'run-1' })).toBe(true)
    expect(planIconVisible({ label: 'flow: closed', plan: null, run_id: 'run-1' })).toBe(false)
    expect(planIconVisible(null)).toBe(false)
  })

  it('opens the plan dialog from the icon of that run', () => {
    // The dialog is fetched and shown once; the Esc/close path is driven end to end in `plan-dialog.test.ts`.
    expect(js).toContain("el.planDialog.showModal()")
    expect(js).toContain("api('GET', `/api/plan?run=")
    expect(js).toContain('planController.attach(el.planDialog)')
    expect(js).toContain('openPlanDialog(run.id)')
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

describe('the stream does not rebuild the sidebar for the clock (block 71)', () => {
  const html = readClientFile('index.html')
  const js = readClientFile('app.js')

  it('updates the driver line first, then skips everything else when only time passed', () => {
    // The defect: the frame carried `age_s`/`next_in_s`, so every 1.5 s frame looked different and the whole card list was
    // rebuilt. The handler now refreshes the one line and bails out when the rest of the state is unchanged.
    const handler = js.slice(js.indexOf('events.onmessage = (e) => {'), js.indexOf('function setConn(state)'))
    const tickLine = handler.indexOf('renderPlanTicks()')
    const bail = handler.indexOf('if (key === lastFrameKey) return')
    const apply = handler.indexOf('applyState(data)')

    expect(handler).toContain('const key = ticks.frameKey(data)')
    // The clock is measured before the line is drawn: the line is computed locally, so it needs the correction first.
    const clock = handler.indexOf('noteServerClock(data)')
    expect(clock).toBeGreaterThan(-1)
    expect(clock).toBeLessThan(tickLine)
    expect(tickLine).toBeGreaterThan(-1)
    expect(bail).toBeGreaterThan(tickLine)
    expect(apply).toBeGreaterThan(bail)
  })

  it('ticks the line with a local timer, and rebuilds it when the tab wakes up', () => {
    expect(js).toContain('setInterval(updatePlanTicksClock, 1000)')
    expect(js).toContain("document.addEventListener('visibilitychange'")
    // The line is drawn from marks with this browser's clock, corrected by the server's.
    expect(js).toContain('ticks.lineText(insights.tick, Date.now() + clockOffset, t)')
    // The offset comes from `ticks.clockOffset` and is refreshed by every payload that carries `now` — the snapshot and
    // every frame that is actually sent (block 71, review round 1).
    expect(js).toContain('const offset = ticks.clockOffset(data, Date.now())')
    const server = readFileSync(join(process.cwd(), 'src/surfaces/webui/server.ts'), 'utf8')
    expect(server).toContain('JSON.stringify({ ...state, now: Date.now() })')
  })

  it('ships the module that computes it, and keeps countdowns out of both sides', () => {
    expect(html).toContain('src="tick-line.js"')
    expect(html.indexOf('tick-line.js')).toBeLessThan(html.indexOf('src="app.js"'))
    expect(js).not.toContain('age_s')
    expect(js).not.toContain('next_in_s')
    const serverSource = readFileSync(join(process.cwd(), 'src/surfaces/webui/server.ts'), 'utf8')
    expect(serverSource).not.toContain('age_s')
    expect(serverSource).not.toContain('next_in_s')
  })
})
