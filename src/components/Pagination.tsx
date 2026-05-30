// Page footer. Renders as "‹ page N of M ›" in text.dim.
// focused must be true for ← → to change pages; prevents global key capture on list screens.
// Arrows dim when at boundary (page 1 or page total).

import React from 'react'
import { Box, Text, useInput } from 'ink'
import { colors } from '../utils/tokens.js'
import { glyphs } from '../utils/glyphs.js'

interface Props {
  page: number
  total: number
  focused?: boolean
  onPrev?: () => void
  onNext?: () => void
}

export function Pagination({ page, total, focused = false, onPrev, onNext }: Props) {
  const isFirstPage = page === 1
  const isLastPage = page === total

  useInput((_input, key) => {
    if (!focused) return
    if (key.leftArrow && onPrev && !isFirstPage) onPrev()
    if (key.rightArrow && onNext && !isLastPage) onNext()
  })

  const prevColor = isFirstPage ? colors.text.faint : colors.text.dim
  const nextColor = isLastPage ? colors.text.faint : colors.text.dim

  return (
    <Box>
      <Text color={focused ? colors.accent.bright : colors.text.faint} bold={focused}>
        {focused ? `${glyphs.cursor.focused} ` : '  '}
      </Text>
      <Text color={prevColor}>‹</Text>
      <Text color={colors.text.dim}>
        {' '}
        page
        {' '}
        {page}
        {' '}
        of
        {' '}
        {total}
        {' '}
      </Text>
      <Text color={nextColor}>›</Text>
    </Box>
  )
}
