// Checks the real install choices from packed tarballs:
// 1) CLI/TUI only (--omit=optional), 2) CLI/TUI + Web, 3) Web + PRE-BETA orchestrator.

import { spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { request } from 'node:http'

const root = resolve(new URL('..', import.meta.url).pathname)
const packageRoot = join(root, 'packages', 'orchestrator')
const rootVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const orchestratorVersion = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version

function ok(label) { console.log(`  ok  ${label}`) }
function fail(message) {
  console.error(message)
  process.exit(1)
}
function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
  }
  return result.stdout.trim()
}

function runMaybe(cmd, args, options = {}) {
  return spawnSync(cmd, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  })
}

function pack(cwd, outDir) {
  const raw = run('npm', ['pack', '--json', '--pack-destination', outDir], { cwd })
  const [packInfo] = JSON.parse(raw)
  if (!packInfo?.filename) throw new Error(`npm pack returned no filename for ${cwd}`)
  return join(outDir, packInfo.filename)
}

function npmInit(dir) {
  mkdirSync(dir, { recursive: true })
  run('npm', ['init', '-y'], { cwd: dir })
}

function bin(dir, name) {
  return join(dir, 'node_modules', '.bin', name)
}

function http(method, port, path, body) {
  const payload = body === undefined ? '' : JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1',
      port,
      path,
      method,
      agent: false,
      headers: method === 'POST'
        ? {
            origin: `http://127.0.0.1:${port}`,
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload),
          }
        : undefined,
    }, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.end(payload)
  })
}

async function waitForHealth(port, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const res = await http('GET', port, '/healthz')
      if (res.status === 200 && res.body === 'ok') return
    } catch (err) {
      lastError = err
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`web server did not become healthy${lastError ? `: ${lastError.message}` : ''}`)
}

function writeExecutable(path, source) {
  writeFileSync(path, source, 'utf8')
  chmodSync(path, 0o755)
}

function installFakeBins(binDir) {
  mkdirSync(binDir, { recursive: true })
  writeExecutable(join(binDir, 'tmux'), [
    '#!/bin/sh',
    'if [ "$1" = "-V" ]; then echo "tmux 3.6"; exit 0; fi',
    'case "$1" in',
    '  display-message) echo "@0 %0"; exit 0 ;;',
    '  new-window)',
    '    for arg in "$@"; do',
    '      if [ "$arg" = "-P" ]; then',
    '        n=$(cat "$REEVES_FAKE_TMUX_COUNTER" 2>/dev/null || echo 1)',
    '        echo $((n + 1)) > "$REEVES_FAKE_TMUX_COUNTER"',
    '        echo "@$n %$n"',
    '        exit 0',
    '      fi',
    '    done',
    '    exit 0 ;;',
    '  capture-pane) echo "ready"; exit 0 ;;',
    '  *) exit 0 ;;',
    'esac',
    '',
  ].join('\n'))

  for (const item of ['claude', 'codex', 'opencode', 'hermes', 'kimi', 'deepseek', 'pi', 'qwen', 'aider']) {
    writeExecutable(join(binDir, item), [
      '#!/bin/sh',
      'if [ "$1" = "--help" ]; then echo "--model --dangerously-bypass-approvals-and-sandbox --dangerously-skip-permissions --yolo"; exit 0; fi',
      'exit 0',
      '',
    ].join('\n'))
  }
}

function startWeb(dir, args, env) {
  const child = spawn(bin(dir, 'reevesagents'), args, {
    cwd: dir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk.toString('utf8') })
  child.stderr.on('data', chunk => { output += chunk.toString('utf8') })
  return {
    child,
    output: () => output,
    async stop() {
      if (child.exitCode !== null) return
      child.kill('SIGTERM')
      await new Promise(resolve => child.once('exit', resolve))
    },
  }
}

async function main() {
  const tmp = mkdtempSync(join(tmpdir(), 'reeves-install-matrix-'))
  try {
    const rootTgz = pack(root, tmp)
    const orchestratorTgz = pack(packageRoot, tmp)
    ok('packed root and pre-beta orchestrator tarballs')

    const cliOnly = join(tmp, 'cli-only')
    npmInit(cliOnly)
    run('npm', ['install', '--omit=optional', rootTgz], { cwd: cliOnly })
    run(bin(cliOnly, 'reevesagents'), ['--help'], { cwd: cliOnly })
    assert(run(bin(cliOnly, 'reevesagents'), ['--version'], { cwd: cliOnly }) === rootVersion, 'root CLI version should match release')
    const noWeb = runMaybe(bin(cliOnly, 'reevesagents'), ['web', '--no-open', '--port', '19082'], {
      cwd: cliOnly,
      env: {
        ...process.env,
        REEVES_REGISTRY: join(tmp, 'cli-only-registry'),
        REEVES_CONFIG: join(tmp, 'cli-only-config.json'),
      },
    })
    assert(noWeb.status !== 0, 'web should fail when optional extras are omitted')
    assert((noWeb.stderr + noWeb.stdout).includes('optional modules'), 'web disabled message should mention optional modules')
    ok('CLI/TUI-only install works and disables Web cleanly')

    const webInstall = join(tmp, 'web')
    npmInit(webInstall)
    run('npm', ['install', rootTgz], { cwd: webInstall })
    const webPort = 19083
    const webEnv = {
      ...process.env,
      REEVES_REGISTRY: join(tmp, 'web-registry'),
      REEVES_CONFIG: join(tmp, 'web-config.json'),
    }
    const web = startWeb(webInstall, ['web', '--no-open', '--port', String(webPort)], webEnv)
    try {
      await waitForHealth(webPort)
      const state = await http('GET', webPort, '/api/state')
      assert(state.status === 200 && JSON.parse(state.body).prebeta.orchestrator === false, 'default web state should be stable mode')
      ok('CLI/TUI + Web install starts loopback Web beta')
    } finally {
      await web.stop()
    }

    const all = join(tmp, 'all')
    npmInit(all)
    run('npm', ['install', rootTgz, orchestratorTgz], { cwd: all })
    run(bin(all, 'reevesagents'), ['--help'], { cwd: all })
    run(bin(all, 'reevesagents-orchestrator'), ['--help'], { cwd: all })
    assert(run(bin(all, 'reevesagents-orchestrator'), ['--version'], { cwd: all }) === orchestratorVersion, 'orchestrator CLI version should match release')
    const fakeBin = join(tmp, 'fake-bin')
    installFakeBins(fakeBin)
    const allPort = 19084
    const allEnv = {
      ...process.env,
      PATH: `${fakeBin}${delimiter}${process.env.PATH ?? ''}`,
      SHELL: '/bin/sh',
      REEVES_REGISTRY: join(tmp, 'all-registry'),
      REEVES_CONFIG: join(tmp, 'all-config.json'),
      REEVES_FAKE_TMUX_COUNTER: join(tmp, 'tmux-counter'),
    }
    const allWeb = startWeb(all, ['web', '--prebeta-orchestrator', '--no-open', '--port', String(allPort)], allEnv)
    try {
      await waitForHealth(allPort)
      const initial = await http('GET', allPort, '/api/state')
      assert(JSON.parse(initial.body).prebeta.orchestrator === true, 'pre-beta web state should advertise orchestrator mode')
      const created = await http('POST', allPort, '/api/terminals', {
        provider: 'codex',
        mode: 'orchestrator',
        nickname: 'lead',
        working_dir: tmp,
      })
      assert(created.status === 200, `orchestrator create failed: ${created.body}`)
      const { run_id } = JSON.parse(created.body)
      const afterCreate = await http('GET', allPort, '/api/state')
      const runState = JSON.parse(afterCreate.body)
      assert(runState.runs.some(run => run.id === run_id && run.mode === 'orchestrator'), 'pre-beta web should show orchestrator run')
      const stopped = await http('POST', allPort, `/api/runs/${encodeURIComponent(run_id)}/stop`, { confirm: true })
      assert(stopped.status === 200, `orchestrator stop failed: ${stopped.body}`)
      ok('all-in install starts pre-beta Web and controls orchestrator runs')
    } finally {
      await allWeb.stop()
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

main().catch(err => fail(err instanceof Error ? err.message : String(err)))
