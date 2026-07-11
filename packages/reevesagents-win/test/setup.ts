import { afterAll, beforeEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Isolate the registry per test: each test gets a fresh REEVES_WIN_REGISTRY dir so
// runs/agents never leak across tests. Mirrors the unix suite's REEVES_CONFIG
// isolation (test/setup.ts).
const root = mkdtempSync(join(tmpdir(), 'reeves-win-vitest-'))
let counter = 0

beforeEach(() => {
  process.env.REEVES_WIN_REGISTRY = join(root, `reg-${counter++}`)
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})
