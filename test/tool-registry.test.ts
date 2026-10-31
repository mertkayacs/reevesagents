import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

// child_process is mocked so the status probes never touch real subprocesses:
// `which` throws so every tool reads as not installed, and spawnSync answers
// with scripted exit codes for the authCheckArgs judgement.
const execFileSync = vi.hoisted(() => vi.fn(() => { throw new Error('which: not found') }))
const spawnSync = vi.hoisted(() => vi.fn(() => ({ status: 1, stdout: '', stderr: '' })))
vi.mock('node:child_process', () => ({ execFileSync, spawnSync }))

let tmpHome: string
let savedPplxKey: string | undefined
let savedHfToken: string | undefined
let savedOllamaKey: string | undefined

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'reeves-tools-test-'))
  execFileSync.mockImplementation(() => { throw new Error('which: not found') })
  spawnSync.mockReset()
  spawnSync.mockImplementation(() => ({ status: 1, stdout: '', stderr: '' }))
  savedPplxKey = process.env.PERPLEXITY_API_KEY
  savedHfToken = process.env.HF_TOKEN
  savedOllamaKey = process.env.OLLAMA_API_KEY
  delete process.env.PERPLEXITY_API_KEY
  delete process.env.HF_TOKEN
  delete process.env.OLLAMA_API_KEY
})

afterEach(() => {
  for (const [key, value] of Object.entries({ PERPLEXITY_API_KEY: savedPplxKey, HF_TOKEN: savedHfToken, OLLAMA_API_KEY: savedOllamaKey })) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  rmSync(tmpHome, { recursive: true, force: true })
})

describe('tool registry', () => {
  it('has a complete, self-consistent entry for every tool', async () => {
    const { TOOL_REGISTRY, TOOL_DEFS, TOOLS } = await import('../src/core/tool-registry.js')
    expect(TOOL_DEFS.map(def => def.id)).toEqual(TOOLS)
    for (const id of TOOLS) {
      const def = TOOL_REGISTRY[id]
      expect(def, `missing registry entry for ${id}`).toBeDefined()
      expect(def.id).toBe(id)
      expect(def.id).toBe(def.id.toLowerCase())
      expect(def.bin.length).toBeGreaterThan(0)
      expect(def.displayName.length).toBeGreaterThan(0)
      expect(def.color).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(def.purpose.length).toBeGreaterThan(0)
      expect(def.stateLabel.length).toBeGreaterThan(0)
      expect(def.example.startsWith(`${def.bin} `)).toBe(true) // runnable as printed
      expect(def.docsUrl).toMatch(/^https:\/\//)
      expect(Array.isArray(def.authEnv)).toBe(true)
      for (const name of def.authEnv) expect(name).toMatch(/^[A-Z][A-Z0-9_]*$/)
    }
  })

  it('has unique ids and bins across the catalogue', async () => {
    const { TOOL_DEFS } = await import('../src/core/tool-registry.js')
    const ids = TOOL_DEFS.map(def => def.id)
    const bins = TOOL_DEFS.map(def => def.bin)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(bins).size).toBe(bins.length)
  })

  it('pins the catalogue: four tools in a stable order', async () => {
    const { TOOLS } = await import('../src/core/tool-registry.js')
    expect(TOOLS).toEqual(['pplx', 'colab', 'hf', 'ollama'])
  })

  it('tool colors are unique and distinct from provider and cursor colors', async () => {
    const { TOOL_DEFS } = await import('../src/core/tool-registry.js')
    const { PROVIDER_DEFS } = await import('../src/core/provider-registry.js')
    const { colors } = await import('../src/surfaces/tui/utils/tokens.js')
    const used = [...PROVIDER_DEFS.map(def => def.color), ...TOOL_DEFS.map(def => def.color)]
    expect(new Set(used).size).toBe(used.length)
    for (const def of TOOL_DEFS) {
      expect(def.color).not.toBe(colors.accent.primary)
      expect(def.color).not.toBe(colors.accent.bright) // the selection cursor color
    }
  })

  it('probes are exactly the verified ones: pplx never runs a command, ollama reports reachability', async () => {
    const { TOOL_REGISTRY } = await import('../src/core/tool-registry.js')
    expect(TOOL_REGISTRY.pplx.authCheckArgs).toBeUndefined() // a real search would spend API credit
    expect(TOOL_REGISTRY.colab.authCheckArgs).toEqual(['--auth=oauth2', 'whoami'])
    expect(TOOL_REGISTRY.hf.authCheckArgs).toEqual(['auth', 'whoami'])
    expect(TOOL_REGISTRY.ollama.authCheckArgs).toEqual(['list']) // server reachability, not sign-in
    expect(TOOL_REGISTRY.ollama.stateLabel).toBe('reachable')
    expect(TOOL_REGISTRY.ollama.example).toMatch(/[-:]cloud/) // cloud model, never a local one
  })
})

describe('tool state', () => {
  it('an authEnv variable set means yes, without running any command', async () => {
    const { TOOL_REGISTRY, toolState } = await import('../src/core/tool-registry.js')
    expect(toolState(TOOL_REGISTRY.hf, { HF_TOKEN: 'set' }, tmpHome)).toBe('yes')
    expect(spawnSync).not.toHaveBeenCalled()
  })

  it('a tool-declared probe decides the state from the env and home, without running any command', async () => {
    const { TOOL_REGISTRY, toolState } = await import('../src/core/tool-registry.js')
    const probe = vi.fn(() => 'no' as const)
    const env = { HF_TOKEN: 'set' }
    expect(toolState({ ...TOOL_REGISTRY.hf, probe }, env, tmpHome)).toBe('no') // wins over authEnv and authCheckArgs
    expect(probe).toHaveBeenCalledWith(env, tmpHome)
    expect(spawnSync).not.toHaveBeenCalled()
  })

  it('authCheckArgs is judged by exit code alone, stdin closed, output discarded', async () => {
    const { TOOL_REGISTRY, toolState } = await import('../src/core/tool-registry.js')
    spawnSync.mockImplementation(() => ({ status: 0, stdout: 'whoever', stderr: '' }))
    expect(toolState(TOOL_REGISTRY.hf, {}, tmpHome)).toBe('yes')
    expect(toolState(TOOL_REGISTRY.colab, {}, tmpHome)).toBe('yes')
    spawnSync.mockImplementation(() => ({ status: 1, stdout: '', stderr: '' }))
    expect(toolState(TOOL_REGISTRY.hf, {}, tmpHome)).toBe('no')
    expect(toolState(TOOL_REGISTRY.colab, {}, tmpHome)).toBe('no')
    expect(spawnSync).toHaveBeenCalledWith('hf', ['auth', 'whoami'], expect.objectContaining({ stdio: 'ignore' }))
    expect(spawnSync).toHaveBeenCalledWith('colab', ['--auth=oauth2', 'whoami'], expect.objectContaining({ stdio: 'ignore' }))
  })

  it('a probe that cannot run (timeout, missing binary) is unknown', async () => {
    const { TOOL_REGISTRY, toolState } = await import('../src/core/tool-registry.js')
    spawnSync.mockImplementation(() => ({ error: new Error('spawn ETIMEDOUT'), status: null, stdout: '', stderr: '' }) as never)
    expect(toolState(TOOL_REGISTRY.hf, {}, tmpHome)).toBe('unknown')
  })

  it('a tool with no probe and no check command is unknown when no authEnv variable is set', async () => {
    const { TOOL_REGISTRY, toolState } = await import('../src/core/tool-registry.js')
    const bare = { ...TOOL_REGISTRY.hf, probe: undefined, authCheckArgs: undefined }
    expect(toolState(bare, {}, tmpHome)).toBe('unknown')
    expect(spawnSync).not.toHaveBeenCalled()
  })
})

describe('pplxSigninState', () => {
  // Hermetic: the env object, the home dir (a temp dir) and the platform are
  // all passed in, so the real environment and home are never consulted.
  const touch = (path: string) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, '', 'utf-8') // presence only, so an empty file is enough
  }
  const linuxFile = (configDir: string) => join(configDir, 'perplexity', 'credentials.json')

  it('a non-blank PERPLEXITY_API_KEY means yes; an empty or blank one with nothing else means no', async () => {
    const { pplxSigninState } = await import('../src/core/tool-registry.js')
    expect(pplxSigninState({ PERPLEXITY_API_KEY: 'set' }, tmpHome, 'linux')).toBe('yes')
    expect(pplxSigninState({ PERPLEXITY_API_KEY: '' }, tmpHome, 'linux')).toBe('no')
    expect(pplxSigninState({ PERPLEXITY_API_KEY: '   ' }, tmpHome, 'linux')).toBe('no')
  })

  it('PPLX_SDK_BASE_URL with PPLX_SDK_API_KEY means yes; either one alone means no', async () => {
    const { pplxSigninState } = await import('../src/core/tool-registry.js')
    const base = 'http://127.0.0.1:9'
    expect(pplxSigninState({ PPLX_SDK_BASE_URL: base, PPLX_SDK_API_KEY: 'set' }, tmpHome, 'linux')).toBe('yes')
    expect(pplxSigninState({ PPLX_SDK_BASE_URL: base }, tmpHome, 'linux')).toBe('no')
    expect(pplxSigninState({ PPLX_SDK_API_KEY: 'set' }, tmpHome, 'linux')).toBe('no')
  })

  it('half an SDK pair means no beside PERPLEXITY_API_KEY or a credentials file, since the CLI refuses to run', async () => {
    const { pplxSigninState } = await import('../src/core/tool-registry.js')
    const base = 'http://127.0.0.1:9'
    expect(pplxSigninState({ PERPLEXITY_API_KEY: 'set', PPLX_SDK_BASE_URL: base }, tmpHome, 'linux')).toBe('no')
    expect(pplxSigninState({ PERPLEXITY_API_KEY: 'set', PPLX_SDK_API_KEY: 'set' }, tmpHome, 'linux')).toBe('no')
    touch(linuxFile(join(tmpHome, '.config')))
    expect(pplxSigninState({}, tmpHome, 'linux')).toBe('yes') // the file alone counts
    expect(pplxSigninState({ PPLX_SDK_BASE_URL: base }, tmpHome, 'linux')).toBe('no')
    expect(pplxSigninState({ PPLX_SDK_API_KEY: 'set' }, tmpHome, 'linux')).toBe('no')
  })

  it('a blank SDK variable counts as unset: beside a set partner it means no, and two blanks fall through', async () => {
    const { pplxSigninState } = await import('../src/core/tool-registry.js')
    const base = 'http://127.0.0.1:9'
    expect(pplxSigninState({ PERPLEXITY_API_KEY: 'set', PPLX_SDK_BASE_URL: '   ', PPLX_SDK_API_KEY: 'set' }, tmpHome, 'linux')).toBe('no')
    expect(pplxSigninState({ PERPLEXITY_API_KEY: 'set', PPLX_SDK_BASE_URL: base, PPLX_SDK_API_KEY: '   ' }, tmpHome, 'linux')).toBe('no')
    expect(pplxSigninState({ PERPLEXITY_API_KEY: 'set', PPLX_SDK_BASE_URL: '', PPLX_SDK_API_KEY: '   ' }, tmpHome, 'linux')).toBe('yes')
  })

  it('linux: the credentials file under ~/.config means yes, and it is never opened', async () => {
    const { pplxSigninState } = await import('../src/core/tool-registry.js')
    const file = linuxFile(join(tmpHome, '.config'))
    expect(pplxSigninState({}, tmpHome, 'linux')).toBe('no')
    touch(file)
    expect(pplxSigninState({}, tmpHome, 'linux')).toBe('yes')
    chmodSync(file, 0o000) // stat needs no read permission on the file; a non-root open would fail
    expect(pplxSigninState({}, tmpHome, 'linux')).toBe('yes')
  })

  it('linux: an absolute XDG_CONFIG_HOME holds the file instead, so ~/.config alone means no', async () => {
    const { pplxSigninState } = await import('../src/core/tool-registry.js')
    const xdg = join(tmpHome, 'xdg')
    touch(linuxFile(join(tmpHome, '.config')))
    expect(pplxSigninState({ XDG_CONFIG_HOME: xdg }, tmpHome, 'linux')).toBe('no')
    touch(linuxFile(xdg))
    expect(pplxSigninState({ XDG_CONFIG_HOME: xdg }, tmpHome, 'linux')).toBe('yes')
  })

  it('linux: a relative XDG_CONFIG_HOME falls back to ~/.config', async () => {
    const { pplxSigninState } = await import('../src/core/tool-registry.js')
    expect(pplxSigninState({ XDG_CONFIG_HOME: 'rel/xdg' }, tmpHome, 'linux')).toBe('no')
    touch(linuxFile(join(tmpHome, '.config')))
    expect(pplxSigninState({ XDG_CONFIG_HOME: 'rel/xdg' }, tmpHome, 'linux')).toBe('yes')
  })

  it('darwin: the file under ~/Library/Application Support means yes; the Linux paths do not count', async () => {
    const { pplxSigninState } = await import('../src/core/tool-registry.js')
    const xdg = join(tmpHome, 'xdg')
    touch(linuxFile(join(tmpHome, '.config')))
    touch(linuxFile(xdg))
    expect(pplxSigninState({ XDG_CONFIG_HOME: xdg }, tmpHome, 'darwin')).toBe('no')
    touch(join(tmpHome, 'Library', 'Application Support', 'perplexity', 'credentials.json'))
    expect(pplxSigninState({}, tmpHome, 'darwin')).toBe('yes')
  })

  it('win32: the CLI has no build there, so no key means unknown; PERPLEXITY_API_KEY still means yes', async () => {
    const { pplxSigninState } = await import('../src/core/tool-registry.js')
    expect(pplxSigninState({}, tmpHome, 'win32')).toBe('unknown')
    expect(pplxSigninState({ PERPLEXITY_API_KEY: 'set' }, tmpHome, 'win32')).toBe('yes')
  })

  // Root bypasses permission checks, so the stat below would succeed there.
  it.skipIf(process.getuid?.() === 0)('a stat that fails for a reason other than absence means unknown', async () => {
    const { pplxSigninState } = await import('../src/core/tool-registry.js')
    const dir = join(tmpHome, '.config', 'perplexity')
    touch(join(dir, 'credentials.json'))
    chmodSync(dir, 0o000)
    try {
      expect(pplxSigninState({}, tmpHome, 'linux')).toBe('unknown')
    } finally {
      chmodSync(dir, 0o700) // so afterEach can remove the temp home
    }
  })
})

describe('detectToolStatuses', () => {
  it('reports install state from the PATH probe and per-tool state, in registry order', async () => {
    const { detectToolStatuses, TOOLS } = await import('../src/core/tool-registry.js')
    const statuses = detectToolStatuses({ PERPLEXITY_API_KEY: 'set' }, tmpHome)
    expect(statuses.map(tool => tool.id)).toEqual(TOOLS)
    const pplx = statuses.find(tool => tool.id === 'pplx')!
    expect(pplx.installed).toBe(false) // which throws in this test env
    expect(pplx.state).toBe('yes') // env key present
    expect(pplx.state_means).toBe('signed in')
    expect(pplx.display_name).toBe('Perplexity CLI')
    expect(pplx.example).toMatch(/^pplx /)
    expect(pplx.docs_url).toMatch(/^https:\/\//)
    const hf = statuses.find(tool => tool.id === 'hf')!
    expect(hf.state).toBe('no') // probe ran, exited 1
    expect(hf.installed).toBe(false)
    const ollama = statuses.find(tool => tool.id === 'ollama')!
    expect(ollama.state_means).toBe('reachable') // server check, not sign-in
  })

  it('runs the auth probe only for tools that declare one', async () => {
    const { detectToolStatuses } = await import('../src/core/tool-registry.js')
    detectToolStatuses({}, tmpHome)
    expect(spawnSync).toHaveBeenCalledTimes(3) // colab, hf, ollama; pplx has no command probe
  })
})
