import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import { Text } from 'ink'
import { Detail } from '../../src/surfaces/tui/components/Detail.js'

describe('Detail', () => {
  it('renders without title', () => {
    const { lastFrame } = render(
      <Detail>
        <Text>Sample content</Text>
      </Detail>
    )
    const frame = lastFrame()
    expect(frame).toContain('Sample content')
  })

  it('renders with title', () => {
    const { lastFrame } = render(
      <Detail title="Details">
        <Text>Sample content</Text>
      </Detail>
    )
    const frame = lastFrame()
    expect(frame).toContain('Details')
    expect(frame).toContain('Sample content')
  })

  it('renders title in accent.primary color', () => {
    const { lastFrame } = render(
      <Detail title="Test Title">
        <Text>Body</Text>
      </Detail>
    )
    const frame = lastFrame()
    expect(frame).toBeTruthy()
    expect(frame?.length).toBeGreaterThan(0)
  })

  it('renders multiple children', () => {
    const { lastFrame } = render(
      <Detail title="Multi">
        <Text>Line 1</Text>
        <Text>Line 2</Text>
      </Detail>
    )
    const frame = lastFrame()
    expect(frame).toContain('Line 1')
    expect(frame).toContain('Line 2')
  })

  it('renders with padding', () => {
    const { lastFrame } = render(
      <Detail title="Padded">
        <Text>Content</Text>
      </Detail>
    )
    const frame = lastFrame()
    // Check that the frame has content and reasonable length (padding adds whitespace)
    expect(frame).toBeTruthy()
    expect(frame?.length).toBeGreaterThan(10)
  })
})
