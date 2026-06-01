// Web client: renders the terminal sidebar from /api/state, keeps it live over the
// /api/events SSE stream, and attaches an xterm.js terminal to a tmux window through
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
    conn: document.getElementById('conn'),
    brandBeta: document.getElementById('brand-beta'),
    stageTitle: document.getElementById('stage-title'),
    stageSub: document.getElementById('stage-sub'),
    stageStatus: document.getElementById('stage-status'),
    overlay: document.getElementById('stage-overlay'),
    termHost: document.getElementById('term-host'),
    newBtn: document.getElementById('new-btn'),
    dialog: document.getElementById('new-dialog'),
    form: document.getElementById('new-form'),
    fProvider: document.getElementById('f-provider'),
    fNickname: document.getElementById('f-nickname'),
    fRun: document.getElementById('f-run'),
    fMode: document.getElementById('f-mode'),
    modeField: document.getElementById('mode-field'),
    fCwd: document.getElementById('f-cwd'),
    cwdField: document.getElementById('cwd-field'),
    fPrompt: document.getElementById('f-prompt'),
    newError: document.getElementById('new-error'),
    newCancel: document.getElementById('new-cancel'),
    newSubmit: document.getElementById('new-submit'),
  }

  let runs = []
  let providers = []
  let prebetaOrchestrator = false
  let selectedId = null
  let session = null // { id, ws, term, fit, observer }

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
    providers = data.providers || []
    runs = data.runs || []
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
          renderSidebar()
        }
      } catch { /* ignore malformed frame */ }
    }
  }

  function setConn(state) {
    el.conn.dataset.state = state
    el.conn.textContent = state === 'down' ? 'offline' : 'live'
  }

  // --- rendering ------------------------------------------------------------

  function findTerminal(id) {
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
      opt.textContent = p.available ? p.id : `${p.id} (not installed)`
      if (mode === 'orchestrator' && !supported) opt.textContent = `${p.id} (spawner only)`
      opt.disabled = !p.available || !supported
      el.fProvider.appendChild(opt)
    }
    const currentOption = [...el.fProvider.options].find(opt => opt.value === current && !opt.disabled)
    const firstAvailable = [...el.fProvider.options].find(opt => !opt.disabled)
    if (currentOption) el.fProvider.value = currentOption.value
    else if (firstAvailable) el.fProvider.value = firstAvailable.value
  }

  function renderSidebar() {
    const withTerminals = runs.filter(r => r.terminals.length > 0)
    el.sidebarEmpty.hidden = withTerminals.length > 0
    el.sidebarList.innerHTML = ''

    for (const run of withTerminals) {
      const group = document.createElement('div')
      group.className = 'run-group'

      const head = document.createElement('div')
      head.className = 'run-head'
      const name = document.createElement('span')
      name.className = 'run-name'
      name.textContent = run.name
      name.title = `${run.name} · ${run.working_dir}`
      head.appendChild(name)
      if (run.canStop) {
        const stop = document.createElement('button')
        stop.className = 'run-stop'
        stop.type = 'button'
        stop.textContent = 'stop run'
        stop.title = `stop run ${run.name}`
        stop.addEventListener('click', () => stopRun(run))
        head.appendChild(stop)
      }
      group.appendChild(head)

      for (const t of run.terminals) group.appendChild(renderCard(run, t))
      el.sidebarList.appendChild(group)
    }
  }

  function renderCard(run, t) {
    const card = document.createElement('button')
    card.className = 'card' + (t.status === 'ended' ? ' is-ended' : '')
    card.type = 'button'
    card.setAttribute('aria-selected', String(t.id === selectedId))

    const avatar = document.createElement('span')
    avatar.className = 'avatar'
    avatar.style.background = t.color
    avatar.textContent = t.monogram
    card.appendChild(avatar)

    const body = document.createElement('span')
    body.className = 'card-body'
    const nm = document.createElement('span')
    nm.className = 'card-name'
    nm.textContent = t.nickname
    const meta = document.createElement('span')
    meta.className = 'card-meta'
    const prov = document.createElement('span')
    prov.className = 'card-provider'
    prov.textContent = t.provider
    meta.appendChild(prov)
    meta.append(document.createTextNode(` · ${t.role} · ${t.status}`))
    body.appendChild(nm)
    body.appendChild(meta)
    card.appendChild(body)

    const tail = document.createElement('span')
    tail.className = 'card-tail'
    const dot = document.createElement('span')
    dot.className = 'dot'
    dot.dataset.status = t.status
    tail.appendChild(dot)
    if (t.canKill) {
      const kill = document.createElement('span')
      kill.className = 'card-kill'
      kill.setAttribute('role', 'button')
      kill.setAttribute('aria-label', `close terminal ${t.nickname}`)
      kill.title = `close terminal ${t.nickname}`
      kill.textContent = '×'
      kill.addEventListener('click', (ev) => { ev.stopPropagation(); killTerminal(t) })
      tail.appendChild(kill)
    }
    card.appendChild(tail)

    if (t.canAttach) {
      card.addEventListener('click', () => attach(t.id))
    } else {
      card.disabled = true
      card.title = t.disabledReason || 'terminal is unavailable'
    }
    return card
  }

  function setStageStatus(kind, text) {
    if (!kind) { el.stageStatus.hidden = true; return }
    el.stageStatus.hidden = false
    el.stageStatus.dataset.kind = kind
    el.stageStatus.textContent = text
  }

  // --- terminal attach ------------------------------------------------------

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

    const found = findTerminal(id)
    selectedId = id
    renderSidebar()
    el.overlay.hidden = true
    el.stageTitle.textContent = found ? found.terminal.nickname : id
    el.stageSub.textContent = found ? `${found.run.mode} · ${found.terminal.provider} · in ${found.run.name}` : ''
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

  async function killTerminal(t) {
    if (!confirm(`Close terminal "${t.nickname}"? Its tmux window will be killed.`)) return
    try {
      await api('POST', `/api/terminals/${encodeURIComponent(t.id)}/kill`, { confirm: true })
      if (session && session.id === t.id) { disposeSession(); showOverlay() }
    } catch (err) {
      alert(`Could not close terminal: ${err.message}`)
    }
  }

  async function stopRun(run) {
    if (!confirm(`Stop run "${run.name}"? Every terminal in it will be killed.`)) return
    try {
      await api('POST', `/api/runs/${encodeURIComponent(run.id)}/stop`, { confirm: true })
      if (session && findTerminal(session.id) === null) { disposeSession(); showOverlay() }
    } catch (err) {
      alert(`Could not stop run: ${err.message}`)
    }
  }

  function showOverlay() {
    selectedId = null
    el.overlay.hidden = false
    el.stageTitle.textContent = 'No terminal selected'
    el.stageSub.textContent = 'Pick a terminal on the left, or create one.'
    setStageStatus(null)
    renderSidebar()
  }

  // --- new terminal dialog --------------------------------------------------

  function openDialog() {
    el.newError.hidden = true
    el.fNickname.value = ''
    el.fPrompt.value = ''
    el.fCwd.value = ''
    populateRunSelect()
    syncCreateFields()
    el.dialog.showModal()
    el.fProvider.focus()
  }

  function populateRunSelect() {
    el.fRun.innerHTML = ''
    const fresh = document.createElement('option')
    fresh.value = ''
    fresh.textContent = 'New run'
    el.fRun.appendChild(fresh)
    for (const run of runs) {
      if (run.status !== 'running') continue
      const opt = document.createElement('option')
      opt.value = run.id
      opt.textContent = prebetaOrchestrator ? `${run.name} · ${run.mode}` : run.name
      el.fRun.appendChild(opt)
    }
  }

  function selectedCreateMode() {
    const run = runs.find(item => item.id === el.fRun.value)
    if (run) return run.mode || 'spawner'
    return prebetaOrchestrator && el.fMode.value === 'orchestrator' ? 'orchestrator' : 'spawner'
  }

  function syncCreateFields() {
    const addingToRun = !!el.fRun.value
    el.modeField.hidden = !prebetaOrchestrator || addingToRun
    el.cwdField.style.display = el.fRun.value ? 'none' : 'flex'
    renderProviders()
  }

  async function submitNew(ev) {
    ev.preventDefault()
    el.newError.hidden = true
    const provider = el.fProvider.value
    if (!provider) return
    const payload = {
      provider,
      nickname: el.fNickname.value.trim(),
      prompt: el.fPrompt.value,
      run_id: el.fRun.value || undefined,
      working_dir: el.fRun.value ? undefined : el.fCwd.value.trim() || undefined,
      mode: el.fRun.value ? undefined : selectedCreateMode(),
    }
    el.newSubmit.disabled = true
    try {
      const created = await api('POST', '/api/terminals', payload)
      el.dialog.close()
      if (created && created.id) {
        selectedId = created.id
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

  el.newBtn.addEventListener('click', openDialog)
  el.newCancel.addEventListener('click', () => el.dialog.close())
  el.fRun.addEventListener('change', syncCreateFields)
  el.fMode.addEventListener('change', syncCreateFields)
  el.form.addEventListener('submit', submitNew)

  loadState().catch((err) => {
    el.sidebarEmpty.hidden = false
    el.sidebarEmpty.querySelector('.empty-body').textContent = `Could not load state: ${err.message}`
  })
  subscribe()
})()
