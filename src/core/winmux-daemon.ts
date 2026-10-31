// winmux daemon: hosts ConPTY panes for the whole user, like the tmux server.
// One detached process per home dir, addressable through a named pipe secured
// with a random token (pipes are visible to other local users). Clients send
// newline-delimited JSON requests; attach-style commands switch the same socket
// into streaming mode ({t:'o'} output frames out, {'t':'i'/'r'} frames in).
// Windows is the only supported host; the module still never throws at the
// request boundary: every command returns {code, stdout, stderr}.

import xtermHeadlessModule from '@xterm/headless'
// CJS package: named import breaks under ESM interop
const { Terminal } = xtermHeadlessModule
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import {
  createServer,
  connect,
  type Server,
  type Socket,
} from 'node:net'
import {
  expandFormat,
  nextWindowIndex,
  paneCommandName,
  parseArgs,
  resolveHome,
  resolveTarget,
  translateKeys,
  winmuxPipeName,
  winmuxStatePath,
  type FmtCtx,
  type TargetCtx,
  type WMState,
  type WMSession,
  type WMWindow,
  type WinmuxStateFile,
} from './winmux.js'

const COLS = 200
const ROWS = 50
const RING_CAP = 256 * 1024
const SCROLLBACK = 5000
const STARTUP_GRACE_MS = 30_000

interface Pane {
  id: string
  pid: number
  cmd: string
  term: InstanceType<typeof Terminal>
  pty: ReturnType<typeof pty.spawn>
  ring: string
  exited: boolean
}

interface AttachClient {
  socket: Socket
  session: string
}

interface Request {
  token?: string
  argv?: string[]
  stdin?: string
  env?: { TMUX_PANE?: string }
  cwd?: string
}

interface Reply { code: number; stdout: string; stderr: string }

const STREAM_OPEN = Symbol('switch socket to streaming')

let sessions: WMSession[] = []
const panes = new Map<string, Pane>()
const buffers = new Map<string, string>()
let clients: AttachClient[] = []
let nextWindowId = 0
let nextPaneId = 0
let anySessionCreated = false
let server: Server | null = null
let pipeName = ''
let token = ''
let closing = false

const nowSec = (): number => Math.floor(Date.now() / 1000)

function snapshot(): WMState {
  return { sessions: sessions.map(s => ({ ...s, windows: s.windows.map(w => ({ ...w })) })) }
}

function liveSession(name: string): WMSession | undefined {
  return sessions.find(s => s.name === name)
}

function fmtContext(session: WMSession | null, window: WMWindow | null, paneId: string): FmtCtx {
  // tmux grouped-session semantics: the group leader reports its own name as
  // #{session_group}; every member's group_list is the group members in
  // creation order, leader first.
  const group = session ? (session.group || session.name) : ''
  const members = group ? sessions.filter(s => s.group === group || s.name === group) : []
  const groupList = group ? members.map(m => m.name).join(',') : ''
  const pane = panes.get(paneId)
  return {
    session_name: session?.name ?? '',
    session_attached: session?.attached ?? 0,
    session_group: group,
    session_group_list: groupList,
    session_created: session?.createdSec ?? 0,
    window_id: window?.id ?? '',
    window_name: window?.name ?? '',
    window_index: window?.index ?? 0,
    pane_id: paneId,
    pane_pid: pane?.pid ?? 0,
    pane_current_command: pane?.cmd ?? '',
  }
}

function killTree(pid: number): void {
  if (!pid || pid <= 0) return // node-pty in this env can report pid 0
  try { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }) } catch { /* gone */ }
}

function closePane(pane: Pane): void {
  if (!panes.has(pane.id)) return
  panes.delete(pane.id)
  if (!pane.exited) {
    killTree(pane.pid)
    try { pane.pty.kill() } catch { /* already gone */ }
  }
}

function killPaneRefs(paneId: string): void {
  for (const s of sessions) s.windows = s.windows.filter(w => w.paneId !== paneId)
}

function collectEmpty(): void {
  const empty = sessions.filter(s => s.windows.length === 0)
  for (const s of empty) {
    dropClients(s.name)
    sessions = sessions.filter(x => x !== s)
    // killing one group member leaves the others (they keep their own refs);
    // a group member's windows already left via killPaneRefs
  }
  if (sessions.length === 0 && anySessionCreated) scheduleExit()
}

function dropClients(sessionName: string): void {
  for (const c of clients.filter(c => c.session === sessionName)) {
    try { c.socket.write(JSON.stringify({ t: 'x', code: 0 }) + '\n') } catch { /* socket gone */ }
    try { c.socket.destroy() } catch { /* gone */ }
  }
  clients = clients.filter(c => c.session !== sessionName)
}

function currentWindow(s: WMSession): WMWindow | undefined {
  return s.windows.find(w => w.id === s.currentWindowId) ?? s.windows[s.windows.length - 1]
}

function currentPane(clientOrSession: string): Pane | undefined {
  const s = liveSession(clientOrSession)
  const w = s ? currentWindow(s) : null
  return w ? panes.get(w.paneId) : undefined
}

function broadcastWindowChange(s: WMSession): void {
  const pane = currentPane(s.name)
  const payload = '\x1b[2J\x1b[H' + (pane?.ring ?? '')
  const frame = JSON.stringify({ t: 'o', d: Buffer.from(payload, 'utf8').toString('base64') }) + '\n'
  for (const c of clients) {
    if (c.session === s.name) {
      try { c.socket.write(frame) } catch { /* socket gone */ }
    }
  }
}

function scheduleExit(): void {
  setTimeout(() => process.exit(0), 100)
}

function groupMembersOf(s: WMSession): WMSession[] {
  if (!s.group) return [s]
  return sessions.filter(m => m.name === s.group || m.group === s.group || m === s)
}

async function mknewPane(shellCommand: string | null, cwd: string, _paneEnv: { TMUX_PANE?: string }): Promise<Pane> {
  const id = `%${nextPaneId++}`
  const comspec = process.env.COMSPEC || 'cmd.exe'
  const term = new Terminal({ cols: COLS, rows: ROWS, scrollback: SCROLLBACK, allowProposedApi: true })
  const proc = pty.spawn(
    comspec,
    shellCommand ? `/d /s /c "${shellCommand}"` : [],
    {
      name: 'xterm-256color',
      cols: COLS,
      rows: ROWS,
      cwd,
      // daemon env + TMUX/TMUX_PANE, tmux-compatible wiring for in-pane scripts
      env: {
        ...process.env,
        TMUX: `${pipeName},${process.pid},0`,
        TMUX_PANE: id,
      },
    },
  )
  const pane: Pane = { id, pid: proc.pid, cmd: paneCommandName(shellCommand), term, pty: proc, ring: '', exited: false }
  if (!pane.pid) {
    // node-pty fills in pid only after the ConPTY output pipe connects, so
    // block briefly for the real pid: callers store it for process-tree kills
    const deadline = Date.now() + 5000
    while (!proc.pid && Date.now() < deadline) await new Promise(r => setTimeout(r, 10))
    pane.pid = proc.pid
  }
  panes.set(id, pane)
  proc.onData((data: string) => {
    pushPaneOutput(pane, data)
  })
  proc.onExit(() => {
    pane.exited = true
    closePane(pane)
    killPaneRefs(pane.id)
    collectEmpty()
  })
  return pane
}

// Feed the headless terminal and the attach clients, keep the raw attach ring.
function pushPaneOutput(pane: Pane, data: string): void {
  pane.ring = pane.ring.length + data.length > RING_CAP
    ? (pane.ring + data).slice((pane.ring + data).length - RING_CAP)
    : pane.ring + data
  pane.term.write(data, () => { /* flushed for capture */ })
  const frame = JSON.stringify({ t: 'o', d: Buffer.from(data, 'utf8').toString('base64') }) + '\n'
  for (const c of clients) {
    const p = currentPane(c.session)
    if (p?.id === pane.id) {
      try { c.socket.write(frame) } catch { /* socket gone */ }
    }
  }
}

function makeWindow(pane: Pane, name: string, index: number): WMWindow {
  return { id: `@${nextWindowId++}`, name, index, paneId: pane.id }
}

async function spawnPaneFor(command: 'new-session' | 'new-window', strs: Record<string, string>, rest: string[], req: Request): Promise<{ pane?: Pane; stderr?: string }> {
  const hasShell = rest.length > 0
  const cwd = strs.c || req.cwd || process.cwd()
  const pane = await mknewPane(hasShell ? rest.join(' ') : null, cwd, req.env ?? {})
  return { pane }
}

async function capturePaneText(pane: Pane, opts: { alt: boolean; count: number | null }): Promise<Reply> {
  const buffer = pane.term.buffer.active
  const isAlt = buffer.type === 'alternate'
  if (opts.alt && !isAlt) return { code: 1, stdout: '', stderr: 'no alternate screen' }
  const buf = isAlt ? pane.term.buffer.alternate : pane.term.buffer.normal
  void buffer
  if (opts.count !== null) {
    // last N lines ending at the cursor row (tmux -S -N semantics); a fresh
    // ConPTY leaves most viewport rows empty, so anchoring at the cursor
    // matches what tmux would show
    const take = opts.count
    const top = Math.max(0, buf.cursorY + 1 - take)
    const lines: string[] = []
    for (let y = top; y <= Math.min(buf.cursorY, buf.length - 1); y++) lines.push(buf.getLine(y)?.translateToString(true) ?? '')
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
    return { code: 0, stdout: lines.join('\n') + '\n', stderr: '' }
  }
  const start = Math.max(0, buf.length - pane.term.rows)
  const lines: string[] = []
  for (let y = start; y < buf.length; y++) lines.push(buf.getLine(y)?.translateToString(true) ?? '')
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return { code: 0, stdout: lines.join('\n') + '\n', stderr: '' }
}

async function handle(argv: string[], req: Request): Promise<Reply | { streamSession: string }> {
  const parsed = parseArgs(argv)
  if (parsed.error) return { code: 1, stdout: '', stderr: parsed.error }
  const { command, bools, strs, rest } = parsed
  const tctx: TargetCtx = { envPaneId: req.env?.TMUX_PANE }
  const state = snapshot()
  const attachTargetSession = (): WMSession | null => {
    const r = resolveTarget(state, strs.t, tctx, 'session')
    return r.session ? liveSession(r.session.name) ?? null : null
  }

  switch (command) {
    case 'new-session': {
      const name = strs.s ?? `winmux-${sessions.length}-${nowSec()}`
      if (liveSession(name)) return { code: 1, stdout: '', stderr: `duplicate session: ${name}` }
      let group = ''
      if (strs.t) {
        const leader = state.sessions.find(x => x.name === strs.t.replace(/^=/, ''))
        if (!leader) return { code: 1, stdout: '', stderr: `can't find session: ${strs.t}` }
        group = leader.group || leader.name
      }
      const sess: WMSession = { name, createdSec: nowSec(), group, windows: [], currentWindowId: '', attached: 0 }
      if (group) {
        const leaderLive = liveSession(group)
        if (!leaderLive) return { code: 1, stdout: '', stderr: `can't find session: ${strs.t}` }
        // grouped session shares the leader's window list, own current window
        for (const w of leaderLive.windows) sess.windows.push(w)
        const cur = currentWindow(leaderLive)
        sess.currentWindowId = cur?.id ?? ''
      } else {
        const { pane, stderr } = await spawnPaneFor('new-session', strs, rest, req)
        if (!pane || stderr) return { code: 1, stdout: '', stderr: stderr ?? 'pane spawn failed' }
        const w = makeWindow(pane, strs.n ?? '0', 0)
        sess.windows.push(w)
        sess.currentWindowId = w.id
      }
      anySessionCreated = true
      sessions.push(sess)
      return bools.has('d') ? { code: 0, stdout: '', stderr: '' } : { streamSession: sess.name }
    }

    case 'new-window': {
      const r = resolveTarget(snapshot(), strs.t, tctx, 'session')
      if (r.error || !r.session) return { code: 1, stdout: '', stderr: r.error ?? `can't find session: ${strs.t ?? ''}` }
      const s = liveSession(r.session.name)!
  const { pane, stderr } = await spawnPaneFor('new-window', strs, rest, req)
      if (!pane || stderr) return { code: 1, stdout: '', stderr: stderr ?? 'pane spawn failed' }
      const index = nextWindowIndex(s.windows)
      const win = makeWindow(pane, strs.n ?? String(index), index)
      s.windows.push(win)
      // group members share window objects: same refs, own current pointer
      for (const m of sessions) {
        if (m !== s && s.group && m.group === s.group) {
          m.windows.push(win)
          if (!bools.has('d')) m.currentWindowId = win.id
        }
      }
      if (!bools.has('d')) s.currentWindowId = win.id
      if (bools.has('P')) {
        const fmt = strs.F || '#{session_name}:#{window_index}'
        return { code: 0, stdout: expandFormat(fmt, fmtContext(s, win, pane.id)) + '\n', stderr: '' }
      }
      return { code: 0, stdout: '', stderr: '' }
    }

    case 'link-window': {
      const srcRes = resolveTarget(snapshot(), strs.s, tctx, 'window')
      if (srcRes.error || !srcRes.session || !srcRes.window) return { code: 1, stdout: '', stderr: srcRes.error ?? `can't find window: ${strs.s ?? ''}` }
      const srcSession = liveSession(srcRes.session.name)!
      const srcWin = srcSession.windows.find(w => w.id === srcRes.window!.id)!
      const dstTarget = strs.t ?? ''
      const colon = dstTarget.indexOf(':')
      const dstSessionName = (colon === -1 ? dstTarget : dstTarget.slice(0, colon)).replace(/^=/, '')
      const dstSess = liveSession(dstSessionName)
      if (!dstSess) return { code: 1, stdout: '', stderr: `can't find session: ${dstTarget}` }
      const winPart = colon === -1 ? '' : dstTarget.slice(colon + 1)
      let idx: number | null = null
      if (/^\d+$/.test(winPart)) idx = Number(winPart)
      else if (winPart !== '') {
        const byName = dstSess.windows.find(w => w.name === winPart)
        if (!byName) return { code: 1, stdout: '', stderr: `can't find window: ${dstTarget}` }
        idx = byName.index
      }
      if (idx === null) idx = nextWindowIndex(dstSess.windows)
      const existing = dstSess.windows.find(w => w.index === idx)
      if (existing) {
        if (!bools.has('k')) return { code: 1, stdout: '', stderr: `create window failed: ${dstTarget}` }
        removeWindowFrom(dstSess, existing)
      }
      for (const m of groupMembersOf(dstSess)) {
        m.windows.push({ ...srcWin }) // same paneId, per-session window copy
        if (!m.currentWindowId) m.currentWindowId = srcWin.id
      }
      sortWindows(dstSess)
      return { code: 0, stdout: '', stderr: '' }
    }

    case 'kill-window': {
      const r = resolveTarget(snapshot(), strs.t, tctx, 'window')
      if (r.error || !r.session || !r.window) return { code: 1, stdout: '', stderr: r.error ?? `can't find window: ${strs.t ?? ''}` }
      const s = liveSession(r.session.name)!
      const w = s.windows.find(x => x.id === r.window!.id)
      if (!w) return { code: 1, stdout: '', stderr: `can't find window: ${strs.t}` }
      removeWindowFrom(s, w)
      closePane(panes.get(w.paneId)!)
      killPaneRefs(w.paneId)
      collectEmpty()
      return { code: 0, stdout: '', stderr: '' }
    }

    case 'kill-session': {
      const r = resolveTarget(snapshot(), strs.t, tctx, 'session')
      if (r.error || !r.session) return { code: 1, stdout: '', stderr: r.error ?? `can't find session: ${strs.t ?? ''}` }
      const s = liveSession(r.session.name)!
      killSession(s)
      return { code: 0, stdout: '', stderr: '' }
    }

    case 'has-session': {
      const r = resolveTarget(snapshot(), strs.t, tctx, 'session')
      if (r.error) return { code: 1, stdout: '', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    }

    case 'list-sessions': {
      if (sessions.length === 0) return { code: 1, stdout: '', stderr: 'no server running' }
      const fmt = strs.F || '#{session_name}\t#{session_attached}'
      const out = sessions.map(s => expandFormat(fmt, fmtContext(s, currentWindow(s) ?? null, currentWindow(s)?.paneId ?? '')))
      return { code: 0, stdout: out.join('\n') + '\n', stderr: '' }
    }

    case 'list-windows': {
      if (bools.has('a')) {
        const fmt = strs.F || '#{session_name}\t#{window_name}'
        const rows = sessions.flatMap(s => s.windows.map(w => expandFormat(fmt, fmtContext(s, w, w.paneId))))
        return { code: 0, stdout: rows.join('\n') + '\n', stderr: '' }
      }
      const r = resolveTarget(snapshot(), strs.t, tctx, 'session')
      if (r.error || !r.session) return { code: 1, stdout: '', stderr: r.error ?? `can't find session: ${strs.t ?? ''}` }
      const s = liveSession(r.session.name)!
      const fmt = strs.F || '#{session_name}\t#{window_index}\t#{window_name}'
      return { code: 0, stdout: s.windows.map(w => expandFormat(fmt, fmtContext(s, w, w.paneId))).join('\n') + '\n', stderr: '' }
    }

    case 'list-panes': {
      const r = resolveTarget(snapshot(), strs.t, tctx, 'session')
      if (r.error || !r.session) return { code: 1, stdout: '', stderr: r.error ?? `can't find session: ${strs.t ?? ''}` }
      const s = liveSession(r.session.name)!
      const fmt = strs.F || '#{pane_id}'
      return { code: 0, stdout: s.windows.map(w => expandFormat(fmt, fmtContext(s, w, w.paneId))).join('\n') + '\n', stderr: '' }
    }

    case 'display-message': {
      if (!bools.has('p')) return { code: 1, stdout: '', stderr: 'only -p is supported' }
      const fmt = rest[0] ?? ''
      const findPair = (): { s: WMSession | null; w: WMWindow | null } => {
        if (strs.t) {
          const r = resolveTarget(snapshot(), strs.t, tctx, 'window')
          if (r.error || !r.session) return { s: null, w: null, err: r.error ?? `can't find window: ${strs.t}` } as never
          const live2 = liveSession(r.session.name) ?? null
          const w2 = live2 && r.window ? live2.windows.find(x => x.id === r.window!.id) ?? null : null
          if (live2 && !w2) return { s: null, w: null, err: `can't find window: ${strs.t}` } as never
          return { s: live2, w: w2 }
        }
        const rr = resolveTarget(snapshot(), undefined, tctx, 'window')
        const s2 = rr.session ? liveSession(rr.session.name) ?? null : null
        return { s: s2, w: s2 ? currentWindow(s2) ?? null : null }
      }
      const pair = findPair()
      if (!pair.s) return { code: 1, stdout: '', stderr: `can't find session: ${strs.t ?? ''}` }
      return { code: 0, stdout: expandFormat(fmt, fmtContext(pair.s, pair.w, pair.w?.paneId ?? '')), stderr: '' }
    }

    case 'select-window': {
      const r = resolveTarget(snapshot(), strs.t, tctx, 'window')
      if (r.error || !r.session || !r.window) return { code: 1, stdout: '', stderr: r.error ?? `can't find window: ${strs.t ?? ''}` }
      const s = liveSession(r.session.name)!
      const w = s.windows.find(x => x.id === r.window!.id)
      if (!w) return { code: 1, stdout: '', stderr: `can't find window: ${strs.t}` }
      s.currentWindowId = w.id
      broadcastWindowChange(s)
      return { code: 0, stdout: '', stderr: '' }
    }

    case 'switch-client': {
      const r = resolveTarget(snapshot(), strs.t, tctx, 'window')
      if (r.error || !r.session || !r.window) return { code: 1, stdout: '', stderr: r.error ?? `can't find window: ${strs.t ?? ''}` }
      const s = liveSession(r.session.name)!
      const w = s.windows.find(x => x.id === r.window!.id)
      if (!w) return { code: 1, stdout: '', stderr: `can't find window: ${strs.t}` }
      if (clients.length === 0) return { code: 1, stdout: '', stderr: 'no current client' }
      const c = clients[clients.length - 1]
      c.session = s.name
      s.currentWindowId = w.id
      broadcastWindowChange(s)
      return { code: 0, stdout: '', stderr: '' }
    }

    case 'send-keys': {
      const r = resolveTarget(snapshot(), strs.t, tctx, 'pane')
      if (r.error || !r.paneId) return { code: 1, stdout: '', stderr: r.error ?? `can't find pane: ${strs.t ?? ''}` }
      const pane = panes.get(r.paneId)
      if (!pane) return { code: 1, stdout: '', stderr: `can't find pane: ${strs.t ?? ''}` }
      const data = translateKeys(rest, bools.has('l'))
      pane.pty.write(data)
      return { code: 0, stdout: '', stderr: '' }
    }

    case 'load-buffer': {
      if (rest[0] !== '-') return { code: 1, stdout: '', stderr: 'load-buffer requires "-" (stdin)' }
      buffers.set(strs.b, req.stdin ?? '')
      return { code: 0, stdout: '', stderr: '' }
    }

    case 'paste-buffer': {
      const r = resolveTarget(snapshot(), strs.t, tctx, 'pane')
      if (r.error || !r.paneId) return { code: 1, stdout: '', stderr: r.error ?? `can't find pane: ${strs.t ?? ''}` }
      const pane = panes.get(r.paneId)
      if (!pane) return { code: 1, stdout: '', stderr: `can't find pane: ${strs.t ?? ''}` }
      const content = (buffers.get(strs.b) ?? '').replace(/\r?\n/g, '\r')
      pane.pty.write(content)
      return { code: 0, stdout: '', stderr: '' }
    }

    case 'delete-buffer': {
      buffers.delete(strs.b)
      return { code: 0, stdout: '', stderr: '' }
    }

    case 'capture-pane': {
      const r = resolveTarget(snapshot(), strs.t, tctx, 'pane')
      if (r.error || !r.paneId) return { code: 1, stdout: '', stderr: r.error ?? `can't find pane: ${strs.t ?? ''}` }
      const pane = panes.get(r.paneId)
      if (!pane) return { code: 1, stdout: '', stderr: `can't find pane: ${strs.t ?? ''}` }
      const count = strs.N !== undefined ? Math.abs(Number(strs.N)) : strs.S !== undefined ? Math.abs(Number(strs.S)) : null
      return await capturePaneText(pane, { alt: bools.has('a'), count })
    }

    case 'attach-session':
    case 'attach': {
      const s = attachTargetSession()
      if (!s) return { code: 1, stdout: '', stderr: `can't find session: ${strs.t ?? ''}` }
      return { streamSession: s.name }
    }

    default:
      return { code: 1, stdout: '', stderr: `unknown command: ${command}` }
  }

  function sortWindows(s2: WMSession): void {
    s2.windows.sort((a, b) => a.index - b.index)
  }
}

function removeWindowFrom(s: WMSession, w: WMWindow): void {
  for (const m of groupMembersOf(s)) {
    m.windows = m.windows.filter(x => x.id !== w.id)
    if (m.currentWindowId === w.id) m.currentWindowId = m.windows[m.windows.length - 1]?.id ?? ''
  }
}

function killSession(s: WMSession): void {
  for (const c of clients.filter(c => c.session === s.name)) {
    try { c.socket.write(JSON.stringify({ t: 'x', code: 0 }) + '\n') } catch { /* gone */ }
    try { c.socket.destroy() } catch { /* gone */ }
  }
  clients = clients.filter(c => c.session !== s.name)
  const paneIds = new Set(s.windows.map(w => w.paneId))
  sessions = sessions.filter(x => x !== s)
  // Only kill panes no remaining session references: in a group the other
  // members keep the windows alive (that is how viewer sessions survive here).
  for (const id of paneIds) {
    const stillHeld = sessions.some(m => m.windows.some(w => w.paneId === id))
    if (!stillHeld) {
      killPaneRefs(id)
      closePane(panes.get(id)!)
    }
  }
  collectEmpty()
}

function detachClients(socket: Socket): void {
  const c = clients.find(x => x.socket === socket)
  if (!c) return
  const s = liveSession(c.session)
  if (s && s.attached > 0) s.attached--
  clients = clients.filter(x => x !== c)
  try { socket.destroy() } catch { /* gone */ }
}

function handleStreamFrame(line: string, socket: Socket): void {
  let f: { t?: string; d?: string; cols?: number; rows?: number }
  try { f = JSON.parse(line) as typeof f } catch { return }
  const client = clients.find(c => c.socket === socket)
  if (!client) return
  if (f.t === 'o' || f.t === 'x') {
    if (f.t === 'x') detachClients(socket)
    return
  }
  const pane = currentPane(client.session)
  if (!pane) return
  if (f.t === 'i' && f.d !== undefined) pane.pty.write(Buffer.from(f.d, 'base64').toString('utf8'))
  else if (f.t === 'r' && f.cols !== undefined && f.rows !== undefined) {
    try { pane.pty.resize(f.cols, f.rows) } catch { /* resize failed */ }
    try { pane.term.resize(f.cols, f.rows) } catch { /* out of range */ }
  } else if (f.t === 'c' && f.d !== undefined) {
    const s = liveSession(client.session)
    if (!s) return
    const wins = s.windows
    const pos = wins.findIndex(w => w.id === s.currentWindowId)
    if (f.d === 'd') { detachClients(socket); return }
    if (f.d === 'n' && pos < wins.length - 1) s.currentWindowId = wins[pos + 1].id
    else if (f.d === 'p' && pos > 0) s.currentWindowId = wins[pos - 1].id
    else if (/^[0-9]$/.test(f.d)) {
      const target = wins.find(w => String(w.index) === f.d)
      if (target) s.currentWindowId = target.id
    }
    broadcastWindowChange(s)
  }
}

async function handleLine(line: string, socket: Socket): Promise<Reply | typeof STREAM_OPEN> {
  let req: Request
  try { req = JSON.parse(line) as Request } catch { return { code: 1, stdout: '', stderr: 'bad request' } }
  if (req.token !== token) return { code: 1, stdout: '', stderr: 'bad token' }
  if (!req.argv?.length) return { code: 1, stdout: '', stderr: 'no command given' }
  const result = await handle(req.argv, req)
  if ('streamSession' in result) {
    const s = liveSession(result.streamSession)
    if (!s) return { code: 1, stdout: '', stderr: `can't find session: ${result.streamSession}` }
    s.attached++
    const client: AttachClient = { socket, session: s.name }
    clients.push(client)
    const pane = currentPane(s.name)
    if (pane) {
      socket.write(JSON.stringify({ t: 'o', d: Buffer.from(pane.ring, 'utf8').toString('base64') }) + '\n')
    }
    return STREAM_OPEN
  }
  if (result.stderr && !result.stderr.endsWith('\n')) result.stderr += '\n'
  return result as Reply
}

const pty = await loadNodePty()

type PtyModule = typeof import('@lydell/node-pty')
// Dynamic import, not static: in the bundled dist the static CJS interop keeps
// the ConPTY read stream silent (verified empirically); dynamic resolves fine.
async function loadNodePty(): Promise<PtyModule> {
  const m = await import('@lydell/node-pty')
  const cand = m as unknown as { default?: unknown }
  return ((cand.default && typeof (cand.default as { spawn?: unknown }).spawn === 'function') ? cand.default : m) as PtyModule
}

// Probe a named pipe by connecting; a working connection means a daemon is
// alive, anything else (ENOENT, EACCES, timeout) means we may take over.
async function pipeAlive(pipe: string): Promise<boolean> {
  return await new Promise(resolve => {
    const done = (alive: boolean): void => {
      clearTimeout(timer)
      try { socket.destroy() } catch { /* gone */ }
      resolve(alive)
    }
    const socket = connect(pipe, () => done(true))
    const timer = setTimeout(() => done(false), 500)
    socket.once('error', () => done(false))
  })
}

export async function runDaemon(): Promise<void> {
  const home = resolveHome(process.env, homedir())
  pipeName = winmuxPipeName(home)
  mkdirSync(home, { recursive: true })
  const statePath = winmuxStatePath(home)
  try {
    const existing = JSON.parse(readFileSync(statePath, 'utf8')) as WinmuxStateFile
    if (existing.pipe === pipeName && existing.pid !== process.pid) {
      // Windows reuses pids quickly, so a live check on the pid alone can hit
      // an unrelated process; only a working pipe connection proves ownership
      if (await pipeAlive(existing.pipe)) process.exit(0) // a daemon already owns this root
    }
  } catch {
    // no state file: we take over
  }
  token = randomBytes(32).toString('hex')
  setTimeout(() => {
    if (!anySessionCreated) process.exit(0)
  }, STARTUP_GRACE_MS)
  server = createServer((socket) => {
    let buf = ''
    let streaming = false
    socket.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8')
      let nl = buf.indexOf('\n')
      while (nl !== -1) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        nl = buf.indexOf('\n')
        if (streaming) {
          handleStreamFrame(line, socket)
          continue
        }
        void handleLine(line, socket).then(result => {
          if (result === STREAM_OPEN) {
            streaming = true
            return
          }
          try {
            socket.write(JSON.stringify(result) + '\n')
            socket.end()
          } catch { /* socket gone */ }
        }, (err: unknown) => {
          const reply: Reply = { code: 1, stdout: '', stderr: err instanceof Error ? err.message : String(err) }
          try {
            socket.write(JSON.stringify(reply) + '\n')
            socket.end()
          } catch { /* socket gone */ }
        })
      }
    })
    socket.on('error', () => detachClients(socket))
  })
  await new Promise<void>((resolve, reject) => {
    server!.once('listening', resolve)
    server!.once('error', reject)
    server!.listen(pipeName)
  }).catch((err: { code?: string }) => {
    // second guard: EADDRINUSE means a daemon took the pipe between probe and
    // listen; exit quietly, the state file was not published
    if (err.code === 'EADDRINUSE') process.exit(0)
    throw err
  })
  // state file is only published after we own the pipe; a losing starter exits quietly
  const stateFile: WinmuxStateFile = { pipe: pipeName, token, pid: process.pid }
  writeFileSync(statePath, JSON.stringify(stateFile))
  server.on('close', () => {
    // exit is driven by the session lifecycle, not socket lifecycle
    void closing
  })
}
