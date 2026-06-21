// Agent Control page: list the MCP-capable host CLIs with their status and let
// the user attach or detach the reevesagents MCP per host, or attach all
// installed drivable hosts at once. Manual hosts (e.g. opencode) cannot be
// toggled and only show an "add by hand" note. The engine lives in
// mcp/installer; this screen never edits CLI config files itself.

import React, { useMemo, useState } from 'react'
import { Box, useInput, useWindowSize } from 'ink'
import { Frame, frameBodyRows } from '../components/Frame.js'
import { Primary } from '../components/Primary.js'
import { Row } from '../components/Row.js'
import { Section, SectionEnd } from '../components/Section.js'
import { Legend } from '../components/Legend.js'
import { useRouter } from '../router.js'
import { colors } from '../utils/tokens.js'
import { glyphs } from '../utils/glyphs.js'
import { useLanguage } from '../state/LanguageContext.js'
import { hostStatus, attach, detach, attachAll, type HostStatus, type AttachResult } from '../mcp/installer.js'

// One status glyph per host: attached is ok, drivable-but-detached is warn,
// not installed or manual is faint.
function hostGlyph(host: HostStatus): { char: string; color: string } {
  if (!host.installed) return { char: glyphs.status.fail, color: colors.text.faint }
  if (host.attached) return { char: glyphs.status.ok, color: colors.status.ok }
  if (host.manual) return { char: glyphs.status.pending, color: colors.text.faint }
  return { char: glyphs.status.warn, color: colors.status.warn }
}

export function AgentControl() {
  const { pop } = useRouter()
  const { t } = useLanguage()
  const { rows: termRows } = useWindowSize()
  const bodyRows = frameBodyRows(termRows, true, true)
  const compactBody = bodyRows <= 10

  const [selectedIdx, setSelectedIdx] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [result, setResult] = useState<AttachResult | null>(null)

  const hosts = useMemo(() => hostStatus(), [refreshKey])
  const attachedCount = hosts.filter(host => host.attached).length

  const actionOffset = hosts.length
  const totalItems = actionOffset + 2  // Attach all, Back

  const hostLabelWidth = Math.max(
    ...hosts.map(host => host.label.length),
    t('agentControl.attachAll').length,
    t('common.back').length,
  )

  const compactEntryCount = Math.max(1, bodyRows - 2)
  const compactFirstEntry = Math.min(
    Math.max(0, selectedIdx - compactEntryCount + 1),
    Math.max(0, totalItems - compactEntryCount),
  )
  const compactEntryIndexes = Array.from(
    { length: Math.min(compactEntryCount, totalItems - compactFirstEntry) },
    (_, idx) => compactFirstEntry + idx,
  )

  function hostHint(host: HostStatus): string {
    if (!host.installed) return t('agentControl.notInstalledHint')
    if (host.manual) return t('agentControl.manualHint')
    return host.attached ? t('agentControl.detachHint') : t('agentControl.attachHint')
  }

  function hostTrailing(host: HostStatus): string {
    if (!host.installed) return t('agentControl.notInstalled')
    if (host.manual) return t('agentControl.manual')
    return host.attached ? t('agentControl.attached') : t('agentControl.detached')
  }

  function toggleHost(host: HostStatus): void {
    // Manual and not-installed hosts cannot be driven; leave them as a note.
    if (host.manual || !host.installed) return
    const res = host.attached ? detach(host.key) : attach(host.key)
    setResult(res)
    setRefreshKey(k => k + 1)
  }

  function runAttachAll(): void {
    const results = attachAll()
    const ok = results.filter(r => r.ok).length
    setResult({
      key: 'all',
      label: t('agentControl.attachAll'),
      ok: results.every(r => r.ok),
      message: t('agentControl.attachAllToast', { ok, total: results.length }),
    })
    setRefreshKey(k => k + 1)
  }

  useInput((input, key) => {
    if (key.escape || key.backspace) { pop(); return }
    if (input === 'a') { runAttachAll(); return }
    if (key.upArrow) { setSelectedIdx(idx => Math.max(0, idx - 1)); return }
    if (key.downArrow) { setSelectedIdx(idx => Math.min(totalItems - 1, idx + 1)); return }
    if (key.return) {
      if (selectedIdx < hosts.length) { toggleHost(hosts[selectedIdx]!); return }
      if (selectedIdx === actionOffset) { runAttachAll(); return }
      if (selectedIdx === actionOffset + 1) { pop(); return }
    }
  })

  const selectedHost = selectedIdx < hosts.length ? hosts[selectedIdx] : undefined
  const statusContext = result
    ? `${result.label}: ${result.message}`
    : selectedHost
    ? `${selectedHost.label} · ${selectedHost.bin}`
    : ''

  function renderHost(host: HostStatus, idx: number) {
    return (
      <Row
        key={host.key}
        selected={idx === selectedIdx}
        glyph={hostGlyph(host)}
        primary={host.label}
        primaryWidth={hostLabelWidth}
        hint={hostHint(host)}
        trailing={hostTrailing(host)}
      />
    )
  }

  function renderAttachAll(idx: number) {
    return (
      <Row
        key="attach-all"
        selected={idx === selectedIdx}
        primary={t('agentControl.attachAll')}
        primaryWidth={hostLabelWidth}
        hint={t('agentControl.attachAllHint')}
      />
    )
  }

  function renderBack(idx: number) {
    return (
      <Row
        key="back"
        selected={idx === selectedIdx}
        primary={t('common.back')}
        primaryWidth={hostLabelWidth}
        hint={t('agentControl.backHint')}
      />
    )
  }

  return (
    <Frame
      breadcrumb={['ReevesAgents', t('agentControl.title')]}
      meta={[{ label: t('agentControl.hostsMeta'), value: `${attachedCount}/${hosts.length}` }]}
      tagline={t('agentControl.tagline')}
      statusContext={statusContext}
      statusKeys={t('agentControl.statusKeys')}
    >
      {compactBody ? (
        <Primary>
          <Section label={selectedIdx < hosts.length ? t('agentControl.hosts') : t('common.actions')} />
          {compactEntryIndexes.map(idx => {
            if (idx < hosts.length) return renderHost(hosts[idx]!, idx)
            if (idx === actionOffset) return renderAttachAll(idx)
            return renderBack(idx)
          })}
          <SectionEnd />
        </Primary>
      ) : (
        <Primary>
          <Section label={t('agentControl.hosts')} />
          {hosts.map((host, idx) => renderHost(host, idx))}
          <SectionEnd />

          <Box marginTop={1} />
          <Legend
            items={[
              { glyph: glyphs.status.ok, label: t('agentControl.attached'), color: colors.status.ok },
              { glyph: glyphs.status.warn, label: t('agentControl.detached'), color: colors.status.warn },
              { glyph: glyphs.status.pending, label: t('agentControl.manual'), color: colors.text.faint },
              { glyph: glyphs.status.fail, label: t('agentControl.notInstalled'), color: colors.text.faint },
            ]}
          />

          <Box marginTop={1} />
          <Section label={t('common.actions')} />
          {renderAttachAll(actionOffset)}
          {renderBack(actionOffset + 1)}
          <SectionEnd />
        </Primary>
      )}
    </Frame>
  )
}
