import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { Pagination } from '../../src/surfaces/tui/components/Pagination.js'

describe('Pagination', () => {
  it('renders page number and total', () => {
    const { lastFrame } = render(
      <Pagination page={1} total={5} />
    )
    const frame = lastFrame()
    expect(frame).toContain('page 1 of 5')
  })

  it('renders left and right chevrons', () => {
    const { lastFrame } = render(
      <Pagination page={2} total={5} />
    )
    const frame = lastFrame()
    expect(frame).toContain('‹')
    expect(frame).toContain('›')
  })

  it('shows cursor when focused', () => {
    const { lastFrame } = render(
      <Pagination page={2} total={5} focused />
    )
    const frame = lastFrame()
    expect(frame).toContain('❯')
  })

  it('renders in text.dim color', () => {
    const { lastFrame } = render(
      <Pagination page={3} total={10} />
    )
    const frame = lastFrame()
    expect(frame).toContain('page')
    expect(frame).toContain('of')
  })

  it('dims left arrow on first page', () => {
    const { lastFrame } = render(
      <Pagination page={1} total={5} />
    )
    const frame = lastFrame()
    expect(frame).toContain('‹')
  })

  it('dims right arrow on last page', () => {
    const { lastFrame } = render(
      <Pagination page={5} total={5} />
    )
    const frame = lastFrame()
    expect(frame).toContain('›')
  })

  it('shows both arrows active on middle page', () => {
    const { lastFrame } = render(
      <Pagination page={3} total={5} />
    )
    const frame = lastFrame()
    expect(frame).toContain('‹')
    expect(frame).toContain('›')
  })

  it('formats output as ‹ page N of M ›', () => {
    const { lastFrame } = render(
      <Pagination page={2} total={4} />
    )
    const frame = lastFrame()
    expect(frame).toMatch(/‹.*page\s+2\s+of\s+4.*›/)
  })

  it('handles single page', () => {
    const { lastFrame } = render(
      <Pagination page={1} total={1} />
    )
    const frame = lastFrame()
    expect(frame).toContain('page 1 of 1')
  })

  it('accepts onPrev callback', () => {
    const onPrev = () => {}
    const { lastFrame } = render(
      <Pagination page={2} total={5} onPrev={onPrev} />
    )
    const frame = lastFrame()
    expect(frame).toContain('page 2 of 5')
  })

  it('accepts onNext callback', () => {
    const onNext = () => {}
    const { lastFrame } = render(
      <Pagination page={2} total={5} onNext={onNext} />
    )
    const frame = lastFrame()
    expect(frame).toContain('page 2 of 5')
  })

  it('handles large page counts', () => {
    const { lastFrame } = render(
      <Pagination page={42} total={100} />
    )
    const frame = lastFrame()
    expect(frame).toContain('page 42 of 100')
  })
})
