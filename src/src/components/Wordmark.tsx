// REEVES AGENTS wordmark with an optional slow brightness breath.
// Stays terminal-native; no images, no fonts.

import React, { useEffect, useMemo, useState } from 'react'
import { Box, Text } from 'ink'
import { LOGO_LINES, FULL_LOGO_LINES, logoRows, logoRowsHalf, chunks } from '../brand/wordmark.js'
import { colors } from '../utils/tokens.js'

const BREATH_INTERVAL_MS = 1600

function useBreathFrame(enabled: boolean, intervalMs = BREATH_INTERVAL_MS): number {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (!enabled) return undefined
    const palette = colors.brand.gradient.length
    const timer = setInterval(() => setFrame(value => (value + 1) % palette), intervalMs)
    return () => clearInterval(timer)
  }, [enabled, intervalMs])
  return frame
}

function colorForChunk(row: number, chunk: number, frame: number): string {
  const palette = colors.brand.gradient
  const sweep = (row + chunk + frame) % (palette.length + 2)
  if (sweep === 0) return colors.brand.pale
  return palette[(row + chunk + frame) % palette.length] ?? palette[0]!
}

interface Props {
  compact?: boolean
  animated?: boolean
  full?: boolean
  small?: boolean
  intervalMs?: number
  lines?: readonly string[]
}

export function Wordmark({ compact = false, animated = false, full = false, small = false, intervalMs = BREATH_INTERVAL_MS, lines }: Props) {
  const animate = animated && Boolean(process.stdout.isTTY) && process.env.CI !== 'true' && process.env.NO_COLOR !== '1'
  const frame = useBreathFrame(animate, intervalMs)
  const rows = useMemo(() => {
    const wordLines = lines ?? (full ? FULL_LOGO_LINES : LOGO_LINES)
    return small ? logoRowsHalf(wordLines) : logoRows(wordLines, false)
  }, [full, small, lines])

  return (
    <Box flexDirection="column">
      {rows.map((row, rowIdx) => (
        <Box key={`${rowIdx}-${row}`}>
          {chunks(row, compact ? 3 : 4).map((part, chunkIdx) => (
            <Text key={`${rowIdx}-${chunkIdx}`} color={colorForChunk(rowIdx, chunkIdx, animate ? frame : 0)} bold>
              {part}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}
