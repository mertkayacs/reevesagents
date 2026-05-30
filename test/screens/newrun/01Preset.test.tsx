import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { Router } from '../../../src/router.js'
import * as StoreModule from '../../../src/state/store.js'

vi.mock('../../../src/state/store.js')

describe('NewRunPreset', () => {
  beforeEach(() => {
    vi.spyOn(StoreModule, 'listSavedTrees').mockReturnValue([])
  })

  it('renders breadcrumb and step indicator', () => {
    const { lastFrame } = render(<Router initialScreen="NewRunPreset" />)
    const output = lastFrame()
    expect(output).toContain('ReevesAgents')
    expect(output).toContain('New Run')
    expect(output).toContain('1 / 5')
    expect(output).toContain('Preset')
  })

  it('renders Blank preset option', () => {
    const { lastFrame } = render(<Router initialScreen="NewRunPreset" />)
    const output = lastFrame()
    expect(output).toContain('Blank')
  })

  it('renders action section', () => {
    const { lastFrame } = render(<Router initialScreen="NewRunPreset" />)
    const output = lastFrame()
    expect(output).toContain('Actions')
    expect(output).toContain('Continue')
    expect(output).toContain('Cancel')
  })
})
