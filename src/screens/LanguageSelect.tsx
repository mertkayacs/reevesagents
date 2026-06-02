import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { Frame } from '../components/Frame.js'
import { Row } from '../components/Row.js'
import { Section, SectionEnd } from '../components/Section.js'
import { useRouter } from '../router.js'
import { LANGUAGE_OPTIONS } from '../i18n/languages.js'
import { useLanguage } from '../state/LanguageContext.js'
import { colors } from '../utils/tokens.js'

const LABEL_WIDTH = Math.max(...LANGUAGE_OPTIONS.map(option => option.nativeName.length))

export function LanguageSelect() {
  const { replace } = useRouter()
  const { language, setLanguage, t } = useLanguage()
  const initial = Math.max(0, LANGUAGE_OPTIONS.findIndex(option => option.code === language))
  const [selectedIdx, setSelectedIdx] = useState(initial)

  function choose(): void {
    const option = LANGUAGE_OPTIONS[selectedIdx] ?? LANGUAGE_OPTIONS[0]!
    setLanguage(option.code)
    replace('Welcome')
  }

  useInput((_input, key) => {
    if (key.upArrow) { setSelectedIdx(idx => Math.max(0, idx - 1)); return }
    if (key.downArrow) { setSelectedIdx(idx => Math.min(LANGUAGE_OPTIONS.length - 1, idx + 1)); return }
    if (key.return) { choose(); return }
  })

  return (
    <Frame
      breadcrumb={['ReevesAgents', t('common.language')]}
      tagline={t('language.subtitle')}
      statusKeys={t('language.status')}
    >
      <Box flexDirection="column">
        <Text color={colors.accent.primary} bold wrap="truncate-end">{t('language.title')}</Text>
        <Text color={colors.text.dim} wrap="truncate-end">{t('language.hint')}</Text>
        <Section label={t('common.language')} />
        {LANGUAGE_OPTIONS.map((option, idx) => (
          <Row
            key={option.code}
            selected={selectedIdx === idx}
            primary={`${option.flag} ${option.nativeName}`}
            primaryWidth={LABEL_WIDTH + 3}
            hint={option.name}
            trailing={option.code === language ? t('common.current') : undefined}
          />
        ))}
        <SectionEnd />
      </Box>
    </Frame>
  )
}
