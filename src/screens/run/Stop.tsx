// Stop run confirmation dialog.
// User confirms to stop this run's tmux session and mark all terminals/agents ended.

import React from 'react'
import { Dialog } from '../../components/Dialog.js'
import { Frame } from '../../components/Frame.js'
import { useRouter } from '../../router.js'
import { useToast } from '../../state/ToastContext.js'
import { readRun } from '../../state/runs.js'
import { openReeves, stopRun } from '../../launcher/runtime.js'

export function RunStop() {
  const { selectedRunId, pop, resetStack } = useRouter()
  const { toast } = useToast()

  const run = selectedRunId ? (() => { try { return readRun(selectedRunId) } catch { return null } })() : null
  const isSpawner = run?.mode === 'spawner'

  if (!run) {
    return (
      <Frame
        breadcrumb={['ReevesAgents', 'Runs', 'Stop']}
        statusKeys="←→ switch · enter select · esc cancel"
      >
        <Dialog
          title="No run selected"
          body="Cannot stop a run because no run is selected."
          intent="default"
          confirmLabel="Back"
          cancelLabel="Cancel"
          onConfirm={() => pop()}
          onCancel={() => pop()}
        />
      </Frame>
    )
  }

  function handleConfirm(): void {
    try {
      try { openReeves(selectedRunId!) } catch { /* no attached tmux client */ }
      stopRun(selectedRunId!)
      resetStack('Runs')
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs', run.name, 'Stop']}
      statusKeys="←→ switch · enter select · esc cancel"
    >
      <Dialog
        title={`Return and stop "${run.name}"?`}
        body={isSpawner
          ? 'Switches back to Reeves, closes this run\'s tmux session and terminal windows, then marks every terminal ended. Local JSON state is preserved.'
          : 'Switches back to Reeves, closes this run\'s tmux session and windows, then marks every entry ended. Local JSON state is preserved.'}
        intent="danger"
        confirmLabel="Return & Stop"
        cancelLabel="Cancel"
        onConfirm={handleConfirm}
        onCancel={() => pop()}
      />
    </Frame>
  )
}
