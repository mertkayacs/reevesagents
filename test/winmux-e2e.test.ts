// Live daemon e2e: Windows-only, drives the real ConPTY through the built CLI.
// Skipped entirely when dist/winmux.js has not been built or host is not win32.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { winmuxPipeName } from '../src/core/winmux.js'

const WINMUX_CLI = join(process.cwd(), 'dist', 'winmux.js')
const d = describe.skipIf(process.platform !== 'win32' || !existsSync(WINMUX_CLI))

let tmpHome = ''

const cli = (args: string[], opts: { input?: string } = {}): { code: number; stdout: string; stderr: string } => {
  const r = spawnSync('node', [WINMUX_CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, REEVES_REGISTRY: tmpHome },
    input: opts.input,
    timeout: 30_000,
    shell: false,
  })
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

// ConPTY output is async: poll capture-pane until the needle shows up.
const captureUntil = (paneId: string, needle: string): string => {
  const deadline = Date.now() + 20_000
  let out = ''
  while (Date.now() < deadline) {
    out = cli(['capture-pane', '-p', '-S', '-10', '-t', paneId]).stdout
    if (out.includes(needle)) return out
    spawnSync('ping', ['-n', '2', '127.0.0.1'], { stdio: 'ignore' }) // ~2s wait on Windows
  }
  return out
}

afterAll(() => {
  if (!tmpHome) return
  // best effort: kill every session, then kill the daemon by its state file pid
  const run = (args: string[]): void => {
    spawnSync('node', [WINMUX_CLI, ...args], { env: { ...process.env, REEVES_REGISTRY: tmpHome }, stdio: 'ignore', timeout: 10_000 })
  }
  try {
    const state = JSON.parse(readFileSync(join(tmpHome, 'winmux.json'), 'utf8')) as { pid?: number }
    for (const name of ['v', 'v2', 'leader', 'smoke']) run(['kill-session', '-t', `=${name}`])
    if (state.pid && state.pid !== process.pid) spawnSync('taskkill', ['/PID', String(state.pid), '/T', '/F'], { stdio: 'ignore' })
  } catch { /* nothing left to clean */ }
  rmSync(tmpHome, { recursive: true, force: true })
})

d('winmux e2e', () => {
  beforeAll(() => { tmpHome = mkdtempSync(join(tmpdir(), 'reeves-winmux-e2e-')) })

  it('-V prints the tmux version string', () => {
    expect(cli(['-V']).stdout.trim()).toContain('tmux 3.4')
  })

  it('pane lifecycle: new-session, new-window with real pid, send-keys, capture, buffers', async () => {
    expect(cli(['list-sessions']).stderr.trim()).toBe('no server running')
    expect(cli(['new-session', '-d', '-s', 'smoke', '-n', 'w0', '-c', tmpHome]).code).toBe(0)
    expect(cli(['has-session', '-t', '=smoke']).code).toBe(0)
    expect(cli(['has-session', '-t', '=absent']).code).toBe(1)
    expect(cli(['new-session', '-d', '-s', 'smoke']).stderr).toContain('duplicate session: smoke')

    // pane program: prints ready, then echoes stdin lines in raw mode
    const echoFile = join(tmpHome, 'echo.mjs')
    writeFileSync(echoFile, "process.stdout.write('ready\\n');process.stdin.setRawMode(true);process.stdin.on('data',c=>process.stdout.write(c));process.stdin.resume()")
    const win = cli(['new-window', '-d', '-P', '-F', '#{window_id} #{pane_id} #{pane_pid}', '-t', 'smoke:', '-n', 'echo', '-c', tmpHome, `node ${echoFile}`])
    expect(win.code).toBe(0)
    const [winId, paneId, panePid] = win.stdout.trim().split(' ')
    expect(winId).toMatch(/^@\d+$/)
    expect(paneId).toMatch(/^%\d+$/)
    expect(Number(panePid)).toBeGreaterThan(0) // the real spawned pty pid

    expect(captureUntil(paneId, 'ready')).toContain('ready')
    expect(cli(['send-keys', '-t', paneId, '-l', 'hello winmux']).code).toBe(0)
    expect(cli(['send-keys', '-t', paneId, 'Enter']).code).toBe(0)
    expect(captureUntil(paneId, 'hello winmux')).toContain('hello winmux')

    // load-buffer/paste-buffer/delete-buffer round trip
    expect(cli(['load-buffer', '-b', 'b1', '-'], { input: 'pasted line' }).code).toBe(0)
    expect(cli(['paste-buffer', '-b', 'b1', '-t', paneId]).code).toBe(0)
    expect(captureUntil(paneId, 'pasted line')).toContain('pasted line')
    expect(cli(['delete-buffer', '-b', 'b1']).code).toBe(0)
    void winId
  }, 90_000)

  it('grouped sessions: leader formats as its own group; kill-session keeps shared windows', async () => {
    expect(cli(['new-session', '-d', '-s', 'leader', '-n', 'w0']).code).toBe(0)
    expect(cli(['new-session', '-d', '-s', 'v', '-t', '=leader']).code).toBe(0)

    const rows = cli(['list-sessions', '-F', '#{session_name}|#{session_group}|#{session_group_list}']).stdout.trim().split('\n')
    expect(rows).toContain('leader|leader|leader,v')
    expect(rows).toContain('v|leader|leader,v')

    // killing the viewer only removes the viewer; the leader keeps the windows
    expect(cli(['kill-session', '-t', '=v']).code).toBe(0)
    const afterViewer = cli(['list-windows', '-a', '-F', '#{session_name} #{window_id}']).stdout.trim().split('\n')
    expect(afterViewer.some(r => r.startsWith('leader '))).toBe(true)

    // and killing the leader keeps the remaining group member's windows alive
    expect(cli(['new-session', '-d', '-s', 'v2', '-t', '=leader']).code).toBe(0)
    expect(cli(['kill-session', '-t', '=leader']).code).toBe(0)
    const keptRows = cli(['list-windows', '-a', '-F', '#{session_name} #{window_id}']).stdout.trim().split('\n').filter(Boolean)
    expect(keptRows.some(r => r.startsWith('v2 '))).toBe(true)
    expect(keptRows.some(r => r.startsWith('smoke '))).toBe(true)

    expect(cli(['kill-session', '-t', '=v2']).code).toBe(0)
    expect(cli(['kill-window', '-t', 'smoke:0']).code).toBe(0) // initial window
    expect(cli(['kill-session', '-t', '=smoke']).code).toBe(0)
  }, 60_000)

  it('stale pid in winmux.json does not block daemon startup', () => {
    // pid is live (this test runner), pipe name is not listening: a pid-only
    // liveness check would exit the new daemon and the client would time out
    const staleHome = mkdtempSync(join(tmpdir(), 'reeves-winmux-stale-'))
    try {
      const stalePipe = winmuxPipeName(staleHome) // matches the daemon's own derivation
      writeFileSync(join(staleHome, 'winmux.json'), JSON.stringify({ pipe: stalePipe, token: 'x', pid: process.pid }))
      const r = spawnSync('node', [WINMUX_CLI, 'new-session', '-d', '-s', 'stale', '-n', 'w'], {
        encoding: 'utf8',
        env: { ...process.env, REEVES_REGISTRY: staleHome },
        timeout: 30_000,
        shell: false,
      })
      expect(r.status).toBe(0)
      expect(spawnSync('node', [WINMUX_CLI, 'has-session', '-t', '=stale'], {
        encoding: 'utf8',
        env: { ...process.env, REEVES_REGISTRY: staleHome },
        timeout: 30_000,
        shell: false,
      }).status).toBe(0)
      // cleanup: the started daemon exits on its own once the session is gone
      spawnSync('node', [WINMUX_CLI, 'kill-session', '-t', '=stale'], {
        encoding: 'utf8', env: { ...process.env, REEVES_REGISTRY: staleHome }, timeout: 10_000, shell: false,
      })
    } finally {
      rmSync(staleHome, { recursive: true, force: true })
    }
  })

  it('daemon exits after the last session is gone', async () => {
    const deadline = Date.now() + 10_000
    let last = cli(['list-sessions'])
    while (Date.now() < deadline) {
      last = cli(['list-sessions'])
      if (last.stderr.trim() === 'no server running') break
      spawnSync('ping', ['-n', '2', '127.0.0.1'], { stdio: 'ignore' })
    }
    expect(last.stderr.trim()).toBe('no server running')
    expect(last.code).toBe(1)
  })
})
