// Secondary viewing pane with dashed border. Title in accent.primary bold,
// body in text.primary. Border colored text.faint. Padded with one column whitespace.

import React from 'react'
import { Box, Text } from 'ink'
import { colors, space } from '../../utils/tokens.js'
import { DASHED_BORDER } from './borderStyles.js'

interface Props {
  title?: string
  children: React.ReactNode
}

export function Detail({ title, children }: Props) {
  return (
    <Box flexDirection="column" marginLeft={space.sm} borderStyle={DASHED_BORDER} borderColor={colors.accent.deep} paddingX={space.sm} paddingY={space.sm}>
      {title && (
        <Box marginBottom={space.sm}>
          <Text color={colors.accent.primary} bold>
            {title}
          </Text>
        </Box>
      )}
      <Box flexDirection="column">
        {children}
      </Box>
    </Box>
  )
}
