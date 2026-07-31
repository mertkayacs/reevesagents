// Tiny file signal used to reset an already-running TUI when the CLI opens it.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stateRoot } from '../../core/runs.js'

function tokenPath(): string {
  return join(stateRoot(), 'tui-open-token')
}

export function readTuiOpenToken(): string {
  try {
    return readFileSync(tokenPath(), 'utf-8').trim()
  } catch {
    return ''
  }
}

export function writeTuiOpenToken(): void {
  mkdirSync(stateRoot(), { recursive: true })
  writeFileSync(tokenPath(), `${Date.now()}\n`, 'utf-8')
}
