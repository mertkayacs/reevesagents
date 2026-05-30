// Selectable list item. Cursor, primary text, optional glyph/badge, hint, trailing.
// Renders inline with cursor on the left, content in the middle, trailing right-aligned.
// Selection state controls cursor visibility and text style.

import React from 'react'
import { Box, Text } from 'ink'
import { colors, space } from '../utils/tokens.js'
import { glyphs } from '../utils/glyphs.js'
import { panelWidth, useLayoutColumns } from './LayoutContext.js'

interface Props {
  selected: boolean
  primary: string
  glyph?: { char: string; color: string }
  badge?: { label: string; color: string }
  hint?: string
  trailing?: string
  primaryWidth?: number
  disabled?: boolean
  danger?: boolean
}

export function Row({
  selected,
  primary,
  glyph,
  badge,
  hint,
  trailing,
  primaryWidth,
  disabled,
  danger,
}: Props) {
  const columns = useLayoutColumns()
  const width = panelWidth(columns)
  const compact = columns < 72
  const cursorChar = selected ? glyphs.cursor.focused : glyphs.cursor.unfocused
  const textBold = selected && !disabled
  const buttonLike = !glyph && !badge && !trailing && !!hint
  const showHint = Boolean(hint) && !compact
  const showTrailing = Boolean(trailing) && !compact
  const cursorColor = selected
    ? danger ? colors.status.error : colors.accent.bright
    : colors.text.faint
  const primaryColor = disabled
    ? colors.text.faint
    : selected && danger
    ? colors.status.error
    : selected
    ? colors.accent.bright
    : colors.text.primary
  const separatorColor = selected ? colors.accent.deep : colors.text.faint
  const hintColor = disabled
    ? colors.text.faint
    : selected
    ? colors.text.primary
    : colors.text.dim
  const buttonBorderColor = selected ? colors.accent.primary : colors.text.faint
  const buttonBg = selected && !disabled ? colors.surface.selected : undefined
  const buttonPrimaryWidth = buttonLike
    ? Math.max(primaryWidth ?? 0, primary.length, 12)
    : primaryWidth
  const primaryText = buttonPrimaryWidth ? primary.padEnd(buttonPrimaryWidth) : primary
  const railColor = selected ? colors.accent.deep : colors.surface.border
  const availableWidth = Math.max(1, width - 6)
  const trailingWidth = showTrailing
    ? Math.min(Math.max(16, Math.floor(availableWidth * 0.42)), Math.max(1, availableWidth - 16))
    : 0
  const mainWidth = showTrailing ? Math.max(1, availableWidth - trailingWidth) : undefined
  const trailingSeparatorWidth = 3
  const trailingTextWidth = Math.max(1, trailingWidth - trailingSeparatorWidth)

  return (
    <Box flexDirection="row" width={width}>
      <Box width={1} flexShrink={0}>
        <Text color={cursorColor}>
          {cursorChar}
        </Text>
      </Box>
      <Box width={2} flexShrink={0}>
        <Text color={railColor}> │</Text>
      </Box>
      <Box
        marginLeft={space.sm}
        flexDirection="row"
        width={mainWidth}
        flexGrow={showTrailing ? 0 : 1}
        flexShrink={1}
      >
        {glyph && (
          <Text color={glyph.color}>{glyph.char}</Text>
        )}
        {glyph && <Text>{' '}</Text>}
        {badge && (
          <>
            <Text color={colors.surface.border}>[</Text>
            <Text color={badge.color}>
              {badge.label}
            </Text>
            <Text color={colors.surface.border}>]</Text>
            <Text>{' '}</Text>
          </>
        )}
        {buttonLike ? (
          <>
            <Text color={buttonBorderColor} backgroundColor={buttonBg}>[ </Text>
            <Text
              color={primaryColor}
              backgroundColor={buttonBg}
              bold={textBold}
              dimColor={disabled}
              wrap="truncate-end"
            >
              {primaryText}
            </Text>
            <Text color={buttonBorderColor} backgroundColor={buttonBg}> ]</Text>
          </>
        ) : (
          <Text
            color={primaryColor}
            bold={textBold}
            dimColor={disabled}
            wrap="truncate-end"
          >
            {primary}
          </Text>
        )}
        {showHint && (
          <>
            <Text color={separatorColor}> │</Text>
            <Box marginLeft={space.sm} flexShrink={1}>
              <Text color={hintColor} wrap="truncate-end">{hint}</Text>
            </Box>
          </>
        )}
      </Box>
      {showTrailing && (
        <Box flexDirection="row" width={trailingWidth} flexShrink={0}>
          <Box width={trailingSeparatorWidth} flexShrink={0}>
            <Text color={separatorColor}> │ </Text>
          </Box>
          <Box width={trailingTextWidth} flexShrink={0}>
            <Text color={colors.text.muted} wrap="truncate-end">{trailing}</Text>
          </Box>
        </Box>
      )}
      <Box width={2} flexShrink={0}>
        <Text color={railColor}> │</Text>
      </Box>
    </Box>
  )
}
