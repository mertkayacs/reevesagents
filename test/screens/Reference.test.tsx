import { describe, expect, it } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { Router } from '../../src/router.js'

const waitForInput = () => new Promise(resolve => setTimeout(resolve, 50))

describe('Reference screen', () => {
  it('renders a scrollable reference with a Back action', async () => {
    const { lastFrame, stdin, unmount } = render(<Router initialScreen="Reference" />)

    expect(lastFrame() ?? '').toContain('Reference')
    expect(lastFrame() ?? '').toContain('TUI Pages')
    expect(lastFrame() ?? '').toContain('Back')

    for (let i = 0; i < 16; i++) {
      stdin.write('\u001B[B')
      await waitForInput()
    }

    const frame = lastFrame() ?? ''
    expect(frame).toContain('Roles')
    expect(frame).toContain('Human')
    expect(frame).toContain('Back')
    unmount()
  })
})
