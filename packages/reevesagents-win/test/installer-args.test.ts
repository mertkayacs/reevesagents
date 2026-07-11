import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Drive the installer without touching a real CLI: every execFileSync call (which /
// mcp list / mcp add / mcp remove) is routed through this single mock. This exercises
// the non-Windows branch (execFileSync direct), so it runs on Linux CI; the cmd.exe
// wrapping is Windows-only and validated on a real Windows runner.
const execFileSync = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({ execFileSync }))

async function loadInstaller() {
  return import('../src/mcp/installer.js')
}

interface FakeEnv {
  installed: Set<string>
  listOutput: Record<string, string>
}

function wireEnv(env: FakeEnv): void {
  execFileSync.mockImplementation((file: string, args: string[]) => {
    if (file === 'which') {
      const bin = args[0]!
      if (env.installed.has(bin)) return `/usr/bin/${bin}\n`
      throw new Error(`which: ${bin} not found`)
    }
    const sub = args[1]
    if (sub === 'list') return env.listOutput[file] ?? ''
    return ''
  })
}

beforeEach(() => {
  execFileSync.mockReset()
})

describe('win installer', () => {
  it('registers the server as reevesagents-win with the node.exe launcher for Claude Code', async () => {
    wireEnv({ installed: new Set(['claude']), listOutput: {} })
    const { attach } = await loadInstaller()

    expect(attach('cc')).toEqual({ key: 'cc', label: 'Claude Code', ok: true, message: 'attached' })
    const argv = execFileSync.mock.calls.find(c => c[0] === 'claude' && c[1]?.[1] === 'add')![1]
    expect(argv.slice(0, 3)).toEqual(['mcp', 'add', 'reevesagents-win'])
    expect(argv[argv.indexOf('-s') + 1]).toBe('user')
    expect(argv).toContain('--')
    // Launcher is node.exe + entry + 'mcp' (resolveLaunchCmd on the running .js).
    expect(argv[argv.length - 1]).toBe('mcp')
  })

  it('uses the -- separator and no scope for codex and kimi', async () => {
    const { attach } = await loadInstaller()
    for (const bin of ['codex', 'kimi'] as const) {
      execFileSync.mockReset()
      wireEnv({ installed: new Set([bin]), listOutput: {} })
      expect(attach(bin).ok).toBe(true)
      const argv = execFileSync.mock.calls.find(c => c[0] === bin && c[1]?.[1] === 'add')![1]
      expect(argv.slice(0, 3)).toEqual(['mcp', 'add', 'reevesagents-win'])
      expect(argv).toContain('--')
      expect(argv).not.toContain('-s')
    }
  })

  it('uses a positional command with no -- for qwen', async () => {
    wireEnv({ installed: new Set(['qwen']), listOutput: {} })
    const { attach } = await loadInstaller()
    expect(attach('qwen').ok).toBe(true)
    const argv = execFileSync.mock.calls.find(c => c[0] === 'qwen' && c[1]?.[1] === 'add')![1]
    expect(argv.slice(0, 3)).toEqual(['mcp', 'add', 'reevesagents-win'])
    expect(argv).not.toContain('--')
  })

  it('uses --command / --args for hermes', async () => {
    wireEnv({ installed: new Set(['hermes']), listOutput: {} })
    const { attach } = await loadInstaller()
    expect(attach('hermes').ok).toBe(true)
    const argv = execFileSync.mock.calls.find(c => c[0] === 'hermes' && c[1]?.[1] === 'add')![1]
    expect(argv.slice(0, 3)).toEqual(['mcp', 'add', 'reevesagents-win'])
    expect(argv).toContain('--command')
    expect(argv).toContain('--args')
  })

  it('reports opencode as manual and runs no command', async () => {
    wireEnv({ installed: new Set(['opencode']), listOutput: {} })
    const { attach, hostStatus } = await loadInstaller()
    const result = attach('opencode')
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/manual/i)
    expect(hostStatus().find(h => h.key === 'opencode')!.manual).toBe(true)
  })

  describe('attach-detection is mutually exclusive with the unix package', () => {
    it('does NOT count the unix reevesagents server as attached', async () => {
      wireEnv({
        installed: new Set(['claude']),
        listOutput: { claude: 'reevesagents: reevesagents mcp - Connected' },
      })
      const { hostStatus } = await loadInstaller()
      expect(hostStatus().find(h => h.key === 'cc')!.attached).toBe(false)
    })

    it('counts a reevesagents-win entry as attached', async () => {
      wireEnv({
        installed: new Set(['claude']),
        listOutput: { claude: 'reevesagents-win: reevesagents-win mcp - Connected' },
      })
      const { hostStatus } = await loadInstaller()
      expect(hostStatus().find(h => h.key === 'cc')!.attached).toBe(true)
    })

    it('counts reevesagents-win even when the unix sibling is also listed', async () => {
      wireEnv({
        installed: new Set(['claude']),
        listOutput: {
          claude: [
            'reevesagents: reevesagents mcp - Connected',
            'reevesagents-win: reevesagents-win mcp - Connected',
          ].join('\n'),
        },
      })
      const { hostStatus } = await loadInstaller()
      expect(hostStatus().find(h => h.key === 'cc')!.attached).toBe(true)
    })
  })

  describe('resolveLaunchCmd', () => {
    it('resolves node.exe + entry + mcp for a js entry', async () => {
      const { resolveLaunchCmd } = await loadInstaller()
      const dir = mkdtempSync(join(tmpdir(), 'reeves-win-launch-'))
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

    it('falls back to the absolute bin on PATH when the entry is not js', async () => {
      wireEnv({ installed: new Set(['reevesagents-win']), listOutput: {} })
      const { resolveLaunchCmd } = await loadInstaller()
      expect(resolveLaunchCmd('/no/such/entry')).toEqual({ command: '/usr/bin/reevesagents-win', args: ['mcp'] })
    })

    it('falls back to the bare name when nothing resolves', async () => {
      wireEnv({ installed: new Set(), listOutput: {} })
      const { resolveLaunchCmd } = await loadInstaller()
      expect(resolveLaunchCmd('/no/such/entry')).toEqual({ command: 'reevesagents-win', args: ['mcp'] })
    })
  })

  describe('detach', () => {
    it('builds the mcp remove argv for a drivable host', async () => {
      wireEnv({ installed: new Set(['claude']), listOutput: {} })
      const { detach } = await loadInstaller()
      expect(detach('cc')).toEqual({ key: 'cc', label: 'Claude Code', ok: true, message: 'detached' })
      const removeCall = execFileSync.mock.calls.find(c => c[0] === 'claude' && c[1]?.[1] === 'remove')!
      expect(removeCall[1]).toEqual(['mcp', 'remove', 'reevesagents-win'])
    })
  })
})
