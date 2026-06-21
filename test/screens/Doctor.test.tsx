import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { Doctor } from '../../src/tui/screens/Doctor.js'
import { Router } from '../../src/tui/router.js'

const waitForInput = () => new Promise(resolve => setTimeout(resolve, 50))

vi.mock('../../src/core/doctor.js', () => ({
  runDoctor: () => ({
    checks: [
      { name: 'node', status: 'ok' as const, detail: '20.19.0' },
      { name: 'tmux', status: 'ok' as const, detail: 'tmux 3.2' },
      { name: 'providers', status: 'warn' as const, detail: 'Claude Code: ok; Codex CLI: missing' },
    ],
  }),
}))

describe('Doctor', () => {
  it('exports Doctor as a React component function', () => {
    expect(typeof Doctor).toBe('function')
  })

  it('Doctor is callable', () => {
    expect(Doctor).toBeDefined()
    expect(Doctor).toBeInstanceOf(Function)
  })

  it('moves from the last check directly to Recheck when there is no pagination row', async () => {
    const { lastFrame, stdin, unmount } = render(<Router initialScreen="Doctor" />)

    await waitForInput()
    for (let idx = 0; idx < 3; idx++) {
      stdin.write('\u001B[B')
      await waitForInput()
    }

    expect(lastFrame() ?? '').toContain('❯ │ [ Recheck')
    unmount()
  })
})
