import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { ALLOWED_KEYS, keyBytes } from '../src/core/keys.js'

// Pull the unix runtime's ALLOWED_KEYS from source text rather than importing the
// module (which drags in the whole tmux runtime graph). Parity matters because the
// two packages share the send_key schema.
function unixAllowedKeys(): string[] {
  const src = readFileSync(fileURLToPath(new URL('../../../src/core/runtime.ts', import.meta.url)), 'utf8')
  const block = src.slice(src.indexOf('export const ALLOWED_KEYS = ['), src.indexOf('] as const'))
  return [...block.matchAll(/'([^']+)'/g)].map(match => match[1]!)
}

describe('keys', () => {
  it('ALLOWED_KEYS matches the unix runtime exactly, in order', () => {
    expect([...ALLOWED_KEYS]).toEqual(unixAllowedKeys())
  })

  it('maps every allowed key to bytes', () => {
    for (const key of ALLOWED_KEYS) {
      expect(typeof keyBytes(key)).toBe('string')
      expect(keyBytes(key).length).toBeGreaterThan(0)
    }
  })

  it('uses the expected control and escape sequences', () => {
    expect(keyBytes('enter')).toBe('\r')
    expect(keyBytes('escape')).toBe('\x1b')
    expect(keyBytes('backspace')).toBe('\x7f')
    expect(keyBytes('tab')).toBe('\t')
    expect(keyBytes('space')).toBe(' ')
    expect(keyBytes('ctrl-c')).toBe('\x03')
  })

  it('uses CSI arrow sequences', () => {
    expect(keyBytes('up')).toBe('\x1b[A')
    expect(keyBytes('down')).toBe('\x1b[B')
    expect(keyBytes('right')).toBe('\x1b[C')
    expect(keyBytes('left')).toBe('\x1b[D')
  })
})
