// Renders every screen via ink-testing-library and prints the output.
// Not a snapshot match: just a visual walk. Run with --reporter=verbose to see.

import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import { Router } from '../../src/surfaces/tui/router.js'
import type { ScreenName } from '../../src/surfaces/tui/types.js'

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
      console.log(`\n========== ${screen} ==========\n${frame}\n========================\n`)
      expect(frame.length).toBeGreaterThan(0)
      unmount()
    })
  }
})
