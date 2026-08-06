import { afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const configRoot = mkdtempSync(join(tmpdir(), 'reeves-vitest-config-'))
const configPath = join(configRoot, 'config.json')
const englishConfig = JSON.stringify({ version: 2, global: { language: 'en' } })

// Default every test's home to a throwaway dir so any code path that writes under
// the home dir (the skills installer, reached by the every-tool smoke loop) lands
// in the sandbox, never the developer's real ~/.claude or ~/.agents. Tests that
// need a specific home still override REEVES_HOME themselves.
const homeRoot = mkdtempSync(join(tmpdir(), 'reeves-vitest-home-'))

// Point tmux at an isolated, always-empty server. Any code path that forgets its
// driver/seam injection (a real sweep from a web or MCP test) then probes and
// "reaps" only this sandbox instead of killing the developer's live sessions.
const tmuxRoot = mkdtempSync(join(tmpdir(), 'reeves-vitest-tmux-'))

// Same for the run registry: stateRoot() reads REEVES_REGISTRY, not REEVES_HOME,
// so a test that forgets to set it would otherwise sweep and archive the
// developer's real ~/.reeves runs.
const registryRoot = mkdtempSync(join(tmpdir(), 'reeves-vitest-registry-'))

beforeEach(() => {
  writeFileSync(configPath, englishConfig, 'utf8')
  process.env.REEVES_CONFIG = configPath
  process.env.REEVES_HOME = homeRoot
  process.env.REEVES_REGISTRY = registryRoot
  process.env.TMUX_TMPDIR = tmuxRoot
  // An inherited TMUX (test runner inside tmux) beats TMUX_TMPDIR for socket
  // selection, so it must go or the isolation above is an illusion.
  delete process.env.TMUX
})

afterAll(() => {
  rmSync(configRoot, { recursive: true, force: true })
  rmSync(homeRoot, { recursive: true, force: true })
  rmSync(tmuxRoot, { recursive: true, force: true })
  rmSync(registryRoot, { recursive: true, force: true })
})
