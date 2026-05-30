// Outer chassis for every page (except Welcome which has its own layout).
// Three vertical regions: Header, optional Tagline, Body row (Primary + optional Detail),
// StatusBar. The Frame locks to width=cols, height=rows so Ink's reconciler always
// knows the exact extent; this is what keeps arrow-key re-renders from leaving stale
// border/row artifacts (ink#907). The outer border is part of the fixed chassis.
// Floor: refuses below 50x18; narrow/standard/wide tiers per spec §15.

import React, { useInsertionEffect, useRef } from 'react'
import { Box, Text, useWindowSize } from 'ink'
import { Header } from './Header.js'
import { Tagline } from './Tagline.js'
import { Detail } from './Detail.js'
import { StatusBar } from './StatusBar.js'
import { LayoutProvider } from './LayoutContext.js'
import { colors, space } from '../utils/tokens.js'

export const FLOOR_COLS = 50
export const FLOOR_ROWS = 18
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

  return (
    <Box flexDirection="column" width={cols} borderStyle="single" borderColor={colors.surface.border}>
      <Header
        breadcrumb={breadcrumb}
        meta={meta}
        tmuxSession={tmuxSession}
        columns={innerCols}
      />
      <Rule cols={innerCols} />
      {tagline ? <Tagline text={tagline} rows={innerRows} cols={innerCols} /> : null}

      <Box flexDirection="row">
        <LayoutProvider columns={bodyColumns}>
          <Box flexDirection="column" flexGrow={1} paddingX={bodyPadding} overflow="hidden">
            {children}
          </Box>
        </LayoutProvider>
        {showDetail ? (
          <Box width={36} flexShrink={0} overflow="hidden">
            <Detail title={detailTitle}>{detail}</Detail>
          </Box>
        ) : null}
      </Box>

      <Rule cols={innerCols} />
      <StatusBar context={statusContext} keys={statusKeys} rows={innerRows} cols={innerCols} />
    </Box>
  )
}
