// Settings page: single page showing providers, state paths, and local actions.
// Providers are selectable; actions manage detection.

import React, { useMemo, useState } from 'react'
import { Box, useInput, useWindowSize } from 'ink'
import { Frame, frameBodyRows } from '../components/Frame.js'
import { Row } from '../components/Row.js'
import { Section, SectionEnd } from '../components/Section.js'
import { useRouter } from '../router.js'
import { colors } from '../utils/tokens.js'
import { glyphs } from '../utils/glyphs.js'
import { PROVIDERS, detectAvailable } from '../../core/providers.js'
import { providerDisplayName } from '../../utils/display.js'
import { runsDir, stateRoot } from '../../core/runs.js'
import { presetsDir } from '../../core/store.js'
import { configPath } from '../../core/config.js'
import { useToast } from '../contexts/ToastContext.js'
import { LANGUAGE_OPTIONS } from '../../i18n/languages.js'
import { useLanguage, tuiLanguageLabel } from '../contexts/LanguageContext.js'
import type { LanguageCode } from '../../core/types.js'

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
const LANGUAGE_LABEL_WIDTH = Math.max(...LANGUAGE_OPTIONS.map(option => option.nativeName.length + 3))

type RowType = 'provider' | 'language' | 'statePath' | 'action'

interface SettingsRow {
  type: RowType
  id: string
  provider?: typeof PROVIDERS[number]
  language?: LanguageCode
  selectable: boolean
}

export function Settings() {
  const { pop, push } = useRouter()
  const { toast } = useToast()
  const { language, setLanguage, t } = useLanguage()
  const { rows: termRows } = useWindowSize()
  const bodyRows = frameBodyRows(termRows, true, true)
  // The full grouped layout below renders every provider, language, state path and
  // action at once; use it only when the body is tall enough to hold them all,
  // otherwise it overflows and Ink corrupts the rows. Below that, the compact
  // scrolling list handles any height.
  const nonCompactRows = PROVIDERS.length + LANGUAGE_OPTIONS.length + 3 + 5 + 8
  const compactBody = bodyRows < nonCompactRows
  const showCompactStatePaths = compactBody && bodyRows >= 10
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)

  const available = useMemo(() => detectAvailable(), [refreshKey])
  const actionLabelWidth = Math.max(t('welcome.setup').length, t('settings.recheck').length, t('settings.showConfig').length, t('settings.editConfig').length, t('common.back').length)

  const rows: SettingsRow[] = [
    ...PROVIDERS.map(p => ({ type: 'provider' as const, id: p, provider: p, selectable: true })),
    ...LANGUAGE_OPTIONS.map(option => ({ type: 'language' as const, id: `language-${option.code}`, language: option.code, selectable: true })),
    { type: 'statePath' as const, id: 'state', selectable: false },
    { type: 'statePath' as const, id: 'runs', selectable: false },
    { type: 'statePath' as const, id: 'presets', selectable: false },
    { type: 'action' as const, id: 'setup', selectable: true },
    { type: 'action' as const, id: 'recheck', selectable: true },
    { type: 'action' as const, id: 'showConfig', selectable: true },
    { type: 'action' as const, id: 'editConfig', selectable: true },
    { type: 'action' as const, id: 'back', selectable: true },
  ]

  const selectableRows = rows.filter(r => r.selectable)
  const selectableIdx = selectableRows.findIndex(r => r.id === rows[selectedIdx]?.id)
  const currentIdx = selectableIdx === -1 ? 0 : selectableIdx
  const compactRowCount = Math.max(1, bodyRows - (showCompactStatePaths ? 8 : 3))
  const compactFirstRow = Math.min(
    Math.max(0, currentIdx - compactRowCount + 1),
    Math.max(0, selectableRows.length - compactRowCount),
  )
  const compactRows = selectableRows.slice(compactFirstRow, compactFirstRow + compactRowCount)

  function moveSelection(delta: number) {
    const newIdx = Math.max(0, Math.min(selectableRows.length - 1, currentIdx + delta))
    const newRowIdx = rows.findIndex(r => r.id === selectableRows[newIdx]?.id)
    setSelectedIdx(newRowIdx)
  }

  async function activate() {
    const row = selectableRows[currentIdx]
    if (!row) return

    if (row.id === 'setup') {
      push('Setup')
      return
    }
    if (row.id === 'recheck') {
      setRefreshKey(k => k + 1)
      return
    }
    if (row.id === 'showConfig') {
      toast(t('settings.configToast', { path: configPath() }), 'info')
      return
    }
    if (row.id === 'editConfig') {
      push('Config')
      return
    }
    if (row.type === 'language' && row.language) {
      setLanguage(row.language)
      toast(t('language.saved'), 'info')
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
  const selectedLanguage = selectedRow?.type === 'language' ? selectedRow.language : undefined

  const installedCount = Object.values(available).filter(Boolean).length
  const totalCount = PROVIDERS.length

  // Selected provider becomes a one-line StatusBar context.
  const statusContext = selectedProvider
    ? `${providerDisplayName(selectedProvider)} · ${available[selectedProvider] ? t('common.installed') : t('common.notInstalled')} · config ${CONFIG_PATHS[selectedProvider]}`
    : selectedLanguage
    ? tuiLanguageLabel(selectedLanguage)
    : selectedRow?.id === 'showConfig'
    ? configPath()
    : undefined

  return (
      <Frame
      breadcrumb={['ReevesAgents', t('settings.title')]}
      meta={[
        { label: t('settings.providersMeta'), value: `${installedCount}/${totalCount}` },
        { label: t('common.language'), value: language },
      ]}
      tagline={t('settings.tagline')}
      statusContext={statusContext}
      statusKeys={t('settings.statusKeys')}
    >
      {compactBody ? (
        <Box flexDirection="column">
          <Section label={selectedRow?.type === 'language' ? t('common.language') : selectedRow?.type === 'action' ? t('common.actions') : t('common.providers')} />
          {compactRows.map(row => {
            const rowIdx = rows.findIndex(r => r.id === row.id)
            if (row.type === 'provider' && row.provider) {
              const isInstalled = available[row.provider]
              return (
                <Row
                  key={row.id}
                  selected={selectedIdx === rowIdx}
                  glyph={{
                    char: isInstalled ? glyphs.status.ok : glyphs.status.fail,
                    color: isInstalled ? colors.status.ok : colors.text.faint,
                  }}
                  primary={providerDisplayName(row.provider)}
                  primaryWidth={PROVIDER_LABEL_WIDTH}
                  hint={isInstalled ? t('common.installed') : t('common.notInstalled')}
                />
              )
            }
            if (row.type === 'language' && row.language) {
              const option = LANGUAGE_OPTIONS.find(item => item.code === row.language)!
              return (
                <Row
                  key={row.id}
                  selected={selectedIdx === rowIdx}
                  primary={`${option.flag} ${option.nativeName}`}
                  primaryWidth={LANGUAGE_LABEL_WIDTH}
                  hint={option.name}
                  trailing={option.code === language ? t('common.current') : undefined}
                />
              )
            }
            const actionLabels: Record<string, { primary: string; hint: string }> = {
              setup: { primary: t('welcome.setup'), hint: t('welcome.setupHint') },
              recheck: { primary: t('settings.recheck'), hint: t('settings.recheckHint') },
              showConfig: { primary: t('settings.showConfig'), hint: t('settings.showConfigHint') },
              editConfig: { primary: t('settings.editConfig'), hint: t('settings.editConfigHint') },
              back: { primary: t('common.back'), hint: t('settings.backHint') },
            }
            const action = actionLabels[row.id]!
            return (
              <Row
                key={row.id}
                selected={selectedIdx === rowIdx}
                primary={action.primary}
                primaryWidth={actionLabelWidth}
                hint={action.hint}
              />
            )
          })}
          {selectableRows.length > compactRowCount && (
            <Row
              selected={false}
              primary={`${compactFirstRow + 1}-${compactFirstRow + compactRows.length} of ${selectableRows.length}`}
              trailing="scroll with arrows"
              disabled
            />
          )}
          <SectionEnd />
          {showCompactStatePaths && (
            <>
              <Section label={t('settings.statePaths')} />
              <Row selected={false} primary={t('settings.state')} trailing={stateRoot()} alwaysShowTrailing disabled />
              <Row selected={false} primary={t('settings.runs')} trailing={runsDir()} alwaysShowTrailing disabled />
              <Row selected={false} primary={t('settings.presets')} trailing={presetsDir()} alwaysShowTrailing disabled />
              <SectionEnd />
            </>
          )}
        </Box>
      ) : (
        <Box flexDirection="column">
          <Section label={t('common.providers')} />
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
                hint={isInstalled ? t('common.installed') : t('common.notInstalled')}
              />
            )
          })}
          <SectionEnd />

          <Section label={t('common.language')} />
          {LANGUAGE_OPTIONS.map(option => {
            const rowIdx = rows.findIndex(r => r.type === 'language' && r.language === option.code)
            return (
              <Row
                key={option.code}
                selected={selectedIdx === rowIdx}
                primary={`${option.flag} ${option.nativeName}`}
                primaryWidth={LANGUAGE_LABEL_WIDTH}
                hint={option.name}
                trailing={option.code === language ? t('common.current') : undefined}
              />
            )
          })}
          <SectionEnd />

          <Section label={t('settings.statePaths')} />
          <Row
            selected={selectedIdx === rows.findIndex(r => r.id === 'state')}
            primary={t('settings.state')}
            trailing={stateRoot()}
          />
          <Row
            selected={selectedIdx === rows.findIndex(r => r.id === 'runs')}
            primary={t('settings.runs')}
            trailing={runsDir()}
          />
          <Row
            selected={selectedIdx === rows.findIndex(r => r.id === 'presets')}
            primary={t('settings.presets')}
            trailing={presetsDir()}
          />
          <SectionEnd />

          <Section label={t('common.actions')} />
          <Row
            selected={selectedIdx === rows.findIndex(r => r.id === 'setup')}
            primary={t('welcome.setup')}
            primaryWidth={actionLabelWidth}
            hint={t('welcome.setupHint')}
          />
          <Row
            selected={selectedIdx === rows.findIndex(r => r.id === 'recheck')}
            primary={t('settings.recheck')}
            primaryWidth={actionLabelWidth}
            hint={t('settings.recheckHint')}
          />
          <Row
            selected={selectedIdx === rows.findIndex(r => r.id === 'showConfig')}
            primary={t('settings.showConfig')}
            primaryWidth={actionLabelWidth}
            hint={t('settings.showConfigHint')}
          />
          <Row
            selected={selectedIdx === rows.findIndex(r => r.id === 'editConfig')}
            primary={t('settings.editConfig')}
            primaryWidth={actionLabelWidth}
            hint={t('settings.editConfigHint')}
          />
          <Row
            selected={selectedIdx === rows.findIndex(r => r.id === 'back')}
            primary={t('common.back')}
            primaryWidth={actionLabelWidth}
            hint={t('settings.backHint')}
          />
          <SectionEnd />
        </Box>
      )}
    </Frame>
  )
}
