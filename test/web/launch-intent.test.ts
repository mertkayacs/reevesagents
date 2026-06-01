import { describe, it, expect } from 'vitest'
import { requestWebLaunch, consumeWebLaunch } from '../../src/web/launch-intent.js'

describe('web launch intent', () => {
  it('defaults to not pending', () => {
    expect(consumeWebLaunch()).toBe(false)
  })

  it('is one-shot: set, read once true, then clears', () => {
    requestWebLaunch()
    expect(consumeWebLaunch()).toBe(true)
    expect(consumeWebLaunch()).toBe(false)
  })
})
