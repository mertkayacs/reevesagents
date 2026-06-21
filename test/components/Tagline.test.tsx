import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { Tagline } from '../../src/tui/components/Tagline.js'

describe('Tagline', () => {
  it('renders full text on standard height (rows >= 22)', () => {
    const text = 'This is a tagline. This is a second sentence.'
    const { stdout } = render(<Tagline text={text} rows={24} cols={80} />)
    expect(stdout.lastFrame()).toContain('This is a tagline.')
    expect(stdout.lastFrame()).toContain('This is a second sentence.')
  })

  it('truncates to first sentence on tight height (rows < 22)', () => {
    const text = 'This is the first sentence. This is the second sentence.'
    const { stdout } = render(<Tagline text={text} rows={20} cols={80} />)
    expect(stdout.lastFrame()).toContain('This is the first sentence.')
    expect(stdout.lastFrame()).not.toContain('This is the second sentence.')
  })

  it('handles single sentence without period on tight height', () => {
    const text = 'Single sentence without period'
    const { stdout } = render(<Tagline text={text} rows={20} cols={80} />)
    expect(stdout.lastFrame()).toContain('Single sentence without period')
  })

  it('preserves padding above and below on standard height', () => {
    const text = 'Test tagline.'
    const { stdout } = render(<Tagline text={text} rows={24} cols={80} />)
    expect(stdout.lastFrame()).toContain('Test tagline.')
  })

  it('renders with padding on tight height', () => {
    const text = 'First sentence. Second sentence.'
    const { stdout } = render(<Tagline text={text} rows={18} cols={80} />)
    expect(stdout.lastFrame()).toContain('First sentence.')
  })

  it('handles empty text gracefully', () => {
    const { stdout } = render(<Tagline text="" rows={24} cols={80} />)
    expect(stdout.lastFrame()).toBeDefined()
  })

  it('appends period when truncating sentence without trailing period', () => {
    const text = 'First sentence. Second sentence.'
    const { stdout } = render(<Tagline text={text} rows={20} cols={80} />)
    expect(stdout.lastFrame()).toContain('First sentence.')
  })
})
