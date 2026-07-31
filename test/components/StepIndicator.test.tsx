import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { StepIndicator } from '../../src/surfaces/tui/components/StepIndicator.js'

describe('StepIndicator', () => {
  it('renders step number and total', () => {
    const { lastFrame } = render(
      <StepIndicator step={1} total={5} name="Preset" />
    )
    const frame = lastFrame()
    expect(frame).toContain('1')
    expect(frame).toContain('/')
    expect(frame).toContain('5')
  })

  it('renders step name', () => {
    const { lastFrame } = render(
      <StepIndicator step={2} total={5} name="Basics" />
    )
    const frame = lastFrame()
    expect(frame).toContain('Basics')
  })

  it('renders format as N / M · name', () => {
    const { lastFrame } = render(
      <StepIndicator step={3} total={5} name="Root" />
    )
    const frame = lastFrame()
    expect(frame).toMatch(/3\s*\/\s*5.*Root/)
  })

  it('handles first step', () => {
    const { lastFrame } = render(
      <StepIndicator step={1} total={5} name="Start" />
    )
    const frame = lastFrame()
    expect(frame).toContain('1 / 5')
  })

  it('handles last step', () => {
    const { lastFrame } = render(
      <StepIndicator step={5} total={5} name="Review" />
    )
    const frame = lastFrame()
    expect(frame).toContain('5 / 5')
  })

  it('renders middle steps', () => {
    const { lastFrame } = render(
      <StepIndicator step={2} total={3} name="Configure" />
    )
    const frame = lastFrame()
    expect(frame).toContain('2 / 3')
    expect(frame).toContain('Configure')
  })

  it('renders step name in accent.primary bold', () => {
    const { lastFrame } = render(
      <StepIndicator step={1} total={5} name="Important Step" />
    )
    const frame = lastFrame()
    expect(frame).toContain('Important Step')
  })

  it('uses accent.bright for step number', () => {
    const { lastFrame } = render(
      <StepIndicator step={4} total={7} name="Workers" />
    )
    const frame = lastFrame()
    expect(frame).toContain('4')
  })

  it('uses text.muted for total count', () => {
    const { lastFrame } = render(
      <StepIndicator step={2} total={6} name="Details" />
    )
    const frame = lastFrame()
    expect(frame).toContain('6')
  })
})
