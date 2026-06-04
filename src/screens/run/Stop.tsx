// Stop run confirmation dialog.
// User confirms to stop this run's tmux session and mark all agents ended.

import React from 'react'
import { Dialog } from '../../components/Dialog.js'
import { Frame } from '../../components/Frame.js'
import { useRouter } from '../../router.js'
import { useToast } from '../../state/ToastContext.js'
import { useLanguage } from '../../state/LanguageContext.js'
import { archiveAndRemoveRun, readRun } from '../../state/runs.js'
import { openReeves, stopRun } from '../../launcher/runtime.js'
import { translatePhrase } from '../../i18n/catalog.js'

export function RunStop() {
  const { selectedRunId, pop, resetStack } = useRouter()
  const { toast } = useToast()
  const { t, language } = useLanguage()

  const run = selectedRunId ? (() => { try { return readRun(selectedRunId) } catch { return null } })() : null

  if (!run) {
    return (
      <Frame
        breadcrumb={['ReevesAgents', 'Runs', 'Stop']}
        statusKeys="←→ switch · enter select · esc cancel"
      >
        <Dialog
          title={t('runStop.noRunTitle')}
          body={t('runStop.noRunBody')}
          intent="default"
          confirmLabel={t('common.back')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => pop()}
          onCancel={() => pop()}
        />
      </Frame>
    )
  }

  function handleConfirm(): void {
    if (!run) return
    try {
      if (run.status === 'ended' || run.ended_at !== null) {
        archiveAndRemoveRun(run.id, 'ended')
        toast(t('runStop.deletedToast', { name: run.name }), 'info')
        resetStack('RunHistory')
        return
      }
      try { openReeves(selectedRunId!) } catch { /* no attached tmux client */ }
      stopRun(selectedRunId!)
      toast(t('history.movedToast', { name: run.name }), 'info')
      resetStack('RunHistory')
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const isRunEnded = run.status === 'ended' || run.ended_at !== null

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs', run.name, isRunEnded ? 'Delete' : 'Stop']}
      statusKeys="←→ switch · enter select · esc cancel"
    >
      <Dialog
        title={t(isRunEnded ? 'runStop.deleteTitle' : 'runStop.stopTitle', { name: run.name })}
        body={t(isRunEnded ? 'runStop.deleteBody' : 'runStop.stopBody')}
        intent="danger"
        confirmLabel={translatePhrase(language, isRunEnded ? 'Delete Run' : 'Stop Run')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleConfirm}
        onCancel={() => pop()}
      />
    </Frame>
  )
}
