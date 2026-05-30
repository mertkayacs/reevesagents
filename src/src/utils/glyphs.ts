// Visible characters used as UI markers. Centralized so a font swap is one change.

export const glyphs = {
  cursor: {
    focused:   '❯',
    unfocused: ' ',
  },
  divider:       '│',
  bullet:        '•',
  chevron:       '›',
  commandPrefix: '/',
  status: {
    ok:      '●',
    warn:    '◐',
    fail:    '○',
    pending: '◌',
  },
} as const

export type Glyph = string
