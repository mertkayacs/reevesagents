// Config editor: edit the numeric and permission global settings in place. Every
// write goes through the shared setConfigValues validator, so the CLI, MCP, web,
// and TUI never drift. Language is edited in Settings (it needs the live language
// context to re-render), so it is intentionally not duplicated here.

import React, { useState } from 'react'
import { Box, useInput } from 'ink'
import { Frame } from '../components/Frame.js'
import { Row } from '../components/Row.js'
import { Section, SectionEnd } from '../components/Section.js'
import { TextField } from '../components/TextField.js'
import { useRouter } from '../router.js'
import { useToast } from '../contexts/ToastContext.js'
import { CONFIG_FIELDS, loadConfig, parseConfigValue, setConfigValues } from '../../core/config.js'
import type { ConfigFieldSpec } from '../../core/config.js'
import type { GlobalConfig, Permissions } from '../../core/types.js'

// Numeric and permission fields are edited here; language lives in Settings.
const EDITABLE_FIELDS = CONFIG_FIELDS.filter(field => field.kind !== 'language')

function isNumeric(field: ConfigFieldSpec): boolean {
  return field.kind === 'posint' || field.kind === 'nonneg-int'
}

export function Config() {
  const { pop } = useRouter()
  const { toast } = useToast()
  const [global, setGlobal] = useState<GlobalConfig>(() => loadConfig().global)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const totalRows = EDITABLE_FIELDS.length + 1 // fields + Back

  function applyValue(key: string, value: unknown): void {
    try {
      setGlobal(setConfigValues({ [key]: value }).global)
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  function commitEdit(field: ConfigFieldSpec): void {
    setEditingKey(null)
    try {
      applyValue(field.key, parseConfigValue(field.key, draft))
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  useInput((_input, key) => {
    if (editingKey) return
    if (key.escape || key.backspace) { pop(); return }
    if (key.upArrow) { setSelectedIdx(i => Math.max(0, i - 1)); return }
    if (key.downArrow) { setSelectedIdx(i => Math.min(totalRows - 1, i + 1)); return }

    if (selectedIdx >= EDITABLE_FIELDS.length) {
      if (key.return) pop()
      return
    }
    const field = EDITABLE_FIELDS[selectedIdx]!
    if (field.kind === 'permissions') {
      if (key.leftArrow || key.rightArrow || key.return) {
        applyValue(field.key, (global[field.key] as Permissions) === 'ask' ? 'skip' : 'ask')
      }
      return
    }
    if (key.return && isNumeric(field)) {
      setDraft(String(global[field.key]))
      setEditingKey(field.key)
    }
  })

  return (
    <Frame
      breadcrumb={['ReevesAgents', 'Settings', 'Config']}
      tagline="Edit global settings. Numbers edit inline; permissions cycle."
      statusKeys="enter edit/cycle · ←→ cycle · esc back"
    >
      <Box flexDirection="column">
        <Section label="Config" />
        {EDITABLE_FIELDS.map((field, idx) => {
          const value = global[field.key]
          if (isNumeric(field)) {
            return (
              <TextField
                key={field.key}
                label={field.label}
                value={editingKey === field.key ? draft : String(value)}
                helpText="enter edit · esc cancel"
                required={false}
                selected={selectedIdx === idx}
                editing={editingKey === field.key}
                onChange={setDraft}
                onCommit={() => commitEdit(field)}
                onCancel={() => setEditingKey(null)}
              />
            )
          }
          return (
            <Row
              key={field.key}
              selected={selectedIdx === idx}
              primary={field.label}
              trailing={`‹ ${String(value)} ›`}
              hint={selectedIdx === idx ? '← → cycle' : undefined}
            />
          )
        })}
        <SectionEnd />

        <Section label="Actions" />
        <Row selected={selectedIdx === EDITABLE_FIELDS.length} primary="Back" hint="return to settings" />
        <SectionEnd />
      </Box>
    </Frame>
  )
}
