// Labeled divider within a list. Renders as a compact section cap.
// Non-selectable. Used to group related rows visually.

import React from 'react'
import { Box, Text } from 'ink'
import { colors } from '../utils/tokens.js'
import { panelWidth, useLayoutColumns } from './LayoutContext.js'

interface Props {
  label: string
}

export function Section({ label }: Props) {
  const columns = useLayoutColumns()
  const labelTextWidth = label ? label.length + 2 : 0
  const width = Math.max(labelTextWidth + 7, panelWidth(columns))
  const suffix = '─'.repeat(Math.max(2, width - labelTextWidth - 5))

  return (
    <Box>
      <Text color={colors.surface.border} wrap="truncate-end">
        {'  '}
        ╭─
        {label ? (
          <>
            {' '}
            <Text color={colors.accent.primary} bold>{label}</Text>
            {' '}
          </>
        ) : null}
        {suffix}
        ╮
      </Text>
    </Box>
  )
}

export function SectionEnd() {
  const columns = useLayoutColumns()
  const width = Math.max(4, panelWidth(columns))
  const suffix = '─'.repeat(Math.max(0, width - 4))

  return (
    <Box>
      <Text color={colors.surface.border} wrap="truncate-end">
        {'  '}
        ╰
        {suffix}
        ╯
      </Text>
    </Box>
  )
}
