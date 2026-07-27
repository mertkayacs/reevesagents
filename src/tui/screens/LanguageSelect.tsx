import React, { useState } from 'react'
import { Box, Text, useInput, useWindowSize } from 'ink'
import { Frame, frameBodyRows } from '../components/Frame.js'
import { Row } from '../components/Row.js'
import { Section, SectionEnd } from '../components/Section.js'
import { useRouter } from '../router.js'
import { LANGUAGE_OPTIONS } from '../../i18n/languages.js'
import { useLanguage } from '../contexts/LanguageContext.js'
import { colors } from '../utils/tokens.js'
import { configExists } from '../../core/config.js'

const LABEL_WIDTH = Math.max(...LANGUAGE_OPTIONS.map(option => option.nativeName.length))

export function LanguageSelect() {
  const { replace } = useRouter()
  const { language, setLanguage, t } = useLanguage()
  const { rows: termRows } = useWindowSize()
  const bodyRows = frameBodyRows(termRows, true, false)
  const showIntro = bodyRows >= 8
  const visibleLanguageCount = Math.max(1, bodyRows - (showIntro ? 5 : 3))
  const initial = Math.max(0, LANGUAGE_OPTIONS.findIndex(option => option.code === language))
  const [selectedIdx, setSelectedIdx] = useState(initial)
  const firstVisible = Math.min(
    Math.max(0, selectedIdx - visibleLanguageCount + 1),
    Math.max(0, LANGUAGE_OPTIONS.length - visibleLanguageCount),
  )
  const visibleOptions = LANGUAGE_OPTIONS.slice(firstVisible, firstVisible + visibleLanguageCount)

  function choose(): void {
    const option = LANGUAGE_OPTIONS[selectedIdx] ?? LANGUAGE_OPTIONS[0]!
    // A first run (no config yet) lands on the setup wizard; a language change
    // from Settings just returns to the menu.
    const firstRun = !configExists()
    setLanguage(option.code)
    replace(firstRun ? 'Setup' : 'Welcome')
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
        {showIntro && (
          <>
            <Text color={colors.accent.primary} bold wrap="truncate-end">{t('language.title')}</Text>
            <Text color={colors.text.dim} wrap="truncate-end">{t('language.hint')}</Text>
          </>
        )}
        <Section label={t('common.language')} />
        {visibleOptions.map((option, localIdx) => {
          const idx = firstVisible + localIdx
          return (
          <Row
            key={option.code}
            selected={selectedIdx === idx}
            primary={`${option.flag} ${option.nativeName}`}
            primaryWidth={LABEL_WIDTH + 3}
            hint={option.name}
            trailing={option.code === language ? t('common.current') : undefined}
          />
          )
        })}
        {LANGUAGE_OPTIONS.length > visibleLanguageCount && (
          <Row
            selected={false}
            primary={t('runtime.pageRange', { from: firstVisible + 1, to: firstVisible + visibleOptions.length, total: LANGUAGE_OPTIONS.length })}
            trailing="scroll with arrows"
            disabled
          />
        )}
        <SectionEnd />
      </Box>
    </Frame>
  )
}
