// Real-provider smoke. Verifies each available provider CLI starts via MCP,
// its pane produces output, send_text reaches it, and stop_run cleans up.
// Providers are tested when their real CLI is installed.
// Inputs: none. Outputs: ok/skip/FAIL lines + exit code.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cliPath = join(repoRoot, 'dist', 'cli.js')
const pathSep = process.platform === 'win32' ? ';' : ':'

function ok(label) { console.log(`  ok  ${label}`) }
function skip(label) { console.log(`  --  ${label}`) }
function fail(label, err) {
  console.error(`  FAIL ${label}: ${err?.message ?? err}`)
  process.exitCode = 1
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function which(bin) {
  const r = spawnSync('which', [bin], { encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : ''
}

function writeExecutable(path, src) {
  writeFileSync(path, src, 'utf8')
  chmodSync(path, 0o755)
}

function tmuxExec(realTmux, socketPath, args, opts = {}) {
  return execFileSync(realTmux, ['-S', socketPath, ...args], {
    encoding: 'utf8',
    stdio: opts.stdio ?? ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function sessionExists(realTmux, socketPath, session) {
  const r = spawnSync(realTmux, ['-S', socketPath, 'has-session', '-t', session], { stdio: 'ignore' })
  return r.status === 0
}

function windowExists(realTmux, socketPath, windowId) {
  const r = spawnSync(realTmux, ['-S', socketPath, 'display-message', '-p', '-t', windowId, '#{window_id}'], { encoding: 'utf8' })
  return r.status === 0 && r.stdout.trim() === windowId
}

function readTool(result, name) {
  const text = result.content?.[0]?.text ?? ''
  let parsed
  try { parsed = JSON.parse(text) } catch { parsed = text }
  if (result.isError) {
    throw new Error(`${name}: ${typeof parsed === 'object' && parsed?.error ? parsed.error : text}`)
  }
  return parsed
}

async function eventually(label, fn, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  let lastErr = null
  while (Date.now() < deadline) {
    try {
      const v = await fn()
      if (v) { ok(label); return v }
    } catch (e) { lastErr = e }
    await sleep(300)
  }
  throw new Error(`${label} timed out${lastErr ? `: ${lastErr.message}` : ''}`)
}

async function call(client, name, args = {}) {
  return readTool(await client.callTool({ name, arguments: args }), name)
}

// mirrors BIN in src/launcher/providers.ts
const PROVIDER_BIN = { cc: 'claude', codex: 'codex', opencode: 'opencode', hermes: 'hermes' }
const READY_DELAY_MS = 5000

async function smokeProvider(client, provider, realTmux, socketPath) {
  const bin = PROVIDER_BIN[provider]
  const binPath = which(bin)
  if (!binPath) {
    skip(`${provider}: ${bin} not installed`)
    return
  }

  console.log(`\n  [${provider}] ${binPath}`)
  let run = null
  try {
    const started = await call(client, 'start_run', {
      name: `smoke-${provider}`,
      working_dir: tmpdir(),
      root: { provider, model: '', task: '', nickname: 'smoke', permissions: 'skip' },
      ready_delay_ms: READY_DELAY_MS,
    })
    run = started.run
    const root = started.agents?.find(a => a.role === 'root')
    if (!run || !root) throw new Error('start_run missing run or root agent')
    if (!sessionExists(realTmux, socketPath, run.tmux_session)) throw new Error('tmux session not created')
    ok(`${provider}: start_run created tmux session`)

    await eventually(`${provider}: peek returns non-empty`, async () => {
      const out = await call(client, 'peek', { agent_id: root.id, lines: 50 })
      return typeof out === 'string' && out.trim().length > 0
    })
    await sleep(READY_DELAY_MS + 300)

    await call(client, 'send_text', { agent_id: root.id, text: 'smoke' })
    await call(client, 'send_key', { agent_id: root.id, key: 'enter' })
    ok(`${provider}: send_text and send_key completed`)

    const stopped = await call(client, 'stop_run', { run_id: run.id })
    if (!stopped.ended_at) throw new Error('stop_run did not mark run ended')
    await sleep(300)
    if (sessionExists(realTmux, socketPath, run.tmux_session)) throw new Error('run tmux session still exists after stop_run')
    if (windowExists(realTmux, socketPath, root.tmux_window_id)) throw new Error('root window still exists after stop_run')
    ok(`${provider}: stop_run cleaned up run tmux session`)
    run = null
  } catch (err) {
    fail(`${provider}`, err)
  } finally {
    if (run) {
      try { await call(client, 'stop_run', { run_id: run.id }) } catch { /* ignore */ }
    }
  }
}

async function main() {
  const realTmux = which('tmux')
  if (!realTmux) throw new Error('tmux required for smoke:providers-real')

  const tmpDir = mkdtempSync(join(tmpdir(), 'reeves-smoke-providers-'))
  const binDir = join(tmpDir, 'bin')
  const socketPath = join(tmpDir, 'tmux.sock')
  const baseEnv = {
    ...process.env,
    PATH: `${binDir}${pathSep}${process.env.PATH ?? ''}`,
    SHELL: '/bin/sh',
    REEVES_REGISTRY: join(tmpDir, 'registry'),
    REEVES_CONFIG: join(tmpDir, 'config.json'),
    REEVES_SETUP_HOME: join(tmpDir, 'home'),
  }

  console.log(`smoke dir: ${tmpDir}`)
  console.log(`cli:       ${cliPath}`)
  console.log(`tmux:      ${realTmux}`)

  let client = null
  try {
    mkdirSync(binDir, { recursive: true })
    // fake tmux wrapper points to isolated socket; real provider CLIs come from PATH
    writeExecutable(join(binDir, 'tmux'), [
      '#!/bin/sh',
      `exec ${JSON.stringify(realTmux)} -S ${JSON.stringify(socketPath)} "$@"`,
      '',
    ].join('\n'))

    client = await connectMcp(baseEnv)

    for (const provider of ['cc', 'codex', 'opencode', 'hermes']) {
      await smokeProvider(client, provider, realTmux, socketPath)
    }
  } finally {
    try { if (client) await client.close() } catch { /* ignore */ }
    try { tmuxExec(realTmux, socketPath, ['kill-server'], { stdio: 'ignore' }) } catch { /* ignore */ }
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

async function connectMcp(baseEnv) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, 'mcp'],
    env: baseEnv,
  })
  const client = new Client(
    { name: 'reevesagents-providers-smoke', version: '1.0' },
    { capabilities: {} },
  )
  await client.connect(transport)
  return client
}

main().catch(err => {
  fail('uncaught', err)
  process.exit(1)
})
