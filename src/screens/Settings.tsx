// Settings page: single page showing providers, state paths, and local actions.
// Providers are selectable; actions manage detection.

import React, { useMemo, useState } from 'react'
import { Box, useInput } from 'ink'
import { Frame } from '../components/Frame.js'
import { Row } from '../components/Row.js'
import { Section, SectionEnd } from '../components/Section.js'
import { useRouter } from '../router.js'
import { colors } from '../utils/tokens.js'
import { glyphs } from '../utils/glyphs.js'
import { PROVIDERS, detectAvailable } from '../launcher/providers.js'
import { providerDisplayName } from '../utils/display.js'
import { runsDir, stateRoot } from '../state/runs.js'
import { presetsDir } from '../state/store.js'
import { configPath } from '../state/config.js'
import { useToast } from '../state/ToastContext.js'

const CONFIG_PATHS = {
  cc: '~/.claude/settings.json',
  codex: '~/.codex/config.toml',
  opencode: '~/.config/opencode/opencode.json',
  hermes: '~/.hermes/config.yaml',
  kimi: '~/.kimi-code/config.toml',
  deepseek: 'DEEPSEEK_MODEL / .env',
  pi: '~/.pi',
  qwen: '~/.qwen/settings.json',
  aider: '~/.aider.conf.yml',
}

const PROVIDER_LABEL_WIDTH = Math.max(...PROVIDERS.map(provider => providerDisplayName(provider).length))
const ACTION_LABEL_WIDTH = Math.max('Recheck'.length, 'Show Config'.length, 'Back'.length)

type RowType = 'provider' | 'statePath' | 'action'

interface SettingsRow {
  type: RowType
  id: string
  provider?: typeof PROVIDERS[number]
  selectable: boolean
}

export function Settings() {
  const { pop } = useRouter()
  const { toast } = useToast()
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)

  const available = useMemo(() => detectAvailable(), [refreshKey])

  const rows: SettingsRow[] = [
    ...PROVIDERS.map(p => ({ type: 'provider' as const, id: p, provider: p, selectable: true })),
    { type: 'statePath' as const, id: 'state', selectable: false },
    { type: 'statePath' as const, id: 'runs', selectable: false },
    { type: 'statePath' as const, id: 'presets', selectable: false },
    { type: 'action' as const, id: 'recheck', selectable: true },
    { type: 'action' as const, id: 'showConfig', selectable: true },
    { type: 'action' as const, id: 'back', selectable: true },
  ]

  const selectableRows = rows.filter(r => r.selectable)
  const selectableIdx = selectableRows.findIndex(r => r.id === rows[selectedIdx]?.id)
  const currentIdx = selectableIdx === -1 ? 0 : selectableIdx

  function moveSelection(delta: number) {
    const newIdx = Math.max(0, Math.min(selectableRows.length - 1, currentIdx + delta))
    const newRowIdx = rows.findIndex(r => r.id === selectableRows[newIdx]?.id)
    setSelectedIdx(newRowIdx)
  }

  async function activate() {
    const row = selectableRows[currentIdx]
    if (!row) return

    if (row.id === 'recheck') {
      setRefreshKey(k => k + 1)
      return
    }
    if (row.id === 'showConfig') {
      toast(`Config: ${configPath()}`, 'info')
      return
    }
    if (row.id === 'back') {
      pop()
      return
    }
  }

  useInput((_input, key) => {
    if (key.escape || key.backspace) { pop(); return }
    if (key.upArrow) { moveSelection(-1); return }
    if (key.downArrow) { moveSelection(1); return }
    if (key.return) { activate(); return }
  })

  const selectedRow = rows[selectedIdx]
  const selectedProvider = selectedRow?.type === 'provider' ? selectedRow.provider : undefined

  const installedCount = Object.values(available).filter(Boolean).length
  const totalCount = PROVIDERS.length

  // Selected provider becomes a one-line StatusBar context.
  const statusContext = selectedProvider
    ? `${providerDisplayName(selectedProvider)} · ${available[selectedProvider] ? 'installed' : 'not installed'} · config ${CONFIG_PATHS[selectedProvider]}`
    : selectedRow?.id === 'showConfig'
    ? configPath()
    : undefined

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Settings']}
      meta={[
        { label: 'providers', value: `${installedCount}/${totalCount}` },
      ]}
      tagline="Providers, local state paths, and spawner configuration."
      statusContext={statusContext}
      statusKeys="↑↓ move · enter select · esc back"
    >
      <Box flexDirection="column">
        <Section label="Providers" />
        {PROVIDERS.map((provider, _idx) => {
          const rowIdx = rows.findIndex(r => r.type === 'provider' && r.provider === provider)
          const isSelected = selectedIdx === rowIdx
          const isInstalled = available[provider]
          return (
            <Row
              key={provider}
              selected={isSelected}
              glyph={{
                char: isInstalled ? glyphs.status.ok : glyphs.status.fail,
                color: isInstalled ? colors.status.ok : colors.text.faint,
              }}
              primary={providerDisplayName(provider)}
              primaryWidth={PROVIDER_LABEL_WIDTH}
              hint={isInstalled ? 'installed' : 'not installed'}
            />
          )
        })}
        <SectionEnd />

        <Section label="State paths" />
        <Row
          selected={selectedIdx === rows.findIndex(r => r.id === 'state')}
          primary="State"
          trailing={stateRoot()}
        />
        <Row
          selected={selectedIdx === rows.findIndex(r => r.id === 'runs')}
          primary="Runs"
          trailing={runsDir()}
        />
        <Row
          selected={selectedIdx === rows.findIndex(r => r.id === 'presets')}
          primary="Presets"
          trailing={presetsDir()}
        />
        <SectionEnd />

        <Section label="Actions" />
        <Row
          selected={selectedIdx === rows.findIndex(r => r.id === 'recheck')}
          primary="Recheck"
          primaryWidth={ACTION_LABEL_WIDTH}
          hint="re-detect installed providers"
        />
        <Row
          selected={selectedIdx === rows.findIndex(r => r.id === 'showConfig')}
          primary="Show Config"
          primaryWidth={ACTION_LABEL_WIDTH}
          hint="show config file path"
        />
        <Row
          selected={selectedIdx === rows.findIndex(r => r.id === 'back')}
          primary="Back"
          primaryWidth={ACTION_LABEL_WIDTH}
          hint="return to previous page"
        />
        <SectionEnd />
      </Box>
    </Frame>
  )
}
