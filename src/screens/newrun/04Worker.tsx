// Step 3b: edit one additional terminal slot. Reached from step 3 by Enter.
// Same inline editing pattern as the first-terminal step.

import React, { useState, useMemo } from 'react'
import { useInput } from 'ink'
import { Frame } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { ModelOptionList } from '../../components/ModelOptionList.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { StepIndicator } from '../../components/StepIndicator.js'
import { TextField } from '../../components/TextField.js'
import { useRouter } from '../../router.js'
import { useWizard } from '../../state/WizardContext.js'
import type { WorkerConfig } from '../../state/WizardContext.js'
import { PROVIDERS } from '../../launcher/providers.js'
import { modelDisplayName, modelValuesForProvider } from '../../launcher/model-catalog.js'
import { modelBadgeLabel, modelColor, providerColor, providerDisplayName } from '../../utils/display.js'
import type { Permissions, Effort, Provider } from '../../state/types.js'

const PERMISSIONS_VALUES: Permissions[] = ['ask', 'skip']
const EFFORT_VALUES: Effort[] = ['default', 'low', 'medium', 'high', 'xhigh', 'max']

type FieldId = 'nickname' | 'provider' | 'model' | 'prompt' | 'workingDir' | 'permissions' | 'effort'
type ActionId = 'save' | 'remove' | 'cancel'
const ACTION_LABEL_WIDTH = Math.max('Done'.length, 'Remove This Terminal'.length, 'Back'.length)

interface PickerField { kind: 'picker'; id: FieldId; label: string; current: string; values: readonly string[]; display?: string; hint?: string }
interface TextFieldDef { kind: 'text'; id: FieldId; label: string; value: string; helpText: string; required: boolean }
type Field = PickerField | TextFieldDef

function cycle<T>(values: readonly T[], current: T, dir: 1 | -1): T {
  if (values.length === 0) return current
  const idx = values.indexOf(current)
  if (idx === -1) return values[dir === 1 ? 0 : values.length - 1]!
  const next = (idx + dir + values.length) % values.length
  return values[next]!
}

export function NewRunWorker() {
  const { pop, selectedWorkerIdx } = useRouter()
  const { state, updateWorker, removeWorker } = useWizard()
  const idx = selectedWorkerIdx ?? -1
  const worker: WorkerConfig | undefined = idx >= 0 ? state.workers[idx] : undefined

  const fields: Field[] = useMemo(() => {
    if (!worker) return []
    const list: Field[] = [
      { kind: 'text', id: 'nickname', label: 'Nickname', value: worker.nickname, helpText: 'tmux window name; letters, digits, dashes', required: true },
      { kind: 'picker', id: 'provider', label: 'Provider', current: worker.provider, values: PROVIDERS, display: providerDisplayName(worker.provider) },
      {
        kind: 'picker',
        id: 'model',
        label: 'Model',
        current: worker.model,
        values: modelValuesForProvider(worker.provider),
        display: modelDisplayName(worker.model),
        hint: 'optional · blank uses CLI default',
      },
      { kind: 'text', id: 'prompt', label: 'Prompt', value: worker.prompt, helpText: 'optional initial prompt · enter newline · esc done', required: false },
      { kind: 'text', id: 'workingDir', label: 'Working Dir', value: worker.workingDir, helpText: 'optional, defaults to the run working dir', required: false },
      { kind: 'picker', id: 'permissions', label: 'Permissions', current: worker.permissions, values: PERMISSIONS_VALUES },
    ]
    if (worker.provider === 'cc' || worker.provider === 'codex') {
      list.push({ kind: 'picker', id: 'effort', label: 'Effort', current: worker.effort, values: EFFORT_VALUES })
    }
    return list
  }, [worker])

  const actions: Array<{ id: ActionId; label: string; hint: string }> = [
    { id: 'save', label: 'Done', hint: 'changes are saved automatically' },
    { id: 'remove', label: 'Remove This Terminal', hint: 'delete and return' },
    { id: 'cancel', label: 'Back', hint: 'return to terminals' },
  ]

  const totalRows = fields.length + actions.length
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [editingFieldId, setEditingFieldId] = useState<FieldId | null>(null)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [modelPickerIdx, setModelPickerIdx] = useState(0)

  if (selectedIdx >= totalRows && totalRows > 0) {
    setSelectedIdx(totalRows - 1)
  }

  function moveUp(): void { setSelectedIdx(i => Math.max(0, i - 1)) }
  function moveDown(): void { setSelectedIdx(i => Math.min(totalRows - 1, i + 1)) }

  function openModelPicker(): void {
    if (!worker) return
    const values = modelValuesForProvider(worker.provider)
    const modelIdx = values.indexOf(worker.model)
    setModelPickerIdx(modelIdx >= 0 ? modelIdx : 0)
    setModelPickerOpen(true)
  }

  function moveModelPicker(delta: 1 | -1): void {
    if (!worker) return
    const values = modelValuesForProvider(worker.provider)
    setModelPickerIdx(modelIdx => (modelIdx + delta + values.length) % values.length)
  }

  function selectModel(): void {
    if (!worker || idx < 0) return
    const values = modelValuesForProvider(worker.provider)
    updateWorker(idx, { model: values[modelPickerIdx] ?? '' })
    setModelPickerOpen(false)
  }

  function commitText(id: FieldId, value: string): void {
    if (idx < 0) return
    if (id === 'nickname') updateWorker(idx, { nickname: value })
    else if (id === 'prompt') updateWorker(idx, { prompt: value })
    else if (id === 'workingDir') updateWorker(idx, { workingDir: value })
  }

  function cyclePicker(id: FieldId, dir: 1 | -1): void {
    if (!worker || idx < 0) return
    if (id === 'provider') updateWorker(idx, { provider: cycle(PROVIDERS, worker.provider, dir), model: '' })
    else if (id === 'model') updateWorker(idx, { model: cycle(modelValuesForProvider(worker.provider), worker.model, dir) })
    else if (id === 'permissions') updateWorker(idx, { permissions: cycle(PERMISSIONS_VALUES, worker.permissions, dir) })
    else if (id === 'effort') updateWorker(idx, { effort: cycle(EFFORT_VALUES, worker.effort, dir) })
  }

  function handleAction(id: ActionId): void {
    if (id === 'save') pop()
    else if (id === 'remove') { if (idx >= 0) removeWorker(idx); pop() }
    else if (id === 'cancel') pop()
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
      if (f?.kind === 'picker') cyclePicker(f.id, key.leftArrow ? -1 : 1)
      return
    }
    if (key.return) {
      if (selectedIdx < fields.length) {
        const f = fields[selectedIdx]!
        if (f.kind === 'text') setEditingFieldId(f.id)
        else if (f.id === 'model') openModelPicker()
        else cyclePicker(f.id, 1)
      } else {
        handleAction(actions[selectedIdx - fields.length]!.id)
      }
    }
  })

  if (!worker) {
    return (
      <Frame breadcrumb={['ReevesAgents', 'New Run', 'Terminals', 'Terminal']}>
        <Row selected={true} primary="Terminal not found" hint="press Esc to go back" />
      </Frame>
    )
  }

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'New Run', 'Terminals', worker.nickname || `terminal-${idx + 2}`]}
      tagline="Configure this independent CLI terminal."
      statusKeys={modelPickerOpen ? 'enter choose model · ↑↓ move · esc close' : 'enter edit/select · ←→ quick cycle · esc done/back'}
    >
      <StepIndicator step={3} total={4} name="Terminal" />

      {fields.map((field, fIdx) => {
        if (field.kind === 'text') {
          return (
            <TextField
              key={field.id}
              label={field.label}
              value={field.value}
              helpText={field.helpText}
              required={field.required}
              selected={selectedIdx === fIdx}
              editing={editingFieldId === field.id}
              multiline={field.id === 'prompt'}
              onChange={(v) => commitText(field.id, v)}
              onCommit={() => setEditingFieldId(null)}
              onCancel={() => setEditingFieldId(null)}
            />
          )
        }
        const badge = pickerBadge(field, worker.provider)
        return (
          <Row
            key={field.id}
            selected={selectedIdx === fIdx}
            primary={field.label}
            badge={badge}
            trailing={`‹ ${field.display ?? field.current} ›`}
            hint={selectedIdx === fIdx ? field.hint ?? '← → cycle' : undefined}
          />
        )
      })}

      {modelPickerOpen && (
        <ModelOptionList
          provider={worker.provider}
          values={modelValuesForProvider(worker.provider)}
          current={worker.model}
          selectedIdx={modelPickerIdx}
        />
      )}

      <Section label="Actions" />

      {actions.map((action, aIdx) => (
        <Row
          key={action.id}
          selected={selectedIdx === fields.length + aIdx}
          primary={action.label}
          primaryWidth={ACTION_LABEL_WIDTH}
          hint={action.hint}
        />
      ))}
      <SectionEnd />
    </Frame>
  )
}

function pickerBadge(field: PickerField, provider: Provider): { label: string; color: string } | undefined {
  if (field.id === 'provider') return { label: providerDisplayName(field.current as Provider), color: providerColor(field.current as Provider) }
  if (field.id === 'model') return { label: modelBadgeLabel(field.current), color: modelColor(field.current, provider) }
  return undefined
}
