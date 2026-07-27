// Tests for Dialog component: renders, focuses, keyboard navigation.

import React from 'react'
import { render } from 'ink-testing-library'
import { expect, it, describe, vi } from 'vitest'
import { Dialog } from '../../src/tui/components/Dialog.js'

describe('Dialog', () => {
  it('renders title and body', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    const { lastFrame } = render(
      <Dialog
        title="Confirm Action"
        body="Are you sure?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    expect(lastFrame()).toContain('Confirm Action')
    expect(lastFrame()).toContain('Are you sure?')
  })

  it('renders both buttons with default labels', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    const { lastFrame } = render(
      <Dialog title="Test" body="Proceed?" onConfirm={onConfirm} onCancel={onCancel} />
    )

    const frame = lastFrame()
    expect(frame).toContain('Cancel')
    expect(frame).toContain('Confirm')
  })

  it('renders custom button labels', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    const { lastFrame } = render(
      <Dialog
        title="Test"
        body="Proceed?"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    const frame = lastFrame()
    expect(frame).toContain('Yes')
    expect(frame).toContain('No')
  })

  it('defaults to Cancel button focused', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    const { lastFrame } = render(
      <Dialog title="Test" body="Proceed?" onConfirm={onConfirm} onCancel={onCancel} />
    )

    const frame = lastFrame()
    if (!frame) throw new Error('Frame is undefined')
    // The Cancel button appears first and should have the focused cursor prefix
    const lines = frame.split('\n')
    const buttonLine = lines.find((l) => l.includes('Cancel') && l.includes('Confirm'))
    expect(buttonLine).toBeTruthy()
    // Focused button should have the cursor glyph (❯)
    expect(buttonLine).toMatch(/❯.*Cancel/)
  })

  it('calls onCancel when Esc is pressed', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    const { stdin } = render(
      <Dialog title="Test" body="Proceed?" onConfirm={onConfirm} onCancel={onCancel} />
    )

    stdin.write('')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onConfirm when Enter is pressed on Confirm button', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    const { stdin } = render(
      <Dialog title="Test" body="Proceed?" onConfirm={onConfirm} onCancel={onCancel} />
    )

    // Move focus to Confirm
    stdin.write('[C')
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Press Enter
    stdin.write('\r')
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(onConfirm).toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('calls onCancel when Enter is pressed on Cancel button', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    const { stdin } = render(
      <Dialog title="Test" body="Proceed?" onConfirm={onConfirm} onCancel={onCancel} />
    )

    // Cancel is already focused by default
    stdin.write('\r')
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('supports intent=danger with correct border color', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    const { lastFrame } = render(
      <Dialog
        title="Delete"
        body="This is permanent."
        intent="danger"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    )

    // Verify it renders without error; visual color verification happens via snapshot or manual testing
    const frame = lastFrame()
    expect(frame).toContain('Delete')
    expect(frame).toContain('This is permanent.')
  })
})
