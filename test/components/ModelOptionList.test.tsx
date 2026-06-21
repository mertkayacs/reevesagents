import { describe, expect, it } from 'vitest'
import React from 'react'
import { render } from 'ink-testing-library'
import { ModelOptionList } from '../../src/tui/components/ModelOptionList.js'

describe('ModelOptionList', () => {
  it('renders selectable provider-scoped models', () => {
    const { lastFrame } = render(
      <ModelOptionList
        provider="cc"
        values={['', 'sonnet', 'opus']}
        current="sonnet"
        selectedIdx={1}
      />
    )

    const frame = lastFrame()
    expect(frame).toContain('Model Options')
    expect(frame).toContain('provider default')
    expect(frame).toContain('sonnet')
    expect(frame).toContain('selected')
  })
})
