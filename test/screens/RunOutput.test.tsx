import { describe, expect, it } from 'vitest'
import { RunOutput } from '../../src/tui/screens/run/RunOutput.js'

describe('Run › Output (Detail)', () => {
  it('exports RunOutput component', () => {
    expect(RunOutput).toBeDefined()
    expect(typeof RunOutput).toBe('function')
  })

  it('RunOutput module loads without errors', () => {
    // Component itself is tested via integration; this verifies module integrity
    expect(RunOutput.name).toBe('RunOutput')
  })
})
