// Credits and product metadata page.

import React, { useState } from 'react'
import { Box, useInput, useWindowSize } from 'ink'
import { Frame, frameBodyRows } from '../components/Frame.js'
import { Row } from '../components/Row.js'
import { Section, SectionEnd } from '../components/Section.js'
import { useRouter } from '../router.js'
import { REEVESAGENTS_VERSION } from '../../version.js'

export function Credits() {
  const { pop } = useRouter()
  const { rows: termRows } = useWindowSize()
  const bodyRows = frameBodyRows(termRows, true, true)
  const compactBody = bodyRows <= 8
  const content = [
    { primary: 'Name', trailing: 'ReevesAgents' },
    { primary: 'Version', trailing: REEVESAGENTS_VERSION },
    { primary: 'Purpose', trailing: 'Local tmux-first workspace manager for AI CLI agents' },
    { primary: 'Interface', trailing: 'Ink TUI, Web UI, and agent run CLI' },
    { primary: 'Runtime', trailing: 'tmux sessions and provider CLI windows' },
    { primary: 'Providers', trailing: 'Claude Code, Codex CLI, OpenCode, Hermes, Kimi, DeepSeek, Pi, Qwen, Aider' },
    { primary: 'License', trailing: 'Apache-2.0' },
    { primary: 'Repository', trailing: 'See package metadata' },
  ]
  const visibleCount = Math.max(1, bodyRows - (compactBody ? 3 : 6))
  const [scroll, setScroll] = useState(0)
  const maxScroll = Math.max(0, content.length - visibleCount)
  const visible = content.slice(scroll, scroll + visibleCount)

  useInput((_input, key) => {
    if (key.upArrow) { setScroll(value => Math.max(0, value - 1)); return }
    if (key.downArrow) { setScroll(value => Math.min(maxScroll, value + 1)); return }
    if (key.return || key.escape || key.backspace) pop()
  })

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Credits']}
      tagline="About this local tmux-first workspace manager."
      statusContext={`ReevesAgents ${REEVESAGENTS_VERSION}`}
      statusKeys="enter back · esc back"
    >
      <Box flexDirection="column">
        <Section label="Credits" />
        {visible.map(item => (
          <Row key={item.primary} selected={false} primary={item.primary} trailing={item.trailing} />
        ))}
        {maxScroll > 0 && (
          <Row
            selected={false}
            primary={`${scroll + 1}-${scroll + visible.length} of ${content.length}`}
            trailing="scroll with arrows"
            disabled
          />
        )}
        <SectionEnd />

        {!compactBody && (
          <>
            <Section label="Actions" />
            <Row selected primary="Back" hint="return to main menu" />
            <SectionEnd />
          </>
        )}
      </Box>
    </Frame>
  )
}
