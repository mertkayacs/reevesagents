// First-run wizard and setup landing. Shows the environment at a glance, the two
// ways to use reevesagents, and one-key actions to connect installed CLIs, open
// per-host control, or start a run. First-run routing lands here after the
// language pick; it is also reachable from the Welcome menu.

import React, { useMemo, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { Frame } from '../components/Frame.js'
import { Row } from '../components/Row.js'
import { Section, SectionEnd } from '../components/Section.js'
import { useRouter } from '../router.js'
import { useLanguage } from '../contexts/LanguageContext.js'
import { colors } from '../utils/tokens.js'
import { buildOnboardingState } from '../../core/onboard.js'
import { attachAll } from '../../mcp/installer.js'
import { providerDisplayName } from '../../utils/display.js'

interface Action {
  key: string
  label: string
  hint: string
  run: () => void
}

export function Setup() {
  const { push, replace, pop, canBack } = useRouter()
  const { t } = useLanguage()
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [toast, setToast] = useState<string | null>(null)

  const state = useMemo(() => buildOnboardingState(), [refreshKey])

  function leave(): void {
    if (canBack) pop()
    else replace('Welcome')
  }

  const actions: Action[] = []
  if (state.attachable.length > 0) {
    actions.push({
      key: 'connect',
      label: t('setup.connectAll'),
      hint: t('setup.connectAllHint'),
      run: () => {
        const results = attachAll()
        const ok = results.filter(result => result.ok).length
        setToast(t('setup.connectedToast', { ok, total: results.length }))
        setRefreshKey(key => key + 1)
      },
    })
  }
  actions.push({ key: 'hosts', label: t('setup.manageHosts'), hint: t('setup.manageHostsHint'), run: () => push('AgentControl') })
  actions.push({ key: 'run', label: t('setup.startRun'), hint: t('setup.startRunHint'), run: () => push('NewRun') })
  actions.push({ key: 'done', label: t('setup.done'), hint: t('setup.doneHint'), run: leave })

  const maxIdx = actions.length - 1

  useInput((_input, key) => {
    if (key.upArrow) { setSelectedIdx(idx => Math.max(0, idx - 1)); return }
    if (key.downArrow) { setSelectedIdx(idx => Math.min(maxIdx, idx + 1)); return }
    if (key.return) { actions[Math.min(selectedIdx, maxIdx)]?.run(); return }
    if (key.escape) { leave(); return }
  })

  const providersText = state.installedProviders.length > 0
    ? state.installedProviders.map(providerDisplayName).join(', ')
    : t('setup.noProviders')

  return (
    <Frame
      breadcrumb={['ReevesAgents', t('setup.title')]}
      tagline={t('setup.subtitle')}
      statusKeys={t('setup.status')}
    >
      <Box flexDirection="column">
        <Text color={colors.text.dim} wrap="truncate-end">{t('setup.intro')}</Text>
        <Section label={t('setup.environment')} />
        <Row selected={false} disabled primary="tmux" primaryWidth={12} hint={state.tmuxOk ? t('setup.ok') : t('setup.tmuxMissing')} />
        <Row selected={false} disabled primary="node" primaryWidth={12} hint={state.nodeOk ? t('setup.ok') : t('setup.nodeOld')} />
        <Row selected={false} disabled primary={t('setup.providersLabel')} primaryWidth={12} hint={providersText} />
        <Section label={t('setup.actions')} />
        {actions.map((action, idx) => (
          <Row
            key={action.key}
            selected={selectedIdx === idx}
            primary={action.label}
            primaryWidth={26}
            hint={action.hint}
          />
        ))}
        {toast && <Text color={colors.status.ok} wrap="truncate-end">{toast}</Text>}
        <SectionEnd />
      </Box>
    </Frame>
  )
}
