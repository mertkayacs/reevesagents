// winmux client: `node dist/winmux.js <tmux args>`. Connects to the daemon's
// named pipe, spawning it detached on first use; attach-style commands switch
// the socket into streaming mode with a raw-mode terminal. One short-lived
// process per command, one long-lived daemon per home dir.

import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { connect, type Socket } from 'node:net'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import {
  WINMUX_VERSION,
  isStreamingCommand,
  resolveHome,
  winmuxStatePath,
  type WinmuxStateFile,
} from './core/winmux.js'
import { runDaemon } from './core/winmux-daemon.js'

const CONNECT_TIMEOUT_MS = 5000
const RETRY_INTERVAL_MS = 100

type Frame = { t?: string; d?: string; cols?: number; rows?: number; code?: number; stdout?: string; stderr?: string }

function stateFile(): WinmuxStateFile | null {
  const path = winmuxStatePath(resolveHome(process.env, homedir()))
  try {
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, 'utf8')) as WinmuxStateFile
  } catch {
    return null
  }
}

function entryPath(): string {
  // bundled by tsup: this file IS dist/winmux-cli.js
  return fileURLToPath(import.meta.url)
}

function spawnDaemon(): void {
  const child = spawn(process.execPath, [entryPath(), '--daemon'], {
    detached: true,
    windowsHide: true,
    stdio: 'ignore',
  })
  child.unref()
}

function connectPipe(pipe: string): Promise<Socket | null> {
  return new Promise(resolve => {
    const socket = connect(pipe, () => resolve(socket))
    socket.once('error', () => resolve(null))
  })
}

async function getSocket(): Promise<{ socket: Socket; token: string } | { error: string }> {
  const end = Date.now() + CONNECT_TIMEOUT_MS
  let spawned = false
  while (Date.now() < end) {
    const state = stateFile()
    if (state?.pipe) {
      const socket = await connectPipe(state.pipe)
      if (socket) return { socket, token: state.token }
    }
    if (!spawned) {
      spawnDaemon()
      spawned = true
    }
    await new Promise(r => setTimeout(r, RETRY_INTERVAL_MS))
  }
  return { error: 'no server running' }
}

function sendRequest(socket: Socket, token: string, argv: string[], stdin: string): void {
  socket.write(JSON.stringify({ token, argv, stdin }) + '\n')
}

// Newline-delimited server frames; '' signals end-of-stream.
function readLine(socket: Socket, onLine: (_frame: string) => void): void {
  let buf = ''
  socket.setEncoding('utf8')
  socket.on('data', (chunk: string | Buffer) => {
    buf += String(chunk)
    let nl = buf.indexOf('\n')
    while (nl !== -1) {
      onLine(buf.slice(0, nl))
      buf = buf.slice(nl + 1)
      nl = buf.indexOf('\n')
    }
  })
  socket.on('end', () => {
    if (buf) {
      onLine(buf)
      buf = ''
    }
    onLine('')
  })
}

async function runStreaming(socket: Socket): Promise<void> {
  const stdin = process.stdin
  const stdout = process.stdout
  const restore = () => {
    try { stdin.setRawMode(false) } catch { /* not a TTY */ }
  }
  if (stdout.isTTY) {
    socket.write(JSON.stringify({ t: 'r', cols: stdout.columns ?? 80, rows: stdout.rows ?? 24 }) + '\n')
  }
  readLine(socket, line => {
    if (!line) {
      restore()
      process.exit(0)
    }
    let f: Frame
    try { f = JSON.parse(line) as Frame } catch { return }
    if (f.stdout !== undefined || f.stderr !== undefined) {
      restore()
      if (f.stderr) process.stderr.write(f.stderr)
      if (f.stdout) stdout.write(f.stdout)
      process.exit(f.code ?? 0)
    }
    if (f.t === 'x') {
      restore()
      process.exit(f.code ?? 0)
    }
    if (f.t === 'o') stdout.write(Buffer.from(f.d ?? '', 'base64').toString('utf8'))
  })
  if (stdin.isTTY) {
    // raw mode: Ctrl-b prefix is interpreted here, other bytes forward to the pane
    try { stdin.setRawMode(true) } catch { /* not a TTY */ }
    let prefix = false
    stdin.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      let forward = ''
      for (const ch of text) {
        if (prefix) {
          prefix = false
          if (ch === 'd') {
            restore()
            try { socket.destroy() } catch { /* socket gone */ }
            process.exit(0)
          }
          if (ch === 'n' || ch === 'p' || /^[0-9]$/.test(ch)) {
            socket.write(JSON.stringify({ t: 'c', d: ch }) + '\n')
            continue
          }
          if (ch === '\x02') { forward += '\x02'; continue } // Ctrl-b Ctrl-b = literal
          continue
        }
        if (ch === '\x02') { prefix = true; continue }
        forward += ch
      }
      if (forward) {
        socket.write(JSON.stringify({ t: 'i', d: Buffer.from(forward, 'utf8').toString('base64') }) + '\n')
      }
    })
  }
  stdin.resume()
  process.on('exit', restore)
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  if (argv[0] === '-V' || argv[0] === '--version') {
    process.stdout.write(WINMUX_VERSION + '\n')
    return 0
  }
  if (argv[0] === '--daemon') {
    // daemon stays alive until its session lifecycle calls exit
    await runDaemon()
    await new Promise<void>(() => {})
  }
  const got = await getSocket()
  if ('error' in got && got.error) {
    process.stderr.write(got.error + '\n')
    return 1
  }
  const { socket, token } = got as { socket: Socket; token: string }
  if (isStreamingCommand(argv[0] ?? '')) {
    sendRequest(socket, token, argv, '')
    await runStreaming(socket)
    return 0
  }
  const wantsStdin = argv[0] === 'load-buffer'
  return await new Promise<number>(resolve => {
    readLine(socket, line => {
      if (!line) return
      let f: Frame
      try { f = JSON.parse(line) as Frame } catch { return }
      if (f.stdout !== undefined || f.stderr !== undefined) {
        socket.destroy()
        if (f.stderr) process.stderr.write(f.stderr)
        if (f.stdout) process.stdout.write(f.stdout)
        resolve(f.code ?? 1)
      }
    })
    if (wantsStdin) {
      const chunks: Buffer[] = []
      process.stdin.resume()
      process.stdin.on('data', (c: Buffer) => chunks.push(c))
      process.stdin.on('end', () => {
        sendRequest(socket, token, argv, Buffer.concat(chunks).toString('utf8'))
      })
    } else {
      sendRequest(socket, token, argv, '')
    }
  })
}

main().then(code => process.exit(code)).catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
