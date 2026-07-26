import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Drive the installer without ever touching a real CLI: every execFileSync call
// (which / mcp list / mcp add / mcp remove) is routed through this single mock.
const execFileSync = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({ execFileSync }))

// Import the module under test fresh after the mock is in place. The installer
// reads execFileSync lazily inside each function, so one import is enough.
async function loadInstaller() {
  return import('../src/mcp/installer.js')
}

// A tiny fake host environment. `installed` lists the bins that `which` finds;
// `listOutput` maps a host bin to what its `mcp list` prints. Anything not
// described here behaves as not installed / empty list.
interface FakeEnv {
  installed: Set<string>
  listOutput: Record<string, string>
  // Bins whose add/remove should throw, with the error to throw.
  failAdd?: Record<string, unknown>
}

function wireEnv(env: FakeEnv): void {
  execFileSync.mockImplementation((file: string, args: string[]) => {
    if (file === 'which') {
      const bin = args[0]!
      // Honor the { encoding: 'utf8' } callers use (resolveLaunchCmd trims this).
      if (env.installed.has(bin)) return `/usr/bin/${bin}\n`
      throw new Error(`which: ${bin} not found`)
    }
    // From here `file` is a host bin and `args` is one of its mcp subcommands.
    const sub = args[1]
    if (sub === 'list') {
      return env.listOutput[file] ?? ''
    }
    if (sub === 'add') {
      const err = env.failAdd?.[file]
      if (err !== undefined) throw err
      return ''
    }
    if (sub === 'remove') {
      return ''
    }
    return ''
  })
}

beforeEach(() => {
  execFileSync.mockReset()
})

describe('mcp installer', () => {
  describe('hostStatus', () => {
    it('reports a drivable host as installed and attached when its mcp list shows reevesagents', async () => {
      wireEnv({
        installed: new Set(['claude']),
        listOutput: { claude: 'reevesagents: reevesagents mcp - ✓ Connected' },
      })
      const { hostStatus } = await loadInstaller()

      const cc = hostStatus().find(h => h.key === 'cc')!
      expect(cc).toMatchObject({
        key: 'cc',
        bin: 'claude',
        label: 'Claude Code',
        installed: true,
        attached: true,
        manual: false,
      })
    })

    it('reports a host as not installed and not attached when which fails', async () => {
      wireEnv({ installed: new Set(), listOutput: {} })
      const { hostStatus } = await loadInstaller()

      const cc = hostStatus().find(h => h.key === 'cc')!
      expect(cc.installed).toBe(false)
      expect(cc.attached).toBe(false)
    })

    it('reports installed but not attached when mcp list does not mention reevesagents', async () => {
      wireEnv({
        installed: new Set(['claude']),
        listOutput: { claude: 'some-other-server: foo - ✓ Connected' },
      })
      const { hostStatus } = await loadInstaller()

      const cc = hostStatus().find(h => h.key === 'cc')!
      expect(cc.installed).toBe(true)
      expect(cc.attached).toBe(false)
    })

    it('marks opencode as drivable via its config file (not manual)', async () => {
      wireEnv({
        installed: new Set(['opencode']),
        listOutput: { opencode: 'reevesagents: reevesagents mcp' },
      })
      const { hostStatus } = await loadInstaller()

      const opencode = hostStatus().find(h => h.key === 'opencode')!
      expect(opencode.manual).toBe(false)
      expect(opencode.installed).toBe(true)
    })

    it('marks every host as manual:false', async () => {
      wireEnv({ installed: new Set(), listOutput: {} })
      const { hostStatus } = await loadInstaller()

      const drivable = hostStatus()
      expect(drivable.map(h => h.manual)).toEqual(drivable.map(() => false))
    })

    it('never marks a host attached when it is not installed even if list would match', async () => {
      // which fails, so isAttached must not be consulted / must not flip attached.
      wireEnv({
        installed: new Set(),
        listOutput: { claude: 'reevesagents: reevesagents mcp' },
      })
      const { hostStatus } = await loadInstaller()

      const cc = hostStatus().find(h => h.key === 'cc')!
      expect(cc.installed).toBe(false)
      expect(cc.attached).toBe(false)
    })
  })

  describe('isAttached regex robustness', () => {
    it('does NOT count a reevesagents-prefixed sibling as attached', async () => {
      // A differently-named sibling whose name only differs by a suffix (here
      // reevesagents-extras) must be rejected by the negative lookahead in the
      // isAttached regex, so it never counts as a token match.
      wireEnv({
        installed: new Set(['claude']),
        listOutput: { claude: 'reevesagents-extras: some other server - ✓ Connected' },
      })
      const { hostStatus } = await loadInstaller()

      const cc = hostStatus().find(h => h.key === 'cc')!
      expect(cc.attached).toBe(false)
    })

    it('counts a real reevesagents entry as attached', async () => {
      wireEnv({
        installed: new Set(['claude']),
        listOutput: { claude: 'reevesagents: reevesagents mcp - ✓ Connected' },
      })
      const { hostStatus } = await loadInstaller()

      const cc = hostStatus().find(h => h.key === 'cc')!
      expect(cc.attached).toBe(true)
    })

    it('counts reevesagents as attached even when a prefixed sibling is also listed', async () => {
      wireEnv({
        installed: new Set(['claude']),
        listOutput: {
          claude: [
            'reevesagents-extras: some other server - ✓ Connected',
            'reevesagents: reevesagents mcp - ✓ Connected',
          ].join('\n'),
        },
      })
      const { hostStatus } = await loadInstaller()

      const cc = hostStatus().find(h => h.key === 'cc')!
      expect(cc.attached).toBe(true)
    })
  })

  describe('attach', () => {
    // The launcher is resolved at attach time to an absolute node + entry (or an
    // absolute bin), so assert each host's argv SHAPE, not the exact paths.
    function addArgv(bin: string): string[] {
      return execFileSync.mock.calls.find(c => c[0] === bin && c[1]?.[1] === 'add')![1]
    }

    it('pins user scope and uses the -- separator for Claude Code', async () => {
      wireEnv({ installed: new Set(['claude']), listOutput: {} })
      const { attach } = await loadInstaller()

      expect(attach('cc')).toEqual({ key: 'cc', label: 'Claude Code', ok: true, message: 'attached' })
      const argv = addArgv('claude')
      expect(argv.slice(0, 3)).toEqual(['mcp', 'add', 'reevesagents'])
      expect(argv[argv.indexOf('-s') + 1]).toBe('user')
      expect(argv).toContain('--')
      expect(argv[argv.length - 1]).toBe('mcp')
    })

    it('uses the -- separator and no scope flag for codex and kimi', async () => {
      const { attach } = await loadInstaller()
      for (const bin of ['codex', 'kimi'] as const) {
        execFileSync.mockReset()
        wireEnv({ installed: new Set([bin]), listOutput: {} })
        expect(attach(bin).ok).toBe(true)
        const argv = addArgv(bin)
        expect(argv.slice(0, 3)).toEqual(['mcp', 'add', 'reevesagents'])
        expect(argv).toContain('--')
        expect(argv).not.toContain('-s')
        expect(argv[argv.length - 1]).toBe('mcp')
      }
    })

    it('uses a positional command with no -- separator for qwen', async () => {
      wireEnv({ installed: new Set(['qwen']), listOutput: {} })
      const { attach } = await loadInstaller()

      expect(attach('qwen').ok).toBe(true)
      const argv = addArgv('qwen')
      expect(argv.slice(0, 3)).toEqual(['mcp', 'add', 'reevesagents'])
      expect(argv).not.toContain('--')
      expect(argv[argv.length - 1]).toBe('mcp')
    })

    it('uses --command / --args for hermes', async () => {
      wireEnv({ installed: new Set(['hermes']), listOutput: {} })
      const { attach } = await loadInstaller()

      expect(attach('hermes').ok).toBe(true)
      const argv = addArgv('hermes')
      expect(argv.slice(0, 3)).toEqual(['mcp', 'add', 'reevesagents'])
      expect(argv).toContain('--command')
      expect(argv).toContain('--args')
      expect(argv[argv.length - 1]).toBe('mcp')
    })

    it('attaches opencode by writing its config file (no CLI add call)', async () => {
      wireEnv({ installed: new Set(['opencode']), listOutput: {} })
      const { attach } = await loadInstaller()

      const result = attach('opencode')
      expect(result.ok).toBe(true)
      // File-based: the config now advertises the reevesagents MCP server, and
      // no `opencode mcp add` command was ever shelled out.
      const cfgPath = join(process.env.REEVES_HOME!, '.config', 'opencode', 'opencode.json')
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'))
      expect(cfg.mcp.reevesagents.type).toBe('local')
      expect(cfg.mcp.reevesagents.command.at(-1)).toBe('mcp')
      expect(execFileSync).not.toHaveBeenCalledWith('opencode', expect.arrayContaining(['mcp', 'add']), expect.anything())
    })

    it('opencode attach preserves existing config and detach removes only its entry', async () => {
      wireEnv({ installed: new Set(['opencode']), listOutput: {} })
      const dir = join(process.env.REEVES_HOME!, '.config', 'opencode')
      mkdirSync(dir, { recursive: true })
      const cfgPath = join(dir, 'opencode.json')
      writeFileSync(cfgPath, JSON.stringify({ theme: 'dark', mcp: { other: { type: 'local', command: ['x'] } } }), 'utf-8')
      const { attach, detach, hostStatus } = await loadInstaller()

      attach('opencode')
      let cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'))
      expect(cfg.theme).toBe('dark')                       // unrelated key preserved
      expect(cfg.mcp.other).toBeTruthy()                   // other MCP server preserved
      expect(cfg.mcp.reevesagents.enabled).toBe(true)
      expect(hostStatus().find(h => h.key === 'opencode')!.attached).toBe(true)

      detach('opencode')
      cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'))
      expect(cfg.mcp.reevesagents).toBeUndefined()         // only our entry removed
      expect(cfg.mcp.other).toBeTruthy()
      expect(cfg.theme).toBe('dark')
      expect(hostStatus().find(h => h.key === 'opencode')!.attached).toBe(false)
    })

    it('returns ok:false when the drivable host is not installed', async () => {
      wireEnv({ installed: new Set(), listOutput: {} })
      const { attach } = await loadInstaller()

      const result = attach('cc')
      expect(result.ok).toBe(false)
      expect(result.message).toMatch(/not installed/i)
      // It checks which, but must never reach mcp add.
      const addCall = execFileSync.mock.calls.find(c => c[0] === 'claude' && c[1]?.[1] === 'add')
      expect(addCall).toBeUndefined()
    })

    it('surfaces the host CLI stderr when the add command fails', async () => {
      const cliFailure = Object.assign(new Error('Command failed with exit code 1'), {
        status: 1,
        stderr: 'error: an MCP server named "reevesagents" already exists',
      })
      wireEnv({
        installed: new Set(['claude']),
        listOutput: {},
        failAdd: { claude: cliFailure },
      })
      const { attach } = await loadInstaller()

      const result = attach('cc')
      expect(result.ok).toBe(false)
      expect(result.message).toBe('error: an MCP server named "reevesagents" already exists')
      // The bare exit-code message must not leak through.
      expect(result.message).not.toMatch(/exit code/i)
    })

    it('surfaces stderr when it arrives as a Buffer', async () => {
      const cliFailure = Object.assign(new Error('Command failed with exit code 1'), {
        status: 1,
        stderr: Buffer.from('hermes: refused to attach\n'),
      })
      wireEnv({
        installed: new Set(['hermes']),
        listOutput: {},
        failAdd: { hermes: cliFailure },
      })
      const { attach } = await loadInstaller()

      const result = attach('hermes')
      expect(result.ok).toBe(false)
      expect(result.message).toBe('hermes: refused to attach')
    })

    it('throws for an unknown host key', async () => {
      wireEnv({ installed: new Set(), listOutput: {} })
      const { attach } = await loadInstaller()

      expect(() => attach('nope')).toThrow(/Unknown CLI/)
    })
  })

  describe('force re-attach', () => {
    it('removes then adds when forced, even if already attached', async () => {
      wireEnv({ installed: new Set(['claude']), listOutput: { claude: 'reevesagents: reevesagents mcp' } })
      const { attach } = await loadInstaller()
      expect(attach('cc', true).ok).toBe(true)
      const subs = execFileSync.mock.calls.filter(c => c[0] === 'claude').map(c => c[1]?.[1])
      expect(subs).toContain('remove')
      expect(subs).toContain('add')
      expect(subs.indexOf('remove')).toBeLessThan(subs.indexOf('add'))
    })

    it('attachAll(true) re-attaches an already-attached host instead of skipping', async () => {
      wireEnv({ installed: new Set(['claude']), listOutput: { claude: 'reevesagents: reevesagents mcp' } })
      const { attachAll } = await loadInstaller()
      const cc = attachAll(true).find(r => r.key === 'cc')!
      expect(cc.ok).toBe(true)
      expect(cc.message).not.toBe('already attached')
      expect(execFileSync.mock.calls.some(c => c[0] === 'claude' && c[1]?.[1] === 'add')).toBe(true)
    })
  })

  describe('resolveLaunchCmd', () => {
    it('resolves an absolute node + entry when the entry is a js file', async () => {
      const { resolveLaunchCmd } = await loadInstaller()
      const dir = mkdtempSync(join(tmpdir(), 'reeves-launch-'))
      const js = join(dir, 'cli.js')
      writeFileSync(js, '// entry')
      try {
        const cmd = resolveLaunchCmd(js)
        expect(cmd.command).toBe(process.execPath)
        expect(cmd.args).toEqual([realpathSync(js), 'mcp'])
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('falls back to the absolute bin on PATH when the entry is not a js file', async () => {
      wireEnv({ installed: new Set(['reevesagents']), listOutput: {} })
      const { resolveLaunchCmd } = await loadInstaller()
      const cmd = resolveLaunchCmd('/no/such/reeves-entry')
      expect(cmd).toEqual({ command: '/usr/bin/reevesagents', args: ['mcp'] })
    })

    it('falls back to the bare name when nothing resolves', async () => {
      wireEnv({ installed: new Set(), listOutput: {} })
      const { resolveLaunchCmd } = await loadInstaller()
      const cmd = resolveLaunchCmd('/no/such/reeves-entry')
      expect(cmd).toEqual({ command: 'reevesagents', args: ['mcp'] })
    })
  })

  describe('attachAll', () => {
    it('attaches every installed drivable host, including file-based opencode', async () => {
      // claude + qwen (CLI-based) and opencode (file-based) installed;
      // codex/kimi/hermes not installed.
      wireEnv({
        installed: new Set(['claude', 'qwen', 'opencode']),
        listOutput: {},
      })
      const { attachAll } = await loadInstaller()

      const results = attachAll()
      const keys = results.map(r => r.key).sort()
      expect(keys).toEqual(['cc', 'opencode', 'qwen'])
      expect(results.every(r => r.ok)).toBe(true)

      // No add was issued for an uninstalled host.
      const codexAdd = execFileSync.mock.calls.find(c => c[0] === 'codex' && c[1]?.[1] === 'add')
      expect(codexAdd).toBeUndefined()
    })

    it('returns an empty list when no drivable host is installed', async () => {
      wireEnv({ installed: new Set(), listOutput: {} })
      const { attachAll } = await loadInstaller()

      expect(attachAll()).toEqual([])
    })

    it('skips an already-attached host and reports it as success without re-adding', async () => {
      // claude is already attached (its mcp list shows reevesagents); qwen is not.
      // attach-all must not re-issue add for claude (which the real CLI would
      // reject as "already exists") yet still count it as ok.
      wireEnv({
        installed: new Set(['claude', 'qwen']),
        listOutput: { claude: 'reevesagents: reevesagents mcp - ✓ Connected' },
      })
      const { attachAll } = await loadInstaller()

      const results = attachAll()
      expect(results.every(r => r.ok)).toBe(true)
      const cc = results.find(r => r.key === 'cc')!
      expect(cc.message).toBe('already attached')

      // No add was issued for the already-attached host.
      const claudeAdd = execFileSync.mock.calls.find(c => c[0] === 'claude' && c[1]?.[1] === 'add')
      expect(claudeAdd).toBeUndefined()
      // The not-yet-attached host was still attached.
      const qwenAdd = execFileSync.mock.calls.find(c => c[0] === 'qwen' && c[1]?.[1] === 'add')
      expect(qwenAdd).toBeDefined()
    })
  })

  describe('detach', () => {
    it('builds the mcp remove argv and returns ok:true for a drivable installed host', async () => {
      wireEnv({ installed: new Set(['claude']), listOutput: {} })
      const { detach } = await loadInstaller()

      const result = detach('cc')
      expect(result).toEqual({ key: 'cc', label: 'Claude Code', ok: true, message: 'detached' })
      const removeCall = execFileSync.mock.calls.find(c => c[0] === 'claude' && c[1]?.[1] === 'remove')!
      expect(removeCall[1]).toEqual(['mcp', 'remove', 'reevesagents'])
    })

    it('detaches opencode by editing its config file (no CLI remove call)', async () => {
      wireEnv({ installed: new Set(['opencode']), listOutput: {} })
      const { detach } = await loadInstaller()

      const result = detach('opencode')
      expect(result.ok).toBe(true)
      expect(execFileSync).not.toHaveBeenCalledWith('opencode', expect.arrayContaining(['mcp', 'remove']), expect.anything())
    })
  })
})
