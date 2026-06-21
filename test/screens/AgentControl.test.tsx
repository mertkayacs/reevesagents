import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from 'ink-testing-library'
import { Router } from '../../src/router.js'

const waitForInput = () => new Promise(resolve => setTimeout(resolve, 50))

// Drive the screen without touching a real CLI: hostStatus returns a fixed set
// of hosts and attach/detach/attachAll are spies we assert against.
const hostStatus = vi.hoisted(() => vi.fn())
const attach = vi.hoisted(() => vi.fn((key: string) => ({ key, label: key, ok: true, message: 'attached' })))
const detach = vi.hoisted(() => vi.fn((key: string) => ({ key, label: key, ok: true, message: 'detached' })))
const attachAll = vi.hoisted(() => vi.fn(() => [] as Array<{ key: string; label: string; ok: boolean; message: string }>))

vi.mock('../../src/agent-mcp/installer.js', () => ({ hostStatus, attach, detach, attachAll }))

const FIXTURE = [
  { key: 'cc', bin: 'claude', label: 'Claude Code', installed: true, attached: true, manual: false },
  { key: 'codex', bin: 'codex', label: 'Codex CLI', installed: true, attached: false, manual: false },
  { key: 'opencode', bin: 'opencode', label: 'OpenCode CLI', installed: true, attached: false, manual: true },
]

describe('AgentControl', () => {
  beforeEach(() => {
    hostStatus.mockReset()
    hostStatus.mockReturnValue(FIXTURE)
    attach.mockClear()
    detach.mockClear()
    attachAll.mockClear()
  })

  it('lists the host CLIs with their labels', () => {
    const { lastFrame, unmount } = render(<Router initialScreen="AgentControl" />)
    const frame = lastFrame() ?? ''
    expect(frame).toContain('Claude Code')
    expect(frame).toContain('Codex CLI')
    expect(frame).toContain('OpenCode CLI')
    unmount()
  })

  it('detaches the selected host when it is attached and Enter is pressed', async () => {
    const { stdin, unmount } = render(<Router initialScreen="AgentControl" />)
    await waitForInput()

    // First row (Claude Code) is attached: Enter detaches it.
    stdin.write('\r')
    await waitForInput()

    expect(detach).toHaveBeenCalledWith('cc')
    expect(attach).not.toHaveBeenCalled()
    unmount()
  })

  it('attaches the selected host when it is detached and Enter is pressed', async () => {
    const { stdin, unmount } = render(<Router initialScreen="AgentControl" />)
    await waitForInput()

    // Move to the second row (Codex CLI, detached), then Enter attaches it.
    stdin.write('\u001B[B')
    await waitForInput()
    stdin.write('\r')
    await waitForInput()

    expect(attach).toHaveBeenCalledWith('codex')
    expect(detach).not.toHaveBeenCalled()
    unmount()
  })

  it('does not toggle a manual host', async () => {
    const { stdin, unmount } = render(<Router initialScreen="AgentControl" />)
    await waitForInput()

    // Move to the third row (OpenCode CLI, manual), then Enter is a no-op.
    stdin.write('\u001B[B')
    await waitForInput()
    stdin.write('\u001B[B')
    await waitForInput()
    stdin.write('\r')
    await waitForInput()

    expect(attach).not.toHaveBeenCalled()
    expect(detach).not.toHaveBeenCalled()
    unmount()
  })

  it('attaches all installed drivable hosts when "a" is pressed', async () => {
    const { stdin, unmount } = render(<Router initialScreen="AgentControl" />)
    await waitForInput()

    stdin.write('a')
    await waitForInput()

    expect(attachAll).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('pops the router when the Back row is activated with Enter', async () => {
    // Reach AgentControl through Welcome so there is a history entry to pop back
    // to. After Back the frame must show Welcome again, not Agent Control.
    const { stdin, lastFrame, unmount } = render(<Router initialScreen="Welcome" />)
    await waitForInput()

    // Welcome menu order with no current run: New Run (0), Runs (1), Presets (2),
    // Doctor (3), Agent Control (4). Step down four times and open it.
    for (let i = 0; i < 4; i++) {
      stdin.write('[B')
      await waitForInput()
    }
    stdin.write('\r')
    await waitForInput()
    expect(lastFrame() ?? '').toContain('Agent Control')

    // Rows in AgentControl: 3 hosts (0-2), Attach all (3), Back (4). Step down to
    // the Back row and activate it.
    for (let i = 0; i < 4; i++) {
      stdin.write('[B')
      await waitForInput()
    }
    stdin.write('\r')
    await waitForInput()

    // Back popped to Welcome: the host rows are gone and the Welcome menu is back.
    const frame = lastFrame() ?? ''
    expect(frame).toContain('New Run')
    expect(frame).not.toContain('Claude Code')
    expect(attach).not.toHaveBeenCalled()
    expect(detach).not.toHaveBeenCalled()
    unmount()
  })
})
