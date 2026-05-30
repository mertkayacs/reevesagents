// Step 4b: Edit one additional terminal/worker slot. Reached from step 4 by Enter.
// Same inline editing pattern as Root (step 3),
// with worker-specific fields (nickname, working dir) and a Remove action.

import React, { useState, useMemo } from 'react'
import { useInput } from 'ink'
import { Frame } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { StepIndicator } from '../../components/StepIndicator.js'
import { TextField } from '../../components/TextField.js'
import { useRouter } from '../../router.js'
import { useWizard } from '../../state/WizardContext.js'
import type { WorkerConfig } from '../../state/WizardContext.js'
import { PROVIDERS } from '../../launcher/providers.js'
import type { Permissions, Effort } from '../../state/types.js'

const PERMISSIONS_VALUES: Permissions[] = ['ask', 'skip']
const EFFORT_VALUES: Effort[] = ['default', 'low', 'medium', 'high', 'xhigh', 'max']

type FieldId = 'nickname' | 'provider' | 'model' | 'prompt' | 'workingDir' | 'permissions' | 'effort'
type ActionId = 'save' | 'remove' | 'cancel'

interface PickerField { kind: 'picker'; id: FieldId; label: string; current: string; values: readonly string[] }
interface TextFieldDef { kind: 'text'; id: FieldId; label: string; value: string; helpText: string; required: boolean }
type Field = PickerField | TextFieldDef

function cycle<T>(values: readonly T[], current: T, dir: 1 | -1): T {
  const idx = values.indexOf(current)
  const next = (idx + dir + values.length) % values.length
  return values[next]!
}

export function NewRunWorker() {
  const { pop, selectedWorkerIdx } = useRouter()
  const { state, updateWorker, removeWorker } = useWizard()
  const isSpawner = state.mode === 'spawner'
  const idx = selectedWorkerIdx ?? -1
  const worker: WorkerConfig | undefined = idx >= 0 ? state.workers[idx] : undefined

  const fields: Field[] = useMemo(() => {
    if (!worker) return []
    const list: Field[] = [
      { kind: 'text', id: 'nickname', label: 'Nickname', value: worker.nickname, helpText: 'tmux window name; letters, digits, dashes', required: true },
      { kind: 'picker', id: 'provider', label: 'Provider', current: worker.provider, values: PROVIDERS },
      { kind: 'text', id: 'model', label: 'Model', value: worker.model, helpText: 'e.g. claude-3-5-sonnet, gpt-4o, or empty for default', required: false },
      { kind: 'text', id: 'prompt', label: 'Prompt', value: worker.prompt, helpText: isSpawner ? 'optional initial prompt · enter newline · esc done' : 'initial task for this worker · enter newline · esc done', required: !isSpawner },
      { kind: 'text', id: 'workingDir', label: 'Working Dir', value: worker.workingDir, helpText: 'optional, defaults to the run working dir', required: false },
      { kind: 'picker', id: 'permissions', label: 'Permissions', current: worker.permissions, values: PERMISSIONS_VALUES },
    ]
    if (worker.provider === 'cc' || worker.provider === 'codex') {
      list.push({ kind: 'picker', id: 'effort', label: 'Effort', current: worker.effort, values: EFFORT_VALUES })
    }
    return list
  }, [isSpawner, worker])

  const actions: Array<{ id: ActionId; label: string; hint: string }> = [
    { id: 'save', label: 'Done', hint: isSpawner ? 'return to terminals' : 'return to workers' },
    { id: 'remove', label: isSpawner ? 'Remove This Terminal' : 'Remove This Worker', hint: 'delete and return' },
    { id: 'cancel', label: 'Back', hint: isSpawner ? 'return to terminals' : 'return to workers' },
  ]

  const totalRows = fields.length + actions.length
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [editingFieldId, setEditingFieldId] = useState<FieldId | null>(null)

  if (selectedIdx >= totalRows && totalRows > 0) {
    setSelectedIdx(totalRows - 1)
  }

  function moveUp(): void { setSelectedIdx(i => Math.max(0, i - 1)) }
  function moveDown(): void { setSelectedIdx(i => Math.min(totalRows - 1, i + 1)) }

  function commitText(id: FieldId, value: string): void {
    if (idx < 0) return
    if (id === 'nickname') updateWorker(idx, { nickname: value })
    else if (id === 'model') updateWorker(idx, { model: value })
    else if (id === 'prompt') updateWorker(idx, { prompt: value })
    else if (id === 'workingDir') updateWorker(idx, { workingDir: value })
  }

  function cyclePicker(id: FieldId, dir: 1 | -1): void {
    if (!worker || idx < 0) return
    if (id === 'provider') updateWorker(idx, { provider: cycle(PROVIDERS, worker.provider, dir) })
    else if (id === 'permissions') updateWorker(idx, { permissions: cycle(PERMISSIONS_VALUES, worker.permissions, dir) })
    else if (id === 'effort') updateWorker(idx, { effort: cycle(EFFORT_VALUES, worker.effort, dir) })
  }

  function handleAction(id: ActionId): void {
    if (id === 'save') pop()
    else if (id === 'remove') { if (idx >= 0) removeWorker(idx); pop() }
    else if (id === 'cancel') pop()
  }

  useInput((_input, key) => {
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
        else cyclePicker(f.id, 1)
      } else {
        handleAction(actions[selectedIdx - fields.length]!.id)
      }
    }
  })

  if (!worker) {
    return (
      <Frame breadcrumb={['ReevesAgents', 'New Run', isSpawner ? 'Terminals' : 'Workers', isSpawner ? 'Terminal' : 'Worker']}>
        <Row selected={true} primary={isSpawner ? 'Terminal not found' : 'Worker not found'} hint="press Esc to go back" />
      </Frame>
    )
  }

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'New Run', isSpawner ? 'Terminals' : 'Workers', worker.nickname || (isSpawner ? `terminal-${idx + 2}` : `worker-${idx + 1}`)]}
      tagline={isSpawner
        ? 'Configure this independent CLI terminal. It receives no ReevesAgents context.'
        : 'Orchestrator mode is BETA. Configure this worker; root drives it through MCP.'}
      statusKeys="enter edit/newline · ←→ cycle picker · esc done/back"
    >
      <StepIndicator step={4} total={5} name={isSpawner ? 'Terminal' : 'Worker'} />

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
        return (
          <Row
            key={field.id}
            selected={selectedIdx === fIdx}
            primary={field.label}
            trailing={`‹ ${field.current} ›`}
            hint={selectedIdx === fIdx ? '← → cycle' : undefined}
          />
        )
      })}

      <Section label="Actions" />

      {actions.map((action, aIdx) => (
        <Row
          key={action.id}
          selected={selectedIdx === fields.length + aIdx}
          primary={action.label}
          hint={action.hint}
        />
      ))}
      <SectionEnd />
    </Frame>
  )
}
