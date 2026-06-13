import { readFileSync } from 'node:fs'
import { URL } from 'node:url'

function readVersion(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version?: unknown }
  if (typeof pkg.version !== 'string') throw new Error('package.json version must be a string')
  return pkg.version
}

export const ORCHESTRATOR_VERSION = readVersion()
