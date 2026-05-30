// Color capability detection and theme mode. Tokens stay in tokens.ts;
// this file picks how aggressively to render them on the current terminal.

import chalk from 'chalk'

export type ThemeMode = 'dark' | 'light'

// Backward-compatible flag the rest of the code already reads.
// Invariant: computed once at import time, safe to cache.
export const COLOR_ENABLED = !process.env.NO_COLOR && process.env.TERM !== 'dumb'

// chalk.level: 0 disabled, 1 16 colors, 2 256, 3 truecolor.
export function colorLevel(): 0 | 1 | 2 | 3 {
  if (!COLOR_ENABLED) return 0
  return chalk.level as 0 | 1 | 2 | 3
}

export function supportsTruecolor(): boolean {
  return colorLevel() >= 3
}

export function supportsAnsi256(): boolean {
  return colorLevel() >= 2
}

// Dark is the default. Light is opt-in via REEVES_THEME=light.
// The /theme picker is deferred per the rebuild plan.
export function themeMode(): ThemeMode {
  return process.env.REEVES_THEME === 'light' ? 'light' : 'dark'
}
