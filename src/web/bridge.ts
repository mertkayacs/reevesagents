// Terminal bridge: pipes a browser terminal to a tmux window over an in-process
// websocket. Input: HTTP upgrade requests on /term?id=<terminal>. Output: a live
// PTY attached to the run's tmux window, streamed both ways as JSON frames.
// Invariant: the tmux target comes only from the registry record, never the
// client. Each connection gets an ephemeral grouped viewer session that is
// disposed on disconnect; the provider's own window is never killed here.

import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { URL } from 'node:url'
import type { Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, type WebSocket, type RawData } from 'ws'
import pty from '@lydell/node-pty'
import { findAgent, readRun } from '../core/runs.js'
import { isAllowedHostHeader, isAllowedOrigin } from './guards.js'

type Pty = ReturnType<typeof pty.spawn>

interface Bridge {
  ws: WebSocket
  term: Pty
  viewer: string
}

export interface TerminalTarget {
  session: string
  windowId: string
  nickname: string
}

export type ClientFrame = { t: 'i'; d: string } | { t: 'r'; c: number; r: number }

// Resolves an agent id to its tmux target using only the registry record.
// Throws a user-facing message when the agent cannot be bridged.
export function resolveTerminalTarget(id: string): TerminalTarget {
  if (!id) throw new Error('missing agent id')
  const agent = findAgent(id)
  readRun(agent.run_id)
  if (agent.ended_at) throw new Error('agent has ended')
  if (agent.headless || !agent.tmux_window_id) throw new Error('agent has no tmux window')
  return { session: agent.tmux_session, windowId: agent.tmux_window_id, nickname: agent.nickname }
}

export function parseClientFrame(raw: RawData | string): ClientFrame | null {
  let text: string
  if (typeof raw === 'string') text = raw
  else if (Buffer.isBuffer(raw)) text = raw.toString('utf8')
  else if (Array.isArray(raw)) text = Buffer.concat(raw).toString('utf8')
  else if (raw instanceof ArrayBuffer) text = Buffer.from(raw).toString('utf8')
  else return null

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const frame = parsed as Record<string, unknown>
  if (frame.t === 'i' && typeof frame.d === 'string') return { t: 'i', d: frame.d }
  if (frame.t === 'r' && typeof frame.c === 'number' && typeof frame.r === 'number') {
    return { t: 'r', c: frame.c, r: frame.r }
  }
  return null
}

function tmuxAvailable(): boolean {
  try {
    return spawnSync('tmux', ['-V'], { stdio: 'ignore' }).status === 0
  } catch {
    return false
  }
}

function send(ws: WebSocket, frame: Record<string, unknown>): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(frame))
}

function disposeBridge(bridge: Bridge): void {
  try { bridge.term.kill() } catch { /* already exited */ }
  try {
    execFileSync('tmux', ['kill-session', '-t', bridge.viewer], { stdio: 'ignore' })
  } catch {
    // viewer session already gone; the shared provider window is untouched
  }
  try { if (bridge.ws.readyState === bridge.ws.OPEN) bridge.ws.close() } catch { /* already closing */ }
}

function openBridge(ws: WebSocket, id: string, bridges: Set<Bridge>): void {
  let target: TerminalTarget
  try {
    target = resolveTerminalTarget(id)
  } catch (err) {
    send(ws, { t: 'e', m: err instanceof Error ? err.message : 'agent not found' })
    ws.close()
    return
  }

  if (!tmuxAvailable()) {
    send(ws, { t: 'e', m: 'tmux is not available on this host' })
    ws.close()
    return
  }

  // Ephemeral viewer session grouped with the run session: it shares the run's
  // windows but keeps an independent current window, so each card views its own
  // terminal without disturbing the human's attached client.
  const viewer = `reevesweb_${randomBytes(4).toString('hex')}`
  try {
    execFileSync('tmux', ['new-session', '-d', '-s', viewer, '-t', target.session], { stdio: 'ignore' })
    execFileSync('tmux', ['select-window', '-t', `${viewer}:${target.windowId}`], { stdio: 'ignore' })
  } catch {
    try { execFileSync('tmux', ['kill-session', '-t', viewer], { stdio: 'ignore' }) } catch { /* nothing to clean */ }
    send(ws, { t: 'e', m: 'could not open a tmux view for this agent' })
    ws.close()
    return
  }

  const term = pty.spawn('tmux', ['attach-session', '-t', viewer], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    env: process.env,
  })

  const bridge: Bridge = { ws, term, viewer }
  bridges.add(bridge)

  let cleaned = false
  const cleanup = (): void => {
    if (cleaned) return
    cleaned = true
    bridges.delete(bridge)
    disposeBridge(bridge)
  }

  term.onData(data => send(ws, { t: 'o', d: data }))
  term.onExit(({ exitCode }) => {
    send(ws, { t: 'x', code: exitCode })
    cleanup()
  })

  ws.on('message', raw => {
    const frame = parseClientFrame(raw)
    if (!frame) return
    if (frame.t === 'i') {
      term.write(frame.d)
    } else {
      try { term.resize(Math.max(1, Math.floor(frame.c)), Math.max(1, Math.floor(frame.r))) } catch { /* pane gone */ }
    }
  })
  ws.on('close', cleanup)
  ws.on('error', cleanup)
}

export interface BridgeHandle {
  close: () => Promise<void>
}

// Attaches the websocket terminal bridge to an existing HTTP server. No separate
// network port is opened. getPort returns the bound port for the origin check.
export function attachTerminalBridge(server: Server, getPort: () => number): BridgeHandle {
  const wss = new WebSocketServer({ noServer: true })
  const bridges = new Set<Bridge>()

  server.on('upgrade', (req, socket: Duplex, head) => {
    const port = getPort()
    if (!isAllowedHostHeader(req.headers.host) || !isAllowedOrigin(req.headers.origin, port)) {
      socket.destroy()
      return
    }
    let pathname: string
    let id: string
    try {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
      pathname = url.pathname
      id = url.searchParams.get('id') ?? ''
    } catch {
      socket.destroy()
      return
    }
    if (pathname !== '/term') {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, ws => openBridge(ws, id, bridges))
  })

  return {
    close: () => new Promise<void>(resolve => {
      for (const bridge of bridges) disposeBridge(bridge)
      bridges.clear()
      wss.close(() => resolve())
    }),
  }
}
