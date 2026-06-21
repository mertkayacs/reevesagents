import React from 'react'
import { Row } from './Row.js'
import { Section, SectionEnd } from './Section.js'
import { modelDisplayName } from '../../core/model-catalog.js'
import { modelBadgeLabel, modelColor } from '../../utils/display.js'
import type { Provider } from '../../core/types.js'

interface Props {
  provider: Provider
  values: readonly string[]
  current: string
  selectedIdx: number
  visibleCount?: number
}

export function ModelOptionList({ provider, values, current, selectedIdx, visibleCount }: Props) {
  const rowCount = Math.max(1, visibleCount ?? values.length)
  const firstVisible = Math.min(
    Math.max(0, selectedIdx - rowCount + 1),
    Math.max(0, values.length - rowCount),
  )
  const visibleValues = values.slice(firstVisible, firstVisible + rowCount)

  return (
    <>
      <Section label="Model Options" />
      {visibleValues.map((model, localIdx) => {
        const idx = firstVisible + localIdx
        return (
        <Row
          key={model || 'provider-default'}
          selected={selectedIdx === idx}
          primary={modelDisplayName(model)}
          badge={model ? { label: modelBadgeLabel(model), color: modelColor(model, provider) } : undefined}
          hint={model === current ? 'selected' : model ? 'available' : 'Provider default'}
        />
        )
      })}
      {values.length > rowCount && (
        <Row
          selected={false}
          primary={`${firstVisible + 1}-${firstVisible + visibleValues.length} of ${values.length}`}
          trailing="scroll with arrows"
          disabled
        />
      )}
      <SectionEnd />
    </>
  )
}
