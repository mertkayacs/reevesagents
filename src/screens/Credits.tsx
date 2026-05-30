// Credits and product metadata page.

import React from 'react'
import { Box, useInput } from 'ink'
import { Frame } from '../components/Frame.js'
import { Row } from '../components/Row.js'
import { Section, SectionEnd } from '../components/Section.js'
import { useRouter } from '../router.js'

export function Credits() {
  const { pop } = useRouter()

  useInput((_input, key) => {
    if (key.return || key.escape || key.backspace) pop()
  })

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Credits']}
      tagline="About this local tmux-first agent runner."
      statusContext="ReevesAgents 0.9.0"
      statusKeys="enter back · esc back"
    >
      <Box flexDirection="column">
        <Section label="About" />
        <Row selected={false} primary="Name" trailing="ReevesAgents" />
        <Row selected={false} primary="Version" trailing="0.9.0" />
        <Row selected={false} primary="Purpose" trailing="Local tmux-first run manager for AI CLI agents" />
        <SectionEnd />

        <Box marginTop={1} />
        <Section label="Stack" />
        <Row selected={false} primary="Interface" trailing="Ink TUI, CLI, MCP tools" />
        <Row selected={false} primary="Runtime" trailing="tmux sessions and provider CLI windows" />
        <Row selected={false} primary="Providers" trailing="Claude Code, Codex CLI, OpenCode, Hermes" />
        <SectionEnd />

        <Box marginTop={1} />
        <Section label="Project" />
        <Row selected={false} primary="License" trailing="Apache-2.0" />
        <Row selected={false} primary="Repository" trailing="github.com/mertkayacs/reevesagents" />
        <SectionEnd />

        <Box marginTop={1} />
        <Section label="Actions" />
        <Row selected primary="Back" hint="return to main menu" />
        <SectionEnd />
      </Box>
    </Frame>
  )
}
