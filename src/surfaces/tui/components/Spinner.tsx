// Braille-frame spinner with optional label. Used for async work so loading
// states no longer render as plain text. Animation pauses cleanly when
// unmounted; safe in non-TTY environments (just shows the first frame).

import { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import { colors, space } from '../utils/tokens.js'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const
const INTERVAL_MS = 80

interface Props {
  label?: string
  color?: string
}

export function Spinner({ label, color = colors.accent.primary }: Props) {
  const [frame, setFrame] = useState(0)
  const animate = process.env.CI !== 'true' && process.env.NO_COLOR !== '1'

  useEffect(() => {
    if (!animate) return undefined
    const t = setInterval(() => setFrame(f => (f + 1) % FRAMES.length), INTERVAL_MS)
    return () => clearInterval(t)
  }, [animate])

  return (
    <Box>
      <Text color={color}>{FRAMES[frame]}</Text>
      {label && (
        <Box marginLeft={space.sm}>
          <Text color={colors.text.dim}>{label}</Text>
        </Box>
      )}
    </Box>
  )
}
