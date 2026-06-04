import { afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const configRoot = mkdtempSync(join(tmpdir(), 'reeves-vitest-config-'))
const configPath = join(configRoot, 'config.json')
const englishConfig = JSON.stringify({ version: 2, global: { language: 'en' } })

beforeEach(() => {
  writeFileSync(configPath, englishConfig, 'utf8')
  process.env.REEVES_CONFIG = configPath
})

afterAll(() => {
  rmSync(configRoot, { recursive: true, force: true })
})
