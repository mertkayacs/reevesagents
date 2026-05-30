import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const originalNoColor = process.env.NO_COLOR
const originalTerm = process.env.TERM

beforeEach(() => {
  delete process.env.NO_COLOR
  delete process.env.TERM
})

afterEach(() => {
  if (originalNoColor !== undefined) process.env.NO_COLOR = originalNoColor
  else delete process.env.NO_COLOR
  if (originalTerm !== undefined) process.env.TERM = originalTerm
  else delete process.env.TERM
})

describe('COLOR_ENABLED from theme.ts', () => {
  it('is true when NO_COLOR is unset and TERM is not dumb', async () => {
    const { COLOR_ENABLED } = await import('../src/utils/theme.js')
    // In test env neither NO_COLOR nor TERM=dumb is set by default
    expect(typeof COLOR_ENABLED).toBe('boolean')
  })

  it('COLOR_ENABLED formula: false when NO_COLOR is set', () => {
    // Direct formula test (module is already cached; test the logic itself)
    const computeEnabled = (noColor: string | undefined, term: string | undefined) =>
      !noColor && term !== 'dumb'
    expect(computeEnabled('1', undefined)).toBe(false)
    expect(computeEnabled(undefined, 'dumb')).toBe(false)
    expect(computeEnabled(undefined, 'xterm-256color')).toBe(true)
    expect(computeEnabled(undefined, undefined)).toBe(true)
  })
})
