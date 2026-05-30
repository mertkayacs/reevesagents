import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { Router } from '../../src/router.js'
import { DoctorCheck } from '../../src/screens/doctor/Check.js'

const waitForInput = () => new Promise(resolve => setTimeout(resolve, 50))

vi.mock('../../src/launcher/doctor.js', () => ({
  runDoctor: () => ({
    checks: [
      { name: 'node', status: 'ok' as const, detail: '20.19.0' },
      { name: 'tmux', status: 'fail' as const, detail: 'not on PATH' },
    ],
  }),
}))

vi.mock('../../src/mcp-setup.js', () => ({
  registerAll: vi.fn(() => []),
}))

describe('DoctorCheck', () => {
  it('exports DoctorCheck as a React component function', () => {
    expect(typeof DoctorCheck).toBe('function')
  })

  it('DoctorCheck is callable', () => {
    expect(DoctorCheck).toBeDefined()
    expect(DoctorCheck).toBeInstanceOf(Function)
  })

  it('keeps Back selected instead of moving focus onto read-only detail rows', async () => {
    const { lastFrame, stdin, unmount } = render(<Router initialScreen="Doctor" />)

    await waitForInput()
    stdin.write('\r')
    await waitForInput()
    expect(lastFrame() ?? '').toContain('❯ │ Back')

    stdin.write('\u001B[A')
    await waitForInput()
    expect(lastFrame() ?? '').toContain('❯ │ Back')

    unmount()
  })
})
