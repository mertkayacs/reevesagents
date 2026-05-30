// Per-check detail page. Shows full name, status, detail, and suggested fix command if available.

import React, { useEffect, useMemo, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { Frame } from '../../components/Frame.js'
import { Primary } from '../../components/Primary.js'
import { Row } from '../../components/Row.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { useRouter } from '../../router.js'
import { colors } from '../../utils/tokens.js'
import { glyphs } from '../../utils/glyphs.js'
import { runDoctor } from '../../launcher/doctor.js'

function statusGlyph(status: 'ok' | 'warn' | 'fail'): { char: string; color: string } {
  if (status === 'ok') return { char: glyphs.status.ok, color: colors.status.ok }
  if (status === 'warn') return { char: glyphs.status.warn, color: colors.status.warn }
  return { char: glyphs.status.fail, color: colors.status.error }
}

function findFixHint(check: { name: string; detail: string }): string | null {
  if (check.name === 'tmux' && check.detail.includes('not on PATH')) return 'Install tmux and make sure it is on PATH.'
  if (check.name === 'providers' && check.detail.includes('missing')) return 'Install at least one supported provider CLI and make sure it is on PATH.'
  if (check.name === 'mcp config') return 'Run reevesagents setup.'
  if (check.name.endsWith('dir') && check.detail.includes('not readable/writable')) return 'Fix directory permissions or set REEVES_REGISTRY to a writable path.'
  return null
}

export function DoctorCheck() {
  const { pop, selectedCheckName } = useRouter()
  const [selectedIdx, setSelectedIdx] = useState(0)
  const result = useMemo(() => runDoctor(), [])
  const check = result.checks.find(c => c.name === selectedCheckName)
  const backIdx = check ? 1 : 0

  useEffect(() => { setSelectedIdx(backIdx) }, [backIdx])

  useInput((_input, key) => {
    if (key.escape || key.backspace) { pop(); return }
    if (key.upArrow || key.downArrow) { setSelectedIdx(backIdx); return }
    if (key.return) {
      if (selectedIdx === backIdx) pop()
    }
  })

  if (!check) {
    return (
      <Frame
        breadcrumb={['ReevesAgents', 'Doctor', 'Check']}
        tagline="Check not found."
      >
        <Primary>
          <Row selected={selectedIdx === backIdx} primary="Back" />
        </Primary>
      </Frame>
    )
  }

  const fixHint = findFixHint(check)

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Doctor', check.name]}
      meta={[{ label: 'status', value: check.status }]}
      tagline="Check details and suggested fix."
    >
      <Primary>
        <Box flexDirection="column">
          <Row selected={false} primary="Name" trailing={check.name} />
          <Row selected={false} primary="Status" trailing={check.status} glyph={statusGlyph(check.status)} />
          <Row selected={false} primary="Detail" trailing={check.detail} />
        </Box>

        {fixHint && (
          <>
            <Box marginY={1} />
            <Section label="Fix" />
            <Box marginY={1} marginLeft={2} flexDirection="column">
              <Text color={colors.text.dim}>Suggested fix:</Text>
              <Text color={colors.accent.primary}>{fixHint}</Text>
            </Box>
            <SectionEnd />
          </>
        )}

        {!fixHint && (
          <>
            <Box marginY={1} />
            <Section label="Fix" />
            <Box marginY={1} marginLeft={2}>
              <Text color={colors.text.dim}>No suggested fix. Check the source code or open an issue.</Text>
            </Box>
            <SectionEnd />
          </>
        )}

        <Box marginY={1} />
        <Section label="Actions" />
        <Row selected={selectedIdx === backIdx} primary="Back" />
        <SectionEnd />
      </Primary>
    </Frame>
  )
}
