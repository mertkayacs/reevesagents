// Key names the drive tools accept, mapped to the raw bytes ConPTY delivers to the
// console app. This replaces the tmux key-name map (src/core/runtime.ts tmuxKey):
// on native Windows there is no tmux to translate names, so we write the escape
// sequences ourselves. ALLOWED_KEYS is kept in lockstep with the unix runtime
// (src/core/runtime.ts ALLOWED_KEYS) so the MCP send_key schema is identical;
// keys.test.ts asserts that parity.

export const ALLOWED_KEYS = [
  'enter',
  'escape',
  'backspace',
  'tab',
  'space',
  'up',
  'down',
  'left',
  'right',
  'ctrl-c',
] as const

export type AllowedKey = typeof ALLOWED_KEYS[number]

const KEY_BYTES: Record<AllowedKey, string> = {
  enter: '\r',
  escape: '\x1b',
  backspace: '\x7f',
  tab: '\t',
  space: ' ',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  'ctrl-c': '\x03',
}

export function keyBytes(key: AllowedKey): string {
  return KEY_BYTES[key]
}
