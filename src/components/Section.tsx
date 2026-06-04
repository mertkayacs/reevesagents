// Labeled divider within a list. Renders as a compact section cap.
// Non-selectable. Used to group related rows visually.

import React from 'react'
import { Box, Text } from 'ink'
import { colors } from '../utils/tokens.js'
import { panelWidth, useLayoutColumns } from './LayoutContext.js'
import { translatePhrase } from '../i18n/catalog.js'
import { useLanguage } from '../state/LanguageContext.js'

interface Props {
  label: string
}

export function Section({ label }: Props) {
  const { language } = useLanguage()
  const columns = useLayoutColumns()
  const displayLabel = translatePhrase(language, label)
  const labelTextWidth = displayLabel ? displayLabel.length + 2 : 0
  const width = Math.max(labelTextWidth + 7, panelWidth(columns))
  const suffix = '─'.repeat(Math.max(2, width - labelTextWidth - 5))

  return (
    <Box>
      <Text color={colors.surface.border} wrap="truncate-end">
        {'  '}
        ╭─
        {displayLabel ? (
          <>
            {' '}
            <Text color={colors.accent.primary} bold>{displayLabel}</Text>
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
