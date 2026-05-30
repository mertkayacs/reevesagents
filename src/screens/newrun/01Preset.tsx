// Orchestrator (BETA) step 1/5: pick a starting preset, or Blank for an empty form.
// Enter on a preset row applies its defaults and advances to Basics directly.
// Continue advances with the currently highlighted preset. Cancel pops to Runs.

import React, { useState, useMemo } from 'react'
import { useInput } from 'ink'
import { Frame } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { StepIndicator } from '../../components/StepIndicator.js'
import { useRouter } from '../../router.js'
import { useWizard } from '../../state/WizardContext.js'
import { listSavedTrees } from '../../state/store.js'
import type { SavedTree } from '../../state/types.js'

type ActionId = 'continue' | 'cancel'

interface PresetOption { name: string; description: string; preset: SavedTree | null }

export function NewRunPreset() {
  const { push, pop } = useRouter()
  const { state, update, updateRoot, reset } = useWizard()

  const presetRows: PresetOption[] = useMemo(() => {
    const presets = listSavedTrees()
    return [
      { name: 'Blank', description: 'Start from scratch with default settings.', preset: null },
      ...presets.map(p => ({ name: p.name, description: p.description || 'No description.', preset: p })),
    ]
  }, [])

  const actions: Array<{ id: ActionId; label: string; hint: string }> = [
    { id: 'continue', label: 'Continue', hint: 'apply highlighted preset and move to basics' },
    { id: 'cancel', label: 'Cancel', hint: 'discard and return to Runs' },
  ]

  const totalRows = presetRows.length + actions.length
  const [selectedIdx, setSelectedIdx] = useState(0)

  if (selectedIdx >= totalRows && totalRows > 0) {
    setSelectedIdx(totalRows - 1)
  }

  const highlightedPresetIdx = selectedIdx < presetRows.length ? selectedIdx : 0
  const highlightedRow = presetRows[highlightedPresetIdx]!

  function applyPreset(option: PresetOption): void {
    if (option.preset) {
      const p = option.preset
      update({ mode: 'orchestrator', presetName: p.name, workingDir: p.root.working_dir || state.workingDir })
      updateRoot({
        provider: p.root.provider,
        model: p.root.model,
        prompt: p.root.initial_prompt,
        permissions: p.root.permissions,
        authMode: p.root.auth_mode,
        effort: p.root.effort,
        workingDir: p.root.working_dir,
      })
    } else {
      update({ mode: 'orchestrator', presetName: null })
    }
  }

  function handleAction(id: ActionId): void {
    if (id === 'continue') {
      applyPreset(highlightedRow)
      push('NewRunBasics')
    } else if (id === 'cancel') {
      reset()
      pop()
    }
  }

  useInput((_input, key) => {
    if (key.upArrow) { setSelectedIdx(i => Math.max(0, i - 1)); return }
    if (key.downArrow) { setSelectedIdx(i => Math.min(totalRows - 1, i + 1)); return }
    if (key.escape || key.backspace) { pop(); return }
    if (key.return) {
      if (selectedIdx < presetRows.length) {
        applyPreset(presetRows[selectedIdx]!)
        push('NewRunBasics')
      } else {
        handleAction(actions[selectedIdx - presetRows.length]!.id)
      }
    }
  })

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'New Run', 'Preset']}
      tagline="Orchestrator mode is BETA. Pick a preset or Blank for connected root/worker agents."
      statusContext={highlightedRow.description}
      statusKeys="enter select · ↑↓ move · esc back"
    >
      <StepIndicator step={1} total={5} name="Preset" />

      {presetRows.map((row, idx) => (
        <Row
          key={row.name}
          selected={selectedIdx === idx}
          primary={row.name}
          hint={row.description.slice(0, 60)}
        />
      ))}

      <Section label="Actions" />

      {actions.map((action, aIdx) => (
        <Row
          key={action.id}
          selected={selectedIdx === presetRows.length + aIdx}
          primary={action.label}
          hint={action.hint}
        />
      ))}
      <SectionEnd />
    </Frame>
  )
}
