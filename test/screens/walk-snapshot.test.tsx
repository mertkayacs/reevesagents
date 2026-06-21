// Renders every screen via ink-testing-library and prints the output.
// Not a snapshot match — just a visual walk. Run with --reporter=verbose to see.

import React from 'react'
import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import { Router } from '../../src/tui/router.js'
import type { ScreenName } from '../../src/core/types.js'

const SCREENS: ScreenName[] = [
  'Welcome',
  'Runs',
  'Run',
  'AgentDetail',
  'NewRun',
  'AddWorker',
  'Doctor',
  'Settings',
  'Reference',
  'Credits',
]

describe('screen walk', () => {
  for (const screen of SCREENS) {
    it(`renders ${screen}`, () => {
      const { lastFrame, unmount } = render(<Router initialScreen={screen} />)
      const frame = lastFrame() ?? '(empty frame)'
      // Output goes through vitest's stdout when reporter is verbose.
      // eslint-disable-next-line no-console
      console.log(`\n========== ${screen} ==========\n${frame}\n========================\n`)
      expect(frame.length).toBeGreaterThan(0)
      unmount()
    })
  }
})
