// Wizard breadcrumb. Renders as "N / M · <name>".
// Step number in accent.bright, total in text.muted, name in accent.primary bold.

import { Box, Text } from 'ink'
import { colors } from '../utils/tokens.js'
import { translatePhrase } from '../../../i18n/catalog.js'
import { useLanguage } from '../contexts/LanguageContext.js'

interface Props {
  step: number
  total: number
  name: string
}

export function StepIndicator({ step, total, name }: Props) {
  const { language } = useLanguage()
  const displayName = translatePhrase(language, name)

  return (
    <Box>
      <Text color={colors.accent.bright}>{step}</Text>
      <Text> / </Text>
      <Text color={colors.text.muted}>{total}</Text>
      <Text> · </Text>
      <Text color={colors.accent.primary} bold>
        {displayName}
      </Text>
    </Box>
  )
}
