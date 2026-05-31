// Step 1/4: Basics. Run name + working directory.
// One screen, inline editing. Enter on a field enters edit mode; Enter again commits.
// Esc inside edit cancels back to list. Esc on list pops the wizard.

import React, { useState, useMemo } from 'react'
import { useInput } from 'ink'
import { Frame } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { StepIndicator } from '../../components/StepIndicator.js'
import { TextField } from '../../components/TextField.js'
import { useRouter } from '../../router.js'
import { useToast } from '../../state/ToastContext.js'
import { useWizard } from '../../state/WizardContext.js'

type FieldId = 'name' | 'workingDir'
type ActionId = 'continue' | 'back' | 'cancel'

export function NewRunBasics() {
  const { push, pop } = useRouter()
  const { toast } = useToast()
  const { state, update, reset } = useWizard()

  const fields = useMemo(() => [
    { id: 'name' as FieldId, label: 'Run Name', value: state.name, helpText: 'used in the TUI and CLI run list', required: true },
    { id: 'workingDir' as FieldId, label: 'Working Dir', value: state.workingDir, helpText: 'defaults to where you ran reevesagents', required: false },
  ], [state.name, state.workingDir])

  const actions: Array<{ id: ActionId; label: string; hint: string }> = [
    { id: 'continue', label: 'Continue', hint: 'to first terminal' },
    { id: 'back', label: 'Back', hint: 'return to runs' },
    { id: 'cancel', label: 'Reset Wizard', hint: 'clear and return' },
  ]

  const totalRows = fields.length + actions.length
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [editingFieldId, setEditingFieldId] = useState<FieldId | null>(null)

  function moveUp(): void { setSelectedIdx(i => Math.max(0, i - 1)) }
  function moveDown(): void { setSelectedIdx(i => Math.min(totalRows - 1, i + 1)) }

  function commitField(id: FieldId, value: string): void {
    if (id === 'name') update({ name: value })
    else if (id === 'workingDir') update({ workingDir: value })
  }

  function handleAction(id: ActionId): void {
    if (id === 'continue') {
      if (!state.name.trim()) { toast('Run name is required', 'error'); return }
      push('NewRunRoot')
    } else if (id === 'back') {
      pop()
    } else if (id === 'cancel') {
      reset()
      pop()
    }
  }

  useInput((_input, key) => {
    if (editingFieldId) return

    if (key.upArrow) { moveUp(); return }
    if (key.downArrow) { moveDown(); return }
    if (key.escape || key.backspace) { pop(); return }
    if (key.return) {
      if (selectedIdx < fields.length) {
        setEditingFieldId(fields[selectedIdx]!.id)
      } else {
        handleAction(actions[selectedIdx - fields.length]!.id)
      }
    }
  })

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'New Run', 'Basics']}
      tagline="Create a multi-terminal tmux workspace for independent CLI sessions."
      statusKeys="enter edit · ↑↓ move · esc back"
    >
      <StepIndicator step={1} total={4} name="Basics" />

      {fields.map((field, idx) => (
        <TextField
          key={field.id}
          label={field.label}
          value={field.value}
          helpText={field.helpText}
          required={field.required}
          selected={selectedIdx === idx}
          editing={editingFieldId === field.id}
          onChange={(v) => commitField(field.id, v)}
          onCommit={() => setEditingFieldId(null)}
          onCancel={() => setEditingFieldId(null)}
        />
      ))}

      <Section label="Actions" />

      {actions.map((action, idx) => (
        <Row
          key={action.id}
          selected={selectedIdx === fields.length + idx}
          primary={action.label}
          hint={action.hint}
        />
      ))}
      <SectionEnd />
    </Frame>
  )
}
