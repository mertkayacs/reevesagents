// New Run mode picker. Spawner is the default low-permission workspace;
// Orchestrator is the MCP-connected BETA flow.

import React, { useState } from 'react'
import { useInput } from 'ink'
import { Frame } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { useRouter } from '../../router.js'
import { useWizard } from '../../state/WizardContext.js'
import type { RunMode } from '../../state/types.js'

interface ModeOption {
  mode: RunMode
  label: string
  hint: string
  next: 'NewRunBasics' | 'NewRunPreset'
}

const MODES: ModeOption[] = [
  {
    mode: 'spawner',
    label: 'Spawner Run',
    hint: 'multiple independent CLI terminals; no MCP, no agent injection',
    next: 'NewRunBasics',
  },
  {
    mode: 'orchestrator',
    label: 'Orchestrator BETA',
    hint: 'root/worker agents with MCP, messages, approvals, and spawning',
    next: 'NewRunPreset',
  },
]

export function NewRunMode() {
  const { push, pop } = useRouter()
  const { update, reset } = useWizard()
  const [selectedIdx, setSelectedIdx] = useState(0)

  function activate(): void {
    const selected = MODES[selectedIdx]!
    update({ mode: selected.mode, presetName: null })
    push(selected.next)
  }

  useInput((_input, key) => {
    if (key.upArrow) { setSelectedIdx(idx => Math.max(0, idx - 1)); return }
    if (key.downArrow) { setSelectedIdx(idx => Math.min(MODES.length - 1, idx + 1)); return }
    if (key.return) { activate(); return }
    if (key.escape || key.backspace) { reset(); pop() }
  })

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'New Run', 'Mode']}
      tagline="Choose how this tmux workspace should behave."
      statusContext={MODES[selectedIdx]?.hint}
      statusKeys="enter select · ↑↓ move · esc back"
    >
      <Section label="Run Mode" />
      {MODES.map((mode, idx) => (
        <Row
          key={mode.mode}
          selected={selectedIdx === idx}
          primary={mode.label}
          hint={mode.hint}
        />
      ))}
      <SectionEnd />
    </Frame>
  )
}
