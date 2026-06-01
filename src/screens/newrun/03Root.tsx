// Step 2/4: First terminal configuration. Provider, model, prompt, permissions, plus
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
import { modelDisplayName, modelValuesForProvider } from '../../launcher/model-catalog.js'
import { modelBadgeLabel, modelColor, providerColor } from '../../utils/display.js'
import type { Permissions, Effort, Provider } from '../../state/types.js'

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
  display?: string
  hint?: string
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
  if (values.length === 0) return current
  const idx = values.indexOf(current)
  if (idx === -1) return values[dir === 1 ? 0 : values.length - 1]!
  const next = (idx + dir + values.length) % values.length
  return values[next]!
}

export function NewRunRoot() {
  const { push, pop } = useRouter()
  const { state, updateRoot, reset } = useWizard()

  const fields: Field[] = useMemo(() => {
    const list: Field[] = [
      { kind: 'picker', id: 'provider', label: 'Provider', current: state.root.provider, values: PROVIDERS },
      {
        kind: 'picker',
        id: 'model',
        label: 'Model',
        current: state.root.model,
        values: modelValuesForProvider(state.root.provider),
        display: modelDisplayName(state.root.model),
        hint: 'optional · blank uses CLI default',
      },
      { kind: 'text', id: 'prompt', label: 'Prompt', value: state.root.prompt, helpText: 'optional initial prompt · enter newline · esc done', required: false },
      { kind: 'picker', id: 'permissions', label: 'Permissions', current: state.root.permissions, values: PERMISSIONS_VALUES },
    ]
    if (state.root.provider === 'cc' || state.root.provider === 'codex') {
      list.push({ kind: 'picker', id: 'effort', label: 'Effort', current: state.root.effort, values: EFFORT_VALUES })
    }
    return list
  }, [state.root.provider, state.root.model, state.root.prompt, state.root.permissions, state.root.effort])

  const actions: Array<{ id: ActionId; label: string; hint: string }> = [
    { id: 'continue', label: 'Continue', hint: 'to additional terminals' },
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
    if (id === 'prompt') updateRoot({ prompt: value })
  }

  function cyclePicker(id: FieldId, dir: 1 | -1): void {
    if (id === 'provider') {
      const next = cycle(PROVIDERS, state.root.provider, dir)
      updateRoot({ provider: next, model: '' })
    } else if (id === 'model') {
      updateRoot({ model: cycle(modelValuesForProvider(state.root.provider), state.root.model, dir) })
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
      breadcrumb={['ReevesAgents', 'New Run', 'First Terminal']}
      tagline="Configure the first independent CLI terminal."
      statusKeys="enter edit/newline · ←→ cycle picker · esc done/back"
    >
      <StepIndicator step={2} total={4} name="First Terminal" />

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
        const badge = pickerBadge(field, state.root.provider)
        return (
          <Row
            key={field.id}
            selected={selectedIdx === idx}
            primary={field.label}
            badge={badge}
            trailing={`‹ ${field.display ?? field.current} ›`}
            hint={selectedIdx === idx ? field.hint ?? '← → cycle' : undefined}
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

function pickerBadge(field: PickerField, provider: Provider): { label: string; color: string } | undefined {
  if (field.id === 'provider') return { label: field.current, color: providerColor(field.current as Provider) }
  if (field.id === 'model') return { label: modelBadgeLabel(field.current), color: modelColor(field.current, provider) }
  return undefined
}
