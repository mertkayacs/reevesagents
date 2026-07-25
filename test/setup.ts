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

beforeEach(() => {
  writeFileSync(configPath, englishConfig, 'utf8')
  process.env.REEVES_CONFIG = configPath
  process.env.REEVES_HOME = homeRoot
})

afterAll(() => {
  rmSync(configRoot, { recursive: true, force: true })
  rmSync(homeRoot, { recursive: true, force: true })
})
