import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import { Header } from '../../src/components/Header.js'
import { glyphs } from '../../src/utils/glyphs.js'

describe('Header', () => {
  it('renders breadcrumb with current segment bold and primary color', () => {
    const { stdout } = render(
      <Header breadcrumb={['Runs', 'my-run', 'Agents']} columns={80} />
    )
    expect(stdout.lastFrame()).toContain('Agents')
  })

  it('shows only current segment on narrow width (columns < 60)', () => {
    const { stdout } = render(
      <Header
        breadcrumb={['Runs', 'my-run', 'Agents']}
        meta={[{ label: 'status', value: 'running' }]}
        columns={50}
      />
    )
    expect(stdout.lastFrame()).toContain('Agents')
    expect(stdout.lastFrame()).not.toContain('Runs')
  })

  it('renders meta items on standard width', () => {
    const { stdout } = render(
      <Header
        breadcrumb={['Runs']}
        meta={[
          { label: 'status', value: 'running' },
          { label: 'agents', value: '3' },
        ]}
        columns={80}
      />
    )
    expect(stdout.lastFrame()).toContain('status')
    expect(stdout.lastFrame()).toContain('running')
    expect(stdout.lastFrame()).toContain('agents')
    expect(stdout.lastFrame()).toContain('3')
  })

  it('appends tmux session to meta when provided', () => {
    const { stdout } = render(
      <Header
        breadcrumb={['Runs']}
        meta={[{ label: 'status', value: 'running' }]}
        tmuxSession="my-session"
        columns={80}
      />
    )
    expect(stdout.lastFrame()).toContain('tmux')
    expect(stdout.lastFrame()).toContain('my-session')
  })

  it('renders breadcrumb chevron separator on standard width', () => {
    const { stdout } = render(
      <Header breadcrumb={['Runs', 'my-run']} columns={80} />
    )
    expect(stdout.lastFrame()).toContain(glyphs.chevron)
  })

  it('handles empty breadcrumb gracefully', () => {
    const { stdout } = render(<Header breadcrumb={[]} columns={80} />)
    expect(stdout.lastFrame()).toBeDefined()
  })

  it('handles single breadcrumb segment', () => {
    const { stdout } = render(<Header breadcrumb={['Runs']} columns={80} />)
    expect(stdout.lastFrame()).toContain('Runs')
  })

  // Header must occupy exactly one row at every supported width. Any wrap trips
  // ink#907 and leaves stale top-border artifacts visible after arrow-key re-renders.
  describe('B1 row-count invariant: Header is exactly 1 row tall', () => {
    const widths = [50, 60, 80, 100, 120]
    for (const cols of widths) {
      it(`is one row at ${cols} cols even when meta is full`, () => {
        const { stdout } = render(
          <Header
            breadcrumb={['ReevesAgents', 'Runs']}
            meta={[
              { label: 'running', value: '0' },
              { label: 'stale', value: '0' },
            ]}
            tmuxSession="active"
            columns={cols}
          />
        )
        const frame = stdout.lastFrame() ?? ''
        const rows = frame.split('\n').filter(line => line.length > 0)
        expect(rows.length).toBe(1)
      })
    }

    it('does not wrap meta values onto a second row even when meta total exceeds columns', () => {
      const { stdout } = render(
        <Header
          breadcrumb={['ReevesAgents', 'Runs', 'my-run', 'Agents']}
          meta={[
            { label: 'running', value: '12' },
            { label: 'stale', value: '4' },
            { label: 'workdir', value: '/Users/example/development/reevesagents' },
          ]}
          tmuxSession="active"
          columns={80}
        />
      )
      const frame = stdout.lastFrame() ?? ''
      const rows = frame.split('\n').filter(line => line.length > 0)
      expect(rows.length).toBe(1)
    })
  })
})
