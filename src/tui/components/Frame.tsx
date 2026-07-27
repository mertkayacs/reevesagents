// Outer chassis for every page (except Welcome which has its own layout).
// Three vertical regions: Header, optional Tagline, Body row (Primary + optional Detail),
// StatusBar. The Frame locks width to cols and clamps the body to the computed
// terminal budget so arrow-key re-renders do not leave stale border artifacts.
// Floor: refuses below 40x12; narrow/standard/wide tiers per spec §15.

import React, { useInsertionEffect, useRef } from 'react'
import { Box, Text, useWindowSize } from 'ink'
import { Header } from './Header.js'
import { Tagline } from './Tagline.js'
import { Detail } from './Detail.js'
import { StatusBar } from './StatusBar.js'
import { LayoutProvider } from './LayoutContext.js'
import { colors, space } from '../utils/tokens.js'
import { translatePhrase } from '../../i18n/catalog.js'
import { useLanguage } from '../contexts/LanguageContext.js'

export const FLOOR_COLS = 40
export const FLOOR_ROWS = 12
export const DETAIL_BREAKPOINT = 90
const CLEAR_TERMINAL = '\x1b[3J\x1b[2J\x1b[H'

export interface FrameProps {
  breadcrumb: string[]
  meta?: Array<{ label: string; value: string }>
  tagline?: string
  children: React.ReactNode
  detail?: React.ReactNode
  detailTitle?: string
  statusContext?: string
  statusKeys?: string
}

function ResizeMessage({ cols, rows }: { cols: number; rows: number }) {
  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" width={cols} height={rows}>
      <Text color={colors.text.dim} wrap="truncate-end">ReevesAgents needs at least {FLOOR_COLS}x{FLOOR_ROWS}.</Text>
      <Text color={colors.text.dim} wrap="truncate-end">Current: {cols}x{rows}. Please resize.</Text>
    </Box>
  )
}

function Rule({ cols }: { cols: number }) {
  return (
    <Text color={colors.surface.quiet} wrap="truncate-end">
      {'┄'.repeat(Math.max(1, cols - 1))}
    </Text>
  )
}

export function frameBodyRows(rows: number, hasTagline: boolean, hasStatusContext: boolean): number {
  const innerRows = Math.max(1, rows - 2)
  const taglineRows = hasTagline ? (innerRows < 22 ? 1 : 2) : 0
  const statusRows = hasStatusContext && innerRows >= 22 ? 2 : 1
  return Math.max(1, innerRows - 1 - 1 - taglineRows - 1 - statusRows)
}

function useResizeClear(cols: number, rows: number, tooSmall: boolean): void {
  const previousSizeRef = useRef<{ cols: number; rows: number; tooSmall: boolean } | null>(null)

  useInsertionEffect(() => {
    const previousSize = previousSizeRef.current
    previousSizeRef.current = { cols, rows, tooSmall }
    if (!previousSize) return
    if (
      previousSize.cols === cols &&
      previousSize.rows === rows &&
      previousSize.tooSmall === tooSmall
    ) {
      return
    }
    if (!process.stdout.isTTY) return

    process.stdout.write(CLEAR_TERMINAL)
  }, [cols, rows, tooSmall])
}

export function Frame({
  breadcrumb,
  meta,
  tagline,
  children,
  detail,
  detailTitle,
  statusContext,
  statusKeys,
}: FrameProps) {
  const { language } = useLanguage()
  const { columns: cols, rows } = useWindowSize()
  const tooSmall = cols < FLOOR_COLS || rows < FLOOR_ROWS
  const innerCols = Math.max(1, cols - 2)
  const innerRows = Math.max(1, rows - 2)
  const bodyPadding = space.sm
  useResizeClear(cols, rows, tooSmall)

  if (tooSmall) {
    return <ResizeMessage cols={cols} rows={rows} />
  }

  const showDetail = detail !== undefined && innerCols >= DETAIL_BREAKPOINT
  const bodyColumns = Math.max(1, innerCols - (bodyPadding * 2) - (showDetail ? 36 : 0))
  const tmuxSession = process.env.TMUX ? 'active' : undefined
  const displayBreadcrumb = breadcrumb.map(item => translatePhrase(language, item))
  const displayMeta = meta?.map(item => ({
    label: translatePhrase(language, item.label),
    value: item.value,
  }))
  const displayTagline = tagline ? translatePhrase(language, tagline) : tagline
  const displayDetailTitle = detailTitle ? translatePhrase(language, detailTitle) : detailTitle
  const displayStatusContext = statusContext ? translatePhrase(language, statusContext) : statusContext
  const displayStatusKeys = statusKeys ? translatePhrase(language, statusKeys) : statusKeys
  const bodyRows = frameBodyRows(rows, Boolean(displayTagline), Boolean(displayStatusContext))

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor={colors.surface.border}>
      <Header
        breadcrumb={displayBreadcrumb}
        meta={displayMeta}
        tmuxSession={tmuxSession}
        columns={innerCols}
      />
      <Rule cols={innerCols} />
      {displayTagline ? <Tagline text={displayTagline} rows={innerRows} cols={innerCols} /> : null}

      <Box flexDirection="row" maxHeight={bodyRows} overflow="hidden">
        <LayoutProvider columns={bodyColumns} rows={bodyRows}>
          <Box flexDirection="column" flexGrow={1} maxHeight={bodyRows} paddingX={bodyPadding} overflow="hidden">
            {children}
          </Box>
        </LayoutProvider>
        {showDetail ? (
          <Box width={36} flexShrink={0} overflow="hidden">
            <Detail title={displayDetailTitle}>{detail}</Detail>
          </Box>
        ) : null}
      </Box>

      <Rule cols={innerCols} />
      <StatusBar context={displayStatusContext} keys={displayStatusKeys} rows={innerRows} cols={innerCols} />
    </Box>
  )
}
