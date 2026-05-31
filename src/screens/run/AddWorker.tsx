// Add a terminal to an existing spawner run. Single screen, inline editing.
// Same Field union + picker cycling pattern as NewRun's 04Worker.
// On Add Terminal, validates provider and model, then calls spawnWorker.
// On Cancel, resets the worker draft and pops back to Run hub.

import React, { useState, useMemo } from 'react'
import { useInput } from 'ink'
import { Frame } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { TextField } from '../../components/TextField.js'
import { useRouter } from '../../router.js'
import { useToast } from '../../state/ToastContext.js'
import { useWorkerDraft } from '../../state/WorkerDraftContext.js'
import { readRun } from '../../state/runs.js'
import { spawnWorker } from '../../launcher/runtime.js'
import { PROVIDERS } from '../../launcher/providers.js'
import { modelDisplayName, modelValuesForProvider } from '../../launcher/model-catalog.js'
import type { Permissions } from '../../state/types.js'

const PERMISSIONS_VALUES: Permissions[] = ['ask', 'skip']

type FieldId = 'nickname' | 'provider' | 'model' | 'prompt' | 'workingDir' | 'permissions'
type ActionId = 'add' | 'cancel'
const ACTION_LABEL_WIDTH = Math.max('Add Terminal'.length, 'Add Worker'.length, 'Cancel'.length)

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

export function AddWorker() {
  const { selectedRunId, pop } = useRouter()
  const { toast } = useToast()
  const { draft, update, reset } = useWorkerDraft()
  const run = selectedRunId ? safeReadRun(selectedRunId) : null
  const isSpawner = run?.mode === 'spawner'

  const fields: Field[] = useMemo(() => [
    { kind: 'text', id: 'nickname', label: 'Nickname', value: draft.nickname, helpText: 'tmux window name; letters, digits, dashes', required: true },
    { kind: 'picker', id: 'provider', label: 'Provider', current: draft.provider, values: PROVIDERS },
    {
      kind: 'picker',
      id: 'model',
      label: 'Model',
      current: draft.model,
      values: modelValuesForProvider(draft.provider),
      display: modelDisplayName(draft.model),
      hint: 'provider file · ← → cycle',
    },
    { kind: 'text', id: 'prompt', label: 'Prompt', value: draft.prompt, helpText: isSpawner ? 'optional initial prompt · enter newline · esc done' : 'not available for this run type', required: !isSpawner },
    { kind: 'text', id: 'workingDir', label: 'Working Dir', value: draft.workingDir, helpText: 'defaults to the run working dir', required: false },
    { kind: 'picker', id: 'permissions', label: 'Permissions', current: draft.permissions, values: PERMISSIONS_VALUES },
  ], [draft, isSpawner])

  const actions: Array<{ id: ActionId; label: string; hint: string }> = [
    { id: 'add', label: isSpawner ? 'Add Terminal' : 'Add Worker', hint: isSpawner ? 'spawn an independent CLI terminal' : 'not available in spawner package' },
    { id: 'cancel', label: 'Cancel', hint: 'discard and return' },
  ]

  const totalRows = fields.length + actions.length
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [editingFieldId, setEditingFieldId] = useState<FieldId | null>(null)

  function moveUp(): void { setSelectedIdx(i => Math.max(0, i - 1)) }
  function moveDown(): void { setSelectedIdx(i => Math.min(totalRows - 1, i + 1)) }

  function commitText(id: FieldId, value: string): void {
    if (id === 'nickname') update({ nickname: value })
    else if (id === 'prompt') update({ prompt: value })
    else if (id === 'workingDir') update({ workingDir: value })
  }

  function cyclePicker(id: FieldId, dir: 1 | -1): void {
    if (id === 'provider') update({ provider: cycle(PROVIDERS, draft.provider, dir), model: '' })
    else if (id === 'model') update({ model: cycle(modelValuesForProvider(draft.provider), draft.model, dir) })
    else if (id === 'permissions') update({ permissions: cycle(PERMISSIONS_VALUES, draft.permissions, dir) })
  }

  function handleAdd(): void {
    if (!selectedRunId) { toast('No run selected', 'error'); return }
    if (!isSpawner) { toast('This run type cannot add terminals here', 'error'); return }
    if (!draft.provider) { toast('Provider is required', 'error'); return }
    if (!isSpawner && !draft.prompt.trim()) { toast('Prompt is required', 'error'); return }
    try {
      spawnWorker({
        run_id: selectedRunId,
        nickname: draft.nickname || (isSpawner ? draft.provider : 'worker'),
        provider: draft.provider,
        model: draft.model,
        task: draft.prompt,
        working_dir: draft.workingDir || undefined,
        permissions: draft.permissions,
      })
      reset()
      pop()
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  function handleAction(id: ActionId): void {
    if (id === 'add') handleAdd()
    else if (id === 'cancel') { reset(); pop() }
  }

  useInput((_input, key) => {
    if (!run) {
      if (key.escape || key.backspace || key.return) pop()
      return
    }
    if (editingFieldId) return
    if (key.upArrow) { moveUp(); return }
    if (key.downArrow) { moveDown(); return }
    if (key.escape || key.backspace) { reset(); pop(); return }
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

  if (!run) {
    return (
      <Frame breadcrumb={['ReevesAgents', 'Runs', 'Add Worker']}>
        <Row primary="No run selected" hint="press Esc to go back" selected={true} />
      </Frame>
    )
  }

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs', run.name, isSpawner ? 'Add Terminal' : 'Add Worker']}
      tagline={isSpawner
        ? `Configure an independent CLI terminal for ${run.name}.`
        : 'This run type is not managed by the spawner package.'}
      statusKeys="enter edit/newline · ←→ cycle picker · esc done/back"
    >
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
            trailing={`‹ ${field.display ?? field.current} ›`}
            hint={selectedIdx === fIdx ? field.hint ?? '← → cycle' : undefined}
          />
        )
      })}

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

function safeReadRun(id: string): ReturnType<typeof readRun> | null {
  try { return readRun(id) } catch { return null }
}
