// Agent › Output detail: scrollable peek of agent's tmux pane.
// Polls peekAgent every 5s; renders output in a bordered box.

import React, { useEffect, useState } from 'react'
import { Box, Text, useInput, useWindowSize } from 'ink'
import { Frame, frameBodyRows } from '../../components/Frame.js'
import { Row } from '../../components/Row.js'
import { Section, SectionEnd } from '../../components/Section.js'
import { Pagination } from '../../components/Pagination.js'
import { useRouter } from '../../router.js'
import { useToast } from '../../contexts/ToastContext.js'
import { translatePhrase } from '../../../i18n/catalog.js'
import { useLanguage } from '../../contexts/LanguageContext.js'
import { colors, space } from '../../utils/tokens.js'
import { modelBadgeLabel, modelColor, providerColor, providerDisplayName } from '../../../utils/display.js'
import { findAgent, readRun } from '../../../core/runs.js'
import { peekAgent, openAgent } from '../../../core/runtime.js'
import type { AgentRecord } from '../../../core/types.js'

const PEEK_INTERVAL_MS = 5000
const DETAIL_LINES = 50
const ACTION_LABEL_WIDTH = Math.max('Refresh Now'.length, 'Open Agent'.length, 'Back'.length)

type RowItem = 'RefreshNow' | 'OpenCLI' | 'Back'

type SelectableItem =
  | { type: 'pagination' }
  | { type: 'action'; action: RowItem }

export function AgentOutput() {
  const { selectedAgentId, pop } = useRouter()
  const { toast } = useToast()
  const { language, t } = useLanguage()
  const { rows: termRows } = useWindowSize()
  const bodyRows = frameBodyRows(termRows, true, true)
  const compactBody = bodyRows <= 9
  const visibleLineCount = compactBody
    ? Math.max(1, Math.min(DETAIL_LINES, bodyRows - 6))
    : Math.max(3, Math.min(DETAIL_LINES, bodyRows - 8))
  const [agent] = useState<AgentRecord | null>(() =>
    selectedAgentId ? (() => { try { return findAgent(selectedAgentId) } catch { return null } })() : null
  )
  const [run] = useState<any | null>(() =>
    agent ? (() => { try { return readRun(agent.run_id) } catch { return null } })() : null
  )
  const [output, setOutput] = useState(() =>
    agent ? (() => { try { return peekAgent(agent.id, DETAIL_LINES) } catch { return '(error fetching output)' } })() : ''
  )
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [page, setPage] = useState(Number.MAX_SAFE_INTEGER)

  const outputLines = output ? output.split('\n').slice(-DETAIL_LINES) : []
  const totalPages = Math.max(1, Math.ceil(Math.max(1, outputLines.length) / visibleLineCount))
  const showPagination = totalPages > 1 && !compactBody
  const paginOffset = showPagination ? 1 : 0
  const activePage = Math.min(page, totalPages)
  const pageStart = activePage === totalPages
    ? Math.max(0, outputLines.length - visibleLineCount)
    : (activePage - 1) * visibleLineCount
  const visibleOutputLines = outputLines.slice(pageStart, pageStart + visibleLineCount)

  const items: SelectableItem[] = [
    ...(showPagination ? [{ type: 'pagination' as const }] : []),
    { type: 'action' as const, action: 'RefreshNow' },
    { type: 'action' as const, action: 'OpenCLI' },
    { type: 'action' as const, action: 'Back' },
  ]

  const selected = items[selectedIdx]
  const actionItems = items.filter((item): item is Extract<SelectableItem, { type: 'action' }> => item.type === 'action')

  function refreshOutput(): void {
    if (!agent) return
    try {
      const peek = peekAgent(agent.id, DETAIL_LINES)
      setOutput(peek)
    } catch {
      setOutput('(error fetching output)')
    }
  }

  useEffect(() => {
    refreshOutput()
    const timer = setInterval(refreshOutput, PEEK_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [agent?.id])

  useEffect(() => {
    setPage(totalPages)
  }, [totalPages])

  useEffect(() => {
    setSelectedIdx(idx => Math.min(idx, items.length - 1))
  }, [items.length])

  function handleActivate(): void {
    if (!selected || !agent) return
    if (selected.type === 'pagination') return

    switch (selected.action) {
      case 'RefreshNow':
        refreshOutput()
        break
      case 'OpenCLI':
        if (!canOpenAgent) return
        try {
          openAgent(agent.id)
        } catch (err) {
          toast(err instanceof Error ? err.message : String(err), 'error')
        }
        break
      case 'Back':
        pop()
        break
    }
  }

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIdx(idx => Math.max(0, idx - 1))
      return
    }
    if (key.downArrow) {
      setSelectedIdx(idx => Math.min(items.length - 1, idx + 1))
      return
    }
    if (key.leftArrow && totalPages > 1) {
      setPage(Math.max(1, activePage - 1))
      setSelectedIdx(0)
      return
    }
    if (key.rightArrow && totalPages > 1) {
      setPage(Math.min(totalPages, activePage + 1))
      setSelectedIdx(0)
      return
    }
    if (key.return) {
      if (!agent || !run) { pop(); return }
      handleActivate()
      return
    }
    if (key.escape || key.backspace) {
      pop()
      return
    }
  })

  if (!agent || !run) {
    return (
      <Frame
        breadcrumb={['ReevesAgents', 'Runs']}
        statusContext="Agent not found"
      >
        <Box flexDirection="column">
          <Text color={colors.text.dim}>{translatePhrase(language, 'Agent not found.')}</Text>
          <Box marginTop={1}>
            <Row
              selected={true}
              primary="Back"
              hint="return to agents list"
            />
          </Box>
        </Box>
      </Frame>
    )
  }

  const isHeadless = !!agent.headless
  const isAgentEnded = agent.ended_at !== null
  const canOpenAgent = !isAgentEnded && !isHeadless && !!agent.tmux_window_id
  const openDisabledHint = isAgentEnded ? 'agent has ended' : 'no tmux window'
  let statusContext = `${agent.nickname} · ${t('runtime.output')}`
  if (selected?.type === 'pagination') {
    statusContext = t('runtime.outputPageNav', { page: activePage, total: totalPages })
  } else if (selected?.type === 'action') {
    const actionLabels: Record<RowItem, string> = {
      RefreshNow: 'fetch output now',
      OpenCLI: canOpenAgent ? 'switch tmux to this agent window' : openDisabledHint,
      Back: 'return to agent detail',
    }
    statusContext = actionLabels[selected.action]
  }

  const shownStart = outputLines.length === 0 ? 0 : pageStart + 1
  const shownEnd = pageStart + visibleOutputLines.length
  const providerHue = providerColor(agent.provider)
  const modelHue = modelColor(agent.model, agent.provider)
  const providerLabel = providerDisplayName(agent.provider)

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Runs', run.name, 'Agents', agent.nickname, 'Output']}
      meta={[
        { label: 'lines', value: outputLines.length === 0 ? '0' : `${shownStart}-${shownEnd}/${outputLines.length}` },
        { label: 'refresh', value: '5s' },
      ]}
      tagline="Recent output from this independent agent. Refreshes every 5 seconds."
      statusContext={statusContext}
      statusKeys="↑↓ move · ←→ output pages · enter select · esc back"
    >
      {!compactBody && (
        <>
          <Box flexDirection="column" marginBottom={2}>
            <Box marginBottom={1}>
              <Text wrap="truncate-end">
                <Text color={colors.text.primary} bold>{agent.nickname}</Text>
                <Text color={colors.text.dim}> </Text>
                <Text color={colors.surface.border}>[</Text>
                <Text color={providerHue}>{providerLabel}</Text>
                <Text color={colors.surface.border}>] [</Text>
                <Text color={modelHue}>{modelBadgeLabel(agent.model)}</Text>
                <Text color={colors.surface.border}>]</Text>
              </Text>
            </Box>
            <Box
              borderStyle="round"
              borderColor={providerHue}
              paddingX={space.sm}
              flexDirection="column"
              height={visibleLineCount + 2}
              overflow="hidden"
            >
              {visibleOutputLines.map((line, idx) => (
                <Text key={idx} color={colors.text.dim}>{line}</Text>
              ))}
              {visibleOutputLines.length === 0 && (
                <Text color={colors.text.muted}>{translatePhrase(language, '(no output yet)')}</Text>
              )}
            </Box>
          </Box>

          {showPagination && (
            <Pagination
              page={activePage}
              total={totalPages}
              focused={selectedIdx === 0}
              onPrev={() => setPage(p => Math.max(1, p - 1))}
              onNext={() => setPage(p => Math.min(totalPages, p + 1))}
            />
          )}
        </>
      )}

      <Section label="Actions" />

      <Box flexDirection="column">
        {actionItems.map((item, idx) => {
          const rowIdx = idx + paginOffset
          const isSelected = selectedIdx === rowIdx

          const hints: Record<RowItem, string> = {
            RefreshNow: 'fetch output now',
            OpenCLI: canOpenAgent ? 'switch tmux to this agent window' : openDisabledHint,
            Back: 'return to agent detail',
          }

          const labels: Record<RowItem, string> = {
            RefreshNow: 'Refresh Now',
            OpenCLI: 'Open Agent',
            Back: 'Back',
          }

          return (
            <Row
              key={item.action}
              selected={isSelected}
              primary={labels[item.action]}
              primaryWidth={ACTION_LABEL_WIDTH}
              hint={hints[item.action]}
              disabled={item.action === 'OpenCLI' && !canOpenAgent}
            />
          )
        })}
        <SectionEnd />
      </Box>
    </Frame>
  )
}
