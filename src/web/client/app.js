// Web client: renders the agent sidebar from /api/state, keeps it live over the
// /api/events SSE stream, and attaches xterm.js to an agent tmux window through
// the /term websocket bridge. Globals Terminal and FitAddon come from the xterm UMD
// bundles loaded before this script. No build step, no framework.

(() => {
  'use strict'

  const TERM_THEME = {
    background: '#15191f',
    foreground: '#ece7dc',
    cursor: '#7eb8f5',
    selectionBackground: '#3a4b5f',
    black: '#15191f', brightBlack: '#817b70',
    red: '#d56a60', brightRed: '#d56a60',
    green: '#83a36f', brightGreen: '#83a36f',
    yellow: '#d7a84f', brightYellow: '#d7a84f',
    blue: '#7eb8f5', brightBlue: '#7eb8f5',
    white: '#ece7dc', brightWhite: '#ffffff',
  }

  const el = {
    sidebarList: document.getElementById('sidebar-list'),
    sidebarEmpty: document.getElementById('sidebar-empty'),
    sidebarCount: document.getElementById('sidebar-count'),
    conn: document.getElementById('conn'),
    brandDuck: document.getElementById('brand-duck'),
    brandBeta: document.getElementById('brand-beta'),
    stageTitle: document.getElementById('stage-title'),
    stageSub: document.getElementById('stage-sub'),
    stageStatus: document.getElementById('stage-status'),
    overlay: document.getElementById('stage-overlay'),
    termWrap: document.getElementById('term-wrap'),
    termHost: document.getElementById('term-host'),
    newRunBtn: document.getElementById('new-run-btn'),
    emptyNewRun: document.getElementById('empty-new-run'),
    stageAddAgent: document.getElementById('stage-add-agent'),
    dialog: document.getElementById('new-dialog'),
    dialogTitle: document.getElementById('new-dialog-title'),
    dialogSubtitle: document.getElementById('new-dialog-subtitle'),
    targetRunNote: document.getElementById('target-run-note'),
    form: document.getElementById('new-form'),
    fProvider: document.getElementById('f-provider'),
    fNickname: document.getElementById('f-nickname'),
    fRunName: document.getElementById('f-run-name'),
    fMode: document.getElementById('f-mode'),
    modeField: document.getElementById('mode-field'),
    runNameField: document.getElementById('run-name-field'),
    fCwd: document.getElementById('f-cwd'),
    cwdField: document.getElementById('cwd-field'),
    fPrompt: document.getElementById('f-prompt'),
    newError: document.getElementById('new-error'),
    newCancel: document.getElementById('new-cancel'),
    newSubmit: document.getElementById('new-submit'),
  }

  let runs = []
  let history = []
  let providers = []
  let prebetaOrchestrator = false
  let selectedId = null
  let session = null // { id, ws, term, fit, observer }
  let createContext = { kind: 'run', runId: '' }

  // --- http helpers ---------------------------------------------------------

  async function api(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    let data = null
    try { data = text ? JSON.parse(text) : null } catch { /* non-json error body */ }
    if (!res.ok) {
      const msg = (data && data.error) || text || `request failed (${res.status})`
      throw new Error(msg)
    }
    return data
  }

  // --- initial load + live stream ------------------------------------------

  async function loadState() {
    const data = await api('GET', '/api/state')
    applyState(data)
  }

  async function refreshState() {
    const data = await api('GET', '/api/state')
    applyState(data)
  }

  function applyState(data) {
    providers = data.providers || []
    runs = data.runs || []
    history = data.history || []
    prebetaOrchestrator = data.prebeta && data.prebeta.orchestrator === true
    el.brandBeta.textContent = prebetaOrchestrator ? 'web · pre-beta MCP' : 'web · beta'
    renderProviders()
    renderSidebar()
  }

  function subscribe() {
    const events = new EventSource('/api/events')
    events.onopen = () => setConn('live')
    events.onerror = () => setConn('down')
    events.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (Array.isArray(data.runs)) {
          runs = data.runs
        }
        if (Array.isArray(data.history)) history = data.history
        renderSidebar()
      } catch { /* ignore malformed frame */ }
    }
  }

  function setConn(state) {
    el.conn.dataset.state = state
    el.conn.textContent = state === 'down' ? 'offline' : 'live'
  }

  // --- rendering ------------------------------------------------------------

  function findAgent(id) {
    for (const run of runs) {
      for (const t of run.terminals) if (t.id === id) return { run, terminal: t }
    }
    return null
  }

  function renderProviders() {
    const current = el.fProvider.value
    const mode = selectedCreateMode()
    el.fProvider.innerHTML = ''
    for (const p of providers) {
      const opt = document.createElement('option')
      opt.value = p.id
      const supported = mode !== 'orchestrator' || p.orchestrator === true
      opt.textContent = p.available ? p.name : `${p.name} (not installed)`
      if (mode === 'orchestrator' && !supported) opt.textContent = `${p.name} (Spawner only)`
      opt.disabled = !p.available || !supported
      el.fProvider.appendChild(opt)
    }
    const currentOption = [...el.fProvider.options].find(opt => opt.value === current && !opt.disabled)
    const firstAvailable = [...el.fProvider.options].find(opt => !opt.disabled)
    if (currentOption) el.fProvider.value = currentOption.value
    else if (firstAvailable) el.fProvider.value = firstAvailable.value
  }

  function selectedProviderAvailable() {
    const selected = el.fProvider.selectedOptions[0]
    return !!selected && !selected.disabled && !!selected.value
  }

  function showDialogError(message) {
    el.newError.textContent = message
    el.newError.hidden = false
  }

  // --- brand animation ------------------------------------------------------

  async function initBrandDuck() {
    try {
      const animation = await api('GET', '/brand-duck.json')
      renderBrandDuck(animation)
    } catch {
      el.brandDuck.dataset.ready = 'error'
    }
  }

  function renderBrandDuck(animation) {
    if (!animation || !Array.isArray(animation.layers) || !Array.isArray(animation.assets)) return

    const svg = svgEl('svg')
    svg.setAttribute('viewBox', `0 0 ${animation.w || 51} ${animation.h || 63}`)
    svg.setAttribute('role', 'img')
    svg.setAttribute('focusable', 'false')

    const title = svgEl('title')
    title.textContent = 'ReevesAgents duck'
    svg.appendChild(title)

    const assets = new Map(animation.assets.map(asset => [asset.id, asset]))
    const animatedLayers = []
    for (const layer of [...animation.layers].reverse()) {
      const asset = assets.get(layer.refId)
      if (!asset || !Array.isArray(asset.layers)) continue
      const group = svgEl('g')
      group.dataset.layer = layer.nm || layer.refId
      renderAssetLayers(group, asset.layers)
      svg.appendChild(group)
      animatedLayers.push({ layer, group })
    }

    el.brandDuck.innerHTML = ''
    el.brandDuck.appendChild(svg)
    el.brandDuck.dataset.ready = 'true'

    const durationFrames = (animation.op || 120) - (animation.ip || 0)
    const frameRate = animation.fr || 60
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const applyFrame = frame => {
      for (const item of animatedLayers) item.group.setAttribute('transform', layerTransform(item.layer, frame))
      el.brandDuck.dataset.frame = String(Math.round(frame))
    }

    applyFrame(animation.ip || 0)
    if (reducedMotion) return

    const startedAt = window.performance.now()
    const tick = now => {
      const elapsed = (now - startedAt) / 1000
      const frame = (animation.ip || 0) + ((elapsed * frameRate) % durationFrames)
      applyFrame(frame)
      window.requestAnimationFrame(tick)
    }
    window.requestAnimationFrame(tick)
  }

  function renderAssetLayers(parent, layers) {
    for (const layer of [...layers].reverse()) {
      const shape = (layer.shapes || []).find(item => item.ty === 'sh')
      const fill = (layer.shapes || []).find(item => item.ty === 'fl')
      if (!shape || !fill) continue
      const path = svgEl('path')
      path.setAttribute('d', shapePath(shape.ks && shape.ks.k))
      path.setAttribute('fill', rgb(fill.c && fill.c.k))
      path.setAttribute('fill-opacity', String(valueOf(fill.o) / 100))

      const group = svgEl('g')
      group.setAttribute('transform', layerTransform(layer, 0))
      group.setAttribute('opacity', String(valueOf(layer.ks && layer.ks.o) / 100))
      group.appendChild(path)
      parent.appendChild(group)
    }
  }

  function svgEl(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name)
  }

  function shapePath(shape) {
    if (!shape || !Array.isArray(shape.v) || shape.v.length === 0) return ''
    const parts = [`M ${fmt(shape.v[0][0])} ${fmt(shape.v[0][1])}`]
    for (let i = 1; i < shape.v.length; i += 1) {
      addSegment(parts, shape, i - 1, i)
    }
    if (shape.c) {
      addSegment(parts, shape, shape.v.length - 1, 0)
      parts.push('Z')
    }
    return parts.join(' ')
  }

  function addSegment(parts, shape, fromIndex, toIndex) {
    const from = shape.v[fromIndex]
    const to = shape.v[toIndex]
    const out = shape.o && shape.o[fromIndex] ? shape.o[fromIndex] : [0, 0]
    const inn = shape.i && shape.i[toIndex] ? shape.i[toIndex] : [0, 0]
    const c1 = [from[0] + out[0], from[1] + out[1]]
    const c2 = [to[0] + inn[0], to[1] + inn[1]]
    if (samePoint(c1, from) && samePoint(c2, to)) {
      parts.push(`L ${fmt(to[0])} ${fmt(to[1])}`)
    } else {
      parts.push(`C ${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(to[0])} ${fmt(to[1])}`)
    }
  }

  function layerTransform(layer, frame) {
    const ks = layer.ks || {}
    const anchor = valueOf(ks.a, frame)
    const position = valueOf(ks.p, frame)
    const scale = valueOf(ks.s, frame)
    const rotation = valueOf(ks.r, frame)
    const sx = Array.isArray(scale) ? scale[0] / 100 : 1
    const sy = Array.isArray(scale) ? scale[1] / 100 : sx
    return [
      `translate(${fmt(position[0])} ${fmt(position[1])})`,
      `rotate(${fmt(rotation || 0)})`,
      `scale(${fmt(sx)} ${fmt(sy)})`,
      `translate(${-fmt(anchor[0])} ${-fmt(anchor[1])})`,
    ].join(' ')
  }

  function valueOf(prop, frame = 0) {
    if (!prop) return [0, 0]
    if (prop.a === 1 && Array.isArray(prop.k)) return keyedValue(prop.k, frame)
    return prop.k
  }

  function keyedValue(keys, frame) {
    if (keys.length === 0) return [0, 0]
    for (let i = 0; i < keys.length - 1; i += 1) {
      const current = keys[i]
      const next = keys[i + 1]
      if (frame < current.t || frame > next.t) continue
      const span = Math.max(1, next.t - current.t)
      const eased = ease((frame - current.t) / span)
      return mix(current.s, next.s, eased)
    }
    return keys[keys.length - 1].s
  }

  function mix(from, to, amount) {
    return from.map((value, index) => value + ((to[index] || 0) - value) * amount)
  }

  function ease(value) {
    const x = Math.max(0, Math.min(1, value))
    return x * x * (3 - (2 * x))
  }

  function rgb(value) {
    if (!Array.isArray(value)) return '#ffffff'
    return `rgb(${Math.round(value[0] * 255)}, ${Math.round(value[1] * 255)}, ${Math.round(value[2] * 255)})`
  }

  function samePoint(a, b) {
    return Math.abs(a[0] - b[0]) < 0.0001 && Math.abs(a[1] - b[1]) < 0.0001
  }

  function fmt(value) {
    return Number.parseFloat(Number(value || 0).toFixed(3))
  }

  function renderSidebar() {
    const runsWithAgents = runs.filter(r => r.status !== 'ended' && r.terminals.length > 0)
    const agentCount = runsWithAgents.reduce((sum, run) => sum + run.terminals.length, 0)
    el.sidebarCount.textContent = String(agentCount)
    el.sidebarEmpty.hidden = runsWithAgents.length > 0 || history.length > 0
    el.sidebarList.innerHTML = ''

    for (const run of runsWithAgents) {
      const group = document.createElement('div')
      group.className = 'run-group'

      const head = document.createElement('div')
      head.className = 'run-head'
      const headBody = document.createElement('div')
      headBody.className = 'run-head-body'
      const name = document.createElement('span')
      name.className = 'run-name'
      name.textContent = run.name
      name.title = `${run.name} · ${run.working_dir}`
      headBody.appendChild(name)
      const meta = document.createElement('span')
      meta.className = 'run-meta'
      meta.textContent = `${modeLabel(run.mode)} · ${run.terminals.length} agent${run.terminals.length === 1 ? '' : 's'}`
      headBody.appendChild(meta)
      head.appendChild(headBody)

      const actions = document.createElement('div')
      actions.className = 'run-actions'
      if (run.status === 'running') {
        const add = document.createElement('button')
        add.className = 'run-action'
        add.type = 'button'
        add.textContent = 'Add agent'
        add.title = `add agent to ${run.name}`
        add.addEventListener('click', () => openAgentDialog(run.id))
        actions.appendChild(add)
      }
      if (run.canStop) {
        const stop = document.createElement('button')
        stop.className = 'run-stop'
        stop.type = 'button'
        stop.textContent = 'Stop'
        stop.title = `stop run ${run.name}`
        stop.addEventListener('click', () => stopRun(run))
        actions.appendChild(stop)
      }
      if (actions.childElementCount > 0) head.appendChild(actions)
      group.appendChild(head)

      for (const agent of run.terminals) group.appendChild(renderCard(run, agent))
      el.sidebarList.appendChild(group)
    }

    if (history.length > 0) {
      const group = document.createElement('div')
      group.className = 'history-group'

      const head = document.createElement('div')
      head.className = 'history-head'
      const title = document.createElement('span')
      title.className = 'history-title'
      title.textContent = 'History'
      head.appendChild(title)
      const count = document.createElement('span')
      count.className = 'history-count'
      count.textContent = `${history.length} archived`
      head.appendChild(count)
      group.appendChild(head)

      for (const record of history) group.appendChild(renderHistoryRecord(record))
      el.sidebarList.appendChild(group)
    }

    updateStageActions()
  }

  function renderHistoryRecord(record) {
    const item = document.createElement('div')
    item.className = 'history-card'
    item.dataset.status = record.status

    const body = document.createElement('div')
    body.className = 'history-body'
    const name = document.createElement('span')
    name.className = 'history-name'
    name.textContent = record.name
    name.title = `${record.name} · ${record.working_dir}`
    body.appendChild(name)
    const meta = document.createElement('span')
    meta.className = 'history-meta'
    const provider = record.root_provider_label || 'no root provider'
    meta.textContent = `${modeLabel(record.mode)} · ${record.status} · ${record.agent_count} agent${record.agent_count === 1 ? '' : 's'} · ${provider}`
    body.appendChild(meta)
    item.appendChild(body)

    const date = document.createElement('span')
    date.className = 'history-date'
    date.textContent = shortIso(record.ended_at || record.archived_at)
    item.appendChild(date)
    return item
  }

  function renderCard(run, agent) {
    const card = document.createElement('div')
    card.className = 'card' + (agent.status === 'ended' ? ' is-ended' : '')
    card.setAttribute('aria-selected', String(agent.id === selectedId))
    card.dataset.status = agent.status
    card.dataset.provider = agent.provider
    card.dataset.attachable = String(agent.canAttach)
    card.style.setProperty('--agent-color', agent.color)

    const open = document.createElement('button')
    open.className = 'card-main'
    open.type = 'button'

    const avatar = document.createElement('span')
    avatar.className = 'avatar'
    avatar.textContent = agent.monogram
    open.appendChild(avatar)

    const body = document.createElement('span')
    body.className = 'card-body'
    const nm = document.createElement('span')
    nm.className = 'card-name'
    nm.textContent = agent.nickname
    const meta = document.createElement('span')
    meta.className = 'card-meta'
    const prov = document.createElement('span')
    prov.className = 'card-provider'
    prov.textContent = agent.provider_label || agent.provider
    meta.appendChild(prov)
    meta.append(document.createTextNode(` · ${agent.role}`))
    if (agent.model) meta.append(document.createTextNode(` · ${agent.model}`))
    body.appendChild(nm)
    body.appendChild(meta)
    open.appendChild(body)
    card.appendChild(open)

    const tail = document.createElement('span')
    tail.className = 'card-tail'
    const dot = document.createElement('span')
    dot.className = 'dot'
    dot.dataset.status = agent.status
    tail.appendChild(dot)
    const status = document.createElement('span')
    status.className = 'card-status'
    status.textContent = agent.status
    tail.appendChild(status)
    if (agent.canKill) {
      const kill = document.createElement('button')
      kill.className = 'card-kill'
      kill.type = 'button'
      kill.setAttribute('aria-label', `close agent ${agent.nickname}`)
      kill.title = `close agent ${agent.nickname}`
      kill.textContent = '×'
      kill.addEventListener('click', () => closeAgent(agent))
      tail.appendChild(kill)
    }
    card.appendChild(tail)

    if (agent.canAttach) {
      open.addEventListener('click', () => attach(agent.id))
    } else {
      open.disabled = true
      card.classList.add('is-disabled')
      open.title = agent.disabledReason || 'agent is unavailable'
    }
    return card
  }

  function setStageStatus(kind, text) {
    if (!kind) { el.stageStatus.hidden = true; return }
    el.stageStatus.hidden = false
    el.stageStatus.dataset.kind = kind
    el.stageStatus.textContent = text
  }

  function updateStageActions() {
    const selected = selectedId ? findAgent(selectedId) : null
    const canAdd = !!selected && selected.run.status === 'running'
    el.stageAddAgent.hidden = !canAdd
    if (canAdd) el.stageAddAgent.title = `add agent to ${selected.run.name}`
  }

  // --- agent attach ---------------------------------------------------------

  function disposeSession() {
    if (!session) return
    try { session.observer.disconnect() } catch { /* not observing */ }
    try { session.ws.close() } catch { /* already closed */ }
    try { session.term.dispose() } catch { /* already disposed */ }
    session = null
  }

  function attach(id) {
    if (session && session.id === id) return
    disposeSession()

    const found = findAgent(id)
    selectedId = id
    renderSidebar()
    el.overlay.hidden = true
    el.stageTitle.textContent = found ? found.terminal.nickname : id
    el.stageSub.textContent = found ? `${modeLabel(found.run.mode)} · ${found.terminal.provider_label || found.terminal.provider} · ${found.run.name}` : ''
    setStageStatus('connecting', 'connecting')

    const term = new Terminal({
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: 13,
      cursorBlink: true,
      theme: TERM_THEME,
      scrollback: 5000,
    })
    const fit = new FitAddon.FitAddon()
    term.loadAddon(fit)
    el.termHost.innerHTML = ''
    term.open(el.termHost)
    fit.fit()

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}/term?id=${encodeURIComponent(id)}`)

    const sendResize = () => {
      if (ws.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify({ t: 'r', c: term.cols, r: term.rows }))
    }
    const observer = new ResizeObserver(() => {
      try { fit.fit() } catch { /* host detached */ }
      sendResize()
    })
    observer.observe(el.termHost)

    session = { id, ws, term, fit, observer }

    ws.onopen = () => { setStageStatus('live', 'live'); fit.fit(); sendResize(); term.focus() }
    ws.onmessage = (e) => {
      let f
      try { f = JSON.parse(e.data) } catch { return }
      if (f.t === 'o') term.write(f.d)
      else if (f.t === 'x') { setStageStatus('closed', 'exited'); term.write(`\r\n\x1b[2m[exited ${f.code}]\x1b[0m\r\n`) }
      else if (f.t === 'e') { setStageStatus('error', 'error'); term.write(`\r\n\x1b[31m[${f.m}]\x1b[0m\r\n`) }
    }
    ws.onerror = () => setStageStatus('error', 'connection error')
    ws.onclose = () => { if (session && session.id === id) setStageStatus('closed', 'disconnected') }
    term.onData((d) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'i', d })) })
  }

  // --- actions --------------------------------------------------------------

  async function closeAgent(agent) {
    if (!confirm(`Close agent "${agent.nickname}"? The running window for this agent will be closed.`)) return
    const selectedWasAgent = agent.id === (session ? session.id : selectedId)
    try {
      await api('POST', `/api/terminals/${encodeURIComponent(agent.id)}/kill`, { confirm: true })
      markAgentEnded(agent.id)
      if (selectedWasAgent) { disposeSession(); showOverlay() }
      else renderSidebar()
      await refreshState()
      if (selectedWasAgent) showOverlay()
    } catch (err) {
      alert(`Could not close agent: ${err.message}`)
    }
  }

  async function stopRun(run) {
    if (!confirm(`Stop run "${run.name}"? Every agent in it will be stopped.`)) return
    const selectedWasInRun = run.terminals.some(agent => agent.id === (session ? session.id : selectedId))
    try {
      await api('POST', `/api/runs/${encodeURIComponent(run.id)}/stop`, { confirm: true })
      markRunStopped(run.id)
      if (selectedWasInRun) { disposeSession(); showOverlay() }
      else renderSidebar()
      await refreshState()
      if (selectedWasInRun) showOverlay()
    } catch (err) {
      alert(`Could not stop run: ${err.message}`)
    }
  }

  function markAgentEnded(agentId) {
    const found = findAgent(agentId)
    if (!found) return
    found.terminal.status = 'ended'
    found.terminal.canAttach = false
    found.terminal.canKill = false
    found.terminal.disabledReason = 'agent has ended'
  }

  function markRunStopped(runId) {
    const run = runs.find(item => item.id === runId)
    if (!run) return
    run.status = 'ended'
    run.canStop = false
    for (const agent of run.terminals) {
      agent.status = 'ended'
      agent.canAttach = false
      agent.canKill = false
      agent.disabledReason = 'agent has ended'
    }
  }

  function showOverlay() {
    selectedId = null
    el.overlay.hidden = false
    el.stageTitle.textContent = 'No agent selected'
    el.stageSub.textContent = 'Pick an agent on the left, or create a run.'
    setStageStatus(null)
    updateStageActions()
    renderSidebar()
  }

  // --- create dialog --------------------------------------------------------

  function resetCreateForm() {
    el.newError.hidden = true
    el.fNickname.value = ''
    el.fRunName.value = ''
    el.fPrompt.value = ''
    el.fCwd.value = ''
  }

  function openRunDialog() {
    createContext = { kind: 'run', runId: '' }
    resetCreateForm()
    syncCreateFields()
    el.dialog.showModal()
    el.fRunName.focus()
  }

  function openAgentDialog(runId) {
    const run = runs.find(item => item.id === runId && item.status === 'running')
    if (!run) {
      alert('This run is no longer active.')
      return
    }
    createContext = { kind: 'agent', runId }
    resetCreateForm()
    syncCreateFields()
    el.dialog.showModal()
    el.fProvider.focus()
  }

  function selectedRunForCreate() {
    if (createContext.kind !== 'agent') return null
    return runs.find(item => item.id === createContext.runId && item.status === 'running') || null
  }

  function selectedCreateMode() {
    const run = selectedRunForCreate()
    if (run) return run.mode || 'spawner'
    return prebetaOrchestrator && el.fMode.value === 'orchestrator' ? 'orchestrator' : 'spawner'
  }

  function syncCreateFields() {
    const addingToRun = createContext.kind === 'agent'
    const run = selectedRunForCreate()
    const mode = selectedCreateMode()
    el.dialog.dataset.intent = addingToRun ? 'agent' : 'run'
    el.dialogTitle.textContent = addingToRun ? 'Add agent' : 'New run'
    el.dialogSubtitle.textContent = addingToRun
      ? 'Add one provider agent to the selected run.'
      : 'Start a run with its first provider agent.'
    el.newSubmit.textContent = addingToRun ? 'Add agent' : 'Create run'
    el.runNameField.hidden = addingToRun
    el.modeField.hidden = !prebetaOrchestrator || addingToRun
    el.cwdField.hidden = addingToRun
    el.targetRunNote.hidden = !addingToRun
    if (addingToRun && run) {
      const count = `${run.terminals.length} agent${run.terminals.length === 1 ? '' : 's'}`
      el.targetRunNote.textContent = `${run.name} · ${modeLabel(run.mode)} · ${count}`
    } else {
      el.targetRunNote.textContent = ''
    }
    el.fNickname.placeholder = addingToRun ? 'reviewer' : 'lead'
    el.fPrompt.placeholder = mode === 'orchestrator'
      ? 'What should this orchestrator agent start working on?'
      : 'What should this agent start working on?'
    renderProviders()
    if (addingToRun && !run) {
      showDialogError('This run is no longer active.')
      return
    }
    if (el.dialog.open && !selectedProviderAvailable()) {
      showDialogError('No installed provider is available for this mode.')
    } else if (el.newError.textContent === 'No installed provider is available for this mode.') {
      el.newError.hidden = true
    }
  }

  async function submitNew(ev) {
    ev.preventDefault()
    el.newError.hidden = true
    const provider = el.fProvider.value
    if (!selectedProviderAvailable()) {
      showDialogError('No installed provider is available for this mode.')
      return
    }
    const run = selectedRunForCreate()
    if (createContext.kind === 'agent' && !run) {
      showDialogError('This run is no longer active.')
      return
    }
    const payload = {
      provider,
      nickname: el.fNickname.value.trim(),
      prompt: el.fPrompt.value,
      run_id: createContext.kind === 'agent' ? createContext.runId : undefined,
      run_name: createContext.kind === 'run' ? el.fRunName.value.trim() || undefined : undefined,
      working_dir: createContext.kind === 'run' ? el.fCwd.value.trim() || undefined : undefined,
      mode: createContext.kind === 'run' ? selectedCreateMode() : undefined,
    }
    el.newSubmit.disabled = true
    try {
      const created = await api('POST', '/api/terminals', payload)
      await refreshState()
      el.dialog.close()
      if (created && created.id) {
        selectedId = created.id
        renderSidebar()
        // give the spawner a moment to create the tmux window before attaching
        setTimeout(() => attach(created.id), 400)
      }
    } catch (err) {
      el.newError.textContent = err.message
      el.newError.hidden = false
    } finally {
      el.newSubmit.disabled = false
    }
  }

  // --- wire up --------------------------------------------------------------

  el.newRunBtn.addEventListener('click', openRunDialog)
  el.emptyNewRun.addEventListener('click', openRunDialog)
  el.stageAddAgent.addEventListener('click', () => {
    const selected = selectedId ? findAgent(selectedId) : null
    if (selected) openAgentDialog(selected.run.id)
  })
  el.newCancel.addEventListener('click', () => el.dialog.close())
  el.fMode.addEventListener('change', syncCreateFields)
  el.form.addEventListener('submit', submitNew)

  function modeLabel(mode) {
    return mode === 'orchestrator' ? 'Orchestrator MCP' : 'Spawner'
  }

  function shortIso(value) {
    if (!value) return 'unknown'
    return `${String(value).replace('T', ' ').slice(0, 16)}Z`
  }

  initBrandDuck()
  loadState().catch((err) => {
    el.sidebarEmpty.hidden = false
    el.sidebarEmpty.querySelector('.empty-body').textContent = `Could not load state: ${err.message}`
  })
  subscribe()
})()
