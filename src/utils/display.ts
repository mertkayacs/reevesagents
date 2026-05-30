// Display utilities: provider colors, color capability checks, secret redaction.
// Invariant: providerColor always returns a valid hex string or named color.

import chalk from 'chalk'
import type { Provider } from '../state/types.js'
import { colors } from './tokens.js'

export function providerColor(p: Provider): string {
  return colors.provider[p] ?? 'gray'
}

export function supportsColor(): boolean {
  return chalk.level >= 2
}

export function supportsHex(): boolean {
  return chalk.level >= 3
}

// Ordered: longer prefix patterns must come before shorter ones (e.g. sk-ant before sk-)
const SECRET_PATTERNS = [
  /sk-ant-[A-Za-z0-9\-_]{20,}/g,
  /sk-[A-Za-z0-9\-_]{20,}/g,
  /AIza[A-Za-z0-9\-_]{35}/g,
  /gsk_[A-Za-z0-9\-_]{20,}/g,
]

export function redactSecrets(text: string): string {
  let result = text
  for (const pattern of SECRET_PATTERNS) result = result.replace(pattern, '[REDACTED]')
  return result
}
