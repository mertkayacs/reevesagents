import { describe, expect, it } from 'vitest'
import { LOGO_LINES, FULL_LOGO_LINES, logoRows, chunks } from '../../src/brand/wordmark.js'

describe('wordmark', () => {
  it('REEVES is five rows tall', () => {
    expect(logoRows(LOGO_LINES, false)).toHaveLength(5)
  })

  it('REEVES AGENTS is ten rows tall', () => {
    expect(logoRows(FULL_LOGO_LINES, false)).toHaveLength(10)
  })

  it('compact width is narrower than wide width', () => {
    const compact = logoRows(LOGO_LINES, false)[0] ?? ''
    const wide = logoRows(LOGO_LINES, true)[0] ?? ''
    expect(compact.length).toBeLessThan(wide.length)
  })

  it('every row has consistent width', () => {
    const rows = logoRows(LOGO_LINES, false)
    const widths = new Set(rows.map(row => row.length))
    expect(widths.size).toBe(1)
  })

  it('chunks splits a row into fixed-size pieces', () => {
    const row = '1234567890'
    expect(chunks(row, 4)).toEqual(['1234', '5678', '90'])
  })
})
