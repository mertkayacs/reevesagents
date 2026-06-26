// Header: breadcrumb + optional meta, single row anchored just inside terminal width.
// Renders breadcrumb segments separated by chevron; current segment bold + primary.
// Meta items right-aligned as label/value pairs separated by dot; if tmuxSession
// provided, appends tmux meta item. At narrow widths (cols < 60), shows only
// current segment; hides meta entirely.
// Invariant: the Header occupies exactly one row. Text wraps are forbidden because
// any wrap trips ink#907 row-count miscount and leaves stale top-border artifacts.

import React from 'react'
import { Box, Text } from 'ink'
import { colors, sep } from '../../utils/tokens.js'
import { glyphs } from '../../utils/glyphs.js'
import { displayWidth } from '../../utils/width.js'

export interface HeaderProps {
  breadcrumb: string[]
  meta?: Array<{ label: string; value: string }>
  tmuxSession?: string
  columns: number
}

export function Header({ breadcrumb, meta, tmuxSession, columns }: HeaderProps) {
  const width = Math.max(1, columns - 1)
  const isNarrow = columns < 60

  let metaList = meta || []
  if (tmuxSession) {
    metaList = [...metaList, { label: 'tmux', value: tmuxSession }]
  }
  const metaText = metaList.map(({ label, value }) => `${label} ${value}`).join(sep.dot)
  const metaWidth = Math.min(displayWidth(metaText), Math.max(0, Math.floor(width * 0.42)))
  const leftWidth = Math.max(1, width - metaWidth)

  if (isNarrow) {
    const current = breadcrumb[breadcrumb.length - 1] || ''
    return (
      <Box width={width} height={1}>
        <Text color={colors.accent.primary} bold wrap="truncate-end">
          {current}
        </Text>
      </Box>
    )
  }

  const breadcrumbParts: React.ReactNode[] = []
  for (let i = 0; i < breadcrumb.length; i++) {
    const seg = breadcrumb[i]
    const isCurrent = i === breadcrumb.length - 1
    if (i > 0) {
      breadcrumbParts.push(
        <Text key={`sep-${i}`} color={colors.text.dim} wrap="truncate-end">
          {` ${glyphs.chevron} `}
        </Text>
      )
    }
    breadcrumbParts.push(
      <Text
        key={`seg-${i}`}
        color={isCurrent ? colors.accent.primary : colors.text.dim}
        bold={isCurrent}
        wrap="truncate-end"
      >
        {seg}
      </Text>
    )
  }

  return (
    <Box width={width} height={1} flexDirection="row">
      <Box width={leftWidth} height={1} flexShrink={0} flexDirection="row">{breadcrumbParts}</Box>
      {metaWidth > 0 && (
        <Box width={metaWidth} height={1} flexShrink={0}>
          <Text color={colors.text.dim} wrap="truncate-end">{metaText}</Text>
        </Box>
      )}
    </Box>
  )
}
