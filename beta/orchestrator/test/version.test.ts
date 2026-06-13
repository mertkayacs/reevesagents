import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ORCHESTRATOR_VERSION } from '../src/version.js'

describe('package version', () => {
  it('matches orchestrator package metadata', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
    expect(ORCHESTRATOR_VERSION).toBe(pkg.version)
  })
})
