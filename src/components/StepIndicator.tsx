// Wizard breadcrumb. Renders as "N / M · <name>".
// Step number in accent.bright, total in text.muted, name in accent.primary bold.

import React from 'react'
import { Box, Text } from 'ink'
import { colors } from '../utils/tokens.js'

interface Props {
  step: number
  total: number
  name: string
}

export function StepIndicator({ step, total, name }: Props) {
  return (
    <Box>
      <Text color={colors.accent.bright}>{step}</Text>
      <Text> / </Text>
      <Text color={colors.text.muted}>{total}</Text>
      <Text> · </Text>
      <Text color={colors.accent.primary} bold>
        {name}
      </Text>
    </Box>
  )
}
