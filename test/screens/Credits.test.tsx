import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import { Router } from '../../src/surfaces/tui/router.js'
import { REEVESAGENTS_VERSION } from '../../src/version.js'

describe('Credits screen', () => {
  it('renders project metadata and a Back action', () => {
    const { lastFrame, unmount } = render(<Router initialScreen="Credits" />)
    const frame = lastFrame() ?? ''

    expect(frame).toContain('Credits')
    expect(frame).toContain('ReevesAgents')
    expect(frame).toContain(REEVESAGENTS_VERSION)
    expect(frame).toContain('Apache-2.0')
    expect(frame).toContain('Back')
    unmount()
  })
})
