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

  const WEB_EN = {
    'common.delete': 'Delete',
    'web.beta': 'web · beta',
    'web.prebeta': 'web · pre-beta MCP',
    'web.live': 'live',
    'web.offline': 'offline',
    'web.languageTitle': 'Language',
    'web.activeAgents': 'active agents',
    'web.agents': 'Agents',
    'web.noAgents': 'No agents yet',
    'web.noAgentsBody': 'Create a run first, then add agents as the work grows.',
    'web.noActiveAgents': 'No active agents',
    'web.noActiveAgentsBody': 'Start a new run when you are ready. Ended runs stay in History.',
    'web.noAgentSelected': 'No agent selected',
    'web.noAgentSub': 'Pick an agent on the left, or create a run.',
    'web.addAgent': 'Add agent',
    'web.stop': 'Stop',
    'web.newAgent': 'New agent',
    'web.newRun': 'New run',
    'web.newRunTitle': 'create a new run',
    'web.webAgent': 'web agent',
    'web.noAgentAttached': 'No agent attached',
    'web.overlayBody': 'Select an agent to open its live pane. Closing the browser leaves the run active.',
    'web.unavailableBody': 'This agent does not have a live tmux window to open.',
    'web.newRunSubtitle': 'Create a run and start its first provider agent.',
    'web.addAgentSubtitle': 'Add one provider agent to an active run.',
    'web.createRun': 'Create run',
    'web.run': 'Run',
    'web.runName': 'Run name',
    'web.provider': 'Provider',
    'web.model': 'Model',
    'web.permissionMode': 'Permission mode',
    'web.askFirst': 'Ask first',
    'web.askFirstMeta': 'Keep provider approval prompts',
    'web.skipPrompts': 'Skip prompts',
    'web.skipPromptsMeta': 'Use only in trusted workspaces',
    'web.agentName': 'Agent name',
    'web.optional': 'optional',
    'web.newRunMode': 'New run mode',
    'web.workingDirectory': 'Working directory',
    'web.cwdPlaceholder': 'defaults to the server directory',
    'web.initialPrompt': 'Initial prompt',
    'web.initialPromptOpt': 'optional, typed in on start',
    'web.agentRunHelp': 'Choose the active run that will receive this agent.',
    'web.runNameHelp': 'Shown in the run list and history.',
    'web.providerHelp': 'Choose the provider CLI that will run this agent.',
    'web.modelHelp': 'Provider default is safest when unsure.',
    'web.permissionsHelp': 'Ask first is safer. Skip prompts only in trusted workspaces.',
    'web.agentNameHelp': 'Optional display name and tmux window name.',
    'web.modeHelp': 'Normal runs are direct agent workspaces. Orchestrator MCP is pre-beta.',
    'web.cwdHelp': 'Agents start in this directory.',
    'web.promptHelp': 'Sent to the agent after its window opens.',
    'web.promptPlaceholder': 'What should this agent start working on?',
    'web.orchestratorPromptPlaceholder': 'What should this orchestrator agent start working on?',
    'web.cancel': 'Cancel',
    'web.create': 'Create',
    'web.providerDefault': 'Provider default',
    'web.notInstalled': 'Not installed',
    'web.spawnerOnly': 'Agent run only',
    'web.readyOrchestrator': 'Ready · Orchestrator',
    'web.ready': 'Ready',
    'web.history': 'History',
    'web.archived': 'archived',
    'web.approvalsTitle': 'Pending approvals',
    'web.approve': 'Approve',
    'web.deny': 'Deny',
    'web.noRootProvider': 'no root provider',
    'web.addAgentTitle': 'add agent to {{name}}',
    'web.stopRunTitle': 'stop run {{name}}',
    'web.deleteRunTitle': 'delete stopped run {{name}}',
    'web.deleteHistoryTitle': 'delete archived run {{name}}',
    'web.stopAgentTitle': 'stop agent {{name}}',
    'web.deleteAgentTitle': 'delete stopped agent {{name}}',
    'web.openAgent': 'Open',
    'web.openAgentTitle': 'open agent {{name}}',
    'web.agentUnavailable': 'agent is unavailable',
    'web.noAgentWindow': 'agent has no tmux window',
    'web.noLiveTmuxTarget': 'run tmux session is unavailable',
    'web.unavailable': 'Unavailable',
    'web.addAgentActiveTitle': 'add an agent to an active run',
    'web.createRunFirstTitle': 'create a run before adding agents',
    'web.connecting': 'connecting',
    'web.closed': 'closed',
    'web.exited': 'exited',
    'web.error': 'error',
    'web.connectionError': 'connection error',
    'web.disconnected': 'disconnected',
    'web.stopAgentConfirm': 'Stop agent "{{name}}"? The running window for this agent will be closed.',
    'web.stopAgentError': 'Could not stop agent: {{message}}',
    'web.stopRunConfirm': 'Stop run "{{name}}"? Every agent in it will be stopped.',
    'web.stopRunError': 'Could not stop run: {{message}}',
    'web.deleteRunConfirm': 'Delete stopped run "{{name}}"? A simple history record will be kept.',
    'web.deleteRunError': 'Could not delete stopped run: {{message}}',
    'web.deleteAgentConfirm': 'Delete stopped agent "{{name}}"? This removes the saved agent record.',
    'web.deleteAgentError': 'Could not delete stopped agent: {{message}}',
    'web.deleteHistoryConfirm': 'Delete archived run "{{name}}"? This only removes the saved history record.',
    'web.deleteHistoryError': 'Could not delete archived run: {{message}}',
    'web.agentEnded': 'agent has ended',
    'web.createRunFirst': 'Create a run first. Agents are added inside active runs.',
    'web.runInactive': 'This run is no longer active.',
    'web.noProvider': 'No installed provider is available for this mode.',
    'web.addingTo': 'Adding to {{name}} · {{mode}} · {{count}}',
    'web.oneAgent': '{{count}} agent',
    'web.manyAgents': '{{count}} agents',
    'web.spawner': 'Agent run',
    'web.orchestrator': 'Orchestrator MCP',
    'web.roleRoot': 'root',
    'web.roleWorker': 'worker',
    'web.statusQueued': 'queued',
    'web.statusWorking': 'working',
    'web.statusDone': 'done',
    'web.statusFailed': 'failed',
    'web.statusBlocked': 'blocked',
    'web.statusEnded': 'ended',
    'web.statusStale': 'stale',
    'web.statusRunning': 'running',
    'web.unknown': 'unknown',
    'web.useProvider': 'use {{name}}',
    'web.agentControl': 'Agent control',
    'web.agentControlTitle': 'attach the reevesagents MCP to your CLIs',
    'web.mcpTitle': 'Agent control',
    'web.mcpSubtitle': 'Attach the reevesagents MCP to your CLIs so an agent can spawn and drive other agents.',
    'web.mcpEmpty': 'No MCP-capable CLI was found on this machine.',
    'web.mcpAttachAll': 'Attach all',
    'web.mcpClose': 'Close',
    'web.mcpAttach': 'Attach',
    'web.mcpDetach': 'Detach',
    'web.mcpAttached': 'Attached',
    'web.mcpDetached': 'Not attached',
    'web.mcpManual': 'Manual setup',
    'web.mcpNotInstalled': 'Not installed',
    'web.mcpManualHint': 'add it from this CLI by hand',
    'web.mcpAttachHint': 'add the MCP to this CLI',
    'web.mcpDetachHint': 'remove the MCP from this CLI',
    'web.mcpAttachError': 'Could not attach {{name}}: {{message}}',
    'web.mcpDetachError': 'Could not detach {{name}}: {{message}}',
    'web.mcpAttachAllError': 'Could not attach all: {{message}}',
    'web.mcpLoadError': 'Could not load MCP hosts: {{message}}',
  }

  const el = {
    sidebarList: document.getElementById('sidebar-list'),
    sidebarEmpty: document.getElementById('sidebar-empty'),
    sidebarCount: document.getElementById('sidebar-count'),
    conn: document.getElementById('conn'),
    brandDuck: document.getElementById('brand-duck'),
    brandBeta: document.getElementById('brand-beta'),
    languageLabel: document.getElementById('language-label'),
    languageSelect: document.getElementById('language-select'),
    stageTitle: document.getElementById('stage-title'),
    stageSub: document.getElementById('stage-sub'),
    stageStatus: document.getElementById('stage-status'),
    overlay: document.getElementById('stage-overlay'),
    termWrap: document.getElementById('term-wrap'),
    termHost: document.getElementById('term-host'),
    newAgentBtn: document.getElementById('new-agent-btn'),
    newRunBtn: document.getElementById('new-run-btn'),
    emptyNewRun: document.getElementById('empty-new-run'),
    overlayNewRun: document.getElementById('overlay-new-run'),
    overlayNewAgent: document.getElementById('overlay-new-agent'),
    stageAddAgent: document.getElementById('stage-add-agent'),
    dialog: document.getElementById('new-dialog'),
    dialogTitle: document.getElementById('new-dialog-title'),
    dialogSubtitle: document.getElementById('new-dialog-subtitle'),
    targetRunNote: document.getElementById('target-run-note'),
    createRunTab: document.getElementById('create-run-tab'),
    createAgentTab: document.getElementById('create-agent-tab'),
    form: document.getElementById('new-form'),
    fProvider: document.getElementById('f-provider'),
    providerGrid: document.getElementById('provider-grid'),
    fModel: document.getElementById('f-model'),
    fPermissions: document.getElementById('f-permissions'),
    permissionGrid: document.getElementById('permission-grid'),
    fNickname: document.getElementById('f-nickname'),
    fRunName: document.getElementById('f-run-name'),
    fAgentRun: document.getElementById('f-agent-run'),
    fMode: document.getElementById('f-mode'),
    agentRunField: document.getElementById('agent-run-field'),
    modeField: document.getElementById('mode-field'),
    runNameField: document.getElementById('run-name-field'),
    fCwd: document.getElementById('f-cwd'),
    cwdField: document.getElementById('cwd-field'),
    fPrompt: document.getElementById('f-prompt'),
    newError: document.getElementById('new-error'),
    newCancel: document.getElementById('new-cancel'),
    newSubmit: document.getElementById('new-submit'),
    agentControlBtn: document.getElementById('agent-control-btn'),
    mcpDialog: document.getElementById('mcp-dialog'),
    mcpDialogTitle: document.getElementById('mcp-dialog-title'),
    mcpDialogSubtitle: document.getElementById('mcp-dialog-subtitle'),
    mcpHostList: document.getElementById('mcp-host-list'),
    mcpEmpty: document.getElementById('mcp-empty'),
    mcpError: document.getElementById('mcp-error'),
    mcpAttachAll: document.getElementById('mcp-attach-all'),
    mcpClose: document.getElementById('mcp-close'),
    doctorBtn: document.getElementById('doctor-btn'),
    doctorDialog: document.getElementById('doctor-dialog'),
    doctorList: document.getElementById('doctor-list'),
    doctorError: document.getElementById('doctor-error'),
    doctorRefresh: document.getElementById('doctor-refresh'),
    doctorClose: document.getElementById('doctor-close'),
    aboutBtn: document.getElementById('about-btn'),
    aboutDialog: document.getElementById('about-dialog'),
    aboutList: document.getElementById('about-list'),
    aboutClose: document.getElementById('about-close'),
  }

  let runs = []
  let history = []
  let approvals = []
  let providers = []
  let appVersion = ''
  let language = 'en'
  let languages = []
  let messages = WEB_EN
  let prebetaOrchestrator = false
  let selectedId = null
  let session = null // { id, ws, term, fit, observer }
  let createContext = { kind: 'run', runId: '' }
  let createSubmitting = false
  let mcpHosts = []
  let mcpBusy = false

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
    approvals = data.approvals || []
    appVersion = data.version || ''
    prebetaOrchestrator = data.prebeta && data.prebeta.orchestrator === true
    applyLanguage(data.language)
    renderProviders()
    renderSidebar()
    reconcileCreateDialog()
    reconcileSelectedAgent()
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
        if (Array.isArray(data.approvals)) approvals = data.approvals
        renderSidebar()
        reconcileCreateDialog()
        reconcileSelectedAgent()
      } catch { /* ignore malformed frame */ }
    }
  }

  function setConn(state) {
    el.conn.dataset.state = state
    el.conn.textContent = state === 'down' ? t('web.offline') : t('web.live')
  }

  function t(key, values) {
    let text = messages[key] || WEB_EN[key] || key
    for (const [name, value] of Object.entries(values || {})) {
      text = text.replaceAll(`{{${name}}}`, String(value))
    }
    return text
  }

  function applyLanguage(payload) {
    if (!payload || typeof payload !== 'object') return
    language = payload.current || language
    languages = Array.isArray(payload.languages) ? payload.languages : languages
    messages = { ...WEB_EN, ...(payload.translations || {}) }
    document.documentElement.lang = language
    const current = languages.find(item => item.code === language)
    document.documentElement.dir = current && current.dir === 'rtl' ? 'rtl' : 'ltr'
    renderLanguageSelect()
    applyStaticTranslations()
  }

  function renderLanguageSelect() {
    if (!el.languageSelect) return
    const current = el.languageSelect.value || language
    el.languageSelect.innerHTML = ''
    for (const option of languages) {
      const item = document.createElement('option')
      item.value = option.code
      item.textContent = `${option.flag} ${option.nativeName}`
      item.title = option.name
      el.languageSelect.appendChild(item)
    }
    el.languageSelect.value = [...el.languageSelect.options].some(option => option.value === current) ? current : language
  }

  function applyStaticTranslations() {
    el.brandBeta.textContent = prebetaOrchestrator ? t('web.prebeta') : t('web.beta')
    el.languageLabel.textContent = t('web.languageTitle')
    el.languageSelect.setAttribute('aria-label', t('web.languageTitle'))
    el.languageSelect.parentElement.title = t('web.languageTitle')
    el.newAgentBtn.textContent = t('web.newAgent')
    el.newRunBtn.textContent = t('web.newRun')
    el.newRunBtn.title = t('web.newRunTitle')
    el.agentControlBtn.textContent = t('web.agentControl')
    el.agentControlBtn.title = t('web.agentControlTitle')
    el.mcpDialogTitle.textContent = t('web.mcpTitle')
    el.mcpDialogSubtitle.textContent = t('web.mcpSubtitle')
    el.mcpEmpty.textContent = t('web.mcpEmpty')
    el.mcpAttachAll.textContent = t('web.mcpAttachAll')
    el.mcpClose.textContent = t('web.mcpClose')
    if (el.mcpDialog.open) renderMcpHosts()
    el.emptyNewRun.textContent = t('web.newRun')
    el.overlayNewRun.textContent = t('web.newRun')
    el.overlayNewAgent.textContent = t('web.newAgent')
    el.stageAddAgent.textContent = t('web.addAgent')
    document.querySelector('.sidebar-title').textContent = t('web.agents')
    document.querySelector('.sidebar-kicker').textContent = t('web.activeAgents')
    document.querySelector('.empty-title').textContent = t('web.noAgents')
    document.querySelector('.empty-body').textContent = t('web.noAgentsBody')
    document.querySelector('.overlay-eyebrow').textContent = t('web.webAgent')
    if (!selectedId) {
      document.querySelector('.overlay-title').textContent = t('web.noAgentAttached')
      document.querySelector('.overlay-body').textContent = t('web.overlayBody')
    } else {
      const found = findAgent(selectedId)
      if (found && !found.terminal.canAttach) {
        setOverlayCopy(disabledReasonLabel(found.terminal), t('web.unavailableBody'))
        setStageStatus('closed', disabledReasonLabel(found.terminal))
      }
    }
    el.createRunTab.textContent = t('web.newRun')
    el.createAgentTab.textContent = t('web.newAgent')
    document.querySelector('#agent-run-field .field-label').textContent = t('web.run')
    document.querySelector('#run-name-field .field-label').textContent = t('web.runName')
    document.querySelector('.provider-field .field-label').textContent = t('web.provider')
    document.querySelector('.model-field .field-label').textContent = t('web.model')
    document.querySelector('.permissions-field .field-label').textContent = t('web.permissionMode')
    document.querySelector('[data-permission="ask"] .permission-title').textContent = t('web.askFirst')
    document.querySelector('[data-permission="ask"] .permission-meta').textContent = t('web.askFirstMeta')
    document.querySelector('[data-permission="skip"] .permission-title').textContent = t('web.skipPrompts')
    document.querySelector('[data-permission="skip"] .permission-meta').textContent = t('web.skipPromptsMeta')
    document.querySelector('#f-permissions option[value="ask"]').textContent = t('web.askFirst')
    document.querySelector('#f-permissions option[value="skip"]').textContent = t('web.skipPrompts')
    document.querySelector('#agent-name-field .field-label').innerHTML = `${t('web.agentName')} <span class="field-opt">${t('web.optional')}</span>`
    document.querySelector('#mode-field .field-label').textContent = t('web.newRunMode')
    document.querySelector('#f-mode option[value="spawner"]').textContent = t('web.spawner')
    document.querySelector('#f-mode option[value="orchestrator"]').textContent = `${t('web.orchestrator')} · pre-beta`
    document.querySelector('#cwd-field .field-label').textContent = t('web.workingDirectory')
    document.querySelector('#f-cwd').placeholder = t('web.cwdPlaceholder')
    document.querySelector('#prompt-field .field-label').innerHTML = `${t('web.initialPrompt')} <span class="field-opt">${t('web.initialPromptOpt')}</span>`
    setText('#agent-run-help', t('web.agentRunHelp'))
    setText('#run-name-help', t('web.runNameHelp'))
    setText('#provider-help', t('web.providerHelp'))
    setText('#model-help', t('web.modelHelp'))
    setText('#permissions-help', t('web.permissionsHelp'))
    setText('#agent-name-help', t('web.agentNameHelp'))
    setText('#mode-help', t('web.modeHelp'))
    setText('#cwd-help', t('web.cwdHelp'))
    setText('#prompt-help', t('web.promptHelp'))
    el.newCancel.textContent = t('web.cancel')
    syncCreateFields()
    if (!selectedId) {
      el.stageTitle.textContent = t('web.noAgentSelected')
      el.stageSub.textContent = t('web.noAgentSub')
    }
    renderSidebar()
  }

  function setText(selector, value) {
    const node = document.querySelector(selector)
    if (node) node.textContent = value
  }

  // --- rendering ------------------------------------------------------------

  function findAgent(id) {
    for (const run of runs) {
      for (const t of run.terminals) if (t.id === id) return { run, terminal: t }
    }
    return null
  }

  function runningRuns() {
    return runs.filter(run => run.status === 'running')
  }

  function preferredRunId() {
    const selected = selectedId ? findAgent(selectedId) : null
    if (selected && selected.run.status === 'running') return selected.run.id
    const first = runningRuns()[0]
    return first ? first.id : ''
  }

  function providerById(id) {
    return providers.find(provider => provider.id === id) || null
  }

  function providerColor(id) {
    const provider = providerById(id)
    return provider ? provider.color : '#7eb8f5'
  }

  function renderProviders() {
    const current = el.fProvider.value
    const mode = selectedCreateMode()
    el.fProvider.innerHTML = ''
    el.providerGrid.innerHTML = ''
    for (const p of providers) {
      const opt = document.createElement('option')
      opt.value = p.id
      const supported = mode !== 'orchestrator' || p.orchestrator === true
      opt.textContent = p.available ? p.name : `${p.name} (${t('web.notInstalled')})`
      if (mode === 'orchestrator' && !supported) opt.textContent = `${p.name} (${t('web.spawnerOnly')})`
      opt.disabled = !p.available || !supported
      el.fProvider.appendChild(opt)

      const choice = document.createElement('button')
      choice.className = 'provider-option'
      choice.type = 'button'
      choice.role = 'option'
      choice.dataset.provider = p.id
      choice.style.setProperty('--provider-color', p.color)
      choice.disabled = opt.disabled
      choice.title = opt.disabled ? opt.textContent : t('web.useProvider', { name: p.name })
      choice.addEventListener('click', () => selectProvider(p.id))
      choice.addEventListener('keydown', (ev) => handleProviderKeydown(ev, p.id))

      const swatch = document.createElement('span')
      swatch.className = 'provider-swatch'
      choice.appendChild(swatch)

      const body = document.createElement('span')
      body.className = 'provider-body'
      const name = document.createElement('span')
      name.className = 'provider-name'
      name.textContent = p.name
      body.appendChild(name)
      const meta = document.createElement('span')
      meta.className = 'provider-meta'
      meta.textContent = providerMeta(p, supported)
      body.appendChild(meta)
      choice.appendChild(body)
      el.providerGrid.appendChild(choice)
    }
    const currentOption = [...el.fProvider.options].find(opt => opt.value === current && !opt.disabled)
    const firstAvailable = [...el.fProvider.options].find(opt => !opt.disabled)
    if (currentOption) el.fProvider.value = currentOption.value
    else if (firstAvailable) el.fProvider.value = firstAvailable.value
    updateProviderSelection()
    renderModels()
    updateCreateSubmitState()
  }

  function providerMeta(provider, supported) {
    if (!provider.available) return t('web.notInstalled')
    if (!supported) return t('web.spawnerOnly')
    if (selectedCreateMode() === 'orchestrator' && provider.orchestrator) return t('web.readyOrchestrator')
    return t('web.ready')
  }

  function selectProvider(providerId) {
    const option = [...el.fProvider.options].find(item => item.value === providerId)
    if (!option || option.disabled) return
    el.fProvider.value = providerId
    updateProviderSelection()
    renderModels()
    updateCreateSubmitState()
  }

  function handleProviderKeydown(ev, providerId) {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault()
      selectProvider(providerId)
      return
    }
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown' || ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') {
      ev.preventDefault()
      focusProvider(providerId, ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : -1)
    }
  }

  function focusProvider(providerId, delta) {
    const choices = [...el.providerGrid.querySelectorAll('.provider-option')].filter(option => !option.disabled)
    if (choices.length === 0) return
    const currentIdx = Math.max(0, choices.findIndex(option => option.dataset.provider === providerId))
    const next = choices[(currentIdx + delta + choices.length) % choices.length]
    if (next) next.focus()
  }

  function updateProviderSelection() {
    const selected = providerById(el.fProvider.value)
    if (selected) el.dialog.style.setProperty('--selected-provider-color', selected.color)
    else el.dialog.style.removeProperty('--selected-provider-color')
    for (const option of el.providerGrid.querySelectorAll('.provider-option')) {
      const active = option.dataset.provider === el.fProvider.value && !option.disabled
      option.setAttribute('aria-selected', String(active))
      option.tabIndex = active ? 0 : -1
    }
  }

  function modelLabel(model) {
    return model || t('web.providerDefault')
  }

  function agentCountLabel(count) {
    return count === 1 ? t('web.oneAgent', { count }) : t('web.manyAgents', { count })
  }

  function renderModels() {
    const selected = providerById(el.fProvider.value)
    const current = el.fModel.value
    el.fModel.innerHTML = ''
    const models = selected && Array.isArray(selected.models) ? selected.models : ['']
    for (const model of models) {
      const opt = document.createElement('option')
      opt.value = model
      opt.textContent = modelLabel(model)
      el.fModel.appendChild(opt)
    }
    const hasCurrent = [...el.fModel.options].some(opt => opt.value === current)
    if (hasCurrent) el.fModel.value = current
    else el.fModel.value = ''
    el.fModel.disabled = !selectedProviderAvailable()
    updateCreateSubmitState()
  }

  function updatePermissionSelection() {
    for (const option of el.permissionGrid.querySelectorAll('.permission-option')) {
      const active = option.dataset.permission === el.fPermissions.value
      option.setAttribute('aria-checked', String(active))
      option.tabIndex = active ? 0 : -1
    }
  }

  function selectPermission(value) {
    if (value !== 'ask' && value !== 'skip') return
    el.fPermissions.value = value
    updatePermissionSelection()
  }

  function handlePermissionKeydown(ev) {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault()
      selectPermission(ev.currentTarget.dataset.permission)
      return
    }
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowDown' && ev.key !== 'ArrowLeft' && ev.key !== 'ArrowUp') return
    ev.preventDefault()
    const values = ['ask', 'skip']
    const currentIdx = Math.max(0, values.indexOf(el.fPermissions.value))
    const delta = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : -1
    const next = values[(currentIdx + delta + values.length) % values.length]
    selectPermission(next)
    const nextButton = el.permissionGrid.querySelector(`[data-permission="${next}"]`)
    if (nextButton) nextButton.focus()
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
    el.sidebarEmpty.hidden = runsWithAgents.length > 0
    if (!el.sidebarEmpty.hidden) {
      document.querySelector('.empty-title').textContent = history.length > 0 ? t('web.noActiveAgents') : t('web.noAgents')
      document.querySelector('.empty-body').textContent = history.length > 0 ? t('web.noActiveAgentsBody') : t('web.noAgentsBody')
    }
    el.sidebarList.innerHTML = ''

    if (approvals.length > 0) {
      const group = document.createElement('div')
      group.className = 'approvals-group'
      const head = document.createElement('div')
      head.className = 'approvals-head'
      const title = document.createElement('span')
      title.className = 'approvals-title'
      title.textContent = t('web.approvalsTitle')
      head.appendChild(title)
      const count = document.createElement('span')
      count.className = 'approvals-count'
      count.textContent = String(approvals.length)
      head.appendChild(count)
      group.appendChild(head)
      for (const approval of approvals) group.appendChild(renderApproval(approval))
      el.sidebarList.appendChild(group)
    }

    for (const run of runsWithAgents) {
      const group = document.createElement('div')
      group.className = 'run-group'
      const rootColor = run.terminals[0] ? run.terminals[0].color : '#7eb8f5'
      group.style.setProperty('--run-color', rootColor)

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
      meta.textContent = `${statusLabel(run.status)} · ${modeLabel(run.mode)} · ${agentCountLabel(run.terminals.length)}`
      headBody.appendChild(meta)
      head.appendChild(headBody)

      const actions = document.createElement('div')
      actions.className = 'run-actions'
      if (run.status === 'running') {
        const add = document.createElement('button')
        add.className = 'run-action'
        add.type = 'button'
        add.textContent = t('web.addAgent')
        add.title = t('web.addAgentTitle', { name: run.name })
        add.addEventListener('click', () => openAgentDialog(run.id))
        actions.appendChild(add)
      }
      if (run.canStop) {
        const stop = document.createElement('button')
        stop.className = 'run-stop'
        stop.type = 'button'
        stop.textContent = t('web.stop')
        stop.title = t('web.stopRunTitle', { name: run.name })
        stop.addEventListener('click', () => stopRun(run))
        actions.appendChild(stop)
      }
      if (run.canDelete) {
        const del = document.createElement('button')
        del.className = 'run-delete'
        del.type = 'button'
        del.textContent = t('common.delete')
        del.title = t('web.deleteRunTitle', { name: run.name })
        del.addEventListener('click', () => deleteRun(run))
        actions.appendChild(del)
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
      title.textContent = t('web.history')
      head.appendChild(title)
      const count = document.createElement('span')
      count.className = 'history-count'
      count.textContent = `${history.length} ${t('web.archived')}`
      head.appendChild(count)
      group.appendChild(head)

      for (const record of history) group.appendChild(renderHistoryRecord(record))
      el.sidebarList.appendChild(group)
    }

    updateStageActions()
    updateCreateActions()
  }

  function renderApproval(approval) {
    const item = document.createElement('div')
    item.className = 'approval-card'
    item.dataset.risk = approval.risk
    if (approval.color) item.style.setProperty('--run-color', approval.color)

    const body = document.createElement('div')
    body.className = 'approval-body'
    const action = document.createElement('span')
    action.className = 'approval-action'
    action.textContent = approval.action
    action.title = approval.action
    body.appendChild(action)
    const meta = document.createElement('span')
    meta.className = 'approval-meta'
    meta.textContent = `${approval.agent_nickname} · ${approval.run_name} · ${approval.risk}`
    body.appendChild(meta)
    if (approval.summary) {
      const summary = document.createElement('span')
      summary.className = 'approval-summary'
      summary.textContent = approval.summary
      body.appendChild(summary)
    }
    item.appendChild(body)

    const actions = document.createElement('div')
    actions.className = 'approval-actions'
    const approve = document.createElement('button')
    approve.className = 'approval-approve'
    approve.type = 'button'
    approve.textContent = t('web.approve')
    approve.addEventListener('click', () => resolveApproval(approval, 'approved'))
    actions.appendChild(approve)
    const deny = document.createElement('button')
    deny.className = 'approval-deny'
    deny.type = 'button'
    deny.textContent = t('web.deny')
    deny.addEventListener('click', () => resolveApproval(approval, 'denied'))
    actions.appendChild(deny)
    item.appendChild(actions)
    return item
  }

  async function resolveApproval(approval, decision) {
    try {
      await api('POST', `/api/approvals/${encodeURIComponent(approval.id)}/resolve`, { decision })
      approvals = approvals.filter(item => item.id !== approval.id)
      renderSidebar()
      await refreshState()
    } catch (err) {
      alert(err.message)
    }
  }

  function renderHistoryRecord(record) {
    const item = document.createElement('div')
    item.className = 'history-card'
    item.dataset.status = record.status
    if (record.root_provider) item.style.setProperty('--run-color', providerColor(record.root_provider))

    const body = document.createElement('div')
    body.className = 'history-body'
    const name = document.createElement('span')
    name.className = 'history-name'
    name.textContent = record.name
    name.title = `${record.name} · ${record.working_dir}`
    body.appendChild(name)
    const meta = document.createElement('span')
    meta.className = 'history-meta'
    const provider = record.root_provider_label || t('web.noRootProvider')
    meta.textContent = `${modeLabel(record.mode)} · ${statusLabel(record.status)} · ${agentCountLabel(record.agent_count)} · ${provider}`
    body.appendChild(meta)
    item.appendChild(body)

    const date = document.createElement('span')
    date.className = 'history-date'
    date.textContent = shortIso(record.ended_at || record.archived_at)
    item.appendChild(date)
    const del = document.createElement('button')
    del.className = 'history-delete'
    del.type = 'button'
    del.textContent = t('common.delete')
    del.title = t('web.deleteHistoryTitle', { name: record.name })
    del.addEventListener('click', () => deleteHistoryRecord(record))
    item.appendChild(del)
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
    prov.style.setProperty('--provider-color', agent.color)
    meta.appendChild(prov)
    meta.append(document.createTextNode(` · ${roleLabel(agent.role)}`))
    if (agent.model) meta.append(document.createTextNode(` · ${agent.model}`))
    body.appendChild(nm)
    body.appendChild(meta)
    if (agent.task) {
      const task = document.createElement('span')
      task.className = 'card-task'
      task.textContent = agent.task
      task.title = agent.task
      body.appendChild(task)
    }
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
    status.textContent = statusLabel(agent.status)
    tail.appendChild(status)
    const availability = document.createElement('span')
    availability.className = 'card-open-hint'
    availability.textContent = agent.canAttach ? t('web.openAgent') : disabledReasonLabel(agent)
    availability.title = agent.canAttach
      ? t('web.openAgentTitle', { name: agent.nickname })
      : disabledReasonLabel(agent)
    tail.appendChild(availability)
    if (agent.canKill || agent.canDelete) {
      const lifecycle = document.createElement('button')
      const isDelete = agent.canDelete
      lifecycle.className = 'card-agent-action'
      lifecycle.dataset.kind = isDelete ? 'delete' : 'stop'
      lifecycle.type = 'button'
      lifecycle.setAttribute('aria-label', t(isDelete ? 'web.deleteAgentTitle' : 'web.stopAgentTitle', { name: agent.nickname }))
      lifecycle.title = t(isDelete ? 'web.deleteAgentTitle' : 'web.stopAgentTitle', { name: agent.nickname })
      lifecycle.textContent = isDelete ? t('common.delete') : t('web.stop')
      lifecycle.addEventListener('click', () => isDelete ? deleteAgentRecord(agent) : stopAgent(agent))
      tail.appendChild(lifecycle)
    }
    card.appendChild(tail)

    if (agent.canAttach) {
      open.title = t('web.openAgentTitle', { name: agent.nickname })
      open.addEventListener('click', () => attach(agent.id))
    } else {
      open.disabled = true
      card.classList.add('is-disabled')
      open.title = disabledReasonLabel(agent)
    }
    return card
  }

  function disabledReasonLabel(agent) {
    if (!agent) return t('web.unavailable')
    if (agent.status === 'ended' || agent.disabledReason === 'agent has ended') return t('web.agentEnded')
    if (agent.disabledReason === 'run tmux session is unavailable') return t('web.noLiveTmuxTarget')
    if (agent.disabledReason === 'agent has no tmux window' || agent.headless || !agent.hasWindow) return t('web.noAgentWindow')
    return agent.disabledReason || t('web.unavailable')
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
    if (canAdd) el.stageAddAgent.title = t('web.addAgentTitle', { name: selected.run.name })
  }

  function updateCreateActions() {
    const hasRunningRun = runningRuns().length > 0
    el.newAgentBtn.disabled = !hasRunningRun
    el.newAgentBtn.title = hasRunningRun ? t('web.addAgentActiveTitle') : t('web.createRunFirstTitle')
    el.overlayNewAgent.hidden = !hasRunningRun
    el.createAgentTab.disabled = !hasRunningRun
    updateCreateSubmitState()
  }

  function updateCreateSubmitState() {
    const validRunTarget = createContext.kind !== 'agent' || !!selectedRunForCreate()
    el.newSubmit.disabled = createSubmitting || !selectedProviderAvailable() || !validRunTarget
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
    const found = findAgent(id)
    if (found && !found.terminal.canAttach) {
      showUnavailableAgent(id, found)
      return
    }
    disposeSession()

    selectedId = id
    renderSidebar()
    el.overlay.hidden = true
    el.stageTitle.textContent = found ? found.terminal.nickname : id
    el.stageSub.textContent = found ? `${modeLabel(found.run.mode)} · ${found.terminal.provider_label || found.terminal.provider} · ${found.run.name}` : ''
    if (found) el.termWrap.style.setProperty('--agent-color', found.terminal.color)
    setStageStatus('connecting', t('web.connecting'))

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
    let finalState = null

    ws.onopen = () => { setStageStatus('live', t('web.live')); fit.fit(); sendResize(); term.focus() }
    ws.onmessage = (e) => {
      let f
      try { f = JSON.parse(e.data) } catch { return }
      if (f.t === 'o') term.write(f.d)
      else if (f.t === 'x') { finalState = 'exited'; setStageStatus('closed', t('web.exited')); term.write(`\r\n\x1b[2m[${t('web.exited')} ${f.code}]\x1b[0m\r\n`) }
      else if (f.t === 'e') { finalState = 'error'; setStageStatus('error', t('web.error')); term.write(`\r\n\x1b[31m[${f.m}]\x1b[0m\r\n`) }
    }
    ws.onerror = () => { finalState = 'error'; setStageStatus('error', t('web.connectionError')) }
    ws.onclose = () => { if (session && session.id === id && !finalState) setStageStatus('closed', t('web.disconnected')) }
    term.onData((d) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'i', d })) })
  }

  function showUnavailableAgent(id, found) {
    disposeSession()
    selectedId = id
    renderSidebar()
    el.termHost.innerHTML = ''
    el.overlay.hidden = false
    if (!found) {
      showOverlay()
      return
    }
    el.stageTitle.textContent = found.terminal.nickname
    el.stageSub.textContent = `${modeLabel(found.run.mode)} · ${found.terminal.provider_label || found.terminal.provider} · ${found.run.name}`
    el.termWrap.style.setProperty('--agent-color', found.terminal.color)
    setOverlayCopy(disabledReasonLabel(found.terminal), t('web.unavailableBody'))
    setStageStatus('closed', disabledReasonLabel(found.terminal))
    updateStageActions()
  }

  function reconcileSelectedAgent() {
    if (!selectedId) return
    const found = findAgent(selectedId)
    if (!found) {
      disposeSession()
      showOverlay()
      return
    }
    if (!found.terminal.canAttach) {
      showUnavailableAgent(selectedId, found)
    }
  }

  // --- actions --------------------------------------------------------------

  async function stopAgent(agent) {
    if (!confirm(t('web.stopAgentConfirm', { name: agent.nickname }))) return
    const selectedWasAgent = agent.id === (session ? session.id : selectedId)
    try {
      await api('POST', `/api/terminals/${encodeURIComponent(agent.id)}/kill`, { confirm: true })
      markAgentEnded(agent.id)
      if (selectedWasAgent) { disposeSession(); showOverlay() }
      else renderSidebar()
      await refreshState()
      if (selectedWasAgent) showOverlay()
    } catch (err) {
      alert(t('web.stopAgentError', { message: err.message }))
    }
  }

  async function stopRun(run) {
    if (!confirm(t('web.stopRunConfirm', { name: run.name }))) return
    const selectedWasInRun = run.terminals.some(agent => agent.id === (session ? session.id : selectedId))
    try {
      await api('POST', `/api/runs/${encodeURIComponent(run.id)}/stop`, { confirm: true })
      markRunStopped(run.id)
      if (selectedWasInRun) { disposeSession(); showOverlay() }
      else renderSidebar()
      await refreshState()
      if (selectedWasInRun) showOverlay()
    } catch (err) {
      alert(t('web.stopRunError', { message: err.message }))
    }
  }

  async function deleteRun(run) {
    if (!confirm(t('web.deleteRunConfirm', { name: run.name }))) return
    const selectedWasInRun = run.terminals.some(agent => agent.id === (session ? session.id : selectedId))
    try {
      await api('POST', `/api/runs/${encodeURIComponent(run.id)}/delete`, { confirm: true })
      runs = runs.filter(item => item.id !== run.id)
      if (selectedWasInRun) { disposeSession(); showOverlay() }
      else renderSidebar()
      await refreshState()
      if (selectedWasInRun) showOverlay()
    } catch (err) {
      alert(t('web.deleteRunError', { message: err.message }))
    }
  }

  async function deleteAgentRecord(agent) {
    if (!confirm(t('web.deleteAgentConfirm', { name: agent.nickname }))) return
    const selectedWasAgent = agent.id === (session ? session.id : selectedId)
    try {
      await api('POST', `/api/terminals/${encodeURIComponent(agent.id)}/delete`, { confirm: true })
      for (const run of runs) run.terminals = run.terminals.filter(item => item.id !== agent.id)
      if (selectedWasAgent) { disposeSession(); showOverlay() }
      else renderSidebar()
      await refreshState()
      if (selectedWasAgent) showOverlay()
    } catch (err) {
      alert(t('web.deleteAgentError', { message: err.message }))
    }
  }

  async function deleteHistoryRecord(record) {
    if (!confirm(t('web.deleteHistoryConfirm', { name: record.name }))) return
    try {
      await api('POST', `/api/history/${encodeURIComponent(record.id)}/delete`, { confirm: true })
      history = history.filter(item => item.id !== record.id)
      renderSidebar()
      await refreshState()
    } catch (err) {
      alert(t('web.deleteHistoryError', { message: err.message }))
    }
  }

  function markAgentEnded(agentId) {
    const found = findAgent(agentId)
    if (!found) return
    found.terminal.status = 'ended'
    found.terminal.canAttach = false
    found.terminal.canKill = false
    found.terminal.canDelete = true
    found.terminal.disabledReason = t('web.agentEnded')
    if (!found.run.terminals.some(agent => agent.status !== 'ended')) {
      found.run.status = 'ended'
      found.run.canStop = false
      found.run.canDelete = true
    }
  }

  function markRunStopped(runId) {
    const run = runs.find(item => item.id === runId)
    if (!run) return
    run.status = 'ended'
    run.canStop = false
    run.canDelete = true
    for (const agent of run.terminals) {
      agent.status = 'ended'
      agent.canAttach = false
      agent.canKill = false
      agent.canDelete = true
      agent.disabledReason = t('web.agentEnded')
    }
  }

  function showOverlay() {
    selectedId = null
    el.overlay.hidden = false
    setOverlayCopy(t('web.noAgentAttached'), t('web.overlayBody'))
    el.termWrap.style.removeProperty('--agent-color')
    el.stageTitle.textContent = t('web.noAgentSelected')
    el.stageSub.textContent = t('web.noAgentSub')
    setStageStatus(null)
    updateStageActions()
    renderSidebar()
  }

  function setOverlayCopy(title, body) {
    setText('.overlay-title', title)
    setText('.overlay-body', body)
  }

  // --- create dialog --------------------------------------------------------

  function resetCreateForm() {
    el.newError.hidden = true
    el.fNickname.value = ''
    el.fRunName.value = ''
    el.fModel.value = ''
    el.fPermissions.value = 'ask'
    el.fPrompt.value = ''
    el.fCwd.value = ''
    updatePermissionSelection()
  }

  function openRunDialog() {
    createContext = { kind: 'run', runId: '' }
    resetCreateForm()
    syncCreateFields()
    el.dialog.showModal()
    el.fRunName.focus()
  }

  function openAgentDialog(runId) {
    const targetRunId = runId || preferredRunId()
    const run = runs.find(item => item.id === targetRunId && item.status === 'running')
    if (!run && runningRuns().length === 0) {
      openRunDialog()
      showDialogError(t('web.createRunFirst'))
      return
    }
    if (!run) {
      alert(t('web.runInactive'))
      return
    }
    createContext = { kind: 'agent', runId: run.id }
    resetCreateForm()
    syncCreateFields()
    el.dialog.showModal()
    el.fAgentRun.focus()
  }

  function populateAgentRunSelect(preferred) {
    const current = preferred || el.fAgentRun.value || preferredRunId()
    el.fAgentRun.innerHTML = ''
    for (const run of runningRuns()) {
      const opt = document.createElement('option')
      opt.value = run.id
      const count = agentCountLabel(run.terminals.length)
      opt.textContent = `${run.name} · ${modeLabel(run.mode)} · ${count}`
      el.fAgentRun.appendChild(opt)
    }
    const hasCurrent = [...el.fAgentRun.options].some(opt => opt.value === current)
    if (hasCurrent) el.fAgentRun.value = current
    else if (el.fAgentRun.options.length > 0) el.fAgentRun.selectedIndex = 0
    createContext.runId = el.fAgentRun.value || ''
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
    if (addingToRun) populateAgentRunSelect(createContext.runId)
    const run = selectedRunForCreate()
    const mode = selectedCreateMode()
    el.dialog.dataset.intent = addingToRun ? 'agent' : 'run'
    el.dialogTitle.textContent = addingToRun ? t('web.addAgent') : t('web.newRun')
    el.dialogSubtitle.textContent = addingToRun
      ? t('web.addAgentSubtitle')
      : t('web.newRunSubtitle')
    el.newSubmit.textContent = addingToRun ? t('web.addAgent') : t('web.createRun')
    el.createRunTab.setAttribute('aria-selected', String(!addingToRun))
    el.createAgentTab.setAttribute('aria-selected', String(addingToRun))
    el.agentRunField.hidden = !addingToRun
    el.runNameField.hidden = addingToRun
    el.modeField.hidden = !prebetaOrchestrator || addingToRun
    el.cwdField.hidden = addingToRun
    el.targetRunNote.hidden = !addingToRun
    if (addingToRun && run) {
      const count = agentCountLabel(run.terminals.length)
      el.targetRunNote.textContent = t('web.addingTo', { name: run.name, mode: modeLabel(run.mode), count })
    } else {
      el.targetRunNote.textContent = ''
    }
    el.fNickname.placeholder = addingToRun ? 'reviewer' : 'lead'
    el.fPrompt.placeholder = mode === 'orchestrator'
      ? t('web.orchestratorPromptPlaceholder')
      : t('web.promptPlaceholder')
    renderProviders()
    updatePermissionSelection()
    updateCreateActions()
    if (addingToRun && !run) {
      showDialogError(t('web.runInactive'))
      return
    }
    if (el.dialog.open && !selectedProviderAvailable()) {
      showDialogError(t('web.noProvider'))
    } else if (el.newError.textContent === t('web.noProvider')) {
      el.newError.hidden = true
    }
    updateCreateSubmitState()
  }

  function reconcileCreateDialog() {
    if (el.dialog.open && createContext.kind === 'agent') syncCreateFields()
  }

  async function submitNew(ev) {
    ev.preventDefault()
    el.newError.hidden = true
    const provider = el.fProvider.value
    if (!selectedProviderAvailable()) {
      showDialogError(t('web.noProvider'))
      return
    }
    const run = selectedRunForCreate()
    if (createContext.kind === 'agent' && !run) {
      showDialogError(t('web.runInactive'))
      return
    }
    const payload = {
      provider,
      model: el.fModel.value,
      permissions: el.fPermissions.value,
      nickname: el.fNickname.value.trim(),
      prompt: el.fPrompt.value,
      run_id: createContext.kind === 'agent' ? createContext.runId : undefined,
      run_name: createContext.kind === 'run' ? el.fRunName.value.trim() || undefined : undefined,
      working_dir: createContext.kind === 'run' ? el.fCwd.value.trim() || undefined : undefined,
      mode: createContext.kind === 'run' ? selectedCreateMode() : undefined,
    }
    createSubmitting = true
    updateCreateSubmitState()
    try {
      const created = await api('POST', '/api/terminals', payload)
      await refreshState()
      el.dialog.close()
      if (created && created.id) {
        selectedId = created.id
        renderSidebar()
        setTimeout(async () => {
          try { await refreshState() } catch { /* keep local state */ }
          const found = findAgent(created.id)
          if (found && found.terminal.canAttach) attach(created.id)
          else showUnavailableAgent(created.id, found)
        }, 400)
      }
    } catch (err) {
      el.newError.textContent = err.message
      el.newError.hidden = false
    } finally {
      createSubmitting = false
      updateCreateSubmitState()
    }
  }

  // --- agent control (MCP installer) ----------------------------------------

  function openAboutDialog() {
    el.aboutList.innerHTML = ''
    const rows = [
      ['Version', appVersion || 'unknown'],
      ['Purpose', 'Local tmux-first workspace manager for AI CLI agents'],
      ['Interface', 'Ink TUI, Web UI, and agent run CLI'],
      ['Runtime', 'tmux sessions and provider CLI windows'],
      ['Providers', providers.map(p => p.name).join(', ') || 'none detected'],
      ['License', 'Apache-2.0'],
    ]
    for (const [label, value] of rows) {
      const row = document.createElement('div')
      row.className = 'about-row'
      const k = document.createElement('span')
      k.className = 'about-key'
      k.textContent = label
      const v = document.createElement('span')
      v.className = 'about-value'
      v.textContent = value
      row.appendChild(k)
      row.appendChild(v)
      el.aboutList.appendChild(row)
    }
    const repoRow = document.createElement('div')
    repoRow.className = 'about-row'
    const repoKey = document.createElement('span')
    repoKey.className = 'about-key'
    repoKey.textContent = 'Repository'
    const link = document.createElement('a')
    link.className = 'about-value about-link'
    link.href = 'https://github.com/mertkayacs/reevesagents'
    link.textContent = 'github.com/mertkayacs/reevesagents'
    link.target = '_blank'
    link.rel = 'noreferrer'
    repoRow.appendChild(repoKey)
    repoRow.appendChild(link)
    el.aboutList.appendChild(repoRow)
    el.aboutDialog.showModal()
  }

  function openDoctorDialog() {
    el.doctorError.hidden = true
    el.doctorDialog.showModal()
    loadDoctor()
  }

  async function loadDoctor() {
    el.doctorError.hidden = true
    el.doctorList.textContent = 'Running checks...'
    try {
      const result = await api('GET', '/api/doctor')
      renderDoctorChecks((result && result.checks) || [])
    } catch (err) {
      el.doctorList.textContent = ''
      el.doctorError.hidden = false
      el.doctorError.textContent = err.message
    }
  }

  function renderDoctorChecks(checks) {
    el.doctorList.innerHTML = ''
    for (const check of checks) {
      const row = document.createElement('div')
      row.className = 'doctor-check'
      row.dataset.status = check.status
      const name = document.createElement('span')
      name.className = 'doctor-check-name'
      name.textContent = check.name
      const status = document.createElement('span')
      status.className = 'doctor-check-status'
      status.textContent = check.status
      const detail = document.createElement('span')
      detail.className = 'doctor-check-detail'
      detail.textContent = check.detail
      detail.title = check.detail
      row.appendChild(name)
      row.appendChild(status)
      row.appendChild(detail)
      el.doctorList.appendChild(row)
    }
  }

  function openMcpDialog() {
    setMcpError(null)
    el.mcpHostList.innerHTML = ''
    el.mcpEmpty.hidden = true
    el.mcpDialog.showModal()
    loadMcpHosts()
  }

  async function loadMcpHosts() {
    try {
      const data = await api('GET', '/api/mcp-hosts')
      mcpHosts = (data && data.hosts) || []
      renderMcpHosts()
    } catch (err) {
      setMcpError(t('web.mcpLoadError', { message: err.message }))
    }
  }

  function hostStatusLabel(host) {
    if (!host.installed) return t('web.mcpNotInstalled')
    if (host.manual) return t('web.mcpManual')
    return host.attached ? t('web.mcpAttached') : t('web.mcpDetached')
  }

  function hostStatusKind(host) {
    if (!host.installed) return 'absent'
    if (host.manual) return 'manual'
    return host.attached ? 'attached' : 'detached'
  }

  function renderMcpHosts() {
    el.mcpHostList.innerHTML = ''
    el.mcpEmpty.hidden = mcpHosts.length > 0
    for (const host of mcpHosts) {
      const row = document.createElement('div')
      row.className = 'mcp-host-row'
      row.dataset.state = hostStatusKind(host)

      const body = document.createElement('div')
      body.className = 'mcp-host-body'
      const name = document.createElement('span')
      name.className = 'mcp-host-name'
      name.textContent = host.label
      body.appendChild(name)
      const meta = document.createElement('span')
      meta.className = 'mcp-host-meta'
      meta.textContent = host.bin
      body.appendChild(meta)
      row.appendChild(body)

      const status = document.createElement('span')
      status.className = 'mcp-host-status'
      status.textContent = hostStatusLabel(host)
      row.appendChild(status)

      if (host.installed && !host.manual) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'mcp-host-action'
        btn.dataset.kind = host.attached ? 'detach' : 'attach'
        btn.textContent = host.attached ? t('web.mcpDetach') : t('web.mcpAttach')
        btn.title = host.attached ? t('web.mcpDetachHint') : t('web.mcpAttachHint')
        btn.disabled = mcpBusy
        btn.addEventListener('click', () => host.attached ? detachHost(host) : attachHost(host))
        row.appendChild(btn)
      } else if (host.manual) {
        const note = document.createElement('span')
        note.className = 'mcp-host-note'
        note.textContent = t('web.mcpManualHint')
        row.appendChild(note)
      }
      el.mcpHostList.appendChild(row)
    }
    el.mcpAttachAll.disabled = mcpBusy || !mcpHosts.some(h => h.installed && !h.manual && !h.attached)
  }

  function setMcpError(message) {
    if (!message) { el.mcpError.hidden = true; el.mcpError.textContent = ''; return }
    el.mcpError.textContent = message
    el.mcpError.hidden = false
  }

  function applyMcpResult(data) {
    if (data && Array.isArray(data.hosts)) {
      mcpHosts = data.hosts
      renderMcpHosts()
    }
  }

  async function attachHost(host) {
    if (mcpBusy) return
    mcpBusy = true
    setMcpError(null)
    renderMcpHosts()
    try {
      const data = await api('POST', '/api/mcp-hosts/attach', { key: host.key })
      applyMcpResult(data)
      if (data && data.result && data.result.ok === false) {
        setMcpError(t('web.mcpAttachError', { name: host.label, message: data.result.message }))
      }
    } catch (err) {
      setMcpError(t('web.mcpAttachError', { name: host.label, message: err.message }))
    } finally {
      mcpBusy = false
      renderMcpHosts()
    }
  }

  async function detachHost(host) {
    if (mcpBusy) return
    mcpBusy = true
    setMcpError(null)
    renderMcpHosts()
    try {
      const data = await api('POST', '/api/mcp-hosts/detach', { key: host.key })
      applyMcpResult(data)
      if (data && data.result && data.result.ok === false) {
        setMcpError(t('web.mcpDetachError', { name: host.label, message: data.result.message }))
      }
    } catch (err) {
      setMcpError(t('web.mcpDetachError', { name: host.label, message: err.message }))
    } finally {
      mcpBusy = false
      renderMcpHosts()
    }
  }

  async function attachAllHosts() {
    if (mcpBusy) return
    mcpBusy = true
    setMcpError(null)
    renderMcpHosts()
    try {
      const data = await api('POST', '/api/mcp-hosts/attach-all', {})
      applyMcpResult(data)
      const failed = ((data && data.results) || []).filter(r => !r.ok)
      if (failed.length > 0) setMcpError(t('web.mcpAttachAllError', { message: failed.map(r => r.message).join('; ') }))
    } catch (err) {
      setMcpError(t('web.mcpAttachAllError', { message: err.message }))
    } finally {
      mcpBusy = false
      renderMcpHosts()
    }
  }

  // --- wire up --------------------------------------------------------------

  el.newAgentBtn.addEventListener('click', () => openAgentDialog(preferredRunId()))
  el.newRunBtn.addEventListener('click', openRunDialog)
  el.agentControlBtn.addEventListener('click', openMcpDialog)
  el.mcpClose.addEventListener('click', () => el.mcpDialog.close())
  el.mcpAttachAll.addEventListener('click', attachAllHosts)
  el.doctorBtn.addEventListener('click', openDoctorDialog)
  el.doctorRefresh.addEventListener('click', loadDoctor)
  el.doctorClose.addEventListener('click', () => el.doctorDialog.close())
  el.aboutBtn.addEventListener('click', openAboutDialog)
  el.aboutClose.addEventListener('click', () => el.aboutDialog.close())
  el.emptyNewRun.addEventListener('click', openRunDialog)
  el.overlayNewRun.addEventListener('click', openRunDialog)
  el.overlayNewAgent.addEventListener('click', () => openAgentDialog(preferredRunId()))
  el.stageAddAgent.addEventListener('click', () => {
    const selected = selectedId ? findAgent(selectedId) : null
    if (selected) openAgentDialog(selected.run.id)
  })
  el.createRunTab.addEventListener('click', () => {
    createContext = { kind: 'run', runId: '' }
    syncCreateFields()
    el.fRunName.focus()
  })
  el.createAgentTab.addEventListener('click', () => {
    if (runningRuns().length === 0) return
    createContext = { kind: 'agent', runId: preferredRunId() }
    syncCreateFields()
    el.fAgentRun.focus()
  })
  el.newCancel.addEventListener('click', () => el.dialog.close())
  el.fAgentRun.addEventListener('change', () => {
    createContext.runId = el.fAgentRun.value
    syncCreateFields()
  })
  el.fMode.addEventListener('change', syncCreateFields)
  el.fProvider.addEventListener('change', () => {
    updateProviderSelection()
    renderModels()
  })
  el.languageSelect.addEventListener('change', async () => {
    try {
      const payload = await api('POST', '/api/language', { language: el.languageSelect.value })
      applyLanguage(payload)
      await refreshState()
    } catch (err) {
      alert(err.message)
      el.languageSelect.value = language
    }
  })
  el.fPermissions.addEventListener('change', updatePermissionSelection)
  for (const option of el.permissionGrid.querySelectorAll('.permission-option')) {
    option.addEventListener('click', () => {
      selectPermission(option.dataset.permission)
    })
    option.addEventListener('keydown', handlePermissionKeydown)
  }
  el.form.addEventListener('submit', submitNew)

  function modeLabel(mode) {
    return mode === 'orchestrator' ? t('web.orchestrator') : t('web.spawner')
  }

  function roleLabel(role) {
    return role === 'root' ? t('web.roleRoot') : t('web.roleWorker')
  }

  function statusLabel(status) {
    if (status === 'queued') return t('web.statusQueued')
    if (status === 'working') return t('web.statusWorking')
    if (status === 'done') return t('web.statusDone')
    if (status === 'failed') return t('web.statusFailed')
    if (status === 'blocked') return t('web.statusBlocked')
    if (status === 'ended') return t('web.statusEnded')
    if (status === 'stale') return t('web.statusStale')
    if (status === 'running') return t('web.statusRunning')
    return status
  }

  function shortIso(value) {
    if (!value) return t('web.unknown')
    return `${String(value).replace('T', ' ').slice(0, 16)}Z`
  }

  initBrandDuck()
  loadState().catch((err) => {
    el.sidebarEmpty.hidden = false
    el.sidebarEmpty.querySelector('.empty-body').textContent = `Could not load state: ${err.message}`
  })
  subscribe()
})()
