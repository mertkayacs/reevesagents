// Checks the real install choices from packed tarballs:
// 1) CLI/TUI only (--omit=optional), 2) CLI/TUI + Web.

import { spawn, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { request } from 'node:http'

const root = resolve(new URL('..', import.meta.url).pathname)
const rootVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version

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
    ok('packed root tarball')

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
      assert(state.status === 200 && Array.isArray(JSON.parse(state.body).runs), 'web state should return a runs array')
      ok('CLI/TUI + Web install starts loopback Web UI')
    } finally {
      await web.stop()
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

main().catch(err => fail(err instanceof Error ? err.message : String(err)))
