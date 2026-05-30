// Pixel font for the REEVES AGENTS wordmark. 5x5 per glyph plus a 3-wide
// blank for spacing. Extracted from the old BlockLogo so brand assets live
// under src/brand/.

export type Glyph = readonly string[]

const GLYPHS: Record<string, Glyph> = {
  ' ': ['000', '000', '000', '000', '000'],
  A: ['01110', '10001', '11111', '10001', '10001'],
  E: ['11111', '10000', '11110', '10000', '11111'],
  G: ['01111', '10000', '10111', '10001', '01111'],
  N: ['10001', '11001', '10101', '10011', '10001'],
  R: ['11110', '10001', '11110', '10010', '10001'],
  S: ['01111', '10000', '01110', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100'],
  V: ['10001', '10001', '10001', '01010', '00100'],
}

const FALLBACK: Glyph = ['111', '101', '101', '101', '111']

export const LOGO_LINES = ['REEVES'] as const
export const FULL_LOGO_LINES = ['REEVES', 'AGENTS'] as const

export function logoRows(lines: readonly string[] = LOGO_LINES, wide = true): string[] {
  const pixel = wide ? '██' : '█'
  const off = wide ? '  ' : ' '
  const gap = wide ? '  ' : ' '
  const output: string[] = []

  for (const line of lines) {
    for (let row = 0; row < 5; row += 1) {
      output.push([...line].map(ch => {
        const glyph = GLYPHS[ch.toUpperCase()] ?? FALLBACK
        return [...(glyph[row] ?? '')].map(bit => bit === '1' ? pixel : off).join('')
      }).join(gap))
    }
  }

  return output
}

export function chunks(row: string, size = 4): string[] {
  return row.match(new RegExp(`.{1,${size}}`, 'g')) ?? ['']
}

export const AGENTS_LINES = ['AGENTS'] as const

// Pack 5-row pixel font into 3 terminal rows using half-block chars (▀▄█).
// Halves the visual height while preserving letter shapes.
export function logoRowsHalf(lines: readonly string[] = LOGO_LINES): string[] {
  const src = logoRows(lines, false)
  const out: string[] = []
  for (let i = 0; i < src.length; i += 2) {
    const top = src[i] ?? ''
    const bot = src[i + 1] ?? ''
    const len = Math.max(top.length, bot.length)
    let row = ''
    for (let j = 0; j < len; j++) {
      const t = (top[j] ?? ' ') !== ' '
      const b = (bot[j] ?? ' ') !== ' '
      if (t && b) row += '█'
      else if (t) row += '▀'
      else if (b) row += '▄'
      else row += ' '
    }
    out.push(row)
  }
  return out
}
