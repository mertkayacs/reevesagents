// Welcome screen and main menu.
// Layout: REEVES wordmark, AGENTS wordmark, mascot, then primary navigation.
// Keyboard: arrows move, Enter opens the selected page, Esc exits.

import React, { useInsertionEffect, useMemo, useRef, useState } from 'react'
import { Box, Text, useApp, useInput, useWindowSize } from 'ink'
import { Wordmark } from '../components/Wordmark.js'
import { Mascot, type MascotVariant } from '../components/Mascot.js'
import { AGENTS_LINES } from '../brand/wordmark.js'
import { useRouter } from '../router.js'
import { colors } from '../utils/tokens.js'
import { Section, SectionEnd } from '../components/Section.js'
import { Row } from '../components/Row.js'
import { LayoutProvider } from '../components/LayoutContext.js'
import { requestWebLaunch } from '../web/launch-intent.js'
import type { ScreenName } from '../state/types.js'
import { useLanguage } from '../state/LanguageContext.js'

function pickMascotVariant(columns: number): MascotVariant {
  if (columns < 50) return 'mini'
  if (columns < 90) return 'single'
  return 'hero'
}

export function Welcome() {
  const { exit } = useApp()
  const { push, selectedRunId } = useRouter()
  const { t, language } = useLanguage()
  const { columns, rows } = useWindowSize()
  const pagePadding = 1
  const contentColumns = Math.max(1, columns - 2 - (pagePadding * 2))
  const menuColumns = Math.max(1, Math.min(contentColumns, 72))
  const compact = contentColumns < 58
  const mascotVariant = pickMascotVariant(contentColumns)
  const actions = useMemo(() => {
    const rows: Array<{ label: string; hint: string; screen?: ScreenName; quit?: boolean; launchWeb?: boolean }> = [
      { label: t('welcome.newRun'), hint: t('welcome.newRunHint'), screen: 'NewRun' },
      { label: t('welcome.runs'), hint: t('welcome.runsHint'), screen: 'Runs' },
      { label: t('welcome.doctor'), hint: t('welcome.doctorHint'), screen: 'Doctor' },
      { label: `${t('welcome.startWeb')} (beta)`, hint: t('welcome.startWebHint'), launchWeb: true },
      { label: t('common.settings'), hint: t('welcome.settingsHint'), screen: 'Settings' },
      { label: t('welcome.reference'), hint: t('welcome.referenceHint'), screen: 'Reference' },
      { label: t('welcome.credits'), hint: t('welcome.creditsHint'), screen: 'Credits' },
      { label: t('welcome.quit'), hint: t('welcome.quitHint'), quit: true },
    ]
    if (selectedRunId) {
      rows.splice(1, 0, { label: t('welcome.currentRun'), hint: t('welcome.currentRunHint'), screen: 'Run' })
    }
    return rows
  }, [selectedRunId, t, language])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const previousSizeRef = useRef<{ columns: number; rows: number } | null>(null)
  const visibleActionCount = Math.max(3, Math.min(actions.length, rows - 14))
  const firstVisibleAction = Math.min(
    Math.max(0, selectedIdx - visibleActionCount + 1),
    Math.max(0, actions.length - visibleActionCount),
  )
  const visibleActions = actions.slice(firstVisibleAction, firstVisibleAction + visibleActionCount)
  const actionLabelWidth = Math.max(...actions.map(action => action.label.length))
  const rangeText = visibleActionCount < actions.length
    ? ` · ${firstVisibleAction + 1}-${firstVisibleAction + visibleActions.length} of ${actions.length}`
    : ''

  useInsertionEffect(() => {
    const previousSize = previousSizeRef.current
    previousSizeRef.current = { columns, rows }
    if (previousSize && previousSize.columns === columns && previousSize.rows === rows) return
    if (!process.stdout.isTTY) return
    process.stdout.write('\x1b[3J\x1b[2J\x1b[H')
  }, [columns, rows])

  function activate(): void {
    const action = actions[selectedIdx]
    if (!action) return
    if (action.quit) {
      exit()
      return
    }
    if (action.launchWeb) {
      // Hand the terminal to the web server: signal intent, then exit the TUI so
      // the CLI launches it in this same terminal (foreground, no daemon).
      requestWebLaunch()
      exit()
      return
    }
    if (action.screen) push(action.screen)
  }

  useInput((input, key) => {
    if (key.upArrow) { setSelectedIdx(idx => Math.max(0, idx - 1)); return }
    if (key.downArrow) { setSelectedIdx(idx => Math.min(actions.length - 1, idx + 1)); return }
    if (key.return) { activate(); return }
    if (key.escape || key.backspace || input === 'q') { exit(); return }
  })

  return (
    <LayoutProvider columns={contentColumns}>
      <Box flexDirection="column" paddingX={pagePadding} width={columns} borderStyle="single" borderColor={colors.surface.border} overflow="hidden">
        <Box flexDirection="row" alignItems="flex-start">
          <Box flexDirection="column">
            <Wordmark compact={compact} animated small intervalMs={400} />
            <Box marginTop={1}>
              <Wordmark lines={AGENTS_LINES} compact={compact} animated small intervalMs={400} />
            </Box>
          </Box>
          <Box marginLeft={2}>
            <Mascot variant={mascotVariant} />
          </Box>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text color={colors.text.dim} wrap="truncate-end">{t('welcome.tagline1')}</Text>
          <Text color={colors.text.dim} wrap="truncate-end">{t('welcome.tagline2')}</Text>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <LayoutProvider columns={menuColumns}>
            <Section label={t('welcome.menu')} />
            {visibleActions.map((action, localIdx) => {
              const idx = firstVisibleAction + localIdx
              return (
                <Row
                  key={action.label}
                  selected={selectedIdx === idx}
                  primary={action.label}
                  hint={action.hint}
                  primaryWidth={actionLabelWidth}
                  danger={action.quit}
                />
              )
            })}
            <SectionEnd />

            <Box>
              <Text color={colors.text.muted}>{t('welcome.keys')}{rangeText}</Text>
            </Box>
          </LayoutProvider>
        </Box>
      </Box>
    </LayoutProvider>
  )
}
