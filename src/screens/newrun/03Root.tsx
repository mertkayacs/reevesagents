// Step 3/5: Root configuration. Provider, model, prompt, permissions, plus
// conditional auth mode (cc only) and effort (cc and codex only).
// Pickers cycle inline with Left/Right. Text fields edit inline with Enter.

import React, { useState, useMemo } from 'react'
import { useInput } from 'ink'
import { Frame } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { StepIndicator } from '../../components/StepIndicator.js'
import { TextField } from '../../components/TextField.js'
import { useRouter } from '../../router.js'
import { useWizard } from '../../state/WizardContext.js'
import { PROVIDERS } from '../../launcher/providers.js'
import type { Permissions, Effort } from '../../state/types.js'

const PERMISSIONS_VALUES: Permissions[] = ['ask', 'skip']
const EFFORT_VALUES: Effort[] = ['default', 'low', 'medium', 'high', 'xhigh', 'max']

type FieldId = 'provider' | 'model' | 'prompt' | 'permissions' | 'effort'
type ActionId = 'continue' | 'back' | 'cancel'

interface PickerField {
  kind: 'picker'
  id: FieldId
  label: string
  current: string
  values: readonly string[]
}
interface TextFieldDef {
  kind: 'text'
  id: FieldId
  label: string
  value: string
  helpText: string
  required: boolean
}
type Field = PickerField | TextFieldDef

function cycle<T>(values: readonly T[], current: T, dir: 1 | -1): T {
  const idx = values.indexOf(current)
  const next = (idx + dir + values.length) % values.length
  return values[next]!
}

export function NewRunRoot() {
  const { push, pop } = useRouter()
  const { state, updateRoot, reset } = useWizard()

  const fields: Field[] = useMemo(() => {
    const list: Field[] = [
      { kind: 'picker', id: 'provider', label: 'Provider', current: state.root.provider, values: PROVIDERS },
      { kind: 'text', id: 'model', label: 'Model', value: state.root.model, helpText: 'e.g. claude-3-5-sonnet, gpt-4o, or empty for provider default', required: false },
      { kind: 'text', id: 'prompt', label: 'Prompt', value: state.root.prompt, helpText: 'initial task for the root · enter newline · esc done', required: true },
      { kind: 'picker', id: 'permissions', label: 'Permissions', current: state.root.permissions, values: PERMISSIONS_VALUES },
    ]
    if (state.root.provider === 'cc' || state.root.provider === 'codex') {
      list.push({ kind: 'picker', id: 'effort', label: 'Effort', current: state.root.effort, values: EFFORT_VALUES })
    }
    return list
  }, [state.root.provider, state.root.model, state.root.prompt, state.root.permissions, state.root.effort])

  const actions: Array<{ id: ActionId; label: string; hint: string }> = [
    { id: 'continue', label: 'Continue', hint: 'to workers' },
    { id: 'back', label: 'Back', hint: 'return to basics' },
    { id: 'cancel', label: 'Reset Wizard', hint: 'clear and return' },
  ]

  const totalRows = fields.length + actions.length
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [editingFieldId, setEditingFieldId] = useState<FieldId | null>(null)

  // Clamp selection if conditional fields disappear after a picker change.
  if (selectedIdx >= totalRows) {
    setSelectedIdx(Math.max(0, totalRows - 1))
  }

  function moveUp(): void { setSelectedIdx(i => Math.max(0, i - 1)) }
  function moveDown(): void { setSelectedIdx(i => Math.min(totalRows - 1, i + 1)) }

  function commitText(id: FieldId, value: string): void {
    if (id === 'model') updateRoot({ model: value })
    else if (id === 'prompt') updateRoot({ prompt: value })
  }

  function cyclePicker(id: FieldId, dir: 1 | -1): void {
    if (id === 'provider') {
      const next = cycle(PROVIDERS, state.root.provider, dir)
      updateRoot({ provider: next })
    } else if (id === 'permissions') {
      updateRoot({ permissions: cycle(PERMISSIONS_VALUES, state.root.permissions, dir) })
    } else if (id === 'effort') {
      updateRoot({ effort: cycle(EFFORT_VALUES, state.root.effort, dir) })
    }
  }

  function handleAction(id: ActionId): void {
    if (id === 'continue') push('NewRunWorkers')
    else if (id === 'back') pop()
    else if (id === 'cancel') { reset(); pop() }
  }

  useInput((_input, key) => {
    if (editingFieldId) return

    if (key.upArrow) { moveUp(); return }
    if (key.downArrow) { moveDown(); return }
    if (key.escape || key.backspace) { pop(); return }
    if (key.leftArrow || key.rightArrow) {
      const f = fields[selectedIdx]
      if (f?.kind === 'picker') {
        cyclePicker(f.id, key.leftArrow ? -1 : 1)
      }
      return
    }
    if (key.return) {
      if (selectedIdx < fields.length) {
        const f = fields[selectedIdx]!
        if (f.kind === 'text') {
          setEditingFieldId(f.id)
        } else {
          cyclePicker(f.id, 1)
        }
      } else {
        handleAction(actions[selectedIdx - fields.length]!.id)
      }
    }
  })

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'New Run', 'Root']}
      tagline="Configure the root agent. The root drives workers and runs the user task."
      statusKeys="enter edit/newline · ←→ cycle picker · esc done/back"
    >
      <StepIndicator step={3} total={5} name="Root" />

      {fields.map((field, idx) => {
        if (field.kind === 'text') {
          return (
            <TextField
              key={field.id}
              label={field.label}
              value={field.value}
              helpText={field.helpText}
              required={field.required}
              selected={selectedIdx === idx}
              editing={editingFieldId === field.id}
              multiline={field.id === 'prompt'}
              onChange={(v) => commitText(field.id, v)}
              onCommit={() => setEditingFieldId(null)}
              onCancel={() => setEditingFieldId(null)}
            />
          )
        }
        return (
          <Row
            key={field.id}
            selected={selectedIdx === idx}
            primary={field.label}
            trailing={`‹ ${field.current} ›`}
            hint={selectedIdx === idx ? '← → cycle' : undefined}
          />
        )
      })}

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
