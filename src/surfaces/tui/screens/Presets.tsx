// Presets page: list saved agent-team presets and act on them. Start launches a
// run from the highlighted preset, Save Current Run captures the active run as a
// new preset, Delete removes one. Preset state lives in the shared store, so the
// CLI, MCP, and web UI all see the same list.

import { useEffect, useState } from 'react'
import { Box, useInput } from 'ink'
import { Frame } from '../components/Frame.js'
import { Row } from '../components/Row.js'
import { Dialog } from '../components/Dialog.js'
import { Section, SectionEnd } from '../components/Section.js'
import { TextField } from '../components/TextField.js'
import { useRouter } from '../router.js'
import { useToast } from '../contexts/ToastContext.js'
import { useLanguage } from '../contexts/LanguageContext.js'
import { deletePreset, listPresets, savePresetFromRun } from '../../../core/store.js'
import { startRunFromPreset } from '../../../core/runtime.js'
import type { Preset } from '../../../core/types.js'

const ACTIONS = ['Start', 'SaveCurrentRun', 'Delete', 'Back', 'Main Menu'] as const
type Action = typeof ACTIONS[number]
const ACTION_COPY: Record<Action, { label: string; hint: string }> = {
  Start: { label: 'Start', hint: 'launch a run from the selected preset' },
  SaveCurrentRun: { label: 'Save Current Run', hint: 'save the active run as a preset' },
  Delete: { label: 'Delete', hint: 'delete the selected preset' },
  Back: { label: 'Back', hint: 'return' },
  'Main Menu': { label: 'Main Menu', hint: 'return to the main menu' },
}
const ACTION_LABEL_WIDTH = Math.max(...ACTIONS.map(action => ACTION_COPY[action].label.length))

export function Presets() {
  const { pop, resetStack, selectedRunId, setSelectedRunId } = useRouter()
  const { toast } = useToast()
  const { t } = useLanguage()
  const [presets, setPresets] = useState<Preset[]>(() => listPresets())
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [actOnName, setActOnName] = useState<string | null>(() => presets[0]?.name ?? null)
  const [pendingDelete, setPendingDelete] = useState<Preset | null>(null)
  const [saving, setSaving] = useState(false)
  const [draftName, setDraftName] = useState('')

  const total = presets.length + ACTIONS.length
  const clampedIdx = Math.min(selectedIdx, Math.max(0, total - 1))
  const onPreset = clampedIdx < presets.length
  const targetPreset = onPreset
    ? presets[clampedIdx]!
    : (presets.find(preset => preset.name === actOnName) ?? presets[0] ?? null)

  // Remember the highlighted preset so Start/Delete keep targeting it once the
  // selection moves down into the action rows.
  useEffect(() => {
    if (onPreset && presets[clampedIdx]) setActOnName(presets[clampedIdx]!.name)
  }, [onPreset, clampedIdx, presets])

  function refresh(): void {
    const next = listPresets()
    setPresets(next)
    setActOnName(current => (current && next.some(p => p.name === current) ? current : next[0]?.name ?? null))
  }

  function confirmDelete(preset: Preset): void {
    deletePreset(preset.name)
    setPendingDelete(null)
    refresh()
    toast(t('presets.deletedToast', { name: preset.name }), 'info')
  }

  function commitSave(): void {
    setSaving(false)
    if (!selectedRunId) return
    try {
      const preset = savePresetFromRun(selectedRunId, draftName)
      refresh()
      toast(t('presets.savedToast', { name: preset.name }), 'info')
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  function handleAction(action: Action): void {
    if (action === 'Back') { pop(); return }
    if (action === 'Main Menu') { resetStack('Welcome', ['Welcome']); return }
    if (action === 'Start') {
      if (!targetPreset) { toast(t('presets.noStartTarget'), 'error'); return }
      try {
        const result = startRunFromPreset(targetPreset.name)
        setSelectedRunId(result.run.id)
        resetStack('Run')
      } catch (err) {
        toast(err instanceof Error ? err.message : String(err), 'error')
      }
      return
    }
    if (action === 'Delete') {
      if (targetPreset) setPendingDelete(targetPreset)
      return
    }
    if (action === 'SaveCurrentRun') {
      if (!selectedRunId) { toast(t('presets.openRunFirst'), 'error'); return }
      setDraftName('')
      setSaving(true)
    }
  }

  useInput((_input, key) => {
    if (saving) return // the name TextField captures input while saving
    if (key.upArrow) { setSelectedIdx(() => Math.max(0, clampedIdx - 1)); return }
    if (key.downArrow) { setSelectedIdx(() => Math.min(total - 1, clampedIdx + 1)); return }
    if (key.escape || key.backspace) { pop(); return }
    if (key.return) {
      if (onPreset) handleAction('Start')
      else handleAction(ACTIONS[clampedIdx - presets.length]!)
    }
  })

  if (saving) {
    return (
      <Frame
        breadcrumb={['ReevesAgents', 'Presets', 'Save']}
        tagline="Name the preset captured from the current run."
        statusKeys="enter save · esc cancel"
      >
        <Box flexDirection="column">
          <Section label="Save Current Run as Preset" />
          <TextField
            label="Preset name"
            value={draftName}
            helpText="letters, digits, dashes · enter save · esc cancel"
            required={true}
            selected={true}
            editing={true}
            onChange={setDraftName}
            onCommit={commitSave}
            onCancel={() => setSaving(false)}
          />
          <SectionEnd />
        </Box>
      </Frame>
    )
  }

  if (pendingDelete) {
    return (
      <Frame breadcrumb={['ReevesAgents', 'Presets']} statusKeys="enter select · esc cancel">
        <Dialog
          title={t('presets.deleteTitle', { name: pendingDelete.name })}
          body="This removes the saved preset. Running runs are not affected."
          intent="danger"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => confirmDelete(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      </Frame>
    )
  }

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Presets']}
      meta={[{ label: 'presets', value: String(presets.length) }]}
      tagline="Saved agent-team templates. Start one, save the current run, or delete."
      statusKeys="enter start/select · ↑↓ move · esc back"
    >
      <Box flexDirection="column">
        <Section label="Presets" />
        {presets.length === 0 ? (
          <Row selected={false} primary="No presets yet" trailing="save a run to create one" disabled />
        ) : presets.map((preset, idx) => (
          <Row
            key={preset.name}
            selected={clampedIdx === idx}
            primary={preset.name}
            hint={`${1 + preset.workers.length} agents`}
            trailing={preset.description || undefined}
          />
        ))}
        <SectionEnd />

        <Section label="Actions" />
        {ACTIONS.map((action, idx) => (
          <Row
            key={action}
            selected={clampedIdx === presets.length + idx}
            primary={ACTION_COPY[action].label}
            primaryWidth={ACTION_LABEL_WIDTH}
            hint={ACTION_COPY[action].hint}
            disabled={
              action === 'Start' || action === 'Delete'
                ? presets.length === 0
                : action === 'SaveCurrentRun'
                ? !selectedRunId
                : false
            }
            danger={action === 'Delete'}
          />
        ))}
        <SectionEnd />
      </Box>
    </Frame>
  )
}
