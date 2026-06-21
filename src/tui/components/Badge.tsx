// Pill component: glyph + space + label. Renders inline in specified color.
// Used inside Row or as a standalone indicator.

import React from 'react'
import { Box, Text } from 'ink'

interface Props {
  glyph: string
  label: string
  color: string
}

export function Badge({ glyph, label, color }: Props) {
  return (
    <Box>
      <Text color={color}>
        {glyph}
        {' '}
        {label}
      </Text>
    </Box>
  )
}
