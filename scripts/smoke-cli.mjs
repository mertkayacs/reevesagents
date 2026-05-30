// Isolated CLI smoke. Runs the built CLI with fake provider binaries and a
// temp setup home so setup, doctor, and runs commands never touch real state.

import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cliPath = join(repoRoot, 'dist', 'cli.js')

function ok(label) { console.log(`  ok  ${label}`) }
function fail(label, err) {
  console.error(`  FAIL ${label}: ${err?.message ?? err}`)
  process.exitCode = 1
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
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

function installFakeBins(binDir) {
  writeExecutable(join(binDir, 'tmux'), [
    '#!/bin/sh',
    'if [ "$1" = "-V" ]; then echo "tmux 3.4"; exit 0; fi',
    'echo "fake tmux only supports -V in smoke:cli" >&2',
    'exit 2',
    '',
  ].join('\n'))

  for (const bin of ['claude', 'codex', 'opencode', 'hermes']) {
    writeExecutable(join(binDir, bin), [
      '#!/bin/sh',
      'for arg in "$@"; do',
      '  if [ "$arg" = "--help" ]; then',
      `    echo ${JSON.stringify(providerHelp(bin))}`,
      '    exit 0',
      '  fi',
      'done',
      `echo "[fake ${bin}] $@"`,
      '',
    ].join('\n'))
  }
}

function runCli(args, env) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: 'utf8',
    env,
  })
  if (result.status !== 0) {
    throw new Error(`${args.join(' ')} exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  }
  return result.stdout.trim()
}

function parseJson(stdout, label) {
  try {
    return JSON.parse(stdout)
  } catch (err) {
    throw new Error(`${label} did not return JSON: ${err instanceof Error ? err.message : 'parse error'}\n${stdout}`)
  }
}

async function main() {
  const tmpDir = mkdtempSync(join(tmpdir(), 'reeves-smoke-cli-'))
  const binDir = join(tmpDir, 'bin')
  const registry = join(tmpDir, 'registry')
  const config = join(tmpDir, 'config.json')
  const home = join(tmpDir, 'home')
  const env = {
    ...process.env,
    PATH: `${binDir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
    REEVES_REGISTRY: registry,
    REEVES_CONFIG: config,
    REEVES_SETUP_HOME: home,
    REEVES_DOCTOR_SKIP_PROVIDER_COMPAT: '0',
  }

  try {
    mkdirSync(binDir, { recursive: true })
    installFakeBins(binDir)
    console.log(`smoke dir: ${tmpDir}`)
    console.log(`cli:       ${cliPath}`)

    const runsText = runCli(['runs'], env)
    assert(runsText === 'no runs', `expected no runs, got ${runsText}`)
    ok('runs prints no runs on empty isolated state')

    const runsJson = parseJson(runCli(['runs', '--json'], env), 'runs --json')
    assert(Array.isArray(runsJson) && runsJson.length === 0, 'runs --json should return []')
    ok('runs --json returns [] on empty isolated state')

    const contextJson = parseJson(runCli(['context', '--json'], env), 'context --json')
    assert(contextJson.role === 'operator' && Array.isArray(contextJson.runs) && contextJson.runs.length === 0, 'context --json should describe empty operator scope')
    ok('context --json returns operator scope')

    const callContextJson = parseJson(runCli(['call', 'context'], env), 'call context')
    assert(callContextJson.role === 'operator' && Array.isArray(callContextJson.runs) && callContextJson.runs.length === 0, 'call context should describe empty operator scope')
    ok('call context reaches MCP tools through CLI')

    const callRunsJson = parseJson(runCli(['call', 'list_runs', '{}'], env), 'call list_runs')
    assert(Array.isArray(callRunsJson) && callRunsJson.length === 0, 'call list_runs should return []')
    ok('call list_runs accepts inline JSON arguments')

    const setup = parseJson(runCli(['setup', '--json'], env), 'setup --json')
    assert(Array.isArray(setup) && setup.length === 4, 'setup should report four providers')
    assert(setup.every(item => item.detected === true && item.registered === true), 'all fake providers should be registered')
    ok('setup registers only temp MCP configs')

    const doctor = parseJson(runCli(['doctor', '--json'], env), 'doctor --json')
    assert(doctor.ok === true, 'doctor should have no fail checks with fake tmux/providers')
    assert(Array.isArray(doctor.checks), 'doctor should return checks array')
    assert(doctor.checks.some(check => check.name === 'mcp config' && check.status === 'ok'), 'doctor should see temp MCP config')
    ok('doctor --json reports healthy isolated setup')
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }
}

main().catch(err => {
  fail('uncaught', err)
  process.exit(1)
})
