import { beforeEach, describe, expect, it, vi } from 'vitest'

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
      if (env.installed.has(bin)) return Buffer.from(`/usr/bin/${bin}\n`)
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

    it('marks opencode as manual because it has no add command', async () => {
      wireEnv({
        installed: new Set(['opencode']),
        listOutput: { opencode: 'reevesagents: reevesagents mcp' },
      })
      const { hostStatus } = await loadInstaller()

      const opencode = hostStatus().find(h => h.key === 'opencode')!
      expect(opencode.manual).toBe(true)
      expect(opencode.installed).toBe(true)
    })

    it('marks every drivable host as manual:false', async () => {
      wireEnv({ installed: new Set(), listOutput: {} })
      const { hostStatus } = await loadInstaller()

      const drivable = hostStatus().filter(h => h.key !== 'opencode')
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
    it('builds the Claude Code argv with the -- separator and returns ok:true', async () => {
      wireEnv({ installed: new Set(['claude']), listOutput: {} })
      const { attach } = await loadInstaller()

      const result = attach('cc')
      expect(result).toEqual({ key: 'cc', label: 'Claude Code', ok: true, message: 'attached' })

      const addCall = execFileSync.mock.calls.find(c => c[0] === 'claude' && c[1]?.[1] === 'add')!
      expect(addCall[0]).toBe('claude')
      expect(addCall[1]).toEqual(['mcp', 'add', 'reevesagents', '--', 'reevesagents', 'mcp'])
    })

    it('builds the codex argv with the -- separator', async () => {
      wireEnv({ installed: new Set(['codex']), listOutput: {} })
      const { attach } = await loadInstaller()

      expect(attach('codex').ok).toBe(true)
      const addCall = execFileSync.mock.calls.find(c => c[0] === 'codex' && c[1]?.[1] === 'add')!
      expect(addCall[1]).toEqual(['mcp', 'add', 'reevesagents', '--', 'reevesagents', 'mcp'])
    })

    it('builds the kimi argv with the -- separator', async () => {
      wireEnv({ installed: new Set(['kimi']), listOutput: {} })
      const { attach } = await loadInstaller()

      expect(attach('kimi').ok).toBe(true)
      const addCall = execFileSync.mock.calls.find(c => c[0] === 'kimi' && c[1]?.[1] === 'add')!
      expect(addCall[1]).toEqual(['mcp', 'add', 'reevesagents', '--', 'reevesagents', 'mcp'])
    })

    it('builds the qwen argv with positional command (no -- separator)', async () => {
      wireEnv({ installed: new Set(['qwen']), listOutput: {} })
      const { attach } = await loadInstaller()

      expect(attach('qwen').ok).toBe(true)
      const addCall = execFileSync.mock.calls.find(c => c[0] === 'qwen' && c[1]?.[1] === 'add')!
      expect(addCall[1]).toEqual(['mcp', 'add', 'reevesagents', 'reevesagents', 'mcp'])
    })

    it('builds the hermes argv with --command / --args flags', async () => {
      wireEnv({ installed: new Set(['hermes']), listOutput: {} })
      const { attach } = await loadInstaller()

      expect(attach('hermes').ok).toBe(true)
      const addCall = execFileSync.mock.calls.find(c => c[0] === 'hermes' && c[1]?.[1] === 'add')!
      expect(addCall[1]).toEqual(['mcp', 'add', 'reevesagents', '--command', 'reevesagents', '--args', 'mcp'])
    })

    it('returns ok:false with a manual message for opencode and runs no command', async () => {
      wireEnv({ installed: new Set(['opencode']), listOutput: {} })
      const { attach } = await loadInstaller()

      const result = attach('opencode')
      expect(result.ok).toBe(false)
      expect(result.message).toMatch(/manual/i)
      // Manual hosts short-circuit before any which / list / add call.
      expect(execFileSync).not.toHaveBeenCalled()
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

  describe('attachAll', () => {
    it('only attaches installed drivable hosts and skips manual and uninstalled ones', async () => {
      // claude + qwen installed and drivable; opencode installed but manual;
      // codex/kimi/hermes not installed.
      wireEnv({
        installed: new Set(['claude', 'qwen', 'opencode']),
        listOutput: {},
      })
      const { attachAll } = await loadInstaller()

      const results = attachAll()
      const keys = results.map(r => r.key).sort()
      expect(keys).toEqual(['cc', 'qwen'])
      expect(results.every(r => r.ok)).toBe(true)

      // opencode is manual, so it must never appear.
      expect(results.find(r => r.key === 'opencode')).toBeUndefined()
      // No add was issued for an uninstalled host.
      const codexAdd = execFileSync.mock.calls.find(c => c[0] === 'codex' && c[1]?.[1] === 'add')
      expect(codexAdd).toBeUndefined()
    })

    it('returns an empty list when no drivable host is installed', async () => {
      wireEnv({ installed: new Set(['opencode']), listOutput: {} })
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

    it('returns ok:false with a manual message for opencode', async () => {
      wireEnv({ installed: new Set(['opencode']), listOutput: {} })
      const { detach } = await loadInstaller()

      const result = detach('opencode')
      expect(result.ok).toBe(false)
      expect(result.message).toMatch(/manual/i)
      expect(execFileSync).not.toHaveBeenCalled()
    })
  })
})
