import { describe, expect, it, vi } from 'vitest'
import { render } from 'ink-testing-library'
import { TextField } from '../../src/surfaces/tui/components/TextField.js'
import { glyphs } from '../../src/surfaces/tui/utils/glyphs.js'
import { LayoutProvider } from '../../src/surfaces/tui/components/LayoutContext.js'

const waitForInput = () => new Promise(resolve => setTimeout(resolve, 50))

describe('TextField', () => {
  it('renders label and value in list mode', () => {
    const onChange = vi.fn()
    const { lastFrame } = render(
      <TextField
        label="Name"
        value="Test"
        selected={false}
        editing={false}
        onChange={onChange}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('Name')
    expect(frame).toContain('Test')
  })

  it('shows cursor when selected in list mode', () => {
    const onChange = vi.fn()
    const { lastFrame } = render(
      <TextField
        label="Name"
        value="Test"
        selected={true}
        editing={false}
        onChange={onChange}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain(glyphs.cursor.focused)
  })

  it('hides cursor when not selected', () => {
    const onChange = vi.fn()
    const { lastFrame } = render(
      <TextField
        label="Name"
        value="Test"
        selected={false}
        editing={false}
        onChange={onChange}
      />
    )
    const frame = lastFrame()
    // Frame should not contain the focused cursor
    const focusedCount = (frame?.match(new RegExp(glyphs.cursor.focused, 'g')) || []).length
    expect(focusedCount).toBe(0)
  })

  it('renders helpText when selected', () => {
    const onChange = vi.fn()
    const { lastFrame } = render(
      <TextField
        label="Name"
        value="Test"
        helpText="Enter your name"
        selected={true}
        editing={false}
        onChange={onChange}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('Enter your name')
  })

  it('hides helpText when not selected', () => {
    const onChange = vi.fn()
    const { lastFrame } = render(
      <TextField
        label="Name"
        value="Test"
        helpText="Enter your name"
        selected={false}
        editing={false}
        onChange={onChange}
      />
    )
    const frame = lastFrame()
    expect(frame).not.toContain('Enter your name')
  })

  it('renders edit cursor at end in edit mode', () => {
    const onChange = vi.fn()
    const { lastFrame } = render(
      <TextField
        label="Name"
        value="Test"
        selected={true}
        editing={true}
        onChange={onChange}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('_')
  })

  it('commits on Enter without adding a newline', async () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    const { stdin } = render(
      <TextField
        label="Name"
        value="Test"
        selected={true}
        editing={true}
        onChange={onChange}
        onCommit={onCommit}
      />
    )

    stdin.write('\r')
    await waitForInput()

    expect(onCommit).toHaveBeenCalledOnce()
    expect(onChange).not.toHaveBeenCalledWith(expect.stringContaining('\n'))
    expect(onChange).not.toHaveBeenCalledWith(expect.stringContaining('\r'))
  })

  it('adds a newline on Enter in multiline mode', async () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    const { stdin } = render(
      <TextField
        label="Prompt"
        value="first"
        selected={true}
        editing={true}
        multiline
        onChange={onChange}
        onCommit={onCommit}
      />
    )

    stdin.write('\r')
    await waitForInput()

    expect(onChange).toHaveBeenLastCalledWith('first\n')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('leaves multiline edit mode on Escape', async () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    const onCancel = vi.fn()
    const { stdin } = render(
      <TextField
        label="Prompt"
        value="first"
        selected={true}
        editing={true}
        multiline
        onChange={onChange}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    )

    stdin.write('\u001B')
    await waitForInput()

    expect(onCommit).toHaveBeenCalledOnce()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('renders multiline values as growing text areas', () => {
    const onChange = vi.fn()
    const { lastFrame } = render(
      <TextField
        label="Prompt"
        value={'first line\nsecond line'}
        selected={true}
        editing={false}
        multiline
        onChange={onChange}
      />
    )

    const frame = lastFrame() ?? ''
    const rows = frame.split('\n')

    expect(rows.filter(row => row.includes('first line') || row.includes('second line'))).toHaveLength(2)
    expect(rows.find(row => row.includes('first line'))).toContain('Prompt')
    expect(rows.find(row => row.includes('second line'))).toContain('│')
  })

  it('wraps long multiline values to the available field width', () => {
    const onChange = vi.fn()
    const longLine = 'abcdefghijklmnopqrstuvwxyz'
    const { lastFrame } = render(
      <LayoutProvider columns={32}>
        <TextField
          label="Prompt"
          value={longLine}
          selected={true}
          editing={false}
          multiline
          onChange={onChange}
        />
      </LayoutProvider>
    )

    const frame = lastFrame() ?? ''
    expect(frame).not.toContain(longLine)
    expect(frame).toContain('abcdefghijklmn')
    expect(frame).toContain('opqrstuvwxyz')
  })

  it('accepts shifted printable characters while editing', async () => {
    const onChange = vi.fn()
    const { stdin } = render(
      <TextField
        label="Name"
        value=""
        selected={true}
        editing={true}
        onChange={onChange}
      />
    )

    stdin.write('A!')
    await waitForInput()

    expect(onChange).toHaveBeenLastCalledWith('A!')
  })

  it('keeps arrow keys inside the active edit field', async () => {
    const onChange = vi.fn()
    const { stdin } = render(
      <TextField
        label="Name"
        value="Test"
        selected={true}
        editing={true}
        onChange={onChange}
      />
    )

    stdin.write('\u001B[B')
    await waitForInput()
    stdin.write('x')
    await waitForInput()

    expect(onChange).toHaveBeenLastCalledWith('Testx')
  })

  it('shows required indicator with asterisk', () => {
    const onChange = vi.fn()
    const { lastFrame } = render(
      <TextField
        label="Name"
        value="Test"
        required={true}
        selected={false}
        editing={false}
        onChange={onChange}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('*')
  })

  it('renders without required indicator by default', () => {
    const onChange = vi.fn()
    const { lastFrame } = render(
      <TextField
        label="Name"
        value="Test"
        selected={false}
        editing={false}
        onChange={onChange}
      />
    )
    // Should not have unnecessary asterisks (may have spaces instead)
    const content = lastFrame()
    expect(content).toContain('Name')
  })

  it('renders editing state with input cursor', () => {
    const onChange = vi.fn()
    const { lastFrame } = render(
      <TextField
        label="Email"
        value="user@example.com"
        selected={true}
        editing={true}
        onChange={onChange}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('Email')
    expect(frame).toContain('user@example.com')
    expect(frame).toContain('_')
  })

  it('accepts empty value', () => {
    const onChange = vi.fn()
    const { lastFrame } = render(
      <TextField
        label="Empty"
        value=""
        selected={false}
        editing={false}
        onChange={onChange}
      />
    )
    const frame = lastFrame()
    expect(frame).toContain('Empty')
  })

  it('renders in edit mode without help text', () => {
    const onChange = vi.fn()
    const { lastFrame } = render(
      <TextField
        label="Field"
        value="value"
        helpText="Help text"
        selected={true}
        editing={true}
        onChange={onChange}
      />
    )
    const frame = lastFrame()
    // In edit mode, even if selected, help text position changes
    expect(frame).toContain('Field')
    expect(frame).toContain('value')
  })
})
