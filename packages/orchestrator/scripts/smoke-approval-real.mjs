// Real-provider approval smoke. Starts one real provider worker, asks it to
// request approval through Reeves MCP, approves it, and verifies completion.
// Opt-in only: uses real provider CLIs, auth, and quota.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cliPath = join(packageRoot, 'dist', 'cli.js')
const pathSep = process.platform === 'win32' ? ';' : ':'
const PROVIDER_BIN = { cc: 'claude', codex: 'codex', opencode: 'opencode', hermes: 'hermes' }
const DEFAULT_PROVIDERS = ['cc']
const READY_DELAY_MS = Number.parseInt(process.env.REEVES_APPROVAL_READY_DELAY_MS ?? '5000', 10)
const TIMEOUT_MS = Number.parseInt(process.env.REEVES_APPROVAL_TIMEOUT_MS ?? '240000', 10)
const SEND_TASK_DELAY_MS = Number.parseInt(process.env.REEVES_APPROVAL_SEND_TASK_DELAY_MS ?? '8000', 10)

function ok(label) { console.log(`  ok  ${label}`) }
function skip(label) { console.log(`  --  ${label}`) }
function fail(label, err) {
  console.error(`  FAIL ${label}: ${err?.message ?? err}`)
  process.exitCode = 1
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function which(bin) {
  const result = spawnSync('which', [bin], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : ''
}

function writeExecutable(path, source) {
  writeFileSync(path, source, 'utf8')
  chmodSync(path, 0o755)
}

function tmuxExec(realTmux, socketPath, args, opts = {}) {
  return execFileSync(realTmux, ['-S', socketPath, ...args], {
    encoding: 'utf8',
    stdio: opts.stdio ?? ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function sessionExists(realTmux, socketPath, session) {
  const result = spawnSync(realTmux, ['-S', socketPath, 'has-session', '-t', session], { stdio: 'ignore' })
  return result.status === 0
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

async function call(client, name, args = {}) {
  return readTool(await client.callTool({ name, arguments: args }), name)
}

async function connectMcp(baseEnv, extraEnv = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, 'mcp'],
    env: { ...baseEnv, ...extraEnv },
  })
  const client = new Client(
    { name: 'reevesagents-real-approval-smoke', version: '1.2.0' },
    { capabilities: {} },
  )
  await client.connect(transport)
  return client
}

async function eventually(label, fn, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  let lastErr = null
  while (Date.now() < deadline) {
    try {
      const value = await fn()
      if (value) { ok(label); return value }
    } catch (err) {
      lastErr = err
    }
    await sleep(1000)
  }
  throw new Error(`${label} timed out after ${timeoutMs}ms${lastErr ? `: ${lastErr.message}` : ''}`)
}

function selectedProviders() {
  const requested = process.env.REEVES_REAL_PROVIDER
  if (!requested) return DEFAULT_PROVIDERS
  return requested
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function approvalTask(markerPath) {
  return [
    'This is a ReevesAgents real-provider approval smoke test.',
    '',
    'You must use ReevesAgents MCP tools.',
    '',
    'Required steps:',
    '1. Call context() so you know your agent id and run.',
    '2. Call request_approval with action "write_marker", summary "write approval marker", risk "low", and details {"marker":"approval-marker.txt"}.',
    '3. Save the returned approval id.',
    '4. Call check_approval with that id until status is "approved".',
    `5. After approval, write the file ${markerPath} with exactly this content: approved`,
    '6. Call update_task for your own agent id with status "done" and note "approval smoke complete".',
    '7. Do not do unrelated work.',
  ].join('\n')
}

async function smokeProvider(provider, baseEnv, realTmux, socketPath, workDir) {
  const bin = PROVIDER_BIN[provider]
  if (!bin) {
    fail(`${provider}`, new Error(`unsupported provider ${provider}`))
    return
  }

  const binPath = which(bin)
  if (!binPath) {
    skip(`${provider}: ${bin} not installed`)
    return
  }

  if (!DEFAULT_PROVIDERS.includes(provider) && !process.env.REEVES_REAL_PROVIDER) {
    skip(`${provider}: approval smoke defaults to cc; set REEVES_REAL_PROVIDER=${provider} to try it with current provider MCP behavior`)
    return
  }

  console.log(`\n  [${provider}] ${binPath}`)
  const markerPath = join(workDir, `${provider}-approval-marker.txt`)
  const clients = []
  let run = null

  try {
    const operator = await connectMcp(baseEnv)
    clients.push(operator)

    const started = await call(operator, 'start_run', {
      name: `approval-${provider}`,
      working_dir: workDir,
      root_is_caller: true,
      root: { provider: 'codex', model: '', task: 'headless root for approval smoke', nickname: 'root' },
      workers: [
        {
          provider,
          model: '',
          task: '',
          nickname: `${provider}-approval-worker`,
          permissions: 'skip',
        },
      ],
      ready_delay_ms: READY_DELAY_MS,
    })

    run = started.run
    const root = started.agents?.find(agent => agent.role === 'root')
    const worker = started.agents?.find(agent => agent.role === 'worker')
    assert(run && root && worker, 'start_run should return run, root, and worker')
    assert(root.headless === true, 'root should be headless')
    assert(sessionExists(realTmux, socketPath, run.tmux_session), 'run tmux session should exist')
    ok(`${provider}: started headless-root run with real worker`)

    await sleep(SEND_TASK_DELAY_MS)
    await call(operator, 'send_text', { agent_id: worker.id, text: approvalTask(markerPath) })
    await call(operator, 'send_key', { agent_id: worker.id, key: 'enter' })
    ok(`${provider}: sent approval task to worker`)

    const rootClient = await connectMcp(baseEnv, {
      REEVES_SESSION_ID: root.id,
      REEVES_AGENT_ID: root.id,
      REEVES_RUN_ID: run.id,
      REEVES_ROLE: 'root',
    })
    clients.push(rootClient)

    await eventually(`${provider}: worker requested approval`, async () => {
      const pending = await call(rootClient, 'list_approvals', { status: 'pending' })
      return Array.isArray(pending) && pending.find(item => item.agent_id === worker.id && item.action === 'write_marker')
    })

    const pending = await call(rootClient, 'list_approvals', { status: 'pending' })
    const approval = pending.find(item => item.agent_id === worker.id && item.action === 'write_marker')
    assert(approval, 'pending worker approval should exist')
    await call(rootClient, 'resolve_approval', {
      approval_id: approval.id,
      decision: 'approved',
      note: 'approved by real approval smoke',
    })
    ok(`${provider}: root resolved approval`)

    await eventually(`${provider}: worker wrote marker file`, () => {
      if (!existsSync(markerPath)) return false
      return readFileSync(markerPath, 'utf8').trim() === 'approved'
    })

    await eventually(`${provider}: worker marked task done`, async () => {
      const payload = await call(rootClient, 'get_run')
      const current = payload.agents?.find(agent => agent.id === worker.id)
      return current?.task_status === 'done' && current?.task_note === 'approval smoke complete'
    })

    const stopped = await call(rootClient, 'stop_run')
    assert(stopped.ended_at, 'stop_run should mark run ended')
    await sleep(500)
    assert(!sessionExists(realTmux, socketPath, run.tmux_session), 'run tmux session should be gone after stop_run')
    ok(`${provider}: stop_run cleaned up run tmux session`)
    run = null
  } catch (err) {
    try {
      if (run && clients[0]) {
        const currentRun = await call(clients[0], 'get_run', { run_id: run.id })
        const stateLines = currentRun.agents
          ?.map(agent => `${agent.role}:${agent.nickname}:${agent.task_status}:${agent.task_note || '-'}`)
          .join('\n') ?? '(no agents)'
        console.error(`\n--- ${provider} run state ---\n${stateLines}\n--- end state ---`)

        const agents = currentRun.agents ?? []
        const worker = agents.find(agent => agent.role === 'worker')
        if (worker) {
          const output = await call(clients[0], 'peek', { agent_id: worker.id, lines: 80 })
          console.error(`\n--- ${provider} worker output ---\n${output || '(empty)'}\n--- end output ---`)
        }
      }
    } catch {
      // best-effort diagnostics only
    }
    fail(`${provider}`, err)
  } finally {
    for (const client of clients.reverse()) {
      try { await client.close() } catch { /* ignore */ }
    }
    if (run) {
      try { tmuxExec(realTmux, socketPath, ['kill-session', '-t', run.tmux_session], { stdio: 'ignore' }) } catch { /* ignore */ }
    }
  }
}

async function main() {
  const realTmux = which('tmux')
  if (!realTmux) throw new Error('tmux required for smoke:approval-real')

  const tmpDir = mkdtempSync(join(tmpdir(), 'reeves-smoke-approval-real-'))
  const binDir = join(tmpDir, 'bin')
  const socketPath = join(tmpDir, 'tmux.sock')
  const workDir = join(tmpDir, 'work')
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
  console.log(`providers: ${selectedProviders().join(', ')}`)

  try {
    mkdirSync(binDir, { recursive: true })
    mkdirSync(workDir, { recursive: true })
    writeExecutable(join(binDir, 'tmux'), [
      '#!/bin/sh',
      `exec ${JSON.stringify(realTmux)} -S ${JSON.stringify(socketPath)} "$@"`,
      '',
    ].join('\n'))

    for (const provider of selectedProviders()) {
      await smokeProvider(provider, baseEnv, realTmux, socketPath, workDir)
    }
  } finally {
    try { tmuxExec(realTmux, socketPath, ['kill-server'], { stdio: 'ignore' }) } catch { /* ignore */ }
    if (process.env.REEVES_KEEP_SMOKE_DIR === '1') {
      console.log(`kept smoke dir: ${tmpDir}`)
    } else {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  }
}

main().catch(err => {
  fail('uncaught', err)
  process.exit(1)
})
