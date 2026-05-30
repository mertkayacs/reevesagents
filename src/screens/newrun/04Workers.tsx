// Step 4/5: additional terminals/workers list. Empty is valid.
// Selecting a row and pressing Enter opens it for inline editing in step 4b.

import React, { useState } from 'react'
import { useInput } from 'ink'
import { Frame } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { StepIndicator } from '../../components/StepIndicator.js'
import { useRouter } from '../../router.js'
import { useWizard } from '../../state/WizardContext.js'
import { providerColor } from '../../utils/display.js'

type ActionId = 'add' | 'continue' | 'back' | 'cancel'

export function NewRunWorkers() {
  const { push, pop, setSelectedWorkerIdx } = useRouter()
  const { state, addWorker, reset } = useWizard()
  const isSpawner = state.mode === 'spawner'

  const workers = state.workers
  const actions: Array<{ id: ActionId; label: string; hint: string }> = [
    { id: 'add', label: isSpawner ? 'Add Terminal' : 'Add Worker', hint: isSpawner ? 'create another independent CLI terminal' : 'create a worker slot' },
    { id: 'continue', label: 'Continue', hint: 'to review' },
    { id: 'back', label: 'Back', hint: 'return to root config' },
    { id: 'cancel', label: 'Reset Wizard', hint: 'clear and return' },
  ]

  const totalRows = workers.length + actions.length
  const [selectedIdx, setSelectedIdx] = useState(0)

  if (selectedIdx >= totalRows && totalRows > 0) {
    setSelectedIdx(totalRows - 1)
  }

  function handleAction(id: ActionId): void {
    if (id === 'add') {
      const newIdx = addWorker()
      setSelectedWorkerIdx(newIdx)
      push('NewRunWorker')
    } else if (id === 'continue') {
      push('NewRunReview')
    } else if (id === 'back') {
      pop()
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
      if (selectedIdx < workers.length) {
        setSelectedWorkerIdx(selectedIdx)
        push('NewRunWorker')
      } else {
        handleAction(actions[selectedIdx - workers.length]!.id)
      }
    }
  })

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'New Run', 'Workers']}
      tagline={isSpawner
        ? 'Add zero or more independent CLI terminals. The human coordinates them manually.'
        : 'Orchestrator mode is BETA. Add zero or more worker agents for the root.'}
      statusKeys="enter select · ↑↓ move · esc back"
    >
      <StepIndicator step={4} total={5} name={isSpawner ? 'Terminals' : 'Workers'} />

      {workers.length === 0 ? (
        <Row selected={false} primary={isSpawner ? 'No extra terminals yet.' : 'No workers yet.'} trailing={isSpawner ? 'choose Add Terminal below' : 'choose Add Worker below'} disabled />
      ) : (
        workers.map((worker, idx) => (
          <Row
            key={`worker-${idx}`}
            selected={selectedIdx === idx}
            primary={worker.nickname || (isSpawner ? `terminal-${idx + 2}` : `worker-${idx + 1}`)}
            badge={{ label: worker.provider, color: providerColor(worker.provider) }}
            hint={worker.prompt ? worker.prompt.slice(0, 40) : '(no prompt set)'}
          />
        ))
      )}

      <Section label="Actions" />

      {actions.map((action, idx) => (
        <Row
          key={action.id}
          selected={selectedIdx === workers.length + idx}
          primary={action.label}
          hint={action.hint}
        />
      ))}
      <SectionEnd />
    </Frame>
  )
}
