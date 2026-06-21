// Step 1/4: Basics. Run name + working directory.
// One screen, inline editing. Enter on a field enters edit mode; Enter again commits.
// Esc inside edit cancels back to list. Esc on list pops the wizard.

import React, { useState, useMemo } from 'react'
import { useInput, useWindowSize } from 'ink'
import { Frame, frameBodyRows } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { StepIndicator } from '../../components/StepIndicator.js'
import { TextField } from '../../components/TextField.js'
import { useRouter } from '../../router.js'
import { useToast } from '../../contexts/ToastContext.js'
import { useWizard } from '../../contexts/WizardContext.js'

type FieldId = 'name' | 'workingDir'
type ActionId = 'continue' | 'back' | 'cancel'
const ACTION_LABEL_WIDTH = Math.max('Continue'.length, 'Back'.length, 'Reset Wizard'.length)

export function NewRunBasics() {
  const { push, pop } = useRouter()
  const { toast } = useToast()
  const { state, update, reset } = useWizard()
  const { rows: termRows } = useWindowSize()
  const bodyRows = frameBodyRows(termRows, true, false)
  const compactBody = bodyRows <= 8

  const fields = useMemo(() => [
    { id: 'name' as FieldId, label: 'Run Name', value: state.name, helpText: 'used in the TUI and CLI run list', required: true },
    { id: 'workingDir' as FieldId, label: 'Working Dir', value: state.workingDir, helpText: 'defaults to where you ran reevesagents', required: false },
  ], [state.name, state.workingDir])

  const actions: Array<{ id: ActionId; label: string; hint: string }> = [
    { id: 'continue', label: 'Continue', hint: 'to first agent' },
    { id: 'back', label: 'Back', hint: 'return to runs' },
    { id: 'cancel', label: 'Reset Wizard', hint: 'clear and return' },
  ]

  const totalRows = fields.length + actions.length
  const visibleFormCount = Math.max(1, bodyRows - 3)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [editingFieldId, setEditingFieldId] = useState<FieldId | null>(null)
  const firstVisible = Math.min(
    Math.max(0, selectedIdx - visibleFormCount + 1),
    Math.max(0, totalRows - visibleFormCount),
  )
  const visibleRows = Array.from(
    { length: Math.min(visibleFormCount, totalRows - firstVisible) },
    (_, idx) => firstVisible + idx,
  )

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
      tagline="Name the run and choose where its agents start."
      statusKeys="enter edit · ↑↓ move · esc back"
    >
      {!compactBody && <StepIndicator step={1} total={4} name="Basics" />}

      {compactBody && <Section label={selectedIdx < fields.length ? 'Basics' : 'Actions'} />}
      {(compactBody ? visibleRows : fields.map((_field, idx) => idx)).map(idx => {
        if (idx < fields.length) {
          const field = fields[idx]!
          return (
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
          )
        }
        const action = actions[idx - fields.length]!
        return (
          <Row
            key={action.id}
            selected={selectedIdx === idx}
            primary={action.label}
            primaryWidth={ACTION_LABEL_WIDTH}
            hint={action.hint}
          />
        )
      })}
      {!compactBody && <Section label="Actions" />}
      {!compactBody && actions.map((action, idx) => (
        <Row
          key={action.id}
          selected={selectedIdx === fields.length + idx}
          primary={action.label}
          primaryWidth={ACTION_LABEL_WIDTH}
          hint={action.hint}
        />
      ))}
      <SectionEnd />
    </Frame>
  )
}
