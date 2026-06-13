// Real tmux smoke. Starts a ReevesAgents run through MCP using a private tmux
// socket and fake provider CLIs, then exercises run, agent, input, and approval tools.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cliPath = join(packageRoot, 'dist', 'cli.js')
const pathSep = process.platform === 'win32' ? ';' : ':'

function ok(label) { console.log(`  ok  ${label}`) }
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

function providerHelp(name) {
  if (name === 'claude') return '--dangerously-skip-permissions --model --effort'
  if (name === 'codex') return '--dangerously-bypass-approvals-and-sandbox --model --enable'
  if (name === 'opencode') return '--prompt --model'
  return 'chat --model --yolo'
}

function providerSource(name) {
  return [
    '#!/bin/sh',
    'for arg in "$@"; do',
    '  if [ "$arg" = "--help" ]; then',
    `    echo ${JSON.stringify(providerHelp(name))}`,
    '    exit 0',
    '  fi',
    'done',
    `echo "[fake ${name}] started"`,
    'echo "agent:$REEVES_AGENT_ID"',
    'echo "run:$REEVES_RUN_ID"',
    'printf "args:"',
    'printf "%s " "$@"',
    'printf "\\n"',
    'while IFS= read -r line; do',
    '  echo "input:$line"',
    'done',
    'while :; do sleep 1; done',
    '',
  ].join('\n')
}

function installFakeRuntime(binDir, realTmux, socketPath) {
  writeExecutable(join(binDir, 'tmux'), [
    '#!/bin/sh',
    `exec ${JSON.stringify(realTmux)} -S ${JSON.stringify(socketPath)} "$@"`,
    '',
  ].join('\n'))

  for (const bin of ['claude', 'codex', 'opencode', 'hermes']) {
    writeExecutable(join(binDir, bin), providerSource(bin))
  }
}

function tmux(realTmux, socketPath, args, opts = {}) {
  return execFileSync(realTmux, ['-S', socketPath, ...args], {
    encoding: 'utf8',
    stdio: opts.stdio ?? ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function sessionExists(realTmux, socketPath, session) {
  const result = spawnSync(realTmux, ['-S', socketPath, 'has-session', '-t', session], { stdio: 'ignore' })
  return result.status === 0
}

function activeWindowId(realTmux, socketPath, session) {
  return tmux(realTmux, socketPath, ['list-windows', '-t', session, '-F', '#{window_id} #{window_active}'])
    .split('\n')
    .map(line => line.trim().split(/\s+/))
    .find(([, active]) => active === '1')?.[0] ?? ''
}

function listBuffers(realTmux, socketPath) {
  const output = tmux(realTmux, socketPath, ['list-buffers', '-F', '#{buffer_name}'])
  return output ? output.split('\n').filter(Boolean) : []
}

async function eventually(label, fn, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const value = await fn()
      if (value) {
        ok(label)
        return value
      }
    } catch (err) {
      lastError = err
    }
    await sleep(200)
  }
  throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ''}`)
}

function readTool(result, name) {
  const text = result.content?.[0]?.text ?? ''
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = text
  }
  if (result.isError) {
    throw new Error(`${name}: ${typeof parsed === 'object' && parsed?.error ? parsed.error : text}`)
  }
  return parsed
}

async function connectMcp(baseEnv, extraEnv = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cliPath, 'mcp'],
    env: { ...baseEnv, ...extraEnv },
  })
  const client = new Client(
    { name: 'reevesagents-tmux-smoke', version: '1.2.0' },
    { capabilities: {} },
  )
  await client.connect(transport)
  return client
}

async function call(client, name, args = {}) {
  return readTool(await client.callTool({ name, arguments: args }), name)
}

function runCliJson(baseEnv, extraEnv, args) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    env: { ...baseEnv, ...extraEnv },
  })
  assert(result.status === 0, `${args.join(' ')} exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  try {
    return JSON.parse(result.stdout)
  } catch (err) {
    throw new Error(`${args.join(' ')} did not return JSON: ${err instanceof Error ? err.message : 'parse error'}\n${result.stdout}`)
  }
}

async function main() {
  const realTmux = which('tmux')
  if (!realTmux) throw new Error('tmux is required for smoke:tmux')

  const tmpDir = mkdtempSync(join(tmpdir(), 'reeves-smoke-tmux-'))
  const binDir = join(tmpDir, 'bin')
  const registry = join(tmpDir, 'registry')
  const config = join(tmpDir, 'config.json')
  const workDir = join(tmpDir, 'work')
  const socketPath = join(tmpDir, 'tmux.sock')
  const baseEnv = {
    ...process.env,
    PATH: `${binDir}${pathSep}${process.env.PATH ?? ''}`,
    SHELL: '/bin/sh',
    REEVES_REGISTRY: registry,
    REEVES_CONFIG: config,
    REEVES_SETUP_HOME: join(tmpDir, 'home'),
  }
  const clients = []
  let run = null

  try {
    mkdirSync(binDir, { recursive: true })
    mkdirSync(workDir, { recursive: true })
    installFakeRuntime(binDir, realTmux, socketPath)
    console.log(`smoke dir: ${tmpDir}`)
    console.log(`cli:       ${cliPath}`)
    console.log(`tmux:      ${realTmux}`)

    const operator = await connectMcp(baseEnv)
    clients.push(operator)

    const started = await call(operator, 'start_run', {
      name: 'smoke run',
      working_dir: workDir,
      root: { provider: 'codex', model: 'fake-model', task: 'root smoke task', nickname: 'root' },
      workers: [
        { provider: 'opencode', model: 'fake-model', task: 'worker smoke task', nickname: 'reviewer' },
      ],
      ready_delay_ms: 0,
    })
    run = started.run
    const root = started.agents.find(agent => agent.role === 'root')
    const worker = started.agents.find(agent => agent.role === 'worker')
    assert(run && root && worker, 'start_run should return run, root, and worker')
    assert(sessionExists(realTmux, socketPath, run.tmux_session), 'run tmux session should exist')
    assert(sessionExists(realTmux, socketPath, run.reeves_session), 'reeves tmux session should exist')
    ok('start_run created real isolated tmux sessions')

    const windowRows = tmux(realTmux, socketPath, ['list-windows', '-t', run.tmux_session, '-F', '#I #{window_name} #{window_id}']).split('\n')
    const windows = windowRows.map(row => row.trim().split(/\s+/))
    const reevesWindows = tmux(realTmux, socketPath, ['list-windows', '-t', run.reeves_session, '-F', '#{window_name}']).split('\n')
    assert(windows.some(([idx, name, id]) => idx === '0' && name === 'reeves' && id === run.reeves_window_id), `expected ReevesAgents at tab 0, got: ${windowRows.join(', ')}`)
    assert(windows.some(([, name]) => name === 'root-codex') && windows.some(([, name]) => name === 'reviewer'), `unexpected run windows: ${windowRows.join(', ')}`)
    assert(reevesWindows.includes('reeves'), `unexpected reeves windows: ${reevesWindows.join(', ')}`)
    ok('tmux window layout keeps ReevesAgents at tab 0')

    const listedRuns = await call(operator, 'list_runs')
    assert(Array.isArray(listedRuns) && listedRuns.some(item => item.id === run.id), 'list_runs should include smoke run')
    ok('list_runs sees created run')

    const tree = await call(operator, 'tree', { run_id: run.id })
    assert(tree.root?.id === root.id && tree.workers?.[0]?.id === worker.id && !('reeves' in tree), 'tree should return only agent nodes')
    ok('tree returns root and worker agent data')

    const rootClient = await connectMcp(baseEnv, {
      REEVES_SESSION_ID: root.id,
      REEVES_AGENT_ID: root.id,
      REEVES_RUN_ID: run.id,
      REEVES_ROLE: 'root',
    })
    clients.push(rootClient)
    const rootContext = await call(rootClient, 'context')
    assert(rootContext.role === 'root' && rootContext.run?.id === run.id && rootContext.root?.id === root.id, 'root context should describe current run')
    const rootGetRun = await call(rootClient, 'get_run')
    assert(rootGetRun.run.id === run.id && rootGetRun.agents.some(agent => agent.id === worker.id), 'root get_run should default to current run')
    ok('root context and current-run defaults work')

    const rootEnv = {
      REEVES_SESSION_ID: root.id,
      REEVES_AGENT_ID: root.id,
      REEVES_RUN_ID: run.id,
      REEVES_ROLE: 'root',
    }
    const rootCliContext = runCliJson(baseEnv, rootEnv, ['context', '--json'])
    assert(rootCliContext.role === 'root' && rootCliContext.run?.id === run.id && rootCliContext.controls?.can_spawn_worker === true, 'root CLI context should describe current run')
    ok('root CLI context uses current run')

    await eventually('peek reads root provider pane', async () => {
      const output = await call(operator, 'peek', { agent_id: root.id, lines: 200 })
      return typeof output === 'string' && output.includes('[fake codex] started')
    })

    await call(operator, 'send_text', { agent_id: worker.id, text: 'hello-smoke' })
    await call(operator, 'send_key', { agent_id: worker.id, key: 'enter' })
    await eventually('send_text/send_key reach worker pane', async () => {
      const output = await call(operator, 'peek', { agent_id: worker.id, lines: 40 })
      return typeof output === 'string' && output.includes('input:hello-smoke')
    })
    assert(listBuffers(realTmux, socketPath).length === 0, 'tmux paste buffers should be deleted after input injection')
    ok('tmux paste buffers do not stack up')

    await call(operator, 'open_agent', { agent_id: worker.id })
    assert(activeWindowId(realTmux, socketPath, run.tmux_session) === worker.tmux_window_id, 'open_agent should select the worker window')
    tmux(realTmux, socketPath, ['select-window', '-t', `${run.tmux_session}:0`])
    assert(activeWindowId(realTmux, socketPath, run.tmux_session) === run.reeves_window_id, 'tab 0 should select the ReevesAgents window')
    await call(operator, 'open_reeves', { run_id: run.id })
    assert(activeWindowId(realTmux, socketPath, run.reeves_session) === run.reeves_window_id, 'open_reeves should select the reeves window')
    ok('open_agent and open_reeves resolve the expected sessions/windows')

    const tester = await call(rootClient, 'spawn_worker', {
      provider: 'opencode',
      model: 'fake-model',
      task: 'tester smoke task',
      nickname: 'tester',
      ready_delay_ms: 0,
    })
    await eventually('spawn_worker creates another real provider window', async () => {
      const names = tmux(realTmux, socketPath, ['list-windows', '-t', run.tmux_session, '-F', '#{window_name}']).split('\n')
      return names.includes('tester')
    })

    await call(operator, 'update_task', { agent_id: tester.id, status: 'working', note: 'smoke note' })
    const getRun = await call(operator, 'get_run', { run_id: run.id })
    assert(getRun.agents.some(agent => agent.id === tester.id && agent.task_note === 'smoke note'), 'get_run should include updated task note')
    ok('update_task is visible through get_run')

    await call(operator, 'send_message', { agent_id: worker.id, text: 'operator message' })
    const workerClient = await connectMcp(baseEnv, {
      REEVES_SESSION_ID: worker.id,
      REEVES_AGENT_ID: worker.id,
      REEVES_RUN_ID: run.id,
      REEVES_ROLE: 'worker',
    })
    clients.push(workerClient)
    const messages = await call(workerClient, 'check_messages')
    assert(Array.isArray(messages) && messages.some(message => message.text === 'operator message'), 'worker should receive operator message')
    ok('send_message/check_messages work through worker caller identity')

    const approval = await call(workerClient, 'request_approval', {
      action: 'publish',
      summary: 'publish smoke artifact',
      details: { source: 'smoke:tmux' },
      risk: 'low',
    })
    const checkedApproval = await call(workerClient, 'check_approval', { approval_id: approval.id })
    assert(checkedApproval.status === 'pending', 'worker should see pending approval')
    const rootPolled = await call(rootClient, 'poll_approval', { timeout_ms: 1 })
    assert(rootPolled.id === approval.id, 'root poll_approval should default to current run')
    const pending = await call(operator, 'list_approvals', { run_id: run.id, status: 'pending' })
    assert(Array.isArray(pending) && pending.some(item => item.id === approval.id), 'operator should list pending approval')
    const resolved = await call(operator, 'resolve_approval', {
      approval_id: approval.id,
      decision: 'approved',
      note: 'approved by smoke',
    })
    assert(resolved.status === 'approved', 'operator should resolve approval')
    ok('approval request, check, list, and resolve work across roles')

    await call(operator, 'interrupt', { agent_id: tester.id })
    const killed = await call(operator, 'kill_agent', { agent_id: tester.id })
    assert(killed.ended_at, 'kill_agent should mark worker ended')
    const waited = await call(operator, 'wait', { agent_id: tester.id, timeout_ms: 500 })
    assert(waited.ended_at, 'wait should return ended worker')
    ok('interrupt, kill_agent, and wait operate on worker')

    const doctor = await call(operator, 'doctor')
    assert(Array.isArray(doctor.checks) && doctor.checks.length > 0, 'doctor should return checks')
    ok('doctor runs through MCP in isolated environment')

    const stopped = await call(rootClient, 'stop_run')
    assert(stopped.status === 'ended' && stopped.ended_at, 'stop_run should mark run ended')
    await sleep(200)
    assert(!sessionExists(realTmux, socketPath, run.tmux_session), 'run tmux session should be gone after stop_run')
    assert(sessionExists(realTmux, socketPath, run.reeves_session), 'reeves tmux session should remain after stop_run')
    ok('stop_run cleans up the run tmux session')
    run = null
  } finally {
    for (const client of clients.reverse()) {
      try { await client.close() } catch { /* ignore */ }
    }
    try {
      if (run) tmux(realTmux, socketPath, ['kill-session', '-t', run.tmux_session], { stdio: 'ignore' })
    } catch { /* ignore */ }
    try { tmux(realTmux, socketPath, ['kill-server'], { stdio: 'ignore' }) } catch { /* ignore */ }
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch(err => {
  fail('uncaught', err)
  process.exit(1)
})
