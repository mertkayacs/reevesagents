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
import type { ScreenName } from '../state/types.js'

function pickMascotVariant(columns: number): MascotVariant {
  if (columns < 50) return 'mini'
  if (columns < 90) return 'single'
  return 'hero'
}

export function Welcome() {
  const { exit } = useApp()
  const { push, selectedRunId } = useRouter()
  const { columns, rows } = useWindowSize()
  const pagePadding = 1
  const contentColumns = Math.max(1, columns - 2 - (pagePadding * 2))
  const menuColumns = Math.max(1, Math.min(contentColumns, 72))
  const compact = contentColumns < 58
  const mascotVariant = pickMascotVariant(contentColumns)
  const actions = useMemo(() => {
    const rows: Array<{ label: string; hint: string; screen?: ScreenName; quit?: boolean }> = [
      { label: 'New Run', hint: 'Spawner workspace or Orchestrator BETA', screen: 'NewRun' },
      { label: 'Runs', hint: 'open active and recent runs', screen: 'Runs' },
      { label: 'Doctor', hint: 'check local setup', screen: 'Doctor' },
      { label: 'Settings', hint: 'providers and paths', screen: 'Settings' },
      { label: 'Approvals', hint: 'Orchestrator BETA requests', screen: 'Approvals' },
      { label: 'Reference', hint: 'Spawner, Orchestrator BETA, CLI, MCP', screen: 'Reference' },
      { label: 'Credits', hint: 'about ReevesAgents', screen: 'Credits' },
      { label: 'Quit', hint: 'exit the TUI', quit: true },
    ]
    if (selectedRunId) {
      rows.splice(1, 0, { label: 'Current Run', hint: 'return to selected run', screen: 'Run' })
    }
    return rows
  }, [selectedRunId])
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

        <Box flexDirection="column">
          <Text color={colors.text.dim}>Local tmux-first workspace manager for AI CLI terminals.</Text>
          <Text color={colors.text.dim}>Spawner default · Orchestrator BETA · TUI · CLI</Text>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <LayoutProvider columns={menuColumns}>
            <Section label="Main Menu" />
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
              <Text color={colors.text.muted}>↑↓ move · enter select · q quit{rangeText}</Text>
            </Box>
          </LayoutProvider>
        </Box>
      </Box>
    </LayoutProvider>
  )
}
