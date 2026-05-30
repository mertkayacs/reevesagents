// Self-contained modal dialog with selectable buttons.
// Props: title, body, intent (default/danger), button labels, callbacks.
// Keyboard: ArrowLeft/Right to switch focus, Enter selects focused button, Esc/Backspace cancels.

import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { colors } from '../utils/tokens.js'
import { glyphs } from '../utils/glyphs.js'

interface DialogProps {
  title: string
  body: string
  intent?: 'default' | 'danger'
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export function Dialog({
  title,
  body,
  intent = 'default',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: DialogProps) {
  const [focusedButton, setFocusedButton] = useState<'cancel' | 'confirm'>('cancel')

  const borderColor = intent === 'danger' ? colors.status.warn : colors.accent.primary

  useInput((input, key) => {
    if (key.leftArrow) {
      setFocusedButton('cancel')
    } else if (key.rightArrow) {
      setFocusedButton('confirm')
    } else if (key.return) {
      if (focusedButton === 'confirm') {
        onConfirm()
      } else {
        onCancel()
      }
    } else if (key.escape || key.backspace) {
      onCancel()
    }
  })

  const renderButton = (label: string, name: 'cancel' | 'confirm') => {
    const isFocused = focusedButton === name
    const prefix = isFocused ? `${glyphs.cursor.focused} ` : '  '
    const textColor = !isFocused
      ? colors.text.dim
      : intent === 'danger' && name === 'confirm'
      ? colors.status.error
      : colors.accent.bright

    return (
      <Text key={name} color={textColor} bold={isFocused}>
        {prefix}[ {label} ]
      </Text>
    )
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={2} paddingY={1} marginY={1}>
      <Box marginBottom={1}>
        <Text color={borderColor} bold>
          {title}
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text color={colors.text.primary}>{body}</Text>
      </Box>
      <Box marginTop={1} flexDirection="row" gap={1}>
        {renderButton(cancelLabel, 'cancel')}
        {renderButton(confirmLabel, 'confirm')}
      </Box>
    </Box>
  )
}
