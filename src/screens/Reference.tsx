// Compact in-app reference for Spawner, CLI, and local roles.

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
  { type: 'row', primary: 'New Run', trailing: 'create a multi-terminal tmux workspace' },
  { type: 'row', primary: 'Spawner', trailing: 'multiple independent CLI terminals; human coordinates' },
  { type: 'row', primary: 'Runs / Run', trailing: 'dashboard, lifecycle, terminals, output' },
  { type: 'row', primary: 'Settings / Doctor', trailing: 'provider setup, paths, health checks' },
  { type: 'section', label: 'CLI' },
  { type: 'row', primary: 'reevesagents', trailing: 'open the visible-menu TUI' },
  { type: 'row', primary: 'spawn', trailing: 'start a low-permission multi-terminal workspace' },
  { type: 'row', primary: 'runs / open / peek', trailing: 'list runs, jump windows, read output' },
  { type: 'row', primary: 'stop / kill', trailing: 'confirmed run and terminal cleanup' },
  { type: 'row', primary: 'doctor', trailing: 'check local health without writing provider configs' },
  { type: 'section', label: 'Roles' },
  { type: 'row', primary: 'Human', trailing: 'uses TUI/tmux and remains in charge' },
  { type: 'row', primary: 'Terminal', trailing: 'independent provider CLI inside the run session' },
  { type: 'section', label: 'OSS' },
  { type: 'row', primary: 'npm / Homebrew', trailing: 'planned public install channels' },
  { type: 'row', primary: 'GitHub Releases', trailing: 'tags, changelog, known limitations' },
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
      tagline="Quick map of Spawner mode, command line, tmux workflow, and roles."
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
