// Single line of glyph-label pairs separated by three spaces. All in text.dim.
// Each glyph inherits its color; labels stay in text.dim for readability.

import { Box, Text } from 'ink'
import { colors } from '../utils/tokens.js'
import { translatePhrase } from '../../../i18n/catalog.js'
import { useLanguage } from '../contexts/LanguageContext.js'

interface LegendItem {
  glyph: string
  label: string
  color: string
}

interface Props {
  items: LegendItem[]
}

export function Legend({ items }: Props) {
  const { language } = useLanguage()

  return (
    <Box>
      {items.map((item, idx) => {
        const displayLabel = translatePhrase(language, item.label)
        return (
          <Box key={`${item.glyph}-${idx}`}>
            {idx > 0 && <Text color={colors.text.dim}>   </Text>}
            <Text color={item.color}>{item.glyph}</Text>
            <Text color={colors.text.dim}>
              {' '}
              {displayLabel}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}
