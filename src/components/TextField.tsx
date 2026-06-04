// Selectable text input field. List mode shows label and value with optional
// cursor. Edit mode captures keyboard input and renders an inline cursor at end.
// helpText shows below in text.dim only when selected, to reduce visual noise.

import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { colors, sep, space } from '../utils/tokens.js'
import { glyphs } from '../utils/glyphs.js'
import { panelWidth, useLayoutColumns } from './LayoutContext.js'
import { translatePhrase } from '../i18n/catalog.js'
import { useLanguage } from '../state/LanguageContext.js'

interface Props {
  label: string
  value: string
  helpText?: string
  required?: boolean
  selected: boolean
  editing: boolean
  multiline?: boolean
  onChange: (_newValue: string) => void
  onCommit?: () => void
  onCancel?: () => void
}

export function TextField({
  label,
  value,
  helpText,
  required,
  selected,
  editing,
  multiline = false,
  onChange,
  onCommit,
  onCancel,
}: Props) {
  const { language } = useLanguage()
  const columns = useLayoutColumns()
  const width = panelWidth(columns)
  const [editValue, setEditValue] = useState(value)

  // Sync editValue when the prop value changes and we're not actively editing
  useEffect(() => {
    if (!editing) {
      setEditValue(value)
    }
  }, [value, editing])

  // Register input only when in edit mode
  useInput((input, key) => {
    if (!editing) return

    // Backspace
    if (key.backspace) {
      const newVal = editValue.slice(0, -1)
      setEditValue(newVal)
      onChange(newVal)
      return
    }

    if (key.return) {
      if (multiline && !key.ctrl && !key.meta) {
        const newVal = `${editValue}\n`
        setEditValue(newVal)
        onChange(newVal)
        return
      }
      onCommit?.()
      return
    }

    if (key.escape) {
      if (multiline) {
        onCommit?.()
        return
      }
      setEditValue(value)
      onCancel?.()
      return
    }

    if (key.upArrow || key.downArrow) return

    // Letters, digits, symbols. Enter can arrive as "\r" or "\n" input in Ink,
    // so text input stays after special-key handling and excludes line breaks.
    if (input && !key.ctrl && !key.meta && !/[\r\n]/.test(input)) {
      setEditValue(editValue + input)
      onChange(editValue + input)
      return
    }
  })

  const cursorChar = selected && !editing ? glyphs.cursor.focused : glyphs.cursor.unfocused
  const cursorColor = selected ? colors.accent.bright : colors.text.faint
  const railColor = selected ? colors.accent.deep : colors.surface.border
  const labelColor = selected && editing ? colors.accent.primary : colors.text.dim
  const valueColor = editing ? colors.accent.bright : colors.text.primary
  const displayValue = editing ? `${editValue}_` : value
  const displayLabel = translatePhrase(language, label)
  const displayHelpText = helpText ? translatePhrase(language, helpText) : helpText
  const labelText = `${displayLabel}${required ? ' *' : ''}`
  const contentWidth = Math.max(1, width - 6)
  const labelWidth = Math.max(1, Math.min(Math.max(12, labelText.length), Math.floor(contentWidth * 0.35)))
  const valueWidth = Math.max(1, contentWidth - labelWidth - sep.pipe.length)
  const lines = multiline ? wrapLines(displayValue, valueWidth) : [displayValue]

  return (
    <Box flexDirection="column" width={width}>
      {lines.map((line, idx) => (
        <Box key={`${idx}-${line}`} flexDirection="row" width={width}>
          <Box width={1} flexShrink={0}>
            <Text color={cursorColor} bold={selected && !editing}>
              {idx === 0 ? cursorChar : ' '}
            </Text>
          </Box>
          <Box width={2} flexShrink={0}>
            <Text color={railColor}> │</Text>
          </Box>
          <Box marginLeft={space.sm} flexDirection="row" width={contentWidth} flexShrink={1}>
            <Box width={labelWidth} flexShrink={0}>
              {idx === 0 ? (
                <Text color={labelColor} bold={selected && editing} wrap="truncate-end">
                  {labelText}
                </Text>
              ) : (
                <Text> </Text>
              )}
            </Box>
            <Text color={colors.text.faint}>
              {sep.pipe}
            </Text>
            <Box width={valueWidth} flexShrink={1}>
              <Text color={valueColor} wrap="truncate-end">
                {line}
              </Text>
            </Box>
          </Box>
          <Box width={2} flexShrink={0}>
            <Text color={railColor}> │</Text>
          </Box>
        </Box>
      ))}
      {selected && displayHelpText && (
        <Box marginLeft={4} marginTop={space.sm} width={Math.max(1, width - 4)}>
          <Text color={colors.text.dim} wrap="truncate-end">{displayHelpText}</Text>
        </Box>
      )}
    </Box>
  )
}

function wrapLines(value: string, width: number): string[] {
  const sourceLines = value.split('\n')
  const lines: string[] = []
  for (const source of sourceLines) {
    if (source.length === 0) {
      lines.push('')
      continue
    }
    for (let i = 0; i < source.length; i += width) {
      lines.push(source.slice(i, i + width))
    }
  }
  return lines.length > 0 ? lines : ['']
}
