// Pure, OS-agnostic core of winmux, the tmux-compatible Windows multiplexer.
// Everything here is testable without a PTY: argv parsing, target resolution
// over a plain state snapshot, tmux format expansion and key-name translation.
// The stateful parts (PTY hosting, named-pipe server/client) live in
// winmux-daemon.ts and winmux-cli.ts.

import { createHash } from 'node:crypto'
import { join } from 'node:path'

export const WINMUX_VERSION = 'tmux 3.4 (reevesagents winmux)'

export interface WMWindow {
  id: string // '@N'
  name: string
  index: number
  paneId: string // '%N'
}

export interface WMSession {
  name: string
  createdSec: number
  group: string // name of the session this was created from, '' when not grouped
  windows: WMWindow[]
  currentWindowId: string
  attached: number // number of streaming clients attached
}

export interface WMState {
  sessions: WMSession[] // creation order
}

export interface TargetCtx {
  envPaneId?: string
}

// ---------------------------------------------------------------- argv parsing

export interface ParsedArgs {
  command: string
  bools: Set<string>
  strs: Record<string, string>
  rest: string[]
  error?: string
}

interface CommandFlags { bool: string[]; value: string[] }

const COMMAND_FLAGS: Record<string, CommandFlags> = {
  'new-session': { bool: ['d'], value: ['s', 'n', 'c', 't'] },
  'new-window': { bool: ['d', 'P'], value: ['F', 't', 'n', 'c'] },
  'link-window': { bool: ['k'], value: ['s', 't'] },
  'kill-window': { bool: [], value: ['t'] },
  'kill-session': { bool: [], value: ['t'] },
  'has-session': { bool: [], value: ['t'] },
  'list-sessions': { bool: [], value: ['F'] },
  'list-windows': { bool: ['a'], value: ['t', 'F'] },
  'list-panes': { bool: ['s'], value: ['t', 'F'] },
  'display-message': { bool: ['p'], value: ['t'] },
  'select-window': { bool: [], value: ['t'] },
  'switch-client': { bool: [], value: ['t'] },
  'send-keys': { bool: ['l'], value: ['t'] },
  'load-buffer': { bool: [], value: ['b'] },
  'paste-buffer': { bool: [], value: ['b', 't'] },
  'delete-buffer': { bool: [], value: ['b'] },
  'capture-pane': { bool: ['p', 'e', 'a', 'J'], value: ['S', 'N', 't'] },
  'attach-session': { bool: [], value: ['t'] },
  attach: { bool: [], value: ['t'] },
}

export const isStreamingCommand = (command: string): boolean =>
  command === 'attach-session' || command === 'attach'

// Flag clusters: '-dPF fmt' → d and P are booleans, F takes the next argument.
// Inline binds ('-S-10', '-t=name') are accepted too.
export function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] ?? ''
  if (!command) return { command, bools: new Set(), strs: {}, rest: [], error: 'no command given' }
  const spec = COMMAND_FLAGS[command]
  const knownBool = new Set(spec?.bool ?? [])
  const knownValue = new Set(spec?.value ?? [])
  const bools = new Set<string>()
  const strs: Record<string, string> = {}
  const rest: string[] = []
  let i = 1
  while (i < argv.length) {
    const arg = argv[i]
    if (arg.length > 1 && arg.startsWith('-') && arg !== '--') {
      const body = arg.slice(1)
      if (knownValue.has(body[0]) && body.length > 1) { strs[body[0]] = body.slice(1); i++; continue } // '-S-80'
      if (/^[a-zA-Z]+$/.test(body.split('=')[0])) {
        const chars = body
        for (let k = 0; k < chars.length; k++) {
          const c = chars[k]
          if (knownValue.has(c)) {
            if (chars[k + 1] === '=') strs[c] = chars.slice(k + 2)
            else if (chars[k + 1]) strs[c] = chars.slice(k + 1)
            else if (i + 1 < argv.length) strs[c] = argv[++i]
            else return { command, bools, strs, rest, error: `missing value for -${c}` }
            break
          }
          if (!knownBool.has(c)) return { command, bools, strs, rest, error: `unknown flag -${c} for ${command}` }
          bools.add(c)
        }
      }
      i++
      continue
    }
    rest.push(arg)
    i++
  }
  return { command, bools, strs, rest }
}

// ---------------------------------------------------------------- key names

export function translateKey(token: string): string {
  switch (token) {
    case 'Enter': return '\r'
    case 'Escape': return '\x1b'
    case 'BSpace': return '\x7f'
    case 'Tab': return '\t'
    case 'Space': return ' '
    case 'Up': return '\x1b[A'
    case 'Down': return '\x1b[B'
    case 'Right': return '\x1b[C'
    case 'Left': return '\x1b[D'
    default: return ''
  }
}

// send-keys tokens: tmux key names, C-letter control chars, everything else
// goes to the pane as literal text.
export function translateKeys(tokens: string[], literal: boolean): string {
  let out = ''
  for (const token of tokens) {
    if (literal) { out += token; continue }
    const direct = translateKey(token)
    if (direct) { out += direct; continue }
    const ctrl = token.match(/^C-([a-zA-Z0-9])$/)
    if (ctrl) { out += String.fromCharCode(ctrl[1].toUpperCase().codePointAt(0)! - 64); continue }
    out += token
  }
  return out
}

// ---------------------------------------------------------------- targets

export interface ResolvedTarget {
  kind: 'session' | 'window' | 'pane'
  session: WMSession | null
  window: WMWindow | null
  paneId: string | null
  error?: string
}

function paneToWindow(state: WMState, paneId: string): { session: WMSession; window: WMWindow } | null {
  for (const s of state.sessions) {
    for (const w of s.windows) {
      if (w.paneId === paneId) return { session: s, window: w }
    }
  }
  return null
}

function windowToSession(state: WMState, windowId: string): { session: WMSession; window: WMWindow } | null {
  for (const s of state.sessions) {
    const w = s.windows.find(x => x.id === windowId)
    if (w) return { session: s, window: w }
  }
  return null
}

function bareId(target: string, prefix: string): string | null {
  const m = target.match(`^\\${prefix}\\d+$`)
  return m ? target : null
}

function findWindow(s: WMSession, part: string): WMWindow | null {
  if (part === '') return s.windows.find(w => w.id === s.currentWindowId) ?? s.windows[s.windows.length - 1] ?? null
  const at = bareId(part, '@')
  if (at) return s.windows.find(w => w.id === at) ?? null
  if (/^\d+$/.test(part)) return s.windows.find(w => w.index === Number(part)) ?? null
  return s.windows.find(w => w.name === part) ?? null
}

function defaultSession(state: WMState, ctx: TargetCtx): WMSession | null {
  if (ctx.envPaneId) {
    const r = paneToWindow(state, ctx.envPaneId)
    if (r) return r.session
  }
  return state.sessions[state.sessions.length - 1] ?? null
}

const notFound = (kind: 'session' | 'window' | 'pane', target: string | undefined): string =>
  `can't find ${kind}: ${target ?? ''}`

// mode 'session': kill-session/has-session/attach. mode 'window': kill-window,
// select-window, new-window -t, list-windows. mode 'pane': send-keys/capture.
// For window/pane commands a session target means its current window; a pane id
// means its window. No target: env.TMUX_PANE's session, else most recently
// created session.
export function resolveTarget(
  state: WMState,
  target: string | undefined,
  ctx: TargetCtx,
  mode: 'session' | 'window' | 'pane',
): ResolvedTarget {
  const fail = (kind: 'session' | 'window' | 'pane'): ResolvedTarget =>
    ({ kind: mode, session: null, window: null, paneId: null, error: notFound(kind, target) })
  const finalize = (session: WMSession | null, window: WMWindow | null): ResolvedTarget => {
    const base: ResolvedTarget = { kind: mode, session, window, paneId: window?.paneId ?? null }
    if (!session) return fail('session')
    if (mode === 'window' && !window) return fail('window')
    if (mode === 'pane' && !base.paneId) return fail('pane')
    return base
  }

  if (target === undefined || target === '') {
    const s = defaultSession(state, ctx)
    if (!s) return fail('session')
    return finalize(s, mode === 'session' ? null : findWindow(s, ''))
  }

  const at = bareId(target, '@')
  const pc = bareId(target, '%')
  if (at) {
    const r = windowToSession(state, at)
    if (!r) return fail('session')
    return finalize(r.session, mode === 'session' ? null : r.window)
  }
  if (pc) {
    const r = paneToWindow(state, pc)
    if (!r) return fail('pane')
    return finalize(r.session, r.window)
  }

  if (target.includes(':')) {
    let sessionPart = target.slice(0, target.indexOf(':'))
    const windowPart = target.slice(target.indexOf(':') + 1)
    if (sessionPart.startsWith('=')) sessionPart = sessionPart.slice(1)
    const s = state.sessions.find(x => x.name === sessionPart)
    if (!s) return fail('session')
    const w = findWindow(s, windowPart)
    if (!w) return fail(mode)
    return finalize(s, w)
  }

  const name = target.startsWith('=') ? target.slice(1) : target
  const s = state.sessions.find(x => x.name === name)
  if (s) return finalize(s, mode === 'session' ? null : findWindow(s, ''))
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const sess = state.sessions[i]
    const w = sess.windows.find(x => x.name === name)
    if (w) return finalize(sess, w)
  }
  return fail(mode)
}

// ---------------------------------------------------------------- formats

export interface FmtCtx {
  session_name: string
  session_attached: number
  session_group: string
  session_group_list: string
  session_created: number
  window_id: string
  window_name: string
  window_index: number
  pane_id: string
  pane_pid: number
  pane_current_command: string
}

const FORMAT_KEYS = [
  'session_name', 'session_attached', 'session_group', 'session_group_list',
  'session_created', 'window_id', 'window_name', 'window_index',
  'pane_id', 'pane_pid', 'pane_current_command',
] as const

const SHORT_FORMATS: Record<string, string> = { S: 'session_name', I: 'window_index', W: 'window_name', D: 'pane_id' }

export function expandFormat(fmt: string, ctx: FmtCtx): string {
  const values = ctx as unknown as Record<string, unknown>
  let out = ''
  let i = 0
  while (i < fmt.length) {
    if (fmt[i] === '#' && fmt[i + 1] === '{') {
      const end = fmt.indexOf('}', i + 2)
      if (end !== -1) {
        out += fmtValue(fmt.slice(i + 2, end), values)
        i = end + 1
        continue
      }
    }
    if (fmt[i] === '#' && SHORT_FORMATS[fmt[i + 1] ?? '']) {
      out += fmtValue(SHORT_FORMATS[fmt[i + 1]], values)
      i += 2
      continue
    }
    out += fmt[i]
    i++
  }
  return out
}

function fmtValue(key: string, values: Record<string, unknown>): string {
  return (FORMAT_KEYS as readonly string[]).includes(key) && values[key] !== undefined ? String(values[key]) : ''
}

// ---------------------------------------------------------------- home paths

export function winmuxStatePath(home: string): string {
  return join(home, 'winmux.json')
}

// Pipe name is derived from the resolved state root, so an isolated registry
// (e.g. a temp REEVES_REGISTRY) gets a fully isolated server.
export function winmuxPipeName(home: string): string {
  const digest = createHash('sha256').update(home).digest('hex')
  return `\\\\.\\pipe\\reeves-winmux-${digest.slice(0, 12)}`
}

export interface WinmuxStateFile {
  pipe: string
  token: string
  pid: number
}

// Same state-root rule as runs.ts stateRoot(): REEVES_REGISTRY is a state-dir
// override, not a substitute HOME (that is REEVES_HOME in skills.ts). `||`, not
// `??`, so an empty value falls back instead of becoming a path.
export function resolveHome(env: { REEVES_REGISTRY?: string }, homedir: string): string {
  return env.REEVES_REGISTRY || join(homedir, '.reeves')
}

// ---------------------------------------------------------------- window utils

export function nextWindowIndex(windows: WMWindow[]): number {
  return windows.reduce((max, w) => Math.max(max, w.index), -1) + 1
}

// pane_current_command: basename of the pane's spawned command's first token,
// .exe stripped; 'cmd' for interactive panes (no shell-command given).
export function paneCommandName(shellCommand: string | null): string {
  if (!shellCommand) return 'cmd'
  const trimmed = shellCommand.trim()
  const quoted = trimmed.match(/^"([^"]+)"/)
  const token = quoted?.[1] ?? trimmed.split(/\s+/)[0] ?? ''
  const norm = token.replace(/\\/g, '/')
  return norm.slice(norm.lastIndexOf('/') + 1).replace(/\.exe$/i, '') || 'cmd'
}
