// Compact in-app reference for the visible TUI, CLI, MCP, and agent roles.

import React, { useState } from 'react'
import { useInput, useWindowSize } from 'ink'
import { Frame } from '../components/Frame.js'
import { Row } from '../components/Row.js'
import { Section, SectionEnd } from '../components/Section.js'
import { useRouter } from '../router.js'

type ReferenceItem =
  | { type: 'section'; label: string }
  | { type: 'row'; primary: string; trailing: string }

const CONTENT: ReferenceItem[] = [
  { type: 'section', label: 'TUI Pages' },
  { type: 'row', primary: 'Welcome', trailing: 'main menu, current run, reference, credits' },
  { type: 'row', primary: 'Runs / Run', trailing: 'run dashboard, lifecycle, workers, output' },
  { type: 'row', primary: 'New Run / Add Worker', trailing: 'configure providers, prompts, permissions' },
  { type: 'row', primary: 'Approvals', trailing: 'review pending and resolved requests' },
  { type: 'row', primary: 'Settings / Doctor', trailing: 'provider setup, paths, health checks' },
  { type: 'section', label: 'CLI' },
  { type: 'row', primary: 'reevesagents', trailing: 'open the visible-menu TUI' },
  { type: 'row', primary: 'runs / open / peek', trailing: 'list runs, jump windows, read output' },
  { type: 'row', primary: 'stop / kill', trailing: 'confirmed run and worker cleanup' },
  { type: 'row', primary: 'setup / doctor', trailing: 'register MCP and check local health' },
  { type: 'row', primary: 'context / call', trailing: 'inspect scope or invoke any MCP tool' },
  { type: 'section', label: 'MCP' },
  { type: 'row', primary: 'context / tree / get_run', trailing: 'discover runs, agents, approvals' },
  { type: 'row', primary: 'start_run / spawn_worker', trailing: 'create tmux-backed agent runs' },
  { type: 'row', primary: 'kill_agent / stop_run', trailing: 'close workers or whole runs' },
  { type: 'row', primary: 'peek / send_text / wait', trailing: 'observe and drive workers' },
  { type: 'row', primary: 'messages / approvals', trailing: 'coordinate work and risky actions' },
  { type: 'section', label: 'Roles' },
  { type: 'row', primary: 'Human', trailing: 'uses TUI/tmux and remains in charge' },
  { type: 'row', primary: 'Operator', trailing: 'starts runs and controls local state' },
  { type: 'row', primary: 'Root', trailing: 'controls workers in one run through MCP' },
  { type: 'row', primary: 'Worker', trailing: 'checks messages, reports status, asks approval' },
  { type: 'section', label: 'OSS' },
  { type: 'row', primary: 'npm / Homebrew', trailing: 'planned public install channels' },
  { type: 'row', primary: 'GitHub Releases', trailing: 'tags, changelog, known limitations' },
  { type: 'row', primary: 'MCP Registry', trailing: 'public discovery for MCP clients' },
]

export function Reference() {
  const { pop } = useRouter()
  const { rows } = useWindowSize()
  const visibleCount = Math.max(5, rows - 12)
  const maxScroll = Math.max(0, CONTENT.length - visibleCount)
  const [scroll, setScroll] = useState(0)

  useInput((_input, key) => {
    if (key.upArrow) {
      setScroll(value => Math.max(0, value - 1))
      return
    }
    if (key.downArrow) {
      setScroll(value => Math.min(maxScroll, value + 1))
      return
    }
    if (key.return || key.escape || key.backspace) pop()
  })

  const visible = CONTENT.slice(scroll, scroll + visibleCount)
  const statusContext = maxScroll > 0
    ? `Reference ${scroll + 1}-${Math.min(CONTENT.length, scroll + visibleCount)} of ${CONTENT.length}`
    : 'ReevesAgents reference'
  const contentRows: React.ReactNode[] = []
  let openSection = false
  visible.forEach((item, idx) => {
    if (item.type === 'section') {
      if (openSection) contentRows.push(<SectionEnd key={`end-${idx}`} />)
      contentRows.push(<Section key={`${item.label}-${idx}`} label={item.label} />)
      openSection = true
      return
    }
    contentRows.push(<Row key={`${item.primary}-${idx}`} selected={false} primary={item.primary} trailing={item.trailing} />)
  })
  if (openSection) contentRows.push(<SectionEnd key="end-visible" />)

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Reference']}
      tagline="Quick map of the local TUI, command line, MCP tools, and agent roles."
      statusContext={statusContext}
      statusKeys={maxScroll > 0 ? '↑↓ scroll · enter back · esc back' : 'enter back · esc back'}
    >
      {contentRows}

      <Section label="Actions" />
      <Row selected primary="Back" hint="return to previous page" />
      <SectionEnd />
    </Frame>
  )
}
