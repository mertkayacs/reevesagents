// StatusBar: bottom region of Frame. Shows context/toast when present; otherwise
// uses the key legend as the single packed line. Standard height can show both.
// Invariant: locked to width=cols and fixed height (1 or 2 rows).
// Text wraps forbidden (truncate-end) so height never drifts across renders.

import React from 'react'
import { Box, Text } from 'ink'
import { colors, sep } from '../../utils/tokens.js'
import { useToast, severityColor } from '../contexts/ToastContext.js'

export interface StatusBarProps {
  context?: string
  keys?: string
  rows: number
  cols: number
}

export function StatusBar({ context = '', keys, rows, cols }: StatusBarProps) {
  const { current: toast } = useToast()

  let line1Text: string = context
  let line1Color: string = colors.text.dim

  if (toast) {
    line1Text = toast.text
    line1Color = severityColor(toast.severity)
  }

  const defaultKeys = `↑↓ move${sep.dot}enter select${sep.dot}esc back`
  const line2Text: string = keys || defaultKeys
  const hasContextLine = Boolean(line1Text)
  const showKeysOnSecondLine = rows >= 22 && hasContextLine
  const height = showKeysOnSecondLine ? 2 : 1
  const compactToast = Boolean(toast) && !showKeysOnSecondLine
  const firstLineText = showKeysOnSecondLine || compactToast
    ? (hasContextLine ? line1Text : line2Text)
    : line2Text
  const firstLineColor = showKeysOnSecondLine || compactToast
    ? (hasContextLine ? line1Color : colors.text.muted)
    : colors.text.muted

  return (
    <Box flexDirection="column" width={cols} height={height}>
      <Text color={firstLineColor} wrap="truncate-end">{firstLineText}</Text>
      {showKeysOnSecondLine && <Text color={colors.text.muted} wrap="truncate-end">{line2Text}</Text>}
    </Box>
  )
}
