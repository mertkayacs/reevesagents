import { afterEach, describe, expect, it } from 'vitest'
import { prepareTuiColorEnv } from '../../src/utils/color-env.js'

const originalEnv = {
  FORCE_COLOR: process.env.FORCE_COLOR,
  NO_COLOR: process.env.NO_COLOR,
  REEVES_NO_COLOR: process.env.REEVES_NO_COLOR,
  TERM: process.env.TERM,
}

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('prepareTuiColorEnv', () => {
  it('enables truecolor for the interactive TUI', () => {
    process.env.NO_COLOR = '1'
    process.env.TERM = 'dumb'
    delete process.env.FORCE_COLOR
    delete process.env.REEVES_NO_COLOR

    prepareTuiColorEnv()

    expect(process.env.NO_COLOR).toBeUndefined()
    expect(process.env.FORCE_COLOR).toBe('3')
    expect(process.env.TERM).toBe('xterm-256color')
  })

  it('does not replace an explicit FORCE_COLOR value', () => {
    process.env.FORCE_COLOR = '1'
    process.env.NO_COLOR = '1'
    process.env.TERM = 'xterm-256color'
    delete process.env.REEVES_NO_COLOR

    prepareTuiColorEnv()

    expect(process.env.FORCE_COLOR).toBe('1')
  })

  it('supports an app-specific no-color opt out', () => {
    process.env.FORCE_COLOR = '3'
    process.env.REEVES_NO_COLOR = '1'

    prepareTuiColorEnv()

    expect(process.env.FORCE_COLOR).toBeUndefined()
    expect(process.env.NO_COLOR).toBe('1')
  })
})
