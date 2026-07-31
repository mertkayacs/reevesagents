// Tagline: 1-2 sentence purpose line in text.dim.
// At tight height (rows < 22), truncates to first sentence.
// Invariant: occupies 1 row when tight, 2 rows otherwise.
// Text wraps are forbidden (truncate-end at width=cols) to keep height stable
// across re-renders; any wrap trips ink#907 cursor-tracking drift.

import { Box, Text } from 'ink'
import { colors, space } from '../utils/tokens.js'

export interface TaglineProps {
  text: string
  rows: number
  cols: number
}

export function Tagline({ text, rows, cols }: TaglineProps) {
  const isTight = rows < 22
  const height = isTight ? 1 : 2

  let displayText = text
  if (isTight) {
    const sentences = text.split('. ')
    if (sentences.length > 1) {
      displayText = sentences[0] + '.'
    }
  }

  return (
    <Box flexDirection="column" width={cols} height={height} paddingX={space.sm}>
      <Text color={colors.text.dim} wrap="truncate-end">{displayText}</Text>
      {!isTight && <Text> </Text>}
    </Box>
  )
}
