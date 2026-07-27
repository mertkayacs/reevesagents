// Step 2/4: first agent configuration. Provider, model, prompt,
// permissions, plus auth and effort where the provider supports them.
// Pickers cycle inline with Left/Right. Text fields edit inline with Enter.

import React, { useState, useMemo } from 'react'
import { useInput, useWindowSize } from 'ink'
import { Frame, frameBodyRows } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { ModelOptionList } from '../../components/ModelOptionList.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { StepIndicator } from '../../components/StepIndicator.js'
import { TextField } from '../../components/TextField.js'
import { useRouter } from '../../router.js'
import { useWizard } from '../../contexts/WizardContext.js'
import { PROVIDERS, providerSupportsAuthMode, providerSupportsEffort } from '../../../core/providers.js'
import { modelDisplayName, modelValuesForProvider } from '../../../core/model-catalog.js'
import { modelBadgeLabel, modelColor, providerColor, providerDisplayName } from '../../../utils/display.js'
import type { Permissions, Effort, AuthMode, Provider } from '../../../core/types.js'

const PERMISSIONS_VALUES: Permissions[] = ['ask', 'skip']
const EFFORT_VALUES: Effort[] = ['default', 'low', 'medium', 'high', 'xhigh', 'max']
const AUTH_MODE_VALUES: AuthMode[] = ['default', 'api-key']

function permissionDisplay(value: Permissions): string {
  return value === 'skip' ? 'Skip prompts' : 'Ask first'
}

function authModeDisplay(value: AuthMode): string {
  return value === 'api-key' ? 'API key' : 'Default login'
}

type FieldId = 'provider' | 'model' | 'prompt' | 'permissions' | 'authMode' | 'effort' | 'extraArgs'
type ActionId = 'continue' | 'back' | 'cancel'
const ACTION_LABEL_WIDTH = Math.max('Continue'.length, 'Back'.length, 'Reset Wizard'.length)

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
  const { rows: termRows } = useWindowSize()
  const bodyRows = frameBodyRows(termRows, true, false)
  const compactBody = bodyRows <= 9

  const fields: Field[] = useMemo(() => {
    const list: Field[] = [
      { kind: 'picker', id: 'provider', label: 'Provider', current: state.root.provider, values: PROVIDERS, display: providerDisplayName(state.root.provider) },
      {
        kind: 'picker',
        id: 'model',
        label: 'Model',
        current: state.root.model,
        values: modelValuesForProvider(state.root.provider),
        display: modelDisplayName(state.root.model),
        hint: 'optional · blank uses provider default',
      },
      { kind: 'text', id: 'prompt', label: 'Prompt', value: state.root.prompt, helpText: 'optional initial prompt · enter newline · esc done', required: false },
      {
        kind: 'picker',
        id: 'permissions',
        label: 'Permissions',
        current: state.root.permissions,
        values: PERMISSIONS_VALUES,
        display: permissionDisplay(state.root.permissions),
        hint: state.root.permissions === 'skip' ? 'trusted workspaces only' : 'provider asks before sensitive actions',
      },
    ]
    if (providerSupportsAuthMode(state.root.provider)) {
      list.push({ kind: 'picker', id: 'authMode', label: 'Auth', current: state.root.authMode, values: AUTH_MODE_VALUES, display: authModeDisplay(state.root.authMode), hint: 'api-key uses the API key instead of the default login' })
    }
    if (providerSupportsEffort(state.root.provider)) {
      list.push({ kind: 'picker', id: 'effort', label: 'Effort', current: state.root.effort, values: EFFORT_VALUES })
    }
    list.push({ kind: 'text', id: 'extraArgs', label: 'Extra Args', value: state.root.extraArgs, helpText: 'optional launch flags, e.g. --remote-control', required: false })
    return list
  }, [state.root.provider, state.root.model, state.root.prompt, state.root.permissions, state.root.authMode, state.root.effort, state.root.extraArgs])

  const actions: Array<{ id: ActionId; label: string; hint: string }> = [
    { id: 'continue', label: 'Continue', hint: 'to additional agents' },
    { id: 'back', label: 'Back', hint: 'return to basics' },
    { id: 'cancel', label: 'Reset Wizard', hint: 'clear and return' },
  ]

  const totalRows = fields.length + actions.length
  const visibleFormCount = Math.max(1, bodyRows - 3)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [editingFieldId, setEditingFieldId] = useState<FieldId | null>(null)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [modelPickerIdx, setModelPickerIdx] = useState(0)
  const firstVisible = Math.min(
    Math.max(0, selectedIdx - visibleFormCount + 1),
    Math.max(0, totalRows - visibleFormCount),
  )
  const visibleRows = Array.from(
    { length: Math.min(visibleFormCount, totalRows - firstVisible) },
    (_, idx) => firstVisible + idx,
  )

  // Clamp selection if conditional fields disappear after a picker change.
  if (selectedIdx >= totalRows) {
    setSelectedIdx(Math.max(0, totalRows - 1))
  }

  function moveUp(): void { setSelectedIdx(i => Math.max(0, i - 1)) }
  function moveDown(): void { setSelectedIdx(i => Math.min(totalRows - 1, i + 1)) }

  function openModelPicker(): void {
    const values = modelValuesForProvider(state.root.provider)
    const idx = values.indexOf(state.root.model)
    setModelPickerIdx(idx >= 0 ? idx : 0)
    setModelPickerOpen(true)
  }

  function moveModelPicker(delta: 1 | -1): void {
    const values = modelValuesForProvider(state.root.provider)
    setModelPickerIdx(idx => (idx + delta + values.length) % values.length)
  }

  function selectModel(): void {
    const values = modelValuesForProvider(state.root.provider)
    updateRoot({ model: values[modelPickerIdx] ?? '' })
    setModelPickerOpen(false)
  }

  function commitText(id: FieldId, value: string): void {
    if (id === 'prompt') updateRoot({ prompt: value })
    else if (id === 'extraArgs') updateRoot({ extraArgs: value })
  }

  function cyclePicker(id: FieldId, dir: 1 | -1): void {
    if (id === 'provider') {
      const next = cycle(PROVIDERS, state.root.provider, dir)
      updateRoot({ provider: next, model: '' })
    } else if (id === 'model') {
      updateRoot({ model: cycle(modelValuesForProvider(state.root.provider), state.root.model, dir) })
    } else if (id === 'permissions') {
      updateRoot({ permissions: cycle(PERMISSIONS_VALUES, state.root.permissions, dir) })
    } else if (id === 'authMode') {
      updateRoot({ authMode: cycle(AUTH_MODE_VALUES, state.root.authMode, dir) })
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
    if (modelPickerOpen) {
      if (key.upArrow) { moveModelPicker(-1); return }
      if (key.downArrow) { moveModelPicker(1); return }
      if (key.return) { selectModel(); return }
      if (key.escape || key.backspace) { setModelPickerOpen(false); return }
      return
    }

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
        } else if (f.id === 'model') {
          openModelPicker()
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
      breadcrumb={['ReevesAgents', 'New Run', 'First Agent']}
      tagline="Choose the provider, model, permissions, and first prompt."
      statusKeys={modelPickerOpen ? 'enter choose model · ↑↓ move · esc close' : 'enter edit/select · ←→ quick cycle · esc done/back'}
    >
      {!compactBody && <StepIndicator step={2} total={4} name="First Agent" />}

      {compactBody && modelPickerOpen ? (
        <ModelOptionList
          provider={state.root.provider}
          values={modelValuesForProvider(state.root.provider)}
          current={state.root.model}
          selectedIdx={modelPickerIdx}
          visibleCount={Math.max(1, bodyRows - 3)}
        />
      ) : (
        <>
          {compactBody && <Section label={selectedIdx < fields.length ? 'First Agent' : 'Actions'} />}
          {(compactBody ? visibleRows.filter(idx => idx < fields.length) : fields.map((_field, idx) => idx)).map((idx) => {
            const field = fields[idx]!
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

          {modelPickerOpen && !compactBody && (
            <ModelOptionList
              provider={state.root.provider}
              values={modelValuesForProvider(state.root.provider)}
              current={state.root.model}
              selectedIdx={modelPickerIdx}
            />
          )}

          {!compactBody && <Section label="Actions" />}

          {compactBody ? visibleRows.filter(idx => idx >= fields.length).map(idx => {
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
          }) : actions.map((action, idx) => (
            <Row
              key={action.id}
              selected={selectedIdx === fields.length + idx}
              primary={action.label}
              primaryWidth={ACTION_LABEL_WIDTH}
              hint={action.hint}
            />
          ))}
          <SectionEnd />
        </>
      )}
    </Frame>
  )
}

function pickerBadge(field: PickerField, provider: Provider): { label: string; color: string } | undefined {
  if (field.id === 'provider') return { label: providerDisplayName(field.current as Provider), color: providerColor(field.current as Provider) }
  if (field.id === 'model') return { label: modelBadgeLabel(field.current), color: modelColor(field.current, provider) }
  return undefined
}
